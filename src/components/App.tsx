import { useState, useCallback, useRef, useReducer, useMemo, useEffect } from 'react'
import MapView from './Map'
import SearchBar from './SearchBar'
import Controls from './Controls'
import HousingSummary from './HousingSummary'
import HousingTable from './HousingTable'
import AffordabilityForm from './AffordabilityForm'
import CollapsibleSection from './CollapsibleSection'
import ZipInfoBox from './ZipInfoBox'
import TableModal from './TableModal'
import { isApiKeyConfigured, geocodeAddress } from '../services/geoapify'
import { fetchIsochroneWithCache } from '../services/isochrone'
import { getHousingForIsochrone, getAffordableNationwide, getAffordableForIsochrone, loadZctaBoundaries } from '../services/housingData'
import { getAffordabilityTier } from '../services/mortgage'
import { expandStateAbbreviation } from '../utils/stateNames'
import { appReducer, initialAppState } from '../hooks/useAppReducer'
import type { GeocodedLocation, TravelMode, AffordabilityInputs, ZipMarker } from '../types'

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState)
  const {
    searchMode, location, isochrone, mode, minutes,
    loading, housingLoading, zctaLoading,
    housingStats, stateGeoJson, stateData, selectedState,
    allNationwideEntries, zipMarkers, zctaGeoJson,
    error, zctaError,
    highlightedZip, focusZip, selectedZipInfo,
    showUnaffordable, debugMode,
  } = state

  // Independent UI state (not part of core data flow)
  const [affordability, setAffordability] = useState<AffordabilityInputs>({
    annualIncome: 47000,
    downPaymentPct: 20,
    interestRate: 6.5,
    loanTermYears: 30,
    propertyTaxRate: 1.1,
    annualInsurance: 1500,
    monthlyDebts: 0,
    hoaMonthly: 0,
    frontDtiPct: 28,
    backDtiPct: 36,
    monthlySpending: 0,
    includeSpending: false,
    manualMaxPrice: null,
    useManualMaxPrice: false,
  })
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [apiWarningDismissed, setApiWarningDismissed] = useState(false)
  const [isTableModalOpen, setIsTableModalOpen] = useState(false)

  const locationRef = useRef<GeocodedLocation | null>(null)
  const apiReady = isApiKeyConfigured()

  const hasIncome = affordability.annualIncome !== null && affordability.annualIncome > 0
  const incomeMode = hasIncome

  const updateIsochrone = useCallback(
    async (loc: GeocodedLocation, travelMode: TravelMode, travelMinutes: number) => {
      dispatch({ type: 'PATCH', patch: { loading: true, error: null } })
      try {
        const geojson = await fetchIsochroneWithCache(loc.lat, loc.lon, travelMode, travelMinutes)
        dispatch({ type: 'PATCH', patch: { isochrone: geojson } })

        dispatch({ type: 'PATCH', patch: { housingLoading: true } })
        try {
          if (affordability.annualIncome) {
            const { stats, zipMarkers: markers } = await getAffordableForIsochrone(geojson, affordability)
            dispatch({ type: 'PATCH', patch: { housingStats: stats, zipMarkers: markers } })
          } else {
            const stats = await getHousingForIsochrone(geojson)
            dispatch({ type: 'PATCH', patch: { housingStats: stats, zipMarkers: [] } })
          }
        } catch {
          dispatch({ type: 'PATCH', patch: { housingStats: null, zipMarkers: [] } })
        } finally {
          dispatch({ type: 'PATCH', patch: { housingLoading: false } })
        }
      } catch (err) {
        dispatch({
          type: 'PATCH',
          patch: {
            error: err instanceof Error ? err.message : 'Isochrone request failed',
            isochrone: null,
            housingStats: null,
          },
        })
      } finally {
        dispatch({ type: 'PATCH', patch: { loading: false } })
      }
    },
    [affordability]
  )

  const handleSearch = useCallback(
    async (address: string) => {
      dispatch({ type: 'START_ADDRESS_SEARCH' })
      setSidebarOpen(false)
      try {
        const loc = await geocodeAddress(address)
        dispatch({ type: 'PATCH', patch: { location: loc } })
        locationRef.current = loc
        await updateIsochrone(loc, mode, minutes)
      } catch (err) {
        dispatch({
          type: 'PATCH',
          patch: {
            error: err instanceof Error ? err.message : 'Search failed',
            loading: false,
          },
        })
      }
    },
    [updateIsochrone, mode, minutes]
  )

  const handleIncomeSearch = useCallback(async () => {
    dispatch({ type: 'START_INCOME_SEARCH' })
    setSidebarOpen(false)
    locationRef.current = null

    try {
      let geoJson = stateGeoJson
      if (!geoJson) {
        const res = await fetch(`${import.meta.env.BASE_URL}data/us-states.json`)
        if (res.ok) geoJson = await res.json()
      }

      const result = await getAffordableNationwide(affordability)
      dispatch({
        type: 'INCOME_SEARCH_DONE',
        stateData: result.states,
        allEntries: result.allEntries,
        stats: result.stats,
        stateGeoJson: geoJson ?? undefined,
      })
    } catch (err) {
      dispatch({
        type: 'PATCH',
        patch: {
          error: err instanceof Error ? err.message : 'Income search failed',
          housingStats: null,
          loading: false,
        },
      })
    }
  }, [affordability, stateGeoJson])

  const handleStateClick = useCallback(
    async (stateCode: string) => {
      dispatch({ type: 'STATE_CLICK', stateCode, affordability })

      try {
        const geojson = await loadZctaBoundaries(stateCode)
        dispatch({
          type: 'PATCH',
          patch: {
            zctaGeoJson: geojson,
            zctaLoading: false,
            zctaError: geojson
              ? null
              : `ZIP boundary data not available for ${stateCode}. Showing ZIP dots instead.`,
          },
        })
      } catch {
        dispatch({
          type: 'PATCH',
          patch: {
            zctaGeoJson: null,
            zctaLoading: false,
            zctaError: `Failed to load ZIP boundaries for ${stateCode}. Showing ZIP dots instead.`,
          },
        })
      }
    },
    [affordability]
  )

  const handleBackToStates = useCallback(() => {
    dispatch({ type: 'BACK_TO_STATES' })
  }, [])

  const handleClear = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' })
    locationRef.current = null
  }, [])

  const handleZipSelect = useCallback((lat: number, lon: number, zip: string) => {
    dispatch({ type: 'SELECT_ZIP', lat, lon, zip, _t: Date.now() })
    setSidebarOpen(false)
  }, [])

  const handleZipMarkerClick = useCallback((zip: string) => {
    dispatch({ type: 'CLICK_ZIP_MARKER', zip })
  }, [])

  const handleModeChange = useCallback(
    (newMode: TravelMode) => {
      dispatch({ type: 'PATCH', patch: { mode: newMode } })
      if (locationRef.current) {
        updateIsochrone(locationRef.current, newMode, minutes)
      }
    },
    [updateIsochrone, minutes]
  )

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const handleMinutesChange = useCallback(
    (newMinutes: number) => {
      dispatch({ type: 'PATCH', patch: { minutes: newMinutes } })
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (locationRef.current) {
          updateIsochrone(locationRef.current, mode, newMinutes)
        }
      }, 400)
    },
    [updateIsochrone, mode]
  )

  const handleClearDebugZips = useCallback(() => {
    dispatch({ type: 'CLEAR_DEBUG' })
  }, [])

  const handleLoadAllStates = useCallback(async () => {
    const ALL_STATE_CODES = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
    ]

    dispatch({ type: 'PATCH', patch: { zctaLoading: true, zctaError: null } })

    try {
      const allFeatures: GeoJSON.Feature[] = []
      const BATCH_SIZE = 15
      for (let i = 0; i < ALL_STATE_CODES.length; i += BATCH_SIZE) {
        const batch = ALL_STATE_CODES.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.all(
          batch.map(async (code) => {
            try {
              const geojson = await loadZctaBoundaries(code)
              return geojson?.features ?? []
            } catch {
              return []
            }
          })
        )
        batchResults.forEach(features => allFeatures.push(...features))
      }

      const combinedGeoJson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: allFeatures,
      }

      dispatch({ type: 'PATCH', patch: { zctaGeoJson: combinedGeoJson, debugMode: true } })

      if (searchMode === 'income' && allNationwideEntries.length > 0 && affordability.annualIncome) {
        const markers: ZipMarker[] = allNationwideEntries.map(e => {
          const tier = getAffordabilityTier(e.medianHomeValue, affordability)
          return {
            lat: e.lat,
            lon: e.lon,
            zip: e.zip,
            tier: tier === 'affordable' ? 'affordable' : tier === 'stretch' ? 'stretch' : 'unaffordable',
          }
        })
        dispatch({ type: 'PATCH', patch: { zipMarkers: markers } })
      }
    } catch {
      dispatch({ type: 'PATCH', patch: { zctaError: 'Failed to load all ZIP boundaries' } })
    } finally {
      dispatch({ type: 'PATCH', patch: { zctaLoading: false } })
    }
  }, [searchMode, allNationwideEntries, affordability])

  // Re-apply affordability tiers when income changes in address mode
  useEffect(() => {
    if (searchMode !== 'address' || !isochrone || !housingStats?.entries.length) return

    if (!affordability.annualIncome || affordability.annualIncome <= 0) {
      dispatch({ type: 'PATCH', patch: { zipMarkers: [] } })
      return
    }

    const updatedMarkers: ZipMarker[] = housingStats.entries
      .map(entry => {
        const tier = getAffordabilityTier(entry.medianHomeValue, affordability)
        return { zip: entry.zip, lat: entry.lat, lon: entry.lon, tier }
      })
      .filter(
        (m): m is ZipMarker => m.tier !== 'unknown'
      )

    dispatch({ type: 'PATCH', patch: { zipMarkers: updatedMarkers } })
  }, [
    affordability.annualIncome,
    affordability.downPaymentPct,
    affordability.interestRate,
    affordability.loanTermYears,
    affordability.propertyTaxRate,
    affordability.annualInsurance,
    affordability.monthlyDebts,
    affordability.hoaMonthly,
    affordability.frontDtiPct,
    affordability.backDtiPct,
    affordability.includeSpending,
    affordability.monthlySpending,
    housingStats,
    // Note: Don't depend on isochrone - it changes before housingStats updates
    searchMode,
  ])

  const selectedStateInfo = selectedState ? stateData.find(s => s.state === selectedState) : null

  const filteredEntries = useMemo(() => {
    if (!housingStats) return []
    if (!showUnaffordable) {
      return housingStats.entries.filter(e => {
        const tier = getAffordabilityTier(e.medianHomeValue, affordability)
        return tier === 'affordable' || tier === 'stretch'
      })
    }
    return housingStats.entries
  }, [
    housingStats,
    showUnaffordable,
    affordability.annualIncome,
    affordability.downPaymentPct,
    affordability.interestRate,
    affordability.loanTermYears,
    affordability.propertyTaxRate,
    affordability.annualInsurance,
    affordability.monthlyDebts,
    affordability.hoaMonthly,
    affordability.frontDtiPct,
    affordability.backDtiPct,
    affordability.includeSpending,
    affordability.monthlySpending,
  ])

  const filteredZipMarkers = useMemo(() => {
    if (!showUnaffordable) {
      return zipMarkers.filter(m => m.tier !== 'unaffordable')
    }
    return zipMarkers
  }, [zipMarkers, showUnaffordable])

  return (
    <div className="flex h-dvh md:h-screen bg-white relative overflow-hidden">
      {/* Hamburger Menu Button (mobile only) */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 right-4 z-[1300] md:hidden bg-white rounded-lg shadow-lg p-2 border border-gray-200"
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
        aria-expanded={sidebarOpen}
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {sidebarOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Backdrop overlay (mobile only, when sidebar open) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[1100] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        role="complementary"
        aria-label="Search and filters"
        className={`
          w-full md:w-[360px] md:min-w-[360px] flex flex-col border-r border-gray-200 bg-white overflow-y-auto
          fixed md:relative inset-y-0 left-0 z-[1200] md:z-auto
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-3 md:p-5 space-y-3 md:space-y-5">
          {/* Header */}
          <div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900">Home Search</h1>
            <p className="text-xs md:text-sm text-gray-500 mt-0.5">Find affordable homes by location or income</p>
          </div>

          {/* API key warning */}
          {!apiReady && !apiWarningDismissed && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 relative">
              <button
                onClick={() => setApiWarningDismissed(true)}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-amber-100 transition-colors"
                aria-label="Close API key warning"
              >
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="pr-6">
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
            </div>
          )}

          {/* Search */}
          <SearchBar
            onSearch={handleSearch}
            onClear={handleClear}
            disabled={loading}
            incomeMode={incomeMode}
            onIncomeSearch={handleIncomeSearch}
          />

          {/* Controls (only for address mode) */}
          {searchMode === 'address' && (
            <CollapsibleSection title="Commute Settings">
              <Controls
                mode={mode}
                onModeChange={handleModeChange}
                minutes={minutes}
                onMinutesChange={handleMinutesChange}
                disabled={loading || !apiReady}
              />
            </CollapsibleSection>
          )}

          {/* Affordability */}
          <hr className="border-gray-200" />
          <CollapsibleSection
            title="Affordability"
            summary={maxPrice ? <span>Budget: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(maxPrice)}</span> : undefined}
          >
            <AffordabilityForm inputs={affordability} onChange={setAffordability} onMaxPriceChange={setMaxPrice} />
          </CollapsibleSection>

          {/* Error */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3"
            >
              {error}
            </div>
          )}

          {/* State header when drilled in */}
          {searchMode === 'income' && selectedStateInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">{selectedStateInfo.stateName}</div>
                <button
                  onClick={handleBackToStates}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  &larr; All states
                </button>
              </div>
              <div className="text-xs text-gray-500">
                {selectedStateInfo.affordableCount} affordable + {selectedStateInfo.stretchCount} stretch / {selectedStateInfo.totalZips} total ZIPs
              </div>
              <div className="text-xs text-gray-400 italic pt-1">
                Gray dashed areas = no housing data available
              </div>
              {zctaLoading && (
                <div className="text-xs text-gray-500 italic">Loading ZIP boundaries...</div>
              )}
              {zctaError && (
                <div className="text-xs text-amber-600 italic">{zctaError}</div>
              )}
            </div>
          )}

          {/* Housing Data */}
          {(housingStats || housingLoading) && (
            <>
              <hr className="border-gray-200" />
              <CollapsibleSection
                title={
                  searchMode === 'income' && selectedState && selectedStateInfo
                    ? `${selectedStateInfo.stateName} Housing Data`
                    : searchMode === 'income'
                    ? 'National Housing Data'
                    : searchMode === 'address' && location?.displayName
                    ? (() => {
                        const stateAbbr = location.displayName.split(',').slice(-2, -1)[0]?.trim()
                        const stateName = stateAbbr ? expandStateAbbreviation(stateAbbr) : 'Local'
                        return `${stateName} Housing Data`
                      })()
                    : 'Housing Data'
                }
                badge={housingStats?.zipCount}
              >
                <HousingSummary
                  stats={housingStats}
                  loading={housingLoading}
                  affordability={affordability}
                  context={
                    searchMode === 'address' && isochrone
                      ? 'commute'
                      : searchMode === 'income' && selectedState
                        ? 'state'
                        : searchMode === 'income'
                          ? 'nationwide'
                          : 'none'
                  }
                  stateName={selectedState && selectedStateInfo ? selectedStateInfo.stateName : undefined}
                />

                {/* Show unaffordable toggle */}
                {((searchMode === 'income' && selectedState) || (searchMode === 'address' && zipMarkers.length > 0)) && (
                  <div className="flex items-center justify-between mt-3 mb-3 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showUnaffordable}
                        onChange={(e) => dispatch({ type: 'PATCH', patch: { showUnaffordable: e.target.checked } })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-gray-700">Show unaffordable ZIPs</span>
                    </label>
                    <span className="text-gray-500">
                      {showUnaffordable
                        ? `All ${housingStats?.entries.length || 0} ZIPs shown`
                        : `${filteredEntries.length} shown, ${(housingStats?.entries.length || 0) - filteredEntries.length} hidden`
                      }
                    </span>
                  </div>
                )}

                {housingStats && housingStats.entries.length > 0 && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">
                        {filteredEntries.length} ZIP{filteredEntries.length !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => setIsTableModalOpen(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        Expand View
                      </button>
                    </div>

                    <HousingTable
                      entries={filteredEntries}
                      affordability={affordability}
                      onZipClick={handleZipSelect}
                      highlightedZip={highlightedZip}
                    />
                  </>
                )}
              </CollapsibleSection>
            </>
          )}
        </div>
      </div>

      {/* Map */}
      <div
        role="main"
        aria-label="Interactive map"
        className="flex-1 w-full relative"
      >
        <MapView
          location={location}
          isochrone={isochrone}
          focusZip={focusZip}
          stateGeoJson={stateGeoJson}
          stateData={searchMode === 'income' ? stateData : undefined}
          onStateClick={handleStateClick}
          selectedState={selectedState}
          zipMarkers={filteredZipMarkers}
          highlightedZip={highlightedZip}
          onZipMarkerClick={handleZipMarkerClick}
          zctaGeoJson={zctaGeoJson}
          housingEntries={housingStats?.entries}
          searchMode={searchMode}
          onLoadAllStates={handleLoadAllStates}
          debugMode={debugMode}
          onClearDebugZips={handleClearDebugZips}
        />

        {/* ZIP Info Box */}
        <ZipInfoBox
          entry={selectedZipInfo}
          affordability={affordability}
          onClose={() => dispatch({ type: 'PATCH', patch: { selectedZipInfo: null } })}
        />
      </div>

      {/* Table Modal */}
      <TableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        entries={filteredEntries}
        affordability={affordability}
        highlightedZip={highlightedZip}
        onZipClick={handleZipSelect}
      />
    </div>
  )
}
