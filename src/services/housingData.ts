import pointsWithinPolygon from '@turf/points-within-polygon'
import { featureCollection, point } from '@turf/helpers'
import type { HousingDataEntry, HousingStats, DataMeta, AffordabilityInputs, StateAffordability } from '../types'
import { getAffordabilityTier } from './mortgage'

interface ZipRecord {
  name?: string
  state?: string
  medianHomeValue: number | null
  medianRent: number | null
  fmr?: {
    br0: number | null
    br1: number | null
    br2: number | null
    br3: number | null
    br4: number | null
  }
}

interface RawHousingData {
  [zip: string]: ZipRecord
}

interface ZipCentroid {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: { ZCTA5CE20: string }
    geometry: { type: 'Point'; coordinates: [number, number] }
  }>
}

let housingDataCache: RawHousingData | null = null
let metaCache: DataMeta | null = null
let centroidCache: ZipCentroid | null = null

async function loadHousingData(): Promise<RawHousingData> {
  if (housingDataCache) return housingDataCache
  try {
    const res = await fetch('/data/housing-data.json')
    if (!res.ok) throw new Error('Housing data not found')
    const raw = await res.json()
    // Extract _meta before caching zip data
    if (raw._meta) {
      metaCache = raw._meta as DataMeta
      delete raw._meta
    }
    housingDataCache = raw
    return housingDataCache!
  } catch {
    console.warn('Housing data not available. Run: npm run fetch-data')
    housingDataCache = {}
    return housingDataCache
  }
}

async function loadCentroids(): Promise<ZipCentroid> {
  if (centroidCache) return centroidCache
  try {
    const res = await fetch('/data/zip-centroids.json')
    if (!res.ok) throw new Error('Centroid data not found')
    centroidCache = await res.json()
    return centroidCache!
  } catch {
    console.warn('ZIP centroid data not available. Run: npm run fetch-data')
    centroidCache = { type: 'FeatureCollection', features: [] }
    return centroidCache
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function buildStats(entries: HousingDataEntry[]): HousingStats {
  const homeValues = entries.map((e) => e.medianHomeValue).filter((v): v is number => v !== null)
  const rents = entries.map((e) => e.medianRent).filter((v): v is number => v !== null)

  return {
    zipCount: entries.length,
    medianHomeValue: median(homeValues),
    medianRent: median(rents),
    minHomeValue: homeValues.length ? Math.min(...homeValues) : null,
    maxHomeValue: homeValues.length ? Math.max(...homeValues) : null,
    minRent: rents.length ? Math.min(...rents) : null,
    maxRent: rents.length ? Math.max(...rents) : null,
    entries,
    meta: metaCache ?? undefined,
  }
}

// State abbreviation → full name
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
}

export async function getHousingForIsochrone(
  isochroneGeoJson: GeoJSON.FeatureCollection
): Promise<HousingStats> {
  const [housingData, centroids] = await Promise.all([
    loadHousingData(),
    loadCentroids(),
  ])

  if (!centroids.features.length || !Object.keys(housingData).length) {
    return buildStats([])
  }

  // Build a Turf FeatureCollection of centroid points
  const centroidPoints = featureCollection(
    centroids.features.map((f) =>
      point(f.geometry.coordinates, { ZCTA5CE20: f.properties.ZCTA5CE20 })
    )
  )

  // Find centroids within the isochrone polygon
  const polygon = isochroneGeoJson.features[0]
  const withinPolygon = featureCollection([polygon as GeoJSON.Feature<GeoJSON.Polygon>])
  const matchingPoints = pointsWithinPolygon(centroidPoints, withinPolygon as GeoJSON.FeatureCollection<GeoJSON.Polygon>)

  const entries: HousingDataEntry[] = matchingPoints.features
    .map((f) => {
      const zip = f.properties?.ZCTA5CE20 as string
      const data = housingData[zip]
      const [lon, lat] = f.geometry.coordinates as [number, number]
      return {
        zip,
        name: data?.name,
        state: data?.state,
        lat,
        lon,
        medianHomeValue: data?.medianHomeValue ?? null,
        medianRent: data?.medianRent ?? null,
        fmr: data?.fmr,
      }
    })

  return buildStats(entries)
}

/**
 * Find all affordable ZIPs nationwide (no address needed).
 * Returns state-level affordability stats + individual ZIP entries.
 */
export async function getAffordableNationwide(
  inputs: AffordabilityInputs
): Promise<{ states: StateAffordability[]; allEntries: HousingDataEntry[]; stats: HousingStats }> {
  const [housingData, centroids] = await Promise.all([
    loadHousingData(),
    loadCentroids(),
  ])

  // Build centroid lookup: zip → {lat, lon}
  const centroidMap = new Map<string, { lat: number; lon: number }>()
  for (const f of centroids.features) {
    const [lon, lat] = f.geometry.coordinates
    centroidMap.set(f.properties.ZCTA5CE20, { lat, lon })
  }

  // Build all entries with affordability tier
  const allEntries: HousingDataEntry[] = []
  const stateMap = new Map<string, { entries: HousingDataEntry[]; affordable: number; stretch: number; unaffordable: number; total: number }>()

  for (const [zip, data] of Object.entries(housingData)) {
    const coords = centroidMap.get(zip)
    if (!coords) continue

    const entry: HousingDataEntry = {
      zip,
      name: data.name,
      state: data.state,
      lat: coords.lat,
      lon: coords.lon,
      medianHomeValue: data.medianHomeValue,
      medianRent: data.medianRent,
      fmr: data.fmr,
    }

    const tier = getAffordabilityTier(data.medianHomeValue, inputs)
    const stateCode = data.state || 'Unknown'

    if (!stateMap.has(stateCode)) {
      stateMap.set(stateCode, { entries: [], affordable: 0, stretch: 0, unaffordable: 0, total: 0 })
    }
    const stateInfo = stateMap.get(stateCode)!

    if (data.medianHomeValue !== null) {
      stateInfo.total++
      if (tier === 'affordable') {
        stateInfo.affordable++
        stateInfo.entries.push(entry)
        allEntries.push(entry)
      } else if (tier === 'stretch') {
        stateInfo.stretch++
        stateInfo.entries.push(entry)
        allEntries.push(entry)
      } else {
        stateInfo.unaffordable++
      }
    }
  }

  // Build state summaries
  const states: StateAffordability[] = []
  for (const [stateCode, info] of stateMap) {
    if (stateCode === 'Unknown' || info.total === 0) continue
    const homeValues = info.entries.map(e => e.medianHomeValue).filter((v): v is number => v !== null)
    const rents = info.entries.map(e => e.medianRent).filter((v): v is number => v !== null)

    states.push({
      state: stateCode,
      stateName: STATE_NAMES[stateCode] || stateCode,
      totalZips: info.total,
      affordableCount: info.affordable,
      stretchCount: info.stretch,
      unaffordableCount: info.unaffordable,
      pctAffordable: Math.round(((info.affordable + info.stretch) / info.total) * 100),
      medianHomeValue: median(homeValues),
      medianRent: median(rents),
    })
  }

  // Sort by pctAffordable descending
  states.sort((a, b) => b.pctAffordable - a.pctAffordable)

  return {
    states,
    allEntries,
    stats: buildStats(allEntries),
  }
}
