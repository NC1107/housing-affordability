import React, { useState, useEffect, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, GeoJSON, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeocodedLocation, StateAffordability, HousingDataEntry, ZipMarker, FocusZip } from '../types'
import MapLegend from './MapLegend'
import { fetchMultipleZipBoundaries } from '../services/zipBoundaries'

// Fix default marker icon issue with bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined

type TileStyleKey = 'osm-bright' | 'positron' | 'dark-matter' | 'osm-carto' | 'toner' | 'klokantech-basic'

const TILE_STYLES: { key: TileStyleKey; label: string }[] = [
  { key: 'osm-bright', label: 'Bright' },
  { key: 'positron', label: 'Light' },
  { key: 'dark-matter', label: 'Dark' },
  { key: 'osm-carto', label: 'Detailed' },
  { key: 'toner', label: 'B&W' },
  { key: 'klokantech-basic', label: 'Minimal' },
]

function getTileUrl(style: TileStyleKey): string {
  if (!API_KEY) return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  return `https://maps.geoapify.com/v1/tile/${style}/{z}/{x}/{y}.png?apiKey=${API_KEY}`
}

function ZoomControl() {
  // Zoom controls disabled - users can use scroll wheel or pinch-to-zoom
  // Removing buttons prevents UI overlap with legend and cleaner mobile experience
  return null
}

function TileLayerSwitcher({ style, onStyleChange }: { style: TileStyleKey; onStyleChange: (s: TileStyleKey) => void }) {
  const map = useMap()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!API_KEY) return // No switcher without API key (only OSM tiles available)

    // Hide on mobile - too cluttered, show on desktop top-right
    const isMobile = window.innerWidth < 768
    if (isMobile) return

    const control = new (L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create('div', 'leaflet-bar')
        div.style.cssText = 'background:white;padding:4px 6px;border-radius:4px;font-size:12px;'
        L.DomEvent.disableClickPropagation(div)
        L.DomEvent.disableScrollPropagation(div)
        containerRef.current = div
        return div
      },
    }))({ position: 'topright' as L.ControlPosition })

    control.addTo(map)

    return () => {
      control.remove()
    }
  }, [map])

  useEffect(() => {
    if (!containerRef.current) return
    const div = containerRef.current
    div.innerHTML = ''
    const select = document.createElement('select')
    select.style.cssText = 'border:none;outline:none;font-size:12px;cursor:pointer;background:transparent;'
    for (const s of TILE_STYLES) {
      const opt = document.createElement('option')
      opt.value = s.key
      opt.textContent = s.label
      opt.selected = s.key === style
      select.appendChild(opt)
    }
    select.addEventListener('change', () => {
      onStyleChange(select.value as TileStyleKey)
    })
    div.appendChild(select)
  }, [style, onStyleChange])

  return null
}

function DebugButton({ enabled, onToggle, zipCount }: { enabled: boolean; onToggle: () => void; zipCount: number }) {
  const map = useMap()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Hide on mobile (screen width < 768px)
    const isMobile = window.innerWidth < 768
    if (isMobile) return

    const control = new (L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create('div', 'leaflet-bar')
        div.style.cssText = 'background:white;padding:6px 8px;border-radius:4px;'
        L.DomEvent.disableClickPropagation(div)
        L.DomEvent.disableScrollPropagation(div)
        containerRef.current = div
        return div
      },
    }))({ position: 'bottomleft' as L.ControlPosition })

    control.addTo(map)

    return () => {
      control.remove()
    }
  }, [map])

  useEffect(() => {
    if (!containerRef.current) return
    const div = containerRef.current
    div.innerHTML = ''

    const button = document.createElement('button')
    button.style.cssText = `
      border:none;
      outline:none;
      font-size:11px;
      cursor:pointer;
      background:${enabled ? '#3b82f6' : '#f3f4f6'};
      color:${enabled ? 'white' : '#6b7280'};
      padding:4px 8px;
      border-radius:4px;
      font-weight:500;
    `
    button.textContent = `${enabled ? '\u2713' : '\u25CB'} Show Loaded ZIPs${zipCount > 0 ? ` (${zipCount})` : ''}`
    button.addEventListener('click', onToggle)
    div.appendChild(button)
  }, [enabled, onToggle, zipCount])

  return null
}

const ISOCHRONE_STYLE: L.PathOptions = {
  color: '#3b82f6',
  weight: 2,
  opacity: 0.8,
  fillColor: '#3b82f6',
  fillOpacity: 0.15,
}

