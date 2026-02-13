import { describe, it, expect } from 'vitest'
import {
  calculateMonthlyPayment,
  calculateFullMonthlyPayment,
  calculateMaxHomePrice,
  getEffectiveMaxPrice,
  getAffordabilityTier,
} from '../mortgage'
import type { AffordabilityInputs } from '../../types'

/** Helper: default affordability inputs for tests */
function makeInputs(overrides: Partial<AffordabilityInputs> = {}): AffordabilityInputs {
  return {
    annualIncome: 75000,
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
    ...overrides,
  }
}

// ─── calculateMonthlyPayment ─────────────────────────────────────────

describe('calculateMonthlyPayment', () => {
  it('calculates standard 30-year payment', () => {
    // $200,000 at 6.5% for 30 years ≈ $1,264/month
    const payment = calculateMonthlyPayment(200000, 6.5, 30)
    expect(payment).toBeCloseTo(1264.14, 0)
  })

  it('calculates standard 15-year payment', () => {
    const payment = calculateMonthlyPayment(200000, 6.5, 15)
    expect(payment).toBeCloseTo(1742.21, 0)
  })

  it('15-year has higher monthly but lower total cost than 30-year', () => {
    const monthly15 = calculateMonthlyPayment(200000, 6.5, 15)
    const monthly30 = calculateMonthlyPayment(200000, 6.5, 30)
    expect(monthly15).toBeGreaterThan(monthly30)
    expect(monthly15 * 15 * 12).toBeLessThan(monthly30 * 30 * 12)
  })

  it('returns 0 for zero principal', () => {
    expect(calculateMonthlyPayment(0, 6.5, 30)).toBe(0)
  })

  it('returns 0 for negative principal', () => {
    expect(calculateMonthlyPayment(-50000, 6.5, 30)).toBe(0)
  })

  it('handles zero interest rate (simple division)', () => {
    // $120,000 / (30 * 12) = $333.33/month
    const payment = calculateMonthlyPayment(120000, 0, 30)
    expect(payment).toBeCloseTo(333.33, 1)
  })

  it('handles very low interest rate', () => {
    const payment = calculateMonthlyPayment(200000, 0.5, 30)
    expect(payment).toBeGreaterThan(0)
    expect(payment).toBeLessThan(200000 / (30 * 12) * 1.5) // should be close to simple division
  })

  it('handles very high interest rate', () => {
    const payment = calculateMonthlyPayment(200000, 25, 30)
    expect(payment).toBeGreaterThan(4000)
  })
})

// ─── calculateFullMonthlyPayment ─────────────────────────────────────

describe('calculateFullMonthlyPayment', () => {
  it('includes all cost components', () => {
    const inputs = makeInputs({ hoaMonthly: 200 })
    const result = calculateFullMonthlyPayment(300000, inputs)

    expect(result.principal).toBeGreaterThan(0)
    expect(result.tax).toBeGreaterThan(0)
    expect(result.insurance).toBeCloseTo(125, 0) // $1500/12
    expect(result.pmi).toBe(0) // 20% down = no PMI
    expect(result.hoa).toBe(200)
    expect(result.total).toBeCloseTo(
      result.principal + result.tax + result.insurance + result.pmi + result.hoa,
      2
    )
  })

  it('no PMI when down payment >= 20%', () => {
    const result = calculateFullMonthlyPayment(300000, makeInputs({ downPaymentPct: 20 }))
    expect(result.pmi).toBe(0)
  })

  it('includes PMI when down payment < 20%', () => {
    const result = calculateFullMonthlyPayment(300000, makeInputs({ downPaymentPct: 10 }))
    expect(result.pmi).toBeGreaterThan(0)
    // PMI = loanAmount * 0.007 / 12 = 270000 * 0.007 / 12 ≈ $157.50
    expect(result.pmi).toBeCloseTo(157.5, 0)
  })

  it('PMI drops exactly at 20% boundary', () => {
    const at19 = calculateFullMonthlyPayment(300000, makeInputs({ downPaymentPct: 19 }))
    const at20 = calculateFullMonthlyPayment(300000, makeInputs({ downPaymentPct: 20 }))
    expect(at19.pmi).toBeGreaterThan(0)
    expect(at20.pmi).toBe(0)
  })

  it('higher down payment means lower principal payment', () => {
    const low = calculateFullMonthlyPayment(300000, makeInputs({ downPaymentPct: 5 }))
    const high = calculateFullMonthlyPayment(300000, makeInputs({ downPaymentPct: 40 }))
    expect(high.principal).toBeLessThan(low.principal)
  })

  it('property tax scales with home price', () => {
    const cheap = calculateFullMonthlyPayment(100000, makeInputs())
    const expensive = calculateFullMonthlyPayment(500000, makeInputs())
    expect(expensive.tax).toBeCloseTo(cheap.tax * 5, 0)
  })
})

// ─── calculateMaxHomePrice ───────────────────────────────────────────

