/**
 * Downloads Zillow ZHVI (home values) and ZORI (rents) CSVs,
 * plus Census ZCTA centroids and US state boundaries, and outputs:
 *   public/data/housing-data.json
 *   public/data/zip-centroids.json
 *   public/data/us-states.json
 *
 * Usage: npm run fetch-data
 */
import { parse } from 'csv-parse/sync'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'

const OUT_DIR = join(import.meta.dirname, '..', 'public', 'data')

// Zillow CSV URLs (ZIP-level, all homes, smoothed & seasonally adjusted)
const ZHVI_URL = 'https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv'
const ZORI_URL = 'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_sa_month.csv'

// Census Bureau ZCTA Gazetteer (tab-delimited inside a ZIP archive, has lat/lon centroids)
const GAZETTEER_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip'
const GAZETTEER_FALLBACK = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip'

// US state boundaries GeoJSON (20m resolution — lightweight, ~1.2 MB)
const US_STATES_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

async function fetchText(url: string, label: string): Promise<string> {
  console.log(`Downloading ${label}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${label}: ${res.status} ${res.statusText}`)
  return await res.text()
}

async function fetchJson(url: string, label: string): Promise<unknown> {
  console.log(`Downloading ${label}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${label}: ${res.status} ${res.statusText}`)
  return await res.json()
}

async function fetchBuffer(url: string, label: string): Promise<Buffer> {
  console.log(`Downloading ${label}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${label}: ${res.status} ${res.statusText}`)
  const arrayBuf = await res.arrayBuffer()
  return Buffer.from(arrayBuf)
}

function getLatestValue(row: Record<string, string>): number | null {
  const dateKeys = Object.keys(row).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
  for (let i = dateKeys.length - 1; i >= 0; i--) {
    const val = row[dateKeys[i]]
    if (val && val.trim() !== '') {
      const num = parseFloat(val)
      return isNaN(num) ? null : num
    }
  }
  return null
}

function getLatestDateColumn(rows: Record<string, string>[]): string | null {
  if (!rows.length) return null
  const dateKeys = Object.keys(rows[0]).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
  return dateKeys.length ? dateKeys[dateKeys.length - 1] : null
}

function parseGazetteerText(text: string) {
  const lines = text.split('\n').filter((l) => l.trim())
  const features: Array<{
    type: 'Feature'
    properties: { ZCTA5CE20: string }
    geometry: { type: 'Point'; coordinates: [number, number] }
  }> = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (cols.length < 7) continue
    const geoid = cols[0].trim()
    const lat = parseFloat(cols[cols.length - 2]?.trim())
    const lon = parseFloat(cols[cols.length - 1]?.trim())

    if (geoid && !isNaN(lat) && !isNaN(lon)) {
      features.push({
        type: 'Feature',
        properties: { ZCTA5CE20: geoid.padStart(5, '0') },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      })
    }
  }
  return features
}

