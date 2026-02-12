import type { GeocodedLocation } from '../types'

const API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY as string

export function isApiKeyConfigured(): boolean {
  return !!API_KEY && API_KEY !== 'your_api_key_here'
}

export async function geocodeAddress(address: string): Promise<GeocodedLocation> {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&apiKey=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)

  const data = await res.json()
  if (!data.features?.length) {
    throw new Error('Address not found. Try a more specific address.')
  }

  const feature = data.features[0]
  const [lon, lat] = feature.geometry.coordinates
  return { lat, lon, displayName: feature.properties.formatted }
}

export async function fetchIsochrone(
  lat: number,
  lon: number,
  mode: string,
  minutes: number
): Promise<GeoJSON.FeatureCollection> {
  const rangeSeconds = minutes * 60
  const url = `https://api.geoapify.com/v1/isoline?lat=${lat}&lon=${lon}&type=time&mode=${mode}&range=${rangeSeconds}&apiKey=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Isochrone request failed (${res.status})`)
  return await res.json()
}