function FitBounds({ geojson }: { geojson: GeoJSON.FeatureCollection | null }) {
  const map = useMap()
  const prevBoundsRef = useRef<string>('')

  useEffect(() => {
    if (!geojson?.features?.length) return
    const layer = L.geoJSON(geojson)
    const bounds = layer.getBounds()
    const key = bounds.toBBoxString()
    if (key !== prevBoundsRef.current) {
      prevBoundsRef.current = key
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [geojson, map])

  return null
}

function FlyToLocation({ location }: { location: GeocodedLocation | null }) {
  const map = useMap()
  const prevRef = useRef<string>('')

  useEffect(() => {
    if (!location) return
    const key = `${location.lat},${location.lon}`
    if (key !== prevRef.current) {
      prevRef.current = key
      map.flyTo([location.lat, location.lon], 12, { duration: 1 })
    }
  }, [location, map])

  return null
}

function FlyToZip({ focus, zctaGeoJson }: { focus: FocusZip | null; zctaGeoJson: GeoJSON.FeatureCollection | null }) {
  const map = useMap()
  const prevRef = useRef<string>('')

  useEffect(() => {
    if (!focus) return
    const key = `${focus.zip}-${focus._t ?? 0}`
    if (key !== prevRef.current) {
      prevRef.current = key

      // Try to find the ZIP polygon bounds from ZCTA data
      if (zctaGeoJson) {
        const feature = zctaGeoJson.features.find(
          f => (f.properties as Record<string, string>)?.zip === focus.zip
        )

        if (feature && feature.geometry.type === 'Polygon') {
          const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][]
          const bounds = L.latLngBounds(coords.map(c => [c[1], c[0]]))
          map.fitBounds(bounds, { padding: [50, 50], duration: 1 })
          return
        }
      }

      // Fallback: fly to centroid with fixed zoom
      map.flyTo([focus.lat, focus.lon], 12, { duration: 1 })
    }
  }, [focus, map, zctaGeoJson])

  return null
}

function FitStateBounds({ stateGeoJson, stateCode }: { stateGeoJson: GeoJSON.FeatureCollection | null; stateCode: string | null }) {
  const map = useMap()
  const prevRef = useRef<string | null>(null)

  useEffect(() => {
    if (!stateGeoJson || !stateCode) return
    if (stateCode === prevRef.current) return
    prevRef.current = stateCode

    const feature = stateGeoJson.features.find(
      (f) => (f.properties as Record<string, string>)?.STUSPS === stateCode
        || (f.properties as Record<string, string>)?.name === stateCode
    )
    if (feature) {
      const layer = L.geoJSON(feature)
      map.fitBounds(layer.getBounds(), { padding: [40, 40] })
    }
  }, [stateGeoJson, stateCode, map])

  return null
}


// Color scale: red (0% affordable) -> green (100%)
function affordabilityColor(pct: number): string {
  if (pct >= 80) return '#15803d'
  if (pct >= 60) return '#22c55e'
  if (pct >= 40) return '#86efac'
  if (pct >= 20) return '#fbbf24'
  if (pct >= 10) return '#f97316'
  return '#dc2626'
}

interface ChoroplethLayerProps {
  stateGeoJson: GeoJSON.FeatureCollection
  stateData: StateAffordability[]
  onStateClick: (stateCode: string) => void
  selectedState: string | null
}

function ChoroplethLayer({ stateGeoJson, stateData, onStateClick, selectedState }: ChoroplethLayerProps) {
  const dataMap = useMemo(() => {
    const m = new Map<string, StateAffordability>()
    for (const s of stateData) {
      m.set(s.state, s)
      m.set(s.stateName, s)
    }
    return m
  }, [stateData])

  const styleFunc = useMemo(() => {
    return (feature: GeoJSON.Feature | undefined) => {
      if (!feature) return {}
      const abbr = (feature.properties as Record<string, string>)?.STUSPS
      const name = (feature.properties as Record<string, string>)?.name
      const info = (abbr && dataMap.get(abbr)) || (name && dataMap.get(name)) || null
      const isSelected = abbr === selectedState || name === selectedState

      if (!info) {
        return {
          fillColor: '#e5e7eb',
          fillOpacity: 0.5,
          color: '#9ca3af',
          weight: isSelected ? 3 : 1,
        }
      }

      return {
        fillColor: affordabilityColor(info.pctAffordable),
        fillOpacity: isSelected ? 0.9 : 0.7,
        color: isSelected ? '#1e3a5f' : '#374151',
        weight: isSelected ? 3 : 1,
      }
    }
  }, [dataMap, selectedState])

  const onEachFeature = useMemo(() => {
    return (feature: GeoJSON.Feature, layer: L.Layer) => {
      const abbr = (feature.properties as Record<string, string>)?.STUSPS
      const name = (feature.properties as Record<string, string>)?.name
      const info = (abbr && dataMap.get(abbr)) || (name && dataMap.get(name)) || null

      if (info) {
        const fmt = (v: number | null) =>
          v !== null
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
            : 'N/A'
        layer.bindTooltip(
          `<strong>${info.stateName}</strong><br/>` +
          `${info.pctAffordable}% affordable<br/>` +
          `${info.affordableCount + info.stretchCount} / ${info.totalZips} ZIPs` +
          `<br/><span style="color:#6b7280;font-size:11px">` +
          `Median Home: ${fmt(info.medianHomeValue)}<br/>` +
          `Median Rent: ${fmt(info.medianRent)}/mo</span>`,
          { sticky: true }
        )
      }

      layer.on('click', () => {
        if (abbr) onStateClick(abbr)
        else if (name) {
          const stateInfo = dataMap.get(name)
          if (stateInfo) onStateClick(stateInfo.state)
        }
      })

      layer.on('mouseover', (e) => {
        const target = e.target as L.Path
        target.setStyle({ weight: 3, fillOpacity: 0.9 })
      })

      layer.on('mouseout', (e) => {
        const target = e.target as L.Path
        const isSelected = abbr === selectedState || name === selectedState
        target.setStyle({
          weight: isSelected ? 3 : 1,
          fillOpacity: isSelected ? 0.9 : 0.7,
        })
      })
    }
  }, [dataMap, onStateClick, selectedState])

  // Change #6: Replace JSON.stringify key with simpler stable key
  const key = useMemo(
    () => `choropleth-${stateData.length}-${selectedState || 'all'}`,
    [stateData.length, selectedState]
  )

  return (
    <GeoJSON
      key={key}
      data={stateGeoJson}
      style={styleFunc}
      onEachFeature={onEachFeature}
    />
  )
}

// --- ZCTA Polygon Layer (replaces CircleMarker dots when boundaries available) ---

interface ZctaLayerProps {
  zctaGeoJson: GeoJSON.FeatureCollection
  zipMarkers: ZipMarker[]
  highlightedZip: string | null
  onZipClick: (zip: string) => void
  housingEntries?: HousingDataEntry[]
}

const ZctaLayer = React.memo(function ZctaLayer({ zctaGeoJson, zipMarkers, highlightedZip, onZipClick, housingEntries }: ZctaLayerProps) {
  const tierMap = useMemo(() => {
    const m = new Map<string, 'affordable' | 'stretch' | 'unaffordable'>()
    for (const marker of zipMarkers) {
      m.set(marker.zip, marker.tier)
    }
    return m
  }, [zipMarkers])

  const entryMap = useMemo(() => {
    const m = new Map<string, HousingDataEntry>()
    if (housingEntries) {
      for (const entry of housingEntries) {
        m.set(entry.zip, entry)
      }
    }
    return m
  }, [housingEntries])

  // Change #4: Store zip -> layer references for imperative style updates
  const zipLayerMapRef = useRef<Map<string, L.Path>>(new Map())
  const prevHighlightedZipRef = useRef<string | null>(null)

  const styleFunc = useMemo(() => {
    return (feature: GeoJSON.Feature | undefined) => {
      if (!feature) return {}
      const zip = (feature.properties as Record<string, string>)?.zip || ''
      const tier = tierMap.get(zip)

      // ZIPs without housing data - use lighter gray with dashed border
      if (!tier) {
        return {
          fillColor: '#f3f4f6',
          fillOpacity: 0.2,
          color: '#d1d5db',
          weight: 1,
          dashArray: '3, 3',
        }
      }

      // Color by affordability tier: green = affordable, amber = stretch, red = unaffordable
      const fillColor =
        tier === 'affordable' ? '#22c55e' :
        tier === 'stretch' ? '#fbbf24' :
        tier === 'unaffordable' ? '#ef4444' : '#e5e7eb'

      const borderColor =
        tier === 'affordable' ? '#16a34a' :
        tier === 'stretch' ? '#d97706' :
        tier === 'unaffordable' ? '#dc2626' : '#9ca3af'

      return {
        fillColor,
        fillOpacity: 0.5,
        color: borderColor,
        weight: 1,
      }
    }
  }, [tierMap])

  const onEachFeature = useMemo(() => {
    return (feature: GeoJSON.Feature, layer: L.Layer) => {
      const zip = (feature.properties as Record<string, string>)?.zip || ''
      const tier = tierMap.get(zip)

      // Store layer reference for imperative highlight updates
      if (zip) {
        zipLayerMapRef.current.set(zip, layer as L.Path)
      }

      layer.bindTooltip(
        `<strong>${zip}</strong>${tier ? ` (${tier})` : ''}`,
        { sticky: true }
      )

      layer.on('click', () => {
        if (zip) onZipClick(zip)
      })

      layer.on('mouseover', (e) => {
        const target = e.target as L.Path
        target.setStyle({ weight: 3, fillOpacity: 0.7 })
      })

      layer.on('mouseout', (e) => {
        const target = e.target as L.Path
        const isHighlighted = zip === prevHighlightedZipRef.current
        target.setStyle({
          weight: isHighlighted ? 3 : 1,
          fillOpacity: isHighlighted ? 0.4 : 0.5,
        })
      })
    }
  }, [tierMap, entryMap, onZipClick])

  // Change #4: Imperatively update highlight styles when highlightedZip changes
  useEffect(() => {
    const prevZip = prevHighlightedZipRef.current
    const newZip = highlightedZip

    // Reset previous highlight
    if (prevZip && prevZip !== newZip) {
      const prevLayer = zipLayerMapRef.current.get(prevZip)
      if (prevLayer) {
        const tier = tierMap.get(prevZip)
        const borderColor =
          tier === 'affordable' ? '#16a34a' :
          tier === 'stretch' ? '#d97706' :
          tier === 'unaffordable' ? '#dc2626' : '#d1d5db'
        prevLayer.setStyle({
          color: borderColor,
          weight: 1,
          fillOpacity: tier ? 0.5 : 0.2,
        })
      }
    }

    // Apply new highlight
    if (newZip) {
      const newLayer = zipLayerMapRef.current.get(newZip)
      if (newLayer) {
        newLayer.setStyle({
          color: '#1d4ed8',
          weight: 3,
          fillOpacity: 0.4,
        })
      }
    }

    prevHighlightedZipRef.current = newZip
  }, [highlightedZip, tierMap])

  // Change #3: Fix ZctaLayer key - include first/last ZIP for correctness, exclude highlightedZip
  const key = useMemo(
    () => `zcta-${zipMarkers.length}-${zipMarkers[0]?.zip || ''}-${zipMarkers[zipMarkers.length - 1]?.zip || ''}`,
    [zipMarkers]
  )

  return (
    <GeoJSON
      key={key}
      data={zctaGeoJson}
      style={styleFunc}
      onEachFeature={onEachFeature}
    />
  )
})

// ZipMarker type re-exported from types
export type { ZipMarker } from '../types'

interface MapViewProps {
  location: GeocodedLocation | null
  isochrone: GeoJSON.FeatureCollection | null
  focusZip?: FocusZip | null
  stateGeoJson?: GeoJSON.FeatureCollection | null
  stateData?: StateAffordability[]
  onStateClick?: (stateCode: string) => void
  selectedState?: string | null
  zipMarkers?: ZipMarker[]
  highlightedZip?: string | null
  onZipMarkerClick?: (zip: string) => void
  zctaGeoJson?: GeoJSON.FeatureCollection | null
  housingEntries?: HousingDataEntry[]
  searchMode?: 'income' | 'address'
  onLoadAllStates?: () => void
  debugMode?: boolean
  onClearDebugZips?: () => void
}

function MapView({
  location,
  isochrone,
  focusZip,
  stateGeoJson,
  stateData,
  onStateClick,
  selectedState,
  zipMarkers,
  highlightedZip,
  onZipMarkerClick,
  zctaGeoJson,
  housingEntries,
  searchMode,
  onLoadAllStates,
  debugMode = false,
  onClearDebugZips,
}: MapViewProps) {
  const [tileStyle, setTileStyle] = useState<TileStyleKey>('osm-bright')
  const [zipBoundaries, setZipBoundaries] = useState<Map<string, GeoJSON.Feature>>(new Map())
  const [loadingBoundaries, setLoadingBoundaries] = useState(false)

  // Change #2: Ref-based counter for isochrone key instead of JSON.stringify
  const isochroneKeyRef = useRef(0)
  const prevIsochroneRef = useRef(isochrone)
  if (isochrone !== prevIsochroneRef.current) {
    isochroneKeyRef.current++
    prevIsochroneRef.current = isochrone
  }

  // Pre-compute entry lookup map for O(1) access instead of O(n) find()
  const entryMap = useMemo(() => {
    if (!housingEntries) return new Map<string, HousingDataEntry>()
    return new Map(housingEntries.map(e => [e.zip, e]))
  }, [housingEntries])

  const showChoropleth = !!stateGeoJson && !!stateData?.length && !isochrone && !selectedState && !debugMode
  // Show ZIP markers in both address mode (with isochrone) and income mode (state selected)
  const showZipMarkers = !!zipMarkers?.length

  // Determine legend mode
  const legendMode = showChoropleth ? 'choropleth' : showZipMarkers ? 'zip' : 'hidden'

  // Fetch ZIP boundaries when zipMarkers change (and not using pre-loaded zctaGeoJson)
  // ONLY fetch in income mode - use dots for address/commute mode
  useEffect(() => {
    if (!showZipMarkers || zctaGeoJson || !zipMarkers || zipMarkers.length === 0) {
      return
    }

    // Skip boundary fetching in address mode - use dots only
    if (searchMode === 'address') {
      return
    }

    const zipCodes = zipMarkers.map(m => m.zip)

    // Check which ZIPs we don't have yet
    const missingZips = zipCodes.filter(zip => !zipBoundaries.has(zip))

    if (missingZips.length === 0) {
      return
    }

    setLoadingBoundaries(true)

    fetchMultipleZipBoundaries(missingZips, () => {
      // Progress callback - boundary loading in progress
    }).then(boundaries => {
      setZipBoundaries(prevBoundaries => {
        const newMap = new Map(prevBoundaries)
        boundaries.forEach((boundary, zip) => {
          newMap.set(zip, boundary)
        })
        return newMap
      })
      setLoadingBoundaries(false)
    }).catch(() => {
      setLoadingBoundaries(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showZipMarkers, zipMarkers, zctaGeoJson])

  return (
    <div className="relative h-full w-full">
      <MapContainer
      center={[39.8283, -98.5795]}
      zoom={5}
      className="h-full w-full"
      zoomControl={false}
      preferCanvas={true}
    >
      <TileLayer
        key={tileStyle}
        url={getTileUrl(tileStyle)}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <ZoomControl />
      <TileLayerSwitcher style={tileStyle} onStyleChange={setTileStyle} />
      <DebugButton
        enabled={debugMode}
        onToggle={() => {
          if (debugMode) {
            // Turn off debug mode - clear ZIP renderings
            if (onClearDebugZips) {
              onClearDebugZips()
            }
          } else {
            // Turn on debug mode - load all states
            if (onLoadAllStates) {
              onLoadAllStates()
            }
          }
        }}
        zipCount={zctaGeoJson?.features?.length || 0}
      />

      <FlyToLocation location={location} />
      <FitBounds geojson={isochrone} />
      <FlyToZip focus={focusZip ?? null} zctaGeoJson={zctaGeoJson ?? null} />
      {/* Removed: FitUSBounds - user wants to stay at current zoom level during income search */}
      <FitStateBounds stateGeoJson={stateGeoJson ?? null} stateCode={selectedState ?? null} />

      {location && (
        <Marker position={[location.lat, location.lon]} />
      )}

      {isochrone?.features?.length && (
        <GeoJSON
          key={`isochrone-${isochroneKeyRef.current}`}
          data={isochrone}
          style={ISOCHRONE_STYLE}
        />
      )}

      {showChoropleth && stateGeoJson && stateData && onStateClick && (
        <ChoroplethLayer
          stateGeoJson={stateGeoJson}
          stateData={stateData}
          onStateClick={onStateClick}
          selectedState={selectedState ?? null}
        />
      )}

      {/* Debug Mode: Show all ZIP boundaries */}
      {debugMode && zctaGeoJson && (
        <GeoJSON
          key="debug-all-zips"
          data={zctaGeoJson}
          style={{
            fillColor: '#93c5fd',
            fillOpacity: 0.2,
            color: '#3b82f6',
            weight: 1,
          }}
        />
      )}

      {showZipMarkers && zctaGeoJson && (
        <ZctaLayer
          zctaGeoJson={zctaGeoJson}
          zipMarkers={zipMarkers!}
          highlightedZip={highlightedZip ?? null}
          onZipClick={(zip) => onZipMarkerClick?.(zip)}
          housingEntries={housingEntries}
        />
      )}

      {showZipMarkers && !zctaGeoJson && zipMarkers!.map((m) => {
        const isHighlighted = m.zip === highlightedZip
        const entry = entryMap.get(m.zip)
        const boundary = zipBoundaries.get(m.zip)

        // Only render as GeoJSON polygon in STATE search mode, use dots for COMMUTE mode
        if (boundary && searchMode === 'income' && !isochrone) {
          const fillColor = m.tier === 'affordable' ? '#22c55e' : m.tier === 'stretch' ? '#fbbf24' : '#ef4444'
          const borderColor = isHighlighted ? '#1d4ed8' : m.tier === 'affordable' ? '#16a34a' : m.tier === 'stretch' ? '#d97706' : '#dc2626'

          return (
            <GeoJSON
              key={`${m.zip}-boundary-${isHighlighted}`}
              data={boundary}
              style={{
                fillColor,
                fillOpacity: isHighlighted ? 0.6 : 0.5,
                color: borderColor,
                weight: isHighlighted ? 3 : 1,
              }}
              eventHandlers={{
                click: () => onZipMarkerClick?.(m.zip),
                mouseover: (e) => {
                  const layer = e.target as L.Path
                  layer.setStyle({ weight: 3, fillOpacity: 0.7 })
                },
                mouseout: (e) => {
                  const layer = e.target as L.Path
                  layer.setStyle({
                    weight: isHighlighted ? 3 : 1,
                    fillOpacity: isHighlighted ? 0.6 : 0.5,
                  })
                },
              }}
            >
              <Tooltip permanent={isHighlighted} sticky={!isHighlighted}>
                <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                  <strong>{m.zip}</strong> - {entry?.name || 'N/A'}<br/>
                  Home: ${entry?.medianHomeValue?.toLocaleString() || 'N/A'}<br/>
                  Rent: ${entry?.medianRent?.toLocaleString() || 'N/A'}/mo<br/>
                  <em>({m.tier})</em>
                </div>
              </Tooltip>
            </GeoJSON>
          )
        }

        // Fallback to CircleMarker if boundary not loaded yet
        return (
          <CircleMarker
            key={m.zip}
            center={[m.lat, m.lon]}
            radius={isHighlighted ? 10 : 5}
            pathOptions={{
              color: isHighlighted
                ? '#1d4ed8'
                : m.tier === 'affordable'
                  ? '#16a34a'
                  : m.tier === 'stretch'
                    ? '#d97706'
                    : '#dc2626',  // red for unaffordable
              fillColor: m.tier === 'affordable'
                ? '#22c55e'
                : m.tier === 'stretch'
                  ? '#fbbf24'
                  : '#ef4444',  // red for unaffordable
              fillOpacity: isHighlighted ? 1 : 0.7,
              weight: isHighlighted ? 3 : 1,
            }}
            eventHandlers={{
              click: () => onZipMarkerClick?.(m.zip),
              mouseover: (e) => {
                const layer = e.target
                layer.setStyle({ radius: 8, fillOpacity: 1, weight: 2 })
              },
              mouseout: (e) => {
                const layer = e.target
                layer.setStyle({
                  radius: isHighlighted ? 10 : 5,
                  fillOpacity: isHighlighted ? 1 : 0.7,
                  weight: isHighlighted ? 3 : 1,
                })
              },
            }}
          >
            <Tooltip permanent={isHighlighted} sticky={!isHighlighted}>
              <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                <strong>{m.zip}</strong> - {entry?.name || 'N/A'}<br/>
                Home: ${entry?.medianHomeValue?.toLocaleString() || 'N/A'}<br/>
                Rent: ${entry?.medianRent?.toLocaleString() || 'N/A'}/mo<br/>
                <em>({m.tier})</em>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
      </MapContainer>

      {/* Legend */}
      <MapLegend mode={legendMode} />

      {/* Loading Indicator */}
      {loadingBoundaries && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium z-[1000] flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading ZIP boundaries...
        </div>
      )}
    </div>
  )
}

export default React.memo(MapView)