// FIPS code → state abbreviation + name mapping
const STATE_FIPS: Record<string, { abbr: string; name: string }> = {
  '01': { abbr: 'AL', name: 'Alabama' }, '02': { abbr: 'AK', name: 'Alaska' },
  '04': { abbr: 'AZ', name: 'Arizona' }, '05': { abbr: 'AR', name: 'Arkansas' },
  '06': { abbr: 'CA', name: 'California' }, '08': { abbr: 'CO', name: 'Colorado' },
  '09': { abbr: 'CT', name: 'Connecticut' }, '10': { abbr: 'DE', name: 'Delaware' },
  '11': { abbr: 'DC', name: 'District of Columbia' }, '12': { abbr: 'FL', name: 'Florida' },
  '13': { abbr: 'GA', name: 'Georgia' }, '15': { abbr: 'HI', name: 'Hawaii' },
  '16': { abbr: 'ID', name: 'Idaho' }, '17': { abbr: 'IL', name: 'Illinois' },
  '18': { abbr: 'IN', name: 'Indiana' }, '19': { abbr: 'IA', name: 'Iowa' },
  '20': { abbr: 'KS', name: 'Kansas' }, '21': { abbr: 'KY', name: 'Kentucky' },
  '22': { abbr: 'LA', name: 'Louisiana' }, '23': { abbr: 'ME', name: 'Maine' },
  '24': { abbr: 'MD', name: 'Maryland' }, '25': { abbr: 'MA', name: 'Massachusetts' },
  '26': { abbr: 'MI', name: 'Michigan' }, '27': { abbr: 'MN', name: 'Minnesota' },
  '28': { abbr: 'MS', name: 'Mississippi' }, '29': { abbr: 'MO', name: 'Missouri' },
  '30': { abbr: 'MT', name: 'Montana' }, '31': { abbr: 'NE', name: 'Nebraska' },
  '32': { abbr: 'NV', name: 'Nevada' }, '33': { abbr: 'NH', name: 'New Hampshire' },
  '34': { abbr: 'NJ', name: 'New Jersey' }, '35': { abbr: 'NM', name: 'New Mexico' },
  '36': { abbr: 'NY', name: 'New York' }, '37': { abbr: 'NC', name: 'North Carolina' },
  '38': { abbr: 'ND', name: 'North Dakota' }, '39': { abbr: 'OH', name: 'Ohio' },
  '40': { abbr: 'OK', name: 'Oklahoma' }, '41': { abbr: 'OR', name: 'Oregon' },
  '42': { abbr: 'PA', name: 'Pennsylvania' }, '44': { abbr: 'RI', name: 'Rhode Island' },
  '45': { abbr: 'SC', name: 'South Carolina' }, '46': { abbr: 'SD', name: 'South Dakota' },
  '47': { abbr: 'TN', name: 'Tennessee' }, '48': { abbr: 'TX', name: 'Texas' },
  '49': { abbr: 'UT', name: 'Utah' }, '50': { abbr: 'VT', name: 'Vermont' },
  '51': { abbr: 'VA', name: 'Virginia' }, '53': { abbr: 'WA', name: 'Washington' },
  '54': { abbr: 'WV', name: 'West Virginia' }, '55': { abbr: 'WI', name: 'Wisconsin' },
  '56': { abbr: 'WY', name: 'Wyoming' }, '72': { abbr: 'PR', name: 'Puerto Rico' },
}

