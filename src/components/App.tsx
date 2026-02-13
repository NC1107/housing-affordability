import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import MapView from './Map'
import type { ZipMarker } from './Map'
import SearchBar from './SearchBar'
import Controls from './Controls'
import HousingSummary from './HousingSummary'
import HousingTable from './HousingTable'
import AffordabilityForm from './AffordabilityForm'
import CollapsibleSection from './CollapsibleSection'
import ZipInfoBox from './ZipInfoBox'
import TableModal from './TableModal'
import POIFilter from './POIFilter'
import { isApiKeyConfigured, geocodeAddress } from '../services/geoapify'
import { fetchIsochroneWithCache } from '../services/isochrone'
import { getHousingForIsochrone, getAffordableNationwide, getAffordableForIsochrone, loadZctaBoundaries } from '../services/housingData'
import { getAffordabilityTier } from '../services/mortgage'
import { expandStateAbbreviation } from '../utils/stateNames'
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
  // const [status, setStatus] = useState<string | null>(null)  // Status not currently displayed
  const setStatus = (_: string | null) => {}  // No-op function for status updates
  const [affordability, setAffordability] = useState<AffordabilityInputs>({
    annualIncome: 47000,  // Median income for single American (Census Bureau 2024)
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
  const [focusZip, setFocusZip] = useState<{ lat: number; lon: number; zip: string; _t: number } | null>(null)
  const [highlightedZip, setHighlightedZip] = useState<string | null>(null)
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [apiWarningDismissed, setApiWarningDismissed] = useState(false)

  // Income search state
  const [stateGeoJson, setStateGeoJson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [stateData, setStateData] = useState<StateAffordability[]>([])
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const [allNationwideEntries, setAllNationwideEntries] = useState<HousingDataEntry[]>([])
  const [zipMarkers, setZipMarkers] = useState<ZipMarker[]>([])
  const [zctaGeoJson, setZctaGeoJson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [zctaLoading, setZctaLoading] = useState(false)
  const [zctaError, setZctaError] = useState<string | null>(null)
  const [showUnaffordable, setShowUnaffordable] = useState(true)
  const [searchMode, setSearchMode] = useState<'address' | 'income'>('address')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedZipInfo, setSelectedZipInfo] = useState<HousingDataEntry | null>(null)
  const [isTableModalOpen, setIsTableModalOpen] = useState(false)
  const [debugMode, setDebugMode] = useState(false)

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
        const geojson = await fetchIsochroneWithCache(loc.lat, loc.lon, travelMode, travelMinutes)
        setIsochrone(geojson)
        setStatus(`${travelMinutes}-min ${travelMode === 'drive' ? 'driving' : 'transit'} zone`)

        // Fetch housing data for the isochrone
        setHousingLoading(true)
        try {
          // If income is available, calculate affordability tiers for ZIP markers
          if (affordability.annualIncome) {
            const { stats, zipMarkers: markers } = await getAffordableForIsochrone(geojson, affordability)
            setHousingStats(stats)
            setZipMarkers(markers)
          } else {
            // No income - just show ZIPs without affordability
            const stats = await getHousingForIsochrone(geojson)
            setHousingStats(stats)
            setZipMarkers([])
          }
        } catch {
          console.warn('Could not load housing data')
          setHousingStats(null)
          setZipMarkers([])
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
    [affordability]
  )

  async function handleSearch(address: string) {
    // Clear income search state
    setSearchMode('address')
    setStateData([])
    setSelectedState(null)
    setAllNationwideEntries([])
    setZipMarkers([])
    setHighlightedZip(null)
    setFocusZip(null)
    setSidebarOpen(false) // Close sidebar on mobile after search

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
    setSidebarOpen(false) // Close sidebar on mobile after search
    setLoading(true)
    setError(null)
    setStatus('Finding affordable areas nationwide...')
    // Clear address mode state
    setLocation(null)
    setIsochrone(null)
    locationRef.current = null
    setSelectedState(null)
    setZipMarkers([])
    setHighlightedZip(null)
    setFocusZip(null)

    try {
      // Load US states GeoJSON if not cached
      if (!stateGeoJson) {
        const res = await fetch(`${import.meta.env.BASE_URL}data/us-states.json`)
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

  async function handleStateClick(stateCode: string) {
    setSelectedState(stateCode)
    setZctaError(null)

    // Load ZCTA boundaries for this state
    setZctaLoading(true)
    try {
      const geojson = await loadZctaBoundaries(stateCode)
      setZctaGeoJson(geojson)
      if (!geojson) {
        setZctaError(`ZIP boundary data not available for ${stateCode}. Showing ZIP dots instead.`)
      }
    } catch (err) {
      setZctaError(`Failed to load ZIP boundaries for ${stateCode}. Showing ZIP dots instead.`)
      setZctaGeoJson(null)
    } finally {
      setZctaLoading(false)
    }

    // Filter entries to just this state
    const stateEntries = allNationwideEntries.filter(e => e.state === stateCode)

    // Build ZIP markers for the map - include all affordability tiers
    const markers: ZipMarker[] = stateEntries.map(e => {
      const tier = getAffordabilityTier(e.medianHomeValue, affordability)
      return {
        lat: e.lat,
        lon: e.lon,
        zip: e.zip,
        tier: tier === 'affordable' ? 'affordable' : tier === 'stretch' ? 'stretch' : 'unaffordable',
      }
    })
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
    setZctaGeoJson(null)
    setZctaError(null)

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

  function handleClearDebugZips() {
    // Clear debug ZIP boundaries and reset debug mode
    setZctaGeoJson(null)
    setDebugMode(false)

    // If we're in nationwide income view, clear all markers
    // If we're in a selected state view, keep the state's markers
    if (searchMode === 'income' && !selectedState) {
      setZipMarkers([])
    }
  }

  // Load all 50 states' ZIP boundaries for debug mode
  async function handleLoadAllStates() {
    const ALL_STATE_CODES = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
    ]

    setZctaLoading(true)
    setZctaError(null)
    setStatus('Loading all US ZIP boundaries... (this may take a moment)')

    try {
      const allFeatures: GeoJSON.Feature[] = []
      let loadedCount = 0

      // Load states in batches of 15 for faster loading
      const BATCH_SIZE = 15
      for (let i = 0; i < ALL_STATE_CODES.length; i += BATCH_SIZE) {
        const batch = ALL_STATE_CODES.slice(i, i + BATCH_SIZE)
        const promises = batch.map(async (stateCode) => {
          try {
            const geojson = await loadZctaBoundaries(stateCode)
            if (geojson && geojson.features) {
              loadedCount++
              setStatus(`Loading ZIP boundaries... (${loadedCount}/${ALL_STATE_CODES.length} states)`)
              return geojson.features
            }
            return []
          } catch {
            console.warn(`Failed to load ${stateCode}`)
            return []
          }
        })

        const batchResults = await Promise.all(promises)
        batchResults.forEach(features => {
          allFeatures.push(...features)
        })
      }

      // Combine all features into one GeoJSON
      const combinedGeoJson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: allFeatures,
      }

      setZctaGeoJson(combinedGeoJson)
      setDebugMode(true)

      // If we're in income mode and have nationwide entries, calculate affordability tiers
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
        setZipMarkers(markers)
        setStatus(`Loaded ${allFeatures.length.toLocaleString()} ZIP boundaries with affordability colors`)
      } else {
        setStatus(`Loaded ${allFeatures.length.toLocaleString()} ZIP boundaries from ${loadedCount} states`)
      }
    } catch (err) {
      setZctaError('Failed to load all ZIP boundaries')
      console.error('Error loading all states:', err)
    } finally {
      setZctaLoading(false)
    }
  }

  function handleClear() {
    setLocation(null)
    setIsochrone(null)
    setHousingStats(null)
    setStatus(null)
    setError(null)
    setFocusZip(null)
    setHighlightedZip(null)
    setStateData([])
    setSelectedState(null)
    setAllNationwideEntries([])
    setZipMarkers([])
    setZctaGeoJson(null)
    setZctaError(null)
    locationRef.current = null
  }

  function handleZipSelect(lat: number, lon: number, zip: string) {
    setFocusZip({ lat, lon, zip, _t: Date.now() })
    setHighlightedZip(zip)
    setSidebarOpen(false) // Close sidebar on mobile after selection

    // Find full entry for info box
    if (housingStats?.entries) {
      const entry = housingStats.entries.find(e => e.zip === zip)
      setSelectedZipInfo(entry ?? null)
    }
  }

  function handleZipMarkerClick(zip: string) {
    setHighlightedZip(zip)

    // Find full entry for info box
    if (housingStats?.entries) {
      const entry = housingStats.entries.find(e => e.zip === zip)
      setSelectedZipInfo(entry ?? null)
    }
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

  // Re-apply affordability tiers when income changes in address mode
  useEffect(() => {
    // Only run in address mode when isochrone and housing stats exist
    if (searchMode !== 'address' || !isochrone || !housingStats?.entries.length) return

    // If no income, clear ZIP markers (no colors)
    if (!affordability.annualIncome || affordability.annualIncome <= 0) {
      setZipMarkers([])
      return
    }

    // Recalculate tiers for existing ZIP entries without re-fetching
    const updatedMarkers = housingStats.entries
      .map((entry) => {
        const tier = getAffordabilityTier(entry.medianHomeValue, affordability)
        return {
          zip: entry.zip,
          lat: entry.lat,
          lon: entry.lon,
          tier,
          medianHomeValue: entry.medianHomeValue,
          medianRent: entry.medianRent,
        }
      })
      .filter((marker): marker is {
        zip: string
        lat: number
        lon: number
        tier: 'affordable' | 'stretch' | 'unaffordable'
        medianHomeValue: number | null
        medianRent: number | null
      } => marker.tier !== 'unknown')

    setZipMarkers(updatedMarkers)
  }, [
    // Only depend on fields that affect affordability tier calculations
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
    // Note: Don't depend on isochrone - it changes before housingStats updates, causing race condition
    searchMode
  ])

  const selectedStateInfo = selectedState ? stateData.find(s => s.state === selectedState) : null

  // Memoize filtered entries to avoid filtering on every render
  const filteredEntries = useMemo(() => {
    if (!housingStats) return []
    // Inverted: when showUnaffordable is FALSE (unchecked), filter out unaffordable
    if (!showUnaffordable) {
      return housingStats.entries.filter(e => {
        const tier = getAffordabilityTier(e.medianHomeValue, affordability)
        return tier === 'affordable' || tier === 'stretch'
      })
    }
    // When TRUE (checked), show all ZIPs including unaffordable
    return housingStats.entries
  }, [
    housingStats,
    showUnaffordable,
    // Only depend on fields that affect affordability tier calculations
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

  // Memoize filtered zip markers
  const filteredZipMarkers = useMemo(() => {
    // Inverted: when showUnaffordable is FALSE (unchecked), filter out unaffordable
    if (!showUnaffordable) {
      return zipMarkers.filter(m => m.tier !== 'unaffordable')
    }
    // When TRUE (checked), show all markers including unaffordable
    return zipMarkers
  }, [zipMarkers, showUnaffordable])

  return (
    <div className="flex h-screen bg-white relative">
      {/* Hamburger Menu Button (mobile only) - positioned top-right to avoid map controls */}
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

          {/* Points of Interest */}
          <hr className="border-gray-200" />
          <CollapsibleSection title="Points of Interest" defaultExpanded={false}>
            <POIFilter />
          </CollapsibleSection>

          {/* Status / Error */}
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

                {/* Show unaffordable toggle - moved inside Housing Data section */}
                {((searchMode === 'income' && selectedState) || (searchMode === 'address' && zipMarkers.length > 0)) && (
                  <div className="flex items-center justify-between mt-3 mb-3 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showUnaffordable}
                        onChange={(e) => setShowUnaffordable(e.target.checked)}
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
          onClose={() => setSelectedZipInfo(null)}
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
