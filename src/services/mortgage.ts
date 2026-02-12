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
 * Uses iterative approach since taxes/PMI scale with home price.
 */
export function calculateMaxHomePrice(inputs: AffordabilityInputs): number {
  if (!inputs.annualIncome || inputs.annualIncome <= 0) return 0

  const maxMonthly = (inputs.annualIncome / 12) * (inputs.frontDtiPct / 100)
  // Subtract existing monthly obligations that eat into housing budget
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
 * Determine affordability tier for a home at the given price.
 * Uses full monthly cost (P&I + tax + insurance + PMI + HOA) + debts.
 * - affordable: ≤ front-end DTI %
 * - stretch: front-end – back-end DTI %
 * - unaffordable: > back-end DTI %
 */
export function getAffordabilityTier(
  homePrice: number | null,
  inputs: AffordabilityInputs
): AffordabilityTier {
  if (homePrice === null || inputs.annualIncome === null || inputs.annualIncome <= 0) {
    return 'unknown'
  }

  const { total } = calculateFullMonthlyPayment(homePrice, inputs)
  const totalWithDebts = total + inputs.monthlyDebts

  const grossMonthlyIncome = inputs.annualIncome / 12
  const ratio = totalWithDebts / grossMonthlyIncome

  if (ratio <= inputs.frontDtiPct / 100) return 'affordable'
  if (ratio <= inputs.backDtiPct / 100) return 'stretch'
  return 'unaffordable'
}
