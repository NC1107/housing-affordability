import type { HousingStats, AffordabilityInputs } from '../types'
import { calculateMaxHomePrice, getAffordabilityTier } from '../services/mortgage'

interface HousingSummaryProps {
  stats: HousingStats | null
  loading?: boolean
  affordability?: AffordabilityInputs
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function HousingSummary({ stats, loading, affordability }: HousingSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-100 rounded-lg p-3 animate-pulse h-20" />
        ))}
      </div>
    )
  }

  if (!stats) return null

  const hasIncome = affordability?.annualIncome != null && affordability.annualIncome > 0

  const maxPrice = hasIncome && affordability
    ? calculateMaxHomePrice(affordability)
    : null

  const affordableCount = hasIncome && affordability
    ? stats.entries.filter(
        (e) => getAffordabilityTier(e.medianHomeValue, affordability) === 'affordable'
      ).length
    : null

  const cards: Array<{ label: string; value: string; sub: string | null; highlight?: string }> = [
    { label: 'Median Home Value', value: formatCurrency(stats.medianHomeValue), sub: stats.minHomeValue !== null ? `${formatCurrency(stats.minHomeValue)} – ${formatCurrency(stats.maxHomeValue)}` : null },
    { label: 'Median Rent', value: formatCurrency(stats.medianRent), sub: stats.minRent !== null ? `${formatCurrency(stats.minRent)} – ${formatCurrency(stats.maxRent)}` : null },
    { label: 'ZIP Codes', value: stats.zipCount.toString(), sub: 'in commute zone' },
    { label: 'Data Coverage', value: `${stats.entries.filter(e => e.medianHomeValue !== null).length}/${stats.zipCount}`, sub: 'ZIPs with data' },
  ]

  if (maxPrice !== null) {
    cards.push({
      label: 'Max Home Price',
      value: formatCurrency(maxPrice),
      sub: `based on ${affordability!.frontDtiPct}% DTI`,
      highlight: 'border-blue-300 bg-blue-50',
    })
  }

  if (affordableCount !== null) {
    const withData = stats.entries.filter((e) => e.medianHomeValue !== null).length
    cards.push({
      label: 'Affordable ZIPs',
      value: `${affordableCount}/${withData}`,
      sub: 'within budget',
      highlight: affordableCount > 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50',
    })
  }

  const meta = stats.meta
  const dataDate = meta?.zhviDate ?? meta?.zoriDate

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`border rounded-lg p-3 ${card.highlight || 'bg-gray-50 border-gray-200'}`}
          >
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className="text-lg font-semibold text-gray-900">{card.value}</div>
            {card.sub && <div className="text-xs text-gray-400 mt-0.5">{card.sub}</div>}
          </div>
        ))}
      </div>
      {dataDate && (
        <div className="text-xs text-gray-400 mt-2">
          Source: Zillow ZHVI/ZORI, {new Date(dataDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          {meta?.fetchedAt && <> &middot; fetched {meta.fetchedAt}</>}
        </div>
      )}
    </div>
  )
}
