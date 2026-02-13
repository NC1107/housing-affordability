/**
 * Downloads Census 500k ZCTA cartographic boundary shapefile,
 * simplifies geometry with mapshaper, and outputs per-state
 * GeoJSON files to public/data/zcta/{STATE}.json
 *
 * Usage: npm run build-zcta
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import mapshaper from 'mapshaper'

const OUT_DIR = join(import.meta.dirname, '..', 'public', 'data', 'zcta')
const CACHE_DIR = join(import.meta.dirname)

// Census 500k cartographic boundary shapefile (~64MB)
const ZCTA_URL = 'https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip'

async function main() {
  // Ensure output dirs exist
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true })
  }

  // --- 1. Download & extract shapefile ---
  const zipPath = join(CACHE_DIR, 'cb_2020_us_zcta520_500k.zip')
  const shpPath = join(CACHE_DIR, 'cb_2020_us_zcta520_500k.shp')

  if (!existsSync(shpPath)) {
    if (!existsSync(zipPath)) {
      console.log('Downloading Census ZCTA shapefile (~64 MB)...')
      const res = await fetch(ZCTA_URL)
      if (!res.ok) throw new Error(`Failed: ${res.status} ${res.statusText}`)
      const buf = Buffer.from(await res.arrayBuffer())
      writeFileSync(zipPath, buf)
      console.log(`  Cached to ${zipPath}`)
    } else {
      console.log('Using cached ZCTA shapefile ZIP...')
    }

    console.log('Extracting shapefile...')
    const zip = new AdmZip(zipPath)
    // Extract all shapefile components (.shp, .dbf, .shx, .prj, .cpg)
    zip.extractAllTo(CACHE_DIR, true)
    console.log('  Extracted shapefile components')
  } else {
    console.log('Using cached extracted shapefile...')
  }

  // --- 2. Load housing data for ZIP-to-state mapping ---
  const housingPath = join(import.meta.dirname, '..', 'public', 'data', 'housing-data.json')
  if (!existsSync(housingPath)) {
    throw new Error('housing-data.json not found. Run "npm run fetch-data" first.')
  }

  const housingRaw = JSON.parse(readFileSync(housingPath, 'utf-8'))
  const zipToState = new Map<string, string>()
  for (const [zip, data] of Object.entries(housingRaw)) {
    if (zip === '_meta') continue
    const rec = data as { state?: string }
    if (rec.state) {
      zipToState.set(zip, rec.state)
    }
  }
  console.log(`  Loaded state mapping for ${zipToState.size} ZIPs`)

  // --- 3. Simplify with mapshaper ---
  console.log('Simplifying shapefile with mapshaper (15% vertex retention)...')
  const result = await mapshaper.applyCommands(
    `-i "${shpPath}" -simplify 15% -o format=geojson`
  )

  // mapshaper returns output as object with file content
  const outputKey = Object.keys(result).find(k => k.endsWith('.json'))
  if (!outputKey || !result[outputKey]) {
    throw new Error('mapshaper did not produce GeoJSON output')
  }

  const geojson = JSON.parse(result[outputKey].toString()) as GeoJSON.FeatureCollection
  console.log(`  Simplified to ${geojson.features.length} ZCTA features`)

  // --- 4. Group by state ---
  const stateFeatures = new Map<string, GeoJSON.Feature[]>()
  let matched = 0
  let unmatched = 0

  for (const feature of geojson.features) {
    const props = feature.properties as Record<string, string>
    // ZCTA property field names vary: ZCTA5CE20, GEOID20, ZCTA5CE10, AFFGEOID20
    const zip = props.ZCTA5CE20 || props.GEOID20 || props.ZCTA5CE10 || ''
    const state = zipToState.get(zip)

    if (!state) {
      unmatched++
      continue
    }
    matched++

    if (!stateFeatures.has(state)) {
      stateFeatures.set(state, [])
    }
    stateFeatures.get(state)!.push({
      ...feature,
      properties: { zip }, // slim down properties to just the ZIP
    })
  }

  console.log(`  Matched ${matched} ZCTAs to states, ${unmatched} unmatched (no housing data)`)

  // --- 5. Write per-state GeoJSON files ---
  let totalSize = 0
  for (const [state, features] of stateFeatures) {
    const stateGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features,
    }
    const filePath = join(OUT_DIR, `${state}.json`)
    const json = JSON.stringify(stateGeoJson)
    writeFileSync(filePath, json)
    const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2)
    totalSize += Buffer.byteLength(json)
    console.log(`  ${state}: ${features.length} ZCTAs (${sizeMB} MB)`)
  }

  console.log(`\nWrote ${stateFeatures.size} state files to ${OUT_DIR}`)
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`)
  console.log('Done!')
}

main().catch(console.error)