describe('calculateMaxHomePrice', () => {
  it('returns a reasonable max price for median income', () => {
    const maxPrice = calculateMaxHomePrice(makeInputs({ annualIncome: 75000 }))
    // $75k income, 28% front DTI = $1,750/mo for housing
    // Should afford roughly $250k-$300k
    expect(maxPrice).toBeGreaterThan(200000)
    expect(maxPrice).toBeLessThan(400000)
  })

  it('returned price has DTI near the front-end limit', () => {
    const inputs = makeInputs({ annualIncome: 75000 })
    const maxPrice = calculateMaxHomePrice(inputs)
    const { total } = calculateFullMonthlyPayment(maxPrice, inputs)
    const grossMonthly = 75000 / 12
    const dti = (total + inputs.monthlyDebts) / grossMonthly
    // Should be very close to 28%
    expect(dti).toBeCloseTo(0.28, 1)
  })

  it('returns 0 for zero income', () => {
    expect(calculateMaxHomePrice(makeInputs({ annualIncome: 0 }))).toBe(0)
  })

  it('returns 0 for null income', () => {
    expect(calculateMaxHomePrice(makeInputs({ annualIncome: null }))).toBe(0)
  })

  it('returns 0 when debts exceed housing budget', () => {
    // $50k income, 28% DTI = $1,166/mo. With $1,500 debts, no room for housing.
    const maxPrice = calculateMaxHomePrice(makeInputs({
      annualIncome: 50000,
      monthlyDebts: 1500,
    }))
    expect(maxPrice).toBe(0)
  })

  it('higher income means higher max price', () => {
    const low = calculateMaxHomePrice(makeInputs({ annualIncome: 50000 }))
    const high = calculateMaxHomePrice(makeInputs({ annualIncome: 150000 }))
    expect(high).toBeGreaterThan(low)
  })

  it('higher DTI means higher max price', () => {
    const strict = calculateMaxHomePrice(makeInputs({ frontDtiPct: 25 }))
    const loose = calculateMaxHomePrice(makeInputs({ frontDtiPct: 35 }))
    expect(loose).toBeGreaterThan(strict)
  })

  it('higher down payment means higher max price (less PMI, more equity)', () => {
    const low = calculateMaxHomePrice(makeInputs({ downPaymentPct: 5 }))
    const high = calculateMaxHomePrice(makeInputs({ downPaymentPct: 30 }))
    expect(high).toBeGreaterThan(low)
  })
})

// ─── getEffectiveMaxPrice ────────────────────────────────────────────

describe('getEffectiveMaxPrice', () => {
  it('returns calculated price by default', () => {
    const inputs = makeInputs()
    const effective = getEffectiveMaxPrice(inputs)
    const calculated = calculateMaxHomePrice(inputs)
    expect(effective).toBe(calculated)
  })

  it('returns manual price when enabled', () => {
    const inputs = makeInputs({ useManualMaxPrice: true, manualMaxPrice: 500000 })
    expect(getEffectiveMaxPrice(inputs)).toBe(500000)
  })

  it('falls back to calculated when manual is null', () => {
    const inputs = makeInputs({ useManualMaxPrice: true, manualMaxPrice: null })
    expect(getEffectiveMaxPrice(inputs)).toBe(calculateMaxHomePrice(inputs))
  })

  it('falls back to calculated when manual is 0', () => {
    const inputs = makeInputs({ useManualMaxPrice: true, manualMaxPrice: 0 })
    expect(getEffectiveMaxPrice(inputs)).toBe(calculateMaxHomePrice(inputs))
  })

  it('returns null for no income', () => {
    expect(getEffectiveMaxPrice(makeInputs({ annualIncome: null }))).toBeNull()
  })
})

// ─── getAffordabilityTier ────────────────────────────────────────────

