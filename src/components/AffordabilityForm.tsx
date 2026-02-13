import { useState, useEffect } from 'react'
import type { AffordabilityInputs } from '../types'
import { calculateMaxHomePrice, calculateFullMonthlyPayment, getEffectiveMaxPrice } from '../services/mortgage'

interface AffordabilityFormProps {
  inputs: AffordabilityInputs
  onChange: (inputs: AffordabilityInputs) => void
  onMaxPriceChange?: (maxPrice: number | null) => void
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function parseIncomeInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9]/g, '')
  if (!cleaned) return null
  return parseInt(cleaned, 10)
}

function formatIncomeDisplay(value: number | null): string {
  if (value === null) return ''
  return new Intl.NumberFormat('en-US').format(value)
}

export default function AffordabilityForm({ inputs, onChange, onMaxPriceChange }: AffordabilityFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const hasIncome = inputs.annualIncome !== null && inputs.annualIncome > 0

  // Local state for down payment dollar input (controlled, updates on blur)
  const [downPaymentDollarInput, setDownPaymentDollarInput] = useState<string>('')

  // Local state for annual income input (debounced, updates on blur)
  const [annualIncomeInput, setAnnualIncomeInput] = useState<string>(
    formatIncomeDisplay(inputs.annualIncome)
  )

  // Local state for manual max price input (debounced, updates on blur)
  const [manualMaxPriceInput, setManualMaxPriceInput] = useState<string>(
    inputs.manualMaxPrice ? formatIncomeDisplay(inputs.manualMaxPrice) : ''
  )

  // Update local state when inputs change externally
  useEffect(() => {
    setAnnualIncomeInput(formatIncomeDisplay(inputs.annualIncome))
  }, [inputs.annualIncome])

  useEffect(() => {
    setManualMaxPriceInput(inputs.manualMaxPrice ? formatIncomeDisplay(inputs.manualMaxPrice) : '')
  }, [inputs.manualMaxPrice])

  // Use effective max price (manual or calculated)
  const maxPrice = getEffectiveMaxPrice(inputs)

  const breakdown = maxPrice !== null
    ? calculateFullMonthlyPayment(maxPrice, inputs)
    : null

  // Calculate current down payment dollar amount
  const downPaymentAmount = maxPrice ? maxPrice * (inputs.downPaymentPct / 100) : 0

  // Notify parent of maxPrice changes for collapsed summary
  useEffect(() => {
    onMaxPriceChange?.(maxPrice)
  }, [maxPrice, onMaxPriceChange])

  return (
    <div className="space-y-3">
      {/* Annual Income */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Annual Income</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={annualIncomeInput}
            onChange={(e) => setAnnualIncomeInput(e.target.value)}
            onBlur={() => {
              const parsed = parseIncomeInput(annualIncomeInput)
              onChange({ ...inputs, annualIncome: parsed })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const parsed = parseIncomeInput(annualIncomeInput)
                onChange({ ...inputs, annualIncome: parsed })
                e.currentTarget.blur()
              }
            }}
            placeholder="100,000"
            className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Monthly Income Display */}
        {hasIncome && inputs.annualIncome && (
          <div className="text-xs text-gray-600 mt-1 flex items-center gap-1.5">
            <span className="text-gray-500">Monthly gross:</span>
            <span className="font-semibold text-blue-700">
              {formatCurrency(inputs.annualIncome / 12)}
            </span>
          </div>
        )}
      </div>

      {/* Down Payment - Dual Input */}
      <div>
        <label className="block text-xs text-gray-500 mb-2">
          Down Payment
        </label>

        {/* Dual Input: Percentage and Dollar Amount */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          {/* Percentage Input */}
          <div>
            <label htmlFor="down-payment-pct" className="block text-xs font-medium text-gray-600 mb-1">
              Percent
            </label>
            <div className="relative">
              <input
                id="down-payment-pct"
                type="number"
                min={3}
                max={50}
                step={1}
                value={inputs.downPaymentPct}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 3
                  const clampedPct = Math.max(3, Math.min(50, value))
                  onChange({ ...inputs, downPaymentPct: clampedPct })
                  setDownPaymentDollarInput('') // Clear dollar input when pct changes
                }}
                aria-label="Down payment percentage"
                aria-describedby="down-payment-slider-desc"
                className="w-full pr-8 pl-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                %
              </span>
            </div>
          </div>

          {/* Dollar Amount Input */}
          <div>
            <label htmlFor="down-payment-dollars" className="block text-xs font-medium text-gray-600 mb-1">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                $
              </span>
              <input
                id="down-payment-dollars"
                type="text"
                inputMode="numeric"
                value={downPaymentDollarInput}
                placeholder={formatCurrency(downPaymentAmount).replace('$', '')}
                onChange={(e) => {
                  // Remove non-numeric characters and format with commas
                  const cleaned = e.target.value.replace(/[^0-9]/g, '')
                  const formatted = cleaned ? formatIncomeDisplay(parseInt(cleaned, 10)) : ''
                  setDownPaymentDollarInput(formatted)
                }}
                onBlur={() => {
                  // Only update percentage on blur (when done typing)
                  if (downPaymentDollarInput && maxPrice) {
                    const amount = parseInt(downPaymentDollarInput.replace(/[^0-9]/g, ''), 10)
                    const newPct = Math.round((amount / maxPrice) * 100)
                    const clampedPct = Math.max(3, Math.min(50, newPct))
                    onChange({ ...inputs, downPaymentPct: clampedPct })
                  }
                  // Clear the local input state
                  setDownPaymentDollarInput('')
                }}
                onKeyDown={(e) => {
                  // Also update on Enter key
                  if (e.key === 'Enter' && downPaymentDollarInput && maxPrice) {
                    const amount = parseInt(downPaymentDollarInput.replace(/[^0-9]/g, ''), 10)
                    const newPct = Math.round((amount / maxPrice) * 100)
                    const clampedPct = Math.max(3, Math.min(50, newPct))
                    onChange({ ...inputs, downPaymentPct: clampedPct })
                    setDownPaymentDollarInput('')
                    e.currentTarget.blur()
                  }
                }}
                disabled={!maxPrice}
                aria-label="Down payment dollar amount"
                aria-describedby="down-payment-slider-desc"
                className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Current Value Display */}
        {maxPrice !== null && (
          <div className="text-xs text-gray-600 mb-2 flex items-center gap-1.5">
            <span className="font-medium">{inputs.downPaymentPct}%</span>
            <span className="text-gray-400">=</span>
            <span className="font-semibold text-blue-700">{formatCurrency(downPaymentAmount)}</span>
          </div>
        )}

        {/* Slider */}
        <div className="relative">
          <input
            id="down-payment-slider"
            type="range"
            min={3}
            max={50}
            step={1}
            value={inputs.downPaymentPct}
            onChange={(e) => {
              onChange({ ...inputs, downPaymentPct: parseInt(e.target.value) })
              setDownPaymentDollarInput('') // Clear dollar input when slider changes
            }}
            aria-label="Down payment percentage slider"
            aria-valuemin={3}
            aria-valuemax={50}
            aria-valuenow={inputs.downPaymentPct}
            aria-valuetext={`${inputs.downPaymentPct} percent`}
            className="w-full h-2 accent-blue-600 cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600
                       [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
                       [&::-webkit-slider-thumb]:hover:bg-blue-700 [&::-webkit-slider-thumb]:transition-colors
                       [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600
                       [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0
                       [&::-moz-range-thumb]:hover:bg-blue-700 [&::-moz-range-thumb]:transition-colors
                       [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full
                       [&::-webkit-slider-runnable-track]:bg-gray-200
                       [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full
                       [&::-moz-range-track]:bg-gray-200"
          />
        </div>

        {/* Slider Labels with Precise Positioning */}
        <div className="relative h-4 mt-1" id="down-payment-slider-desc">
          <div className="absolute w-full flex items-center">
            {/* 3% at 0% position */}
            <span className="absolute text-xs text-gray-500" style={{ left: '0%', transform: 'translateX(0%)' }}>
              3%
            </span>
            {/* 20% at ~36% position (20-3)/(50-3) = 17/47 ≈ 36% */}
            <span className="absolute text-xs text-gray-500 font-medium" style={{ left: '36.17%', transform: 'translateX(-50%)' }}>
              20%
            </span>
            {/* 50% at 100% position */}
            <span className="absolute text-xs text-gray-500" style={{ left: '100%', transform: 'translateX(-100%)' }}>
              50%
            </span>
          </div>
        </div>

        {/* Helper Text */}
        <div className="text-xs text-gray-400 mt-1">
          Type amount or drag slider. 20%+ avoids PMI.
        </div>
      </div>

      {/* Interest Rate */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Interest Rate</label>
        <div className="relative">
          <input
            type="number"
            step={0.1}
            min={0}
            max={15}
            value={inputs.interestRate}
            onChange={(e) =>
              onChange({ ...inputs, interestRate: parseFloat(e.target.value) || 0 })
            }
            className="w-full pr-8 pl-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        </div>
      </div>

      {/* Loan Term Toggle */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Loan Term</label>
        <div className="flex rounded-lg overflow-hidden border border-gray-300" role="group" aria-label="Loan term selection">
          <button
            onClick={() => onChange({ ...inputs, loanTermYears: 30 })}
            aria-pressed={inputs.loanTermYears === 30}
            className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors
              ${inputs.loanTermYears === 30
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            30 yr
          </button>
          <button
            onClick={() => onChange({ ...inputs, loanTermYears: 15 })}
            aria-pressed={inputs.loanTermYears === 15}
            className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300
              ${inputs.loanTermYears === 15
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            15 yr
          </button>
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        aria-expanded={showAdvanced}
        aria-controls="advanced-settings"
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
        <span className="ml-1">{showAdvanced ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Advanced Settings Panel */}
      {showAdvanced && (
        <div id="advanced-settings" className="space-y-3 border border-gray-200 rounded-lg p-3 bg-gray-50/50">
          {/* Property Tax Rate */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Property Tax Rate</label>
            <div className="relative">
              <input
                type="number"
                step={0.1}
                min={0}
                max={5}
                value={inputs.propertyTaxRate}
                onChange={(e) =>
                  onChange({ ...inputs, propertyTaxRate: parseFloat(e.target.value) || 0 })
                }
                className="w-full pr-8 pl-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">National avg ~1.1%. NJ ~2.5%, HI ~0.3%</div>
          </div>

          {/* Annual Insurance */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Annual Home Insurance</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                step={100}
                min={0}
                max={10000}
                value={inputs.annualInsurance}
                onChange={(e) =>
                  onChange({ ...inputs, annualInsurance: parseFloat(e.target.value) || 0 })
                }
                className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="text-xs text-gray-500 mt-0.5">National avg ~$1,500/yr</div>
          </div>

          {/* Monthly Debts */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Monthly Debts (car, student loans, etc.)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                step={50}
                min={0}
                max={20000}
                value={inputs.monthlyDebts}
                onChange={(e) =>
                  onChange({ ...inputs, monthlyDebts: parseFloat(e.target.value) || 0 })
                }
                className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* HOA */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Monthly HOA</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                step={25}
                min={0}
                max={5000}
                value={inputs.hoaMonthly}
                onChange={(e) =>
                  onChange({ ...inputs, hoaMonthly: parseFloat(e.target.value) || 0 })
                }
                className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Include Monthly Spending Toggle */}
          <div className="border-t border-gray-300 pt-3">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={inputs.includeSpending}
                onChange={(e) =>
                  onChange({ ...inputs, includeSpending: e.target.checked })
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs text-gray-700 font-medium group-hover:text-gray-900">
                Factor monthly spending into affordability assessment
              </span>
            </label>
            <div className="text-xs text-gray-500 mt-1 ml-6">
              Checks if you'll have enough cash flow after housing, debts, and living expenses.
              Does not affect lender approval (which uses traditional DTI only).
            </div>
          </div>

          {/* Monthly Spending Input */}
          {inputs.includeSpending && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Monthly Spending (groceries, utilities, gas, etc.)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step={100}
                  min={0}
                  max={20000}
                  value={inputs.monthlySpending}
                  onChange={(e) =>
                    onChange({ ...inputs, monthlySpending: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Average household: $2,000-$4,000/mo
              </div>
            </div>
          )}

          {/* DTI Ratios */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Front DTI %</label>
              <div className="relative">
                <input
                  type="number"
                  step={1}
                  min={10}
                  max={50}
                  value={inputs.frontDtiPct}
                  onChange={(e) =>
                    onChange({ ...inputs, frontDtiPct: parseInt(e.target.value) || 28 })
                  }
                  className="w-full pr-8 pl-3 py-1.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Back DTI %</label>
              <div className="relative">
                <input
                  type="number"
                  step={1}
                  min={10}
                  max={60}
                  value={inputs.backDtiPct}
                  onChange={(e) =>
                    onChange({ ...inputs, backDtiPct: parseInt(e.target.value) || 36 })
                  }
                  className="w-full pr-8 pl-3 py-1.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            Front DTI = housing only. Back DTI = housing + all debts. Standard: 28/36.
          </div>
        </div>
      )}

      {/* Calculated Results */}
      {hasIncome && maxPrice !== null && breakdown !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          {/* Max Price Mode Toggle */}
          <div className="mb-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={inputs.useManualMaxPrice}
                onChange={(e) => onChange({ ...inputs, useManualMaxPrice: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs text-gray-700 font-medium group-hover:text-gray-900">
                Set max price manually
              </span>
            </label>
          </div>

          {/* Max Price Display/Input */}
          {inputs.useManualMaxPrice ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max Home Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={manualMaxPriceInput}
                  placeholder="500,000"
                  onChange={(e) => setManualMaxPriceInput(e.target.value)}
                  onBlur={() => {
                    const parsed = parseIncomeInput(manualMaxPriceInput)
                    onChange({ ...inputs, manualMaxPrice: parsed })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const parsed = parseIncomeInput(manualMaxPriceInput)
                      onChange({ ...inputs, manualMaxPrice: parsed })
                      e.currentTarget.blur()
                    }
                  }}
                  className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Calculated: {formatCurrency(calculateMaxHomePrice(inputs))}
              </div>
            </div>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Max home price</span>
              <span className="font-semibold text-gray-900">{formatCurrency(maxPrice)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total monthly</span>
            <span className="font-semibold text-gray-900">{formatCurrency(breakdown.total)}/mo</span>
          </div>
          <div className="border-t border-blue-200 pt-1.5 space-y-0.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Principal & interest</span>
              <span>{formatCurrency(breakdown.principal)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Property tax</span>
              <span>{formatCurrency(breakdown.tax)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Insurance</span>
              <span>{formatCurrency(breakdown.insurance)}</span>
            </div>
            {breakdown.pmi > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>PMI</span>
                <span>{formatCurrency(breakdown.pmi)}</span>
              </div>
            )}
            {breakdown.hoa > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>HOA</span>
                <span>{formatCurrency(breakdown.hoa)}</span>
              </div>
            )}
            {inputs.monthlyDebts > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Other debts</span>
                <span>{formatCurrency(inputs.monthlyDebts)}</span>
              </div>
            )}
          </div>

          {/* Cash Flow Check (when spending is included) */}
          {inputs.includeSpending && inputs.monthlySpending > 0 && (() => {
            const grossMonthlyIncome = inputs.annualIncome ? inputs.annualIncome / 12 : 0
            const remainingCashFlow = grossMonthlyIncome - (breakdown?.total || 0) - inputs.monthlyDebts - inputs.monthlySpending
            const isPositive = remainingCashFlow >= 0

            return (
              <div className="border-t border-blue-200 pt-2 mt-2">
                <div className="text-xs text-gray-600 font-medium mb-1">Cash Flow Check:</div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Gross monthly income</span>
                  <span>{formatCurrency(grossMonthlyIncome)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>- Housing + debts</span>
                  <span>-{formatCurrency((breakdown?.total || 0) + inputs.monthlyDebts)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>- Monthly spending</span>
                  <span>-{formatCurrency(inputs.monthlySpending)}</span>
                </div>
                <div className={`flex justify-between text-xs font-medium border-t border-gray-200 pt-1 mt-1 ${
                  isPositive ? 'text-green-700' : 'text-red-700'
                }`}>
                  <span>Remaining for savings</span>
                  <span>{formatCurrency(remainingCashFlow)}</span>
                </div>
                {remainingCashFlow < 500 && remainingCashFlow >= 0 && (
                  <div className="text-xs text-amber-600 mt-1">
                    ⚠ Less than $500/month cushion
                  </div>
                )}
                {remainingCashFlow < 0 && (
                  <div className="text-xs text-red-600 mt-1">
                    ⚠ Negative cash flow - not sustainable
                  </div>
                )}
              </div>
            )
          })()}

          <div className="text-xs text-gray-400">
            Lender approval based on {inputs.frontDtiPct}% front-end DTI (traditional).
            {inputs.includeSpending && inputs.monthlySpending > 0 &&
              ' Affordability tiers adjusted for cash flow after living expenses.'}
          </div>
        </div>
      )}
    </div>
  )
}
