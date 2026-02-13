export interface GeocodedLocation {
  lat: number
  lon: number
  displayName: string
}

export interface HousingDataEntry {
  zip: string
  name?: string
  state?: string
  lat: number
  lon: number
  medianHomeValue: number | null
  medianRent: number | null
  landSharePct?: number | null
  landValuePerAcre?: number | null
  appreciation5yr?: number | null  // 5-year home value appreciation percentage
  fmr?: {
    br0: number | null
    br1: number | null
    br2: number | null
    br3: number | null
    br4: number | null
  }
}

export interface DataMeta {
  zhviDate: string | null
  zoriDate: string | null
  aeiYear?: string | null
  fetchedAt: string | null
}

export interface HousingStats {
  zipCount: number
  medianHomeValue: number | null
  medianRent: number | null
  minHomeValue: number | null
  maxHomeValue: number | null
  minRent: number | null
  maxRent: number | null
  entries: HousingDataEntry[]
  meta?: DataMeta
}

export type TravelMode = 'drive' | 'transit'

export interface AffordabilityInputs {
  annualIncome: number | null
  downPaymentPct: number   // 3-50, default 20
  interestRate: number     // e.g. 6.5
  loanTermYears: 15 | 30  // default 30
  // Advanced (optional overrides)
  propertyTaxRate: number  // default 1.1 (%)
  annualInsurance: number  // default 1500 ($)
  monthlyDebts: number     // default 0 ($) — car, student loans, credit cards
  hoaMonthly: number       // default 0 ($)
  frontDtiPct: number      // default 28 (%)
  backDtiPct: number       // default 36 (%)
  // Monthly spending (groceries, utilities, gas, etc.)
  monthlySpending: number  // default 0 ($)
  includeSpending: boolean // default false - whether to factor spending into affordability
  // Manual max price override
  manualMaxPrice: number | null      // User-set max price (null = use calculated)
  useManualMaxPrice: boolean          // Toggle between manual and calculated
}

export type AffordabilityTier = 'affordable' | 'stretch' | 'unaffordable' | 'unknown'

export type SummaryContext = 'commute' | 'state' | 'nationwide' | 'none'

export interface StateAffordability {
  state: string           // "NY"
  stateName: string       // "New York"
  totalZips: number
  affordableCount: number
  stretchCount: number
  unaffordableCount: number
  pctAffordable: number   // 0-100
  medianHomeValue: number | null
  medianRent: number | null
}
