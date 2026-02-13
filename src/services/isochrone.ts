/**
 * Isochrone Caching Service
 * Wraps fetchIsochrone with localStorage caching to avoid repeated API calls
 */

import { fetchIsochrone } from './geoapify'
import type { TravelMode } from '../types'

const ISOCHRONE_CACHE_KEY_PREFIX = 'isochrone_cache_'
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface CachedIsochrone {
  data: GeoJSON.FeatureCollection
  timestamp: number
}

/**
 * Generate cache key from isochrone parameters
 * Rounds lat/lon to 4 decimal places for reasonable cache granularity
 */
function getCacheKey(lat: number, lon: number, minutes: number, mode: TravelMode): string {
  const roundedLat = lat.toFixed(4)
  const roundedLon = lon.toFixed(4)
  return `${ISOCHRONE_CACHE_KEY_PREFIX}${roundedLat}_${roundedLon}_${minutes}_${mode}`
}

/**
 * Fetch isochrone with localStorage caching
 * Returns cached result if available and not expired, otherwise fetches from API
 */
export async function fetchIsochroneWithCache(
  lat: number,
  lon: number,
  mode: TravelMode,
  minutes: number
): Promise<GeoJSON.FeatureCollection> {
  const cacheKey = getCacheKey(lat, lon, minutes, mode)

  // Check cache first
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { data, timestamp }: CachedIsochrone = JSON.parse(cached)

      // Check if cache is still valid
      if (Date.now() - timestamp < CACHE_DURATION_MS) {
        console.log(`✅ Isochrone cache HIT for ${mode} ${minutes}min at (${lat.toFixed(4)}, ${lon.toFixed(4)})`)
        return data
      }

      // Cache expired, remove it
      localStorage.removeItem(cacheKey)
      console.log(`⏰ Isochrone cache EXPIRED for ${cacheKey}`)
    }
  } catch (error) {
    console.warn('Error reading isochrone cache:', error)
    // Continue to fetch from API
  }

  // Cache miss or expired - fetch from API
  console.log(`🌐 Isochrone cache MISS - fetching from API for ${mode} ${minutes}min`)
  const data = await fetchIsochrone(lat, lon, mode, minutes)

  // Cache the result
  try {
    const cached: CachedIsochrone = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(cacheKey, JSON.stringify(cached))
    console.log(`💾 Cached isochrone for ${cacheKey}`)
  } catch (error) {
    console.warn('Error caching isochrone:', error)
    // If localStorage is full, try clearing old entries
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      clearOldIsochroneCache()
      // Try caching again
      try {
        const cached: CachedIsochrone = {
          data,
          timestamp: Date.now(),
        }
        localStorage.setItem(cacheKey, JSON.stringify(cached))
      } catch {
        // Still failed, give up on caching this one
      }
    }
  }

  return data
}

/**
 * Clear old cached isochrones to free up space
 * Removes oldest half of cached entries
 */
function clearOldIsochroneCache(): void {
  try {
    const keys = Object.keys(localStorage)
    const isochroneKeys = keys.filter(k => k.startsWith(ISOCHRONE_CACHE_KEY_PREFIX))

    // Sort by timestamp, remove oldest half
    const entries = isochroneKeys
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

    console.log(`🗑️ Cleared ${toRemove.length} old isochrone cache entries`)
  } catch (error) {
    console.warn('Error clearing old isochrone cache:', error)
  }
}

/**
 * Clear all cached isochrones
 */
export function clearAllIsochroneCache(): void {
  try {
    const keys = Object.keys(localStorage)
    const isochroneKeys = keys.filter(k => k.startsWith(ISOCHRONE_CACHE_KEY_PREFIX))
    isochroneKeys.forEach(key => localStorage.removeItem(key))
    console.log(`🗑️ Cleared ${isochroneKeys.length} cached isochrones`)
  } catch (error) {
    console.warn('Error clearing isochrone cache:', error)
  }
}
