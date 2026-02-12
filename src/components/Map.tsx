import { useEffect, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeocodedLocation, StateAffordability } from '../types'

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

const TILE_URL = import.meta.env.VITE_GEOAPIFY_API_KEY
  ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${import.meta.env.VITE_GEOAPIFY_API_KEY}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

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

interface FocusZip {
  lat: number
  lon: number
  zip: string
  _t?: number
}

function FlyToZip({ focus }: { focus: FocusZip | null }) {
  const map = useMap()
  const prevRef = useRef<string>('')

  useEffect(() => {
    if (!focus) return
    const key = `${focus.zip}-${focus._t ?? 0}`
    if (key !== prevRef.current) {
      prevRef.current = key
      map.flyTo([focus.lat, focus.lon], 14, { duration: 1 })
    }
  }, [focus, map])

  return null
}

function FitUSBounds({ active }: { active: boolean }) {
  const map = useMap()
  const prevRef = useRef(false)

  useEffect(() => {
    if (active && !prevRef.current) {
      prevRef.current = true
      map.fitBounds([[24.5, -125], [49.5, -66.5]], { padding: [20, 20] })
    }
    if (!active) {
      prevRef.current = false
    }
  }, [active, map])

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
        layer.bindTooltip(
          `<strong>${info.stateName}</strong><br/>` +
          `${info.pctAffordable}% affordable<br/>` +
          `${info.affordableCount + info.stretchCount} / ${info.totalZips} ZIPs`,
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

  const key = useMemo(
    () => JSON.stringify(stateData.map(s => `${s.state}:${s.pctAffordable}`)) + (selectedState || ''),
    [stateData, selectedState]
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

export interface ZipMarker {
  lat: number
  lon: number
  zip: string
  tier: 'affordable' | 'stretch'
}

interface MapViewProps {
  location: GeocodedLocation | null
  isochrone: GeoJSON.FeatureCollection | null
  focusZip?: FocusZip | null
  stateGeoJson?: GeoJSON.FeatureCollection | null
  stateData?: StateAffordability[]
  onStateClick?: (stateCode: string) => void
  selectedState?: string | null
  zipMarkers?: ZipMarker[]
}

export default function MapView({
  location,
  isochrone,
  focusZip,
  stateGeoJson,
  stateData,
  onStateClick,
  selectedState,
  zipMarkers,
}: MapViewProps) {
  const showChoropleth = !!stateGeoJson && !!stateData?.length && !isochrone && !selectedState
  const showZipMarkers = !!zipMarkers?.length && !isochrone

  return (
    <MapContainer
      center={[39.8283, -98.5795]}
      zoom={5}
      className="h-full w-full"
      zoomControl={true}
    >
      <TileLayer
        url={TILE_URL}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      <FlyToLocation location={location} />
      <FitBounds geojson={isochrone} />
      <FlyToZip focus={focusZip ?? null} />
      <FitUSBounds active={showChoropleth} />
      <FitStateBounds stateGeoJson={stateGeoJson ?? null} stateCode={selectedState ?? null} />

      {location && (
        <Marker position={[location.lat, location.lon]}>
          <Popup>{location.displayName}</Popup>
        </Marker>
      )}

      {isochrone?.features?.length && (
        <GeoJSON
          key={JSON.stringify(isochrone)}
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

      {showZipMarkers && zipMarkers!.map((m) => (
        <CircleMarker
          key={m.zip}
          center={[m.lat, m.lon]}
          radius={5}
          pathOptions={{
            color: m.tier === 'affordable' ? '#16a34a' : '#d97706',
            fillColor: m.tier === 'affordable' ? '#22c55e' : '#fbbf24',
            fillOpacity: 0.7,
            weight: 1,
          }}
        >
          <Tooltip>{m.zip} ({m.tier})</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
