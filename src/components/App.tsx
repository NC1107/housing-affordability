import { useState, useCallback, useRef } from 'react'
import MapView from './Map'
import type { ZipMarker } from './Map'
import SearchBar from './SearchBar'
import Controls from './Controls'
import HousingSummary from './HousingSummary'
import HousingTable from './HousingTable'
import AffordabilityForm from './AffordabilityForm'
import { isApiKeyConfigured, geocodeAddress, fetchIsochrone } from '../services/geoapify'
import { getHousingForIsochrone, getAffordableNationwide } from '../services/housingData'
import { getAffordabilityTier } from '../services/mortgage'
import type { GeocodedLocation, TravelMode, HousingStats, AffordabilityInputs, StateAffordability, HousingDataEntry } from '../types'

export default function App() {
  const [location, setLocation] = useState<GeocodedLocation | null>(null)
  const [isochrone, setIsochrone] = useState<GeoJSON.FeatureCollection | null>(null)
  const [mode, setMode] = useState<TravelMode>('drive')
  const [minutes, setMinutes] = useState(30)
  const [loading, setLoading] = useState(false)
  const [housingStats, setHousingStats] = useState<HousingStats | null>(null)
  const [housingLoading, setHousingLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [affordability, setAffordability] = useState<AffordabilityInputs>({
    annualIncome: null,
    downPaymentPct: 20,
    interestRate: 6.5,
    loanTermYears: 30,
    propertyTaxRate: 1.1,
    annualInsurance: 1500,
    monthlyDebts: 0,
    hoaMonthly: 0,
    frontDtiPct: 28,
    backDtiPct: 36,
  })
  const [focusZip, setFocusZip] = useState<{ lat: number; lon: number; zip: string; _t: number } | null>(null)

  // Income search state
  const [stateGeoJson, setStateGeoJson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [stateData, setStateData] = useState<StateAffordability[]>([])
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const [allNationwideEntries, setAllNationwideEntries] = useState<HousingDataEntry[]>([])
  const [zipMarkers, setZipMarkers] = useState<ZipMarker[]>([])
  const [searchMode, setSearchMode] = useState<'address' | 'income'>('address')

  const locationRef = useRef<GeocodedLocation | null>(null)
  const apiReady = isApiKeyConfigured()

  const hasIncome = affordability.annualIncome !== null && affordability.annualIncome > 0
  const incomeMode = hasIncome

  const updateIsochrone = useCallback(
    async (loc: GeocodedLocation, travelMode: TravelMode, travelMinutes: number) => {
      setLoading(true)
      setError(null)
      setStatus('Fetching commute zone...')
      try {
        const geojson = await fetchIsochrone(loc.lat, loc.lon, travelMode, travelMinutes)
        setIsochrone(geojson)
        setStatus(`${travelMinutes}-min ${travelMode === 'drive' ? 'driving' : 'transit'} zone`)

        // Fetch housing data for the isochrone
        setHousingLoading(true)
        try {
          const stats = await getHousingForIsochrone(geojson)
          setHousingStats(stats)
        } catch {
          console.warn('Could not load housing data')
          setHousingStats(null)
        } finally {
          setHousingLoading(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Isochrone request failed')
        setIsochrone(null)
        setHousingStats(null)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  async function handleSearch(address: string) {
    // Clear income search state
    setSearchMode('address')
    setStateData([])
    setSelectedState(null)
    setAllNationwideEntries([])
    setZipMarkers([])

    setLoading(true)
    setError(null)
    setStatus('Geocoding address...')
    try {
      const loc = await geocodeAddress(address)
      setLocation(loc)
      locationRef.current = loc
      await updateIsochrone(loc, mode, minutes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setLoading(false)
    }
  }

  async function handleIncomeSearch() {
    setSearchMode('income')
    setLoading(true)
    setError(null)
    setStatus('Finding affordable areas nationwide...')
    // Clear address mode state
    setLocation(null)
    setIsochrone(null)
    locationRef.current = null
    setSelectedState(null)
    setZipMarkers([])

    try {
      // Load US states GeoJSON if not cached
      if (!stateGeoJson) {
        const res = await fetch('/data/us-states.json')
        if (res.ok) {
          setStateGeoJson(await res.json())
        }
      }

      const result = await getAffordableNationwide(affordability)
      setStateData(result.states)
      setAllNationwideEntries(result.allEntries)
      setHousingStats(result.stats)

      const statesWithAffordable = result.states.filter(s => s.pctAffordable > 0).length
      setStatus(`${result.allEntries.length.toLocaleString()} affordable ZIPs across ${statesWithAffordable} states`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Income search failed')
      setHousingStats(null)
    } finally {
      setLoading(false)
    }
  }

  function handleStateClick(stateCode: string) {
    setSelectedState(stateCode)

    // Filter entries to just this state
    const stateEntries = allNationwideEntries.filter(e => e.state === stateCode)

    // Build ZIP markers for the map
    const markers: ZipMarker[] = stateEntries.map(e => ({
      lat: e.lat,
      lon: e.lon,
      zip: e.zip,
      tier: getAffordabilityTier(e.medianHomeValue, affordability) === 'affordable' ? 'affordable' : 'stretch',
    }))
    setZipMarkers(markers)

    // Update housing stats to show this state's data
    const homeValues = stateEntries.map(e => e.medianHomeValue).filter((v): v is number => v !== null)
    const rents = stateEntries.map(e => e.medianRent).filter((v): v is number => v !== null)
    const sorted = [...homeValues].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianHV = sorted.length % 2 ? sorted[mid] : sorted.length ? (sorted[mid - 1] + sorted[mid]) / 2 : null
    const sortedRents = [...rents].sort((a, b) => a - b)
    const midR = Math.floor(sortedRents.length / 2)
    const medianR = sortedRents.length % 2 ? sortedRents[midR] : sortedRents.length ? (sortedRents[midR - 1] + sortedRents[midR]) / 2 : null

    setHousingStats({
      zipCount: stateEntries.length,
      medianHomeValue: medianHV,
      medianRent: medianR,
      minHomeValue: homeValues.length ? Math.min(...homeValues) : null,
      maxHomeValue: homeValues.length ? Math.max(...homeValues) : null,
      minRent: rents.length ? Math.min(...rents) : null,
      maxRent: rents.length ? Math.max(...rents) : null,
      entries: stateEntries,
    })

    const stateInfo = stateData.find(s => s.state === stateCode)
    setStatus(`${stateInfo?.stateName || stateCode}: ${stateEntries.length} affordable ZIPs`)
  }

  function handleBackToStates() {
    setSelectedState(null)
    setZipMarkers([])

    // Restore nationwide stats
    const homeValues = allNationwideEntries.map(e => e.medianHomeValue).filter((v): v is number => v !== null)
    const rents = allNationwideEntries.map(e => e.medianRent).filter((v): v is number => v !== null)
    const sorted = [...homeValues].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianHV = sorted.length % 2 ? sorted[mid] : sorted.length ? (sorted[mid - 1] + sorted[mid]) / 2 : null
    const sortedRents = [...rents].sort((a, b) => a - b)
    const midR = Math.floor(sortedRents.length / 2)
    const medianR = sortedRents.length % 2 ? sortedRents[midR] : sortedRents.length ? (sortedRents[midR - 1] + sortedRents[midR]) / 2 : null

    setHousingStats({
      zipCount: allNationwideEntries.length,
      medianHomeValue: medianHV,
      medianRent: medianR,
      minHomeValue: homeValues.length ? Math.min(...homeValues) : null,
      maxHomeValue: homeValues.length ? Math.max(...homeValues) : null,
      minRent: rents.length ? Math.min(...rents) : null,
      maxRent: rents.length ? Math.max(...rents) : null,
      entries: allNationwideEntries,
    })

    const statesWithAffordable = stateData.filter(s => s.pctAffordable > 0).length
    setStatus(`${allNationwideEntries.length.toLocaleString()} affordable ZIPs across ${statesWithAffordable} states`)
  }

  function handleModeChange(newMode: TravelMode) {
    setMode(newMode)
    if (locationRef.current) {
      updateIsochrone(locationRef.current, newMode, minutes)
    }
  }

  // Debounce slider changes
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  function handleMinutesChange(newMinutes: number) {
    setMinutes(newMinutes)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (locationRef.current) {
        updateIsochrone(locationRef.current, mode, newMinutes)
      }
    }, 400)
  }

  const selectedStateInfo = selectedState ? stateData.find(s => s.state === selectedState) : null

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className="w-[360px] min-w-[360px] flex flex-col border-r border-gray-200 bg-gray-50/50 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Header */}
          <div>
            <h1 className="text-xl font-bold text-gray-900">Commute Map</h1>
            <p className="text-sm text-gray-500 mt-0.5">Find homes within your commute zone</p>
          </div>

          {/* API key warning */}
          {!apiReady && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>API key missing.</strong> Copy{' '}
              <code className="bg-amber-100 px-1 rounded">.env.example</code> to{' '}
              <code className="bg-amber-100 px-1 rounded">.env</code> and add your{' '}
              <a
                href="https://myprojects.geoapify.com/register"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Geoapify API key
              </a>.
            </div>
          )}

          {/* Search */}
          <SearchBar
            onSearch={handleSearch}
            disabled={loading}
            incomeMode={incomeMode}
            onIncomeSearch={handleIncomeSearch}
          />

          {/* Controls (only for address mode) */}
          {searchMode === 'address' && (
            <Controls
              mode={mode}
              onModeChange={handleModeChange}
              minutes={minutes}
              onMinutesChange={handleMinutesChange}
              disabled={loading || !apiReady}
            />
          )}

          {/* Affordability */}
          <hr className="border-gray-200" />
          <AffordabilityForm inputs={affordability} onChange={setAffordability} />

          {/* Status / Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}
          {status && !error && (
            <div className="text-sm text-gray-500">{loading ? '...' : status}</div>
          )}

          {/* Back to all states button */}
          {searchMode === 'income' && selectedState && (
            <button
              onClick={handleBackToStates}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              &larr; Back to all states
            </button>
          )}

          {/* State header when drilled in */}
          {searchMode === 'income' && selectedStateInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm font-semibold text-gray-900">{selectedStateInfo.stateName}</div>
              <div className="text-xs text-gray-500 mt-1">
                {selectedStateInfo.affordableCount} affordable + {selectedStateInfo.stretchCount} stretch / {selectedStateInfo.totalZips} total ZIPs
              </div>
            </div>
          )}

          {/* Housing Data */}
          {(housingStats || housingLoading) && (
            <>
              <hr className="border-gray-200" />
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Housing Data</h2>
                <HousingSummary stats={housingStats} loading={housingLoading} affordability={affordability} />
              </div>
            </>
          )}

          {housingStats && housingStats.entries.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">
                {searchMode === 'income' && selectedState
                  ? `ZIP Codes in ${selectedStateInfo?.stateName || selectedState}`
                  : searchMode === 'income'
                  ? 'Affordable ZIP Codes (all states)'
                  : 'ZIP Code Breakdown'}
              </h2>
              <HousingTable
                entries={housingStats.entries}
                affordability={affordability}
                onZipClick={(lat, lon, zip) => setFocusZip({ lat, lon, zip, _t: Date.now() })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <MapView
          location={location}
          isochrone={isochrone}
          focusZip={focusZip}
          stateGeoJson={stateGeoJson}
          stateData={searchMode === 'income' ? stateData : undefined}
          onStateClick={handleStateClick}
          selectedState={selectedState}
          zipMarkers={zipMarkers}
        />
      </div>
    </div>
  )
}
