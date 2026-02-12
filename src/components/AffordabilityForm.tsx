import { useState } from 'react'
import type { AffordabilityInputs } from '../types'
import { calculateMaxHomePrice, calculateFullMonthlyPayment } from '../services/mortgage'

interface AffordabilityFormProps {
  inputs: AffordabilityInputs
  onChange: (inputs: AffordabilityInputs) => void
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

export default function AffordabilityForm({ inputs, onChange }: AffordabilityFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const hasIncome = inputs.annualIncome !== null && inputs.annualIncome > 0

  const maxPrice = hasIncome ? calculateMaxHomePrice(inputs) : null

  const breakdown = maxPrice !== null
    ? calculateFullMonthlyPayment(maxPrice, inputs)
    : null

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">Affordability</h2>

      {/* Annual Income */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Annual Income</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={formatIncomeDisplay(inputs.annualIncome)}
            onChange={(e) =>
              onChange({ ...inputs, annualIncome: parseIncomeInput(e.target.value) })
            }
            placeholder="100,000"
            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Down Payment % */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Down Payment: <span className="font-semibold text-gray-700">{inputs.downPaymentPct}%</span>
        </label>
        <input
          type="range"
          min={3}
          max={50}
          step={1}
          value={inputs.downPaymentPct}
          onChange={(e) =>
            onChange({ ...inputs, downPaymentPct: parseInt(e.target.value) })
          }
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>3%</span>
          <span>20%</span>
          <span>50%</span>
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
        <div className="flex rounded-lg overflow-hidden border border-gray-300">
          <button
            onClick={() => onChange({ ...inputs, loanTermYears: 30 })}
            className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors
              ${inputs.loanTermYears === 30
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            30 yr
          </button>
          <button
            onClick={() => onChange({ ...inputs, loanTermYears: 15 })}
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
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
        <span className="ml-1">{showAdvanced ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Advanced Settings Panel */}
      {showAdvanced && (
        <div className="space-y-3 border border-gray-200 rounded-lg p-3 bg-gray-50/50">
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
            <div className="text-xs text-gray-400 mt-0.5">National avg ~1.1%. NJ ~2.5%, HI ~0.3%</div>
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
            <div className="text-xs text-gray-400 mt-0.5">National avg ~$1,500/yr</div>
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
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Max home price</span>
            <span className="font-semibold text-gray-900">{formatCurrency(maxPrice)}</span>
          </div>
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
              <div className="flex justify-between text-xs text-amber-600">
                <span>Other debts (reduces budget)</span>
                <span>-{formatCurrency(inputs.monthlyDebts)}</span>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-400">Based on {inputs.frontDtiPct}% front-end DTI</div>
        </div>
      )}
    </div>
  )
}
