import type { AffordabilityInputs, AffordabilityTier } from '../types'

const PMI_RATE = 0.007

/**
 * Standard amortization formula.
 * Returns monthly principal + interest payment.
 */
export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termYears: number
): number {
  if (principal <= 0) return 0
  if (annualRate <= 0) return principal / (termYears * 12)

  const monthlyRate = annualRate / 100 / 12
  const numPayments = termYears * 12
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1)
  )
}

/**
 * Full monthly housing cost: P&I + property tax + insurance + PMI + HOA.
 */
export function calculateFullMonthlyPayment(
  homePrice: number,
  inputs: AffordabilityInputs
): { total: number; principal: number; tax: number; insurance: number; pmi: number; hoa: number } {
  const loanAmount = homePrice * (1 - inputs.downPaymentPct / 100)
  const principal = calculateMonthlyPayment(loanAmount, inputs.interestRate, inputs.loanTermYears)
  const taxRate = inputs.propertyTaxRate / 100
  const tax = (homePrice * taxRate) / 12
  const insurance = inputs.annualInsurance / 12
  const pmi = inputs.downPaymentPct < 20 ? (loanAmount * PMI_RATE) / 12 : 0
  const hoa = inputs.hoaMonthly

  return {
    total: principal + tax + insurance + pmi + hoa,
    principal,
    tax,
    insurance,
    pmi,
    hoa,
  }
}

/**
 * Max home price based on front-end DTI ratio, accounting for taxes, insurance, PMI, HOA, and debts.
 * Uses TRADITIONAL DTI calculation (excludes monthly spending - that affects tier, not max price).
 * Uses iterative approach since taxes/PMI scale with home price.
 */
export function calculateMaxHomePrice(inputs: AffordabilityInputs): number {
  if (!inputs.annualIncome || inputs.annualIncome <= 0) return 0

  const maxMonthly = (inputs.annualIncome / 12) * (inputs.frontDtiPct / 100)
  // Traditional DTI: only debts reduce housing budget, NOT living expenses
  // Monthly spending will be factored into tier calculation via cash flow check
  const availableForHousing = maxMonthly - inputs.monthlyDebts
  if (availableForHousing <= 0) return 0

  // Iteratively solve: find home price where full monthly = availableForHousing
  let low = 0
  let high = inputs.annualIncome * 10
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2
    const { total } = calculateFullMonthlyPayment(mid, inputs)
    if (total < availableForHousing) {
      low = mid
    } else {
      high = mid
    }
  }
  return Math.round((low + high) / 2)
}

/**
 * Get the effective max home price - either user-set manual price or calculated DTI-based price.
 * Use this instead of calculateMaxHomePrice() when displaying/using the max price.
 */
export function getEffectiveMaxPrice(inputs: AffordabilityInputs): number | null {
  if (inputs.useManualMaxPrice && inputs.manualMaxPrice !== null && inputs.manualMaxPrice > 0) {
    return inputs.manualMaxPrice
  }
  if (!inputs.annualIncome || inputs.annualIncome <= 0) return null
  return calculateMaxHomePrice(inputs)
}

/**
 * Determine affordability tier for a home at the given price.
 * Uses TRADITIONAL DTI for base tier (housing + debts only),
 * then applies cash flow check if monthly spending is included.
 *
 * Base DTI tiers:
 * - affordable: ≤ front-end DTI % (28%)
 * - stretch: front-end – back-end DTI % (28-36%)
 * - unaffordable: > back-end DTI % (>36%)
 *
 * Cash flow adjustments (when includeSpending is true):
 * - Downgrades tier if remaining cash flow is insufficient
 * - Requires 15% cushion for affordable, 25% for stretch
 * - Enforces $500/month absolute minimum regardless of income
 */
export function getAffordabilityTier(
  homePrice: number | null,
  inputs: AffordabilityInputs
): AffordabilityTier {
  if (homePrice === null || inputs.annualIncome === null || inputs.annualIncome <= 0) {
    return 'unknown'
  }

  const { total: housingPayment } = calculateFullMonthlyPayment(homePrice, inputs)
  const grossMonthlyIncome = inputs.annualIncome / 12

  // Calculate TRADITIONAL DTI tier (housing + debts only, NO spending)
  const totalDebts = housingPayment + inputs.monthlyDebts
  const dtiRatio = totalDebts / grossMonthlyIncome

  let tier: AffordabilityTier
  if (dtiRatio <= inputs.frontDtiPct / 100) tier = 'affordable'
  else if (dtiRatio <= inputs.backDtiPct / 100) tier = 'stretch'
  else tier = 'unaffordable'

  // If includeSpending is enabled, perform cash flow check
  // This may DOWNGRADE the tier based on remaining disposable income
  if (inputs.includeSpending && inputs.monthlySpending > 0) {
    const remainingCashFlow = grossMonthlyIncome - totalDebts - inputs.monthlySpending
    const cashFlowPct = remainingCashFlow / grossMonthlyIncome

    // Financial expert thresholds: 15% for affordable, 25% for stretch
    // Also enforce $500/month absolute minimum cushion
    const MINIMUM_MONTHLY_CUSHION = 500

    if (remainingCashFlow < 0) {
      // Negative cash flow = definitely unaffordable
      tier = 'unaffordable'
    } else if (remainingCashFlow < MINIMUM_MONTHLY_CUSHION) {
      // Below absolute minimum = unaffordable regardless of percentage
      tier = 'unaffordable'
    } else if (cashFlowPct < 0.15 && tier === 'affordable') {
      // Less than 15% buffer on "affordable" = downgrade to stretch
      tier = 'stretch'
    }
    if (cashFlowPct < 0.25 && tier === 'stretch') {
      // Less than 25% buffer on "stretch" = downgrade to unaffordable
      tier = 'unaffordable'
    }
  }

  return tier
}
