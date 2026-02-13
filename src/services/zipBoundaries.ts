/**
 * ZIP Boundary Fetching Service
 * Fetches ZCTA (ZIP Code Tabulation Area) boundaries from Census Bureau API
 * Implements client-side caching with localStorage
 */

const CACHE_KEY_PREFIX = 'zcta_boundary_'
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface CachedBoundary {
  geojson: GeoJSON.Feature
  timestamp: number
}

/**
 * Fetch ZIP boundary from Census Bureau Tigerweb API
 * Returns GeoJSON Feature for the specified ZIP code
 */
export async function fetchZipBoundary(zipCode: string): Promise<GeoJSON.Feature | null> {
  // Check cache first
  const cached = getCachedBoundary(zipCode)
  if (cached) {
    return cached
  }

  try {
    // Try multiple Census Bureau APIs with different configurations
    const apiConfigs = [
      // Config 1: 2020 TIGER/Line ZCTA (most reliable for boundaries)
      {
        url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer/10/query',
        field: 'ZCTA5CE20',
        name: '2020 Census ZCTA'
      },
      // Config 2: Try base TIGER service
      {
        url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query',
        field: 'ZCTA5CE10',
        name: 'TIGER ZCTA Service'
      },
      // Config 3: Try with GEOID field instead
      {
        url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer/10/query',
        field: 'GEOID20',
        name: '2020 Census GEOID'
      },
    ]

    for (const config of apiConfigs) {
      try {
        const url = new URL(config.url)
        url.searchParams.set('where', `${config.field}='${zipCode}'`)
        url.searchParams.set('outFields', '*')
        url.searchParams.set('returnGeometry', 'true')
        url.searchParams.set('outSR', '4326')
        url.searchParams.set('f', 'geojson')

        console.log(`Trying ${config.name} for ZIP ${zipCode}`)

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        })

        if (!response.ok) {
          console.warn(`${config.name} returned ${response.status}`)
          continue
        }

        const data = await response.json() as GeoJSON.FeatureCollection

        if (!data.features || data.features.length === 0) {
          console.warn(`${config.name}: No boundary found`)
          continue
        }

        const feature = data.features[0]
        console.log(`✅ Found boundary via ${config.name}`)

        cacheBoundary(zipCode, feature)
        return feature
      } catch (endpointError) {
        console.warn(`${config.name} error:`, endpointError)
        continue
      }
    }

    console.warn(`❌ All APIs failed for ZIP ${zipCode}`)
    return null
  } catch (error) {
    console.error(`Error fetching boundary for ZIP ${zipCode}:`, error)
    return null
  }
}

/**
 * Batch fetch multiple ZIP boundaries
 * Fetches in parallel but respects API rate limits
 */
export async function fetchMultipleZipBoundaries(
  zipCodes: string[],
  onProgress?: (loaded: number, total: number) => void
): Promise<Map<string, GeoJSON.Feature>> {
  const results = new Map<string, GeoJSON.Feature>()
  let loaded = 0

  // Fetch in batches of 5 to avoid overwhelming the API
  const BATCH_SIZE = 5
  for (let i = 0; i < zipCodes.length; i += BATCH_SIZE) {
    const batch = zipCodes.slice(i, i + BATCH_SIZE)
    const promises = batch.map(zip => fetchZipBoundary(zip))
    const boundaries = await Promise.all(promises)

    boundaries.forEach((boundary, idx) => {
      if (boundary) {
        results.set(batch[idx], boundary)
      }
      loaded++
      onProgress?.(loaded, zipCodes.length)
    })

    // Small delay between batches to be respectful to the API
    if (i + BATCH_SIZE < zipCodes.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}

/**
 * Get cached boundary from localStorage
 */
function getCachedBoundary(zipCode: string): GeoJSON.Feature | null {
  try {
    const cacheKey = CACHE_KEY_PREFIX + zipCode
    const cached = localStorage.getItem(cacheKey)

    if (!cached) return null

    const { geojson, timestamp }: CachedBoundary = JSON.parse(cached)

    // Check if cache is still valid
    if (Date.now() - timestamp > CACHE_DURATION_MS) {
      localStorage.removeItem(cacheKey)
      return null
    }

    return geojson
  } catch (error) {
    console.warn(`Error reading cache for ZIP ${zipCode}:`, error)
    return null
  }
}

/**
 * Cache boundary in localStorage
 */
function cacheBoundary(zipCode: string, geojson: GeoJSON.Feature): void {
  try {
    const cacheKey = CACHE_KEY_PREFIX + zipCode
    const cached: CachedBoundary = {
      geojson,
      timestamp: Date.now(),
    }
    localStorage.setItem(cacheKey, JSON.stringify(cached))
  } catch (error) {
    console.warn(`Error caching boundary for ZIP ${zipCode}:`, error)
    // If localStorage is full, clear old entries
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      clearOldBoundaries()
      // Try again
      try {
        const cacheKey = CACHE_KEY_PREFIX + zipCode
        const cached: CachedBoundary = {
          geojson,
          timestamp: Date.now(),
        }
        localStorage.setItem(cacheKey, JSON.stringify(cached))
      } catch {
        // Still failed, give up
      }
    }
  }
}

/**
 * Clear old cached boundaries to free up space
 */
function clearOldBoundaries(): void {
  try {
    const keys = Object.keys(localStorage)
    const boundaryKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX))

    // Sort by timestamp, remove oldest half
    const entries = boundaryKeys
      .map(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}')
          return { key, timestamp: data.timestamp || 0 }
        } catch {
          return { key, timestamp: 0 }
        }
      })
      .sort((a, b) => a.timestamp - b.timestamp)

    const toRemove = entries.slice(0, Math.ceil(entries.length / 2))
    toRemove.forEach(({ key }) => localStorage.removeItem(key))

    console.log(`Cleared ${toRemove.length} old ZIP boundary cache entries`)
  } catch (error) {
    console.warn('Error clearing old boundaries:', error)
  }
}

/**
 * Clear all cached boundaries
 */
export function clearAllBoundaryCache(): void {
  try {
    const keys = Object.keys(localStorage)
    const boundaryKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX))
    boundaryKeys.forEach(key => localStorage.removeItem(key))
    console.log(`Cleared ${boundaryKeys.length} cached ZIP boundaries`)
  } catch (error) {
    console.warn('Error clearing boundary cache:', error)
  }
}
