import { buildStats } from '../services/housingData'
import { getAffordabilityTier } from '../services/mortgage'
import type {
  GeocodedLocation,
  TravelMode,
  HousingStats,
  AffordabilityInputs,
  StateAffordability,
  HousingDataEntry,
  ZipMarker,
  FocusZip,
} from '../types'

export interface AppState {
  searchMode: 'address' | 'income'
  location: GeocodedLocation | null
  isochrone: GeoJSON.FeatureCollection | null
  mode: TravelMode
  minutes: number
  loading: boolean
  housingLoading: boolean
  zctaLoading: boolean
  housingStats: HousingStats | null
  stateGeoJson: GeoJSON.FeatureCollection | null
  stateData: StateAffordability[]
  selectedState: string | null
  allNationwideEntries: HousingDataEntry[]
  zipMarkers: ZipMarker[]
  zctaGeoJson: GeoJSON.FeatureCollection | null
  error: string | null
  zctaError: string | null
  highlightedZip: string | null
  focusZip: FocusZip | null
  selectedZipInfo: HousingDataEntry | null
  showUnaffordable: boolean
  debugMode: boolean
}

export type AppAction =
  | { type: 'PATCH'; patch: Partial<AppState> }
  | { type: 'START_ADDRESS_SEARCH' }
  | { type: 'START_INCOME_SEARCH' }
  | { type: 'INCOME_SEARCH_DONE'; stateData: StateAffordability[]; allEntries: HousingDataEntry[]; stats: HousingStats; stateGeoJson?: GeoJSON.FeatureCollection }
  | { type: 'STATE_CLICK'; stateCode: string; affordability: AffordabilityInputs }
  | { type: 'SELECT_ZIP'; lat: number; lon: number; zip: string; _t: number }
  | { type: 'CLICK_ZIP_MARKER'; zip: string }
  | { type: 'BACK_TO_STATES' }
  | { type: 'CLEAR_ALL' }
  | { type: 'CLEAR_DEBUG' }

export const initialAppState: AppState = {
  searchMode: 'address',
  location: null,
  isochrone: null,
  mode: 'drive',
  minutes: 30,
  loading: false,
  housingLoading: false,
  zctaLoading: false,
  housingStats: null,
  stateGeoJson: null,
  stateData: [],
  selectedState: null,
  allNationwideEntries: [],
  zipMarkers: [],
  zctaGeoJson: null,
  error: null,
  zctaError: null,
  highlightedZip: null,
  focusZip: null,
  selectedZipInfo: null,
  showUnaffordable: true,
  debugMode: false,
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'PATCH':
      return { ...state, ...action.patch }

    case 'START_ADDRESS_SEARCH':
      return {
        ...state,
        searchMode: 'address',
        loading: true,
        error: null,
        stateData: [],
        selectedState: null,
        allNationwideEntries: [],
        zipMarkers: [],
        highlightedZip: null,
        focusZip: null,
      }

    case 'START_INCOME_SEARCH':
      return {
        ...state,
        searchMode: 'income',
        loading: true,
        error: null,
        location: null,
        isochrone: null,
        selectedState: null,
        zipMarkers: [],
        highlightedZip: null,
        focusZip: null,
      }

    case 'INCOME_SEARCH_DONE':
      return {
        ...state,
        loading: false,
        stateData: action.stateData,
        allNationwideEntries: action.allEntries,
        housingStats: action.stats,
        stateGeoJson: action.stateGeoJson ?? state.stateGeoJson,
      }

    case 'STATE_CLICK': {
      const stateEntries = state.allNationwideEntries.filter(e => e.state === action.stateCode)
      const markers: ZipMarker[] = stateEntries.map(e => {
        const tier = getAffordabilityTier(e.medianHomeValue, action.affordability)
        return {
          lat: e.lat,
          lon: e.lon,
          zip: e.zip,
          tier: tier === 'affordable' ? 'affordable' : tier === 'stretch' ? 'stretch' : 'unaffordable',
        }
      })
      return {
        ...state,
        selectedState: action.stateCode,
        zctaError: null,
        zctaLoading: true,
        zipMarkers: markers,
        housingStats: buildStats(stateEntries),
      }
    }

    case 'SELECT_ZIP': {
      const entry = state.housingStats?.entries.find(e => e.zip === action.zip) ?? null
      return {
        ...state,
        focusZip: { lat: action.lat, lon: action.lon, zip: action.zip, _t: action._t },
        highlightedZip: action.zip,
        selectedZipInfo: entry,
      }
    }

    case 'CLICK_ZIP_MARKER': {
      const entry = state.housingStats?.entries.find(e => e.zip === action.zip) ?? null
      return {
        ...state,
        highlightedZip: action.zip,
        selectedZipInfo: entry,
      }
    }

    case 'BACK_TO_STATES':
      return {
        ...state,
        selectedState: null,
        zipMarkers: [],
        zctaGeoJson: null,
        zctaError: null,
        housingStats: buildStats(state.allNationwideEntries),
      }

    case 'CLEAR_ALL':
      return {
        ...initialAppState,
        stateGeoJson: state.stateGeoJson,
        mode: state.mode,
        minutes: state.minutes,
        showUnaffordable: state.showUnaffordable,
      }

    case 'CLEAR_DEBUG':
      return {
        ...state,
        zctaGeoJson: null,
        debugMode: false,
        zipMarkers: state.searchMode === 'income' && !state.selectedState ? [] : state.zipMarkers,
      }

    default:
      return state
  }
}