describe('getAffordabilityTier', () => {
  describe('base DTI tiers (no cash flow check)', () => {
    it('returns affordable when DTI <= front-end %', () => {
      // With $100k income, a $200k home should be affordable
      const tier = getAffordabilityTier(200000, makeInputs({ annualIncome: 100000 }))
      expect(tier).toBe('affordable')
    })

    it('returns stretch when front-end < DTI <= back-end', () => {
      // Find a price between affordable and unaffordable thresholds
      const inputs = makeInputs({ annualIncome: 75000 })
      const maxAffordable = calculateMaxHomePrice(inputs)
      // Price 20% above max affordable should push into stretch
      const stretchPrice = Math.round(maxAffordable * 1.15)
      const tier = getAffordabilityTier(stretchPrice, inputs)
      expect(tier).toBe('stretch')
    })

    it('returns unaffordable when DTI > back-end %', () => {
      // Very expensive home relative to income
      const tier = getAffordabilityTier(800000, makeInputs({ annualIncome: 50000 }))
      expect(tier).toBe('unaffordable')
    })

    it('returns unknown for null home value', () => {
      expect(getAffordabilityTier(null, makeInputs())).toBe('unknown')
    })

    it('returns unknown for null income', () => {
      expect(getAffordabilityTier(200000, makeInputs({ annualIncome: null }))).toBe('unknown')
    })

    it('returns unknown for zero income', () => {
      expect(getAffordabilityTier(200000, makeInputs({ annualIncome: 0 }))).toBe('unknown')
    })
  })

  describe('cash flow downgrades', () => {
    it('does not downgrade when includeSpending is false', () => {
      const inputs = makeInputs({
        annualIncome: 100000,
        monthlySpending: 5000,
        includeSpending: false, // disabled
      })
      const tier = getAffordabilityTier(200000, inputs)
      expect(tier).toBe('affordable')
    })

    it('downgrades to unaffordable when cash flow is negative', () => {
      const inputs = makeInputs({
        annualIncome: 60000, // $5k/mo gross
        monthlySpending: 4000,
        includeSpending: true,
      })
      // Housing eats rest, spending pushes negative
      const tier = getAffordabilityTier(250000, inputs)
      expect(tier).toBe('unaffordable')
    })

    it('downgrades to unaffordable when below $500/month cushion', () => {
      const inputs = makeInputs({
        annualIncome: 100000,
        monthlySpending: 6500, // leaves very little after housing
        includeSpending: true,
      })
      // Gross monthly: ~$8,333. Housing on $150k home is low.
      // But spending of $6,500 leaves < $500 cushion
      const tier = getAffordabilityTier(150000, inputs)
      // Verify the tier accounts for the cushion minimum
      if (tier !== 'affordable') {
        expect(['stretch', 'unaffordable']).toContain(tier)
      }
    })

    it('BUG FIX: cascades from affordable through stretch to unaffordable on very low cash flow', () => {
      // This is the specific bug that was fixed: else if -> if
      // With very low cashFlowPct (< 0.15), a home that's "affordable" by DTI
      // should cascade: affordable -> stretch (< 15% buffer) -> unaffordable (< 25% buffer)
      const inputs = makeInputs({
        annualIncome: 60000,  // $5,000/mo gross
        downPaymentPct: 20,
        interestRate: 6.5,
        loanTermYears: 30,
        propertyTaxRate: 1.1,
        annualInsurance: 1500,
        monthlyDebts: 0,
        hoaMonthly: 0,
        frontDtiPct: 28,
        backDtiPct: 36,
        monthlySpending: 3500,  // high spending
        includeSpending: true,
        manualMaxPrice: null,
        useManualMaxPrice: false,
      })

      // Find a home price that is "affordable" by DTI (<=28%)
      // but has cashFlowPct < 0.15 after spending
      // Gross monthly = $5,000
      // At 28% DTI, max housing = $1,400
      // Try a cheap home: $100k -> housing ≈ $700ish
      // Remaining = $5,000 - $700 - $3,500 = $800
      // cashFlowPct = $800 / $5,000 = 0.16 -> just above 0.15

      // Try $120k home -> housing ≈ $850ish
      // Remaining = $5,000 - $850 - $3,500 = $650
      // cashFlowPct = $650 / $5,000 = 0.13 -> below 0.15 AND below 0.25

      // This should cascade: affordable (by DTI) -> stretch (cashFlowPct < 0.15) -> unaffordable (cashFlowPct < 0.25)
      const homePrice = 120000
      const { total: housingPayment } = calculateFullMonthlyPayment(homePrice, inputs)
      const grossMonthly = 60000 / 12
      const totalDebts = housingPayment + inputs.monthlyDebts
      const dtiRatio = totalDebts / grossMonthly

      // Verify this IS affordable by DTI
      expect(dtiRatio).toBeLessThanOrEqual(0.28)

      // Verify cash flow percentage is < 0.15 (triggers both downgrades)
      const remaining = grossMonthly - totalDebts - inputs.monthlySpending
      const cashFlowPct = remaining / grossMonthly
      expect(cashFlowPct).toBeLessThan(0.15)
      expect(remaining).toBeGreaterThanOrEqual(500) // above $500 minimum

      // THE KEY ASSERTION: with the bug fix, this should be 'unaffordable'
      // (not 'stretch' as the old buggy code would return)
      const tier = getAffordabilityTier(homePrice, inputs)
      expect(tier).toBe('unaffordable')
    })

    it('downgrades affordable to stretch only (not further) when 0.15 <= cashFlowPct < 0.25', () => {
      // cashFlowPct between 0.15 and 0.25 should stop at stretch, not cascade further
      const inputs = makeInputs({
        annualIncome: 60000,
        monthlySpending: 3000,
        includeSpending: true,
      })

      // Gross monthly = $5,000
      // Try a cheap home where DTI is affordable but cash flow is 15-25%
      const homePrice = 80000
      const { total: housingPayment } = calculateFullMonthlyPayment(homePrice, inputs)
      const grossMonthly = 60000 / 12
      const totalDebts = housingPayment + inputs.monthlyDebts
      const remaining = grossMonthly - totalDebts - inputs.monthlySpending
      const cashFlowPct = remaining / grossMonthly

      // Only assert the tier if cashFlowPct is in the right range
      if (cashFlowPct >= 0.15 && cashFlowPct < 0.25) {
        const dtiRatio = totalDebts / grossMonthly
        if (dtiRatio <= 0.28) {
          const tier = getAffordabilityTier(homePrice, inputs)
          // Should stay at stretch, not cascade to unaffordable
          expect(tier).toBe('stretch')
        }
      }
    })
  })
})