async function main() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true })
  }

  // --- 1. Fetch Zillow ZHVI (home values) ---
  // Track state+city per zip from ZHVI rows
  let zhviMap: Record<string, number | null> = {}
  const zipStateMap: Record<string, string> = {}   // zip → "NY"
  const zipNameMap: Record<string, string> = {}     // zip → "New York, NY"
  let zhviDate: string | null = null
  try {
    const zhviCsv = await fetchText(ZHVI_URL, 'Zillow ZHVI (home values)')
    const zhviRows = parse(zhviCsv, { columns: true, skip_empty_lines: true }) as Record<string, string>[]
    console.log(`  Parsed ${zhviRows.length} ZHVI rows`)
    zhviDate = getLatestDateColumn(zhviRows)
    if (zhviDate) console.log(`  Latest ZHVI data: ${zhviDate}`)

    for (const row of zhviRows) {
      const zip = (row['RegionName'] || '').padStart(5, '0')
      if (zip.length === 5) {
        zhviMap[zip] = getLatestValue(row)
        // Capture state and city info
        const state = row['State'] || ''
        const city = row['City'] || ''
        if (state) {
          zipStateMap[zip] = state.toUpperCase()
          if (city) {
            zipNameMap[zip] = `${city}, ${state.toUpperCase()}`
          }
        }
      }
    }
    console.log(`  Captured state info for ${Object.keys(zipStateMap).length} ZIPs`)
  } catch (err) {
    console.warn('  Warning: Could not fetch ZHVI data:', (err as Error).message)
    console.warn('  Zillow may have changed their CSV URLs. Check https://www.zillow.com/research/data/')
  }

  // --- 2. Fetch Zillow ZORI (rents) ---
  let zoriMap: Record<string, number | null> = {}
  let zoriDate: string | null = null
  try {
    const zoriCsv = await fetchText(ZORI_URL, 'Zillow ZORI (rents)')
    const zoriRows = parse(zoriCsv, { columns: true, skip_empty_lines: true }) as Record<string, string>[]
    console.log(`  Parsed ${zoriRows.length} ZORI rows`)
    zoriDate = getLatestDateColumn(zoriRows)
    if (zoriDate) console.log(`  Latest ZORI data: ${zoriDate}`)

    for (const row of zoriRows) {
      const zip = (row['RegionName'] || '').padStart(5, '0')
      if (zip.length === 5) {
        zoriMap[zip] = getLatestValue(row)
        // Also capture state from ZORI for ZIPs not in ZHVI
        if (!zipStateMap[zip]) {
          const state = row['State'] || ''
          const city = row['City'] || ''
          if (state) {
            zipStateMap[zip] = state.toUpperCase()
            if (city) {
              zipNameMap[zip] = `${city}, ${state.toUpperCase()}`
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('  Warning: Could not fetch ZORI data:', (err as Error).message)
  }

  // --- 3. Merge into housing-data.json ---
  const allZips = new Set([...Object.keys(zhviMap), ...Object.keys(zoriMap)])
  const zipData: Record<string, { state?: string; name?: string; medianHomeValue: number | null; medianRent: number | null }> = {}

  for (const zip of allZips) {
    zipData[zip] = {
      ...(zipStateMap[zip] ? { state: zipStateMap[zip] } : {}),
      ...(zipNameMap[zip] ? { name: zipNameMap[zip] } : {}),
      medianHomeValue: zhviMap[zip] ?? null,
      medianRent: zoriMap[zip] ?? null,
    }
  }

  const housingData = {
    _meta: {
      zhviDate,
      zoriDate,
      fetchedAt: new Date().toISOString().split('T')[0],
    },
    ...zipData,
  }

  const housingPath = join(OUT_DIR, 'housing-data.json')
  writeFileSync(housingPath, JSON.stringify(housingData))
  console.log(`\nWrote ${Object.keys(zipData).length} ZIP codes to ${housingPath}`)
  const housingSize = (Buffer.byteLength(JSON.stringify(housingData)) / 1024 / 1024).toFixed(1)
  console.log(`  File size: ~${housingSize} MB`)
  console.log(`  ZIPs with state info: ${Object.values(zipData).filter(d => d.state).length}`)

  // --- 4. Fetch Census Gazetteer ZCTA centroids (ZIP archive) ---
  let centroidFeatures: ReturnType<typeof parseGazetteerText> = []

  for (const url of [GAZETTEER_URL, GAZETTEER_FALLBACK]) {
    try {
      const buf = await fetchBuffer(url, 'Census ZCTA Gazetteer')
      const zip = new AdmZip(buf)
      const entries = zip.getEntries()

      // Find the text file inside the ZIP
      const textEntry = entries.find((e) => e.entryName.endsWith('.txt'))
      if (!textEntry) throw new Error('No .txt file found in ZIP archive')

      const gazText = textEntry.getData().toString('utf-8')
      centroidFeatures = parseGazetteerText(gazText)

      if (centroidFeatures.length > 0) {
        console.log(`  Parsed ${centroidFeatures.length} ZCTA centroids`)
        break
      }
    } catch (err) {
      console.warn(`  Warning: Could not fetch from ${url}:`, (err as Error).message)
    }
  }

  if (centroidFeatures.length === 0) {
    console.error('Could not fetch Gazetteer data from any source.')
    console.log('Download manually from: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html')
  } else {
    const centroidGeoJson = { type: 'FeatureCollection' as const, features: centroidFeatures }
    const centroidPath = join(OUT_DIR, 'zip-centroids.json')
    writeFileSync(centroidPath, JSON.stringify(centroidGeoJson))
    console.log(`Wrote ${centroidFeatures.length} ZIP centroids to ${centroidPath}`)
    const centroidSize = (Buffer.byteLength(JSON.stringify(centroidGeoJson)) / 1024 / 1024).toFixed(1)
    console.log(`  File size: ~${centroidSize} MB`)
  }

  // --- 5. Fetch US state boundaries (TopoJSON → convert to GeoJSON) ---
  try {
    const topoData = await fetchJson(US_STATES_URL, 'US state boundaries (TopoJSON)') as {
      type: string
      objects: { states: { type: string; geometries: Array<{ type: string; arcs: unknown; properties: { name: string }; id: string }> } }
      arcs: number[][][]
      transform?: { scale: [number, number]; translate: [number, number] }
    }

    // We need to convert TopoJSON to GeoJSON. Import topojson-client.
    // Since we may not have it installed, let's do a simple inline conversion
    // Actually, let's use a simpler approach — fetch a pre-made GeoJSON
    // Try an alternative GeoJSON source
    console.log('  Converting TopoJSON to GeoJSON...')

    // Use dynamic import of topojson-client
    let feature: (topology: unknown, object: unknown) => GeoJSON.FeatureCollection
    try {
      const topojson = await import('topojson-client')
      feature = topojson.feature as typeof feature
    } catch {
      // topojson-client not installed, try alternative GeoJSON source
      console.log('  topojson-client not available, fetching pre-made GeoJSON...')
      const geoRes = await fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
      if (!geoRes.ok) throw new Error('Failed to fetch US states GeoJSON')
      const geoJson = await geoRes.json() as GeoJSON.FeatureCollection
      // Add STUSPS (state abbreviation) from the name field
      // This GeoJSON has properties.name (full name) and properties.density
      // We need to add the abbreviation
      const nameToAbbr: Record<string, string> = {}
      for (const info of Object.values(STATE_FIPS)) {
        nameToAbbr[info.name] = info.abbr
      }
      for (const feat of geoJson.features) {
        const name = (feat.properties as Record<string, string>).name
        const abbr = nameToAbbr[name]
        if (abbr) {
          ;(feat.properties as Record<string, string>).STUSPS = abbr
        }
      }
      const statesPath = join(OUT_DIR, 'us-states.json')
      writeFileSync(statesPath, JSON.stringify(geoJson))
      const statesSize = (Buffer.byteLength(JSON.stringify(geoJson)) / 1024 / 1024).toFixed(1)
      console.log(`Wrote ${geoJson.features.length} state boundaries to ${statesPath}`)
      console.log(`  File size: ~${statesSize} MB`)
      console.log('\nDone! Housing data is ready in public/data/')
      return
    }

    const geoJson = feature(topoData, topoData.objects.states)
    // Add state abbreviation from FIPS
    for (const feat of geoJson.features) {
      const fipsId = String(feat.id).padStart(2, '0')
      const stateInfo = STATE_FIPS[fipsId]
      if (stateInfo) {
        ;(feat.properties as Record<string, string>).STUSPS = stateInfo.abbr
        ;(feat.properties as Record<string, string>).NAME = stateInfo.name
      }
    }

    const statesPath = join(OUT_DIR, 'us-states.json')
    writeFileSync(statesPath, JSON.stringify(geoJson))
    const statesSize = (Buffer.byteLength(JSON.stringify(geoJson)) / 1024 / 1024).toFixed(1)
    console.log(`Wrote ${geoJson.features.length} state boundaries to ${statesPath}`)
    console.log(`  File size: ~${statesSize} MB`)
  } catch (err) {
    console.warn('  Warning: Could not fetch US state boundaries:', (err as Error).message)
    console.warn('  Choropleth map will not be available.')
  }

  console.log('\nDone! Housing data is ready in public/data/')
}

main().catch(console.error)
