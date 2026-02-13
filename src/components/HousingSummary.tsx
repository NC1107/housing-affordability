import type { HousingStats, AffordabilityInputs } from '../types'
import { getAffordabilityTier, getEffectiveMaxPrice } from '../services/mortgage'

interface HousingSummaryProps {
  stats: HousingStats | null
  loading?: boolean
  affordability?: AffordabilityInputs
  context?: 'commute' | 'state' | 'nationwide' | 'none'
  stateName?: string
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function HousingSummary({
  stats,
  loading,
  affordability,
  context = 'none',
  stateName
}: HousingSummaryProps) {
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
    ? getEffectiveMaxPrice(affordability)
    : null

  const affordableCount = hasIncome && affordability
    ? stats.entries.filter(
        (e) => getAffordabilityTier(e.medianHomeValue, affordability) === 'affordable'
      ).length
    : null

  // Determine subtitle for ZIP count card based on context
  let zipCountSubtitle: string | null = null
  if (context === 'commute') {
    zipCountSubtitle = 'in commute zone'
  } else if (context === 'state' && stateName) {
    zipCountSubtitle = `in ${stateName}`
  } else if (context === 'nationwide') {
    zipCountSubtitle = 'nationwide'
  }
  // If context is 'none', subtitle remains null (no text shown)

  const cards: Array<{ label: string; value: string; sub: string | null; highlight?: string }> = [
    { label: 'Median Home Value', value: formatCurrency(stats.medianHomeValue), sub: stats.minHomeValue !== null ? `${formatCurrency(stats.minHomeValue)} – ${formatCurrency(stats.maxHomeValue)}` : null },
    { label: 'Median Rent', value: formatCurrency(stats.medianRent), sub: stats.minRent !== null ? `${formatCurrency(stats.minRent)} – ${formatCurrency(stats.maxRent)}` : null },
    { label: 'ZIP Codes', value: stats.zipCount.toString(), sub: zipCountSubtitle },
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

  // Median land share card
  const landShares = stats.entries
    .map(e => e.landSharePct)
    .filter((v): v is number => v != null)
  if (landShares.length > 0) {
    const sortedLand = [...landShares].sort((a, b) => a - b)
    const midL = Math.floor(sortedLand.length / 2)
    const medianLand = sortedLand.length % 2
      ? sortedLand[midL]
      : (sortedLand[midL - 1] + sortedLand[midL]) / 2
    cards.push({
      label: 'Median Land Share',
      value: `${medianLand.toFixed(1)}%`,
      sub: `${landShares.length} ZIPs with data`,
      highlight: 'border-amber-200 bg-amber-50',
    })
  }

  // Median land $/acre card
  const landPerAcreValues = stats.entries
    .map(e => e.landValuePerAcre)
    .filter((v): v is number => v != null)
  if (landPerAcreValues.length > 0) {
    const sortedAcre = [...landPerAcreValues].sort((a, b) => a - b)
    const midA = Math.floor(sortedAcre.length / 2)
    const medianAcre = sortedAcre.length % 2
      ? sortedAcre[midA]
      : (sortedAcre[midA - 1] + sortedAcre[midA]) / 2
    cards.push({
      label: 'Median Land $/Acre',
      value: formatCurrency(medianAcre),
      sub: 'Median land cost per acre (rural areas typically lower)',
      highlight: 'border-amber-200 bg-amber-50',
    })
  }

  // 5-year home value appreciation card
  const appreciationValues = stats.entries
    .map(e => e.appreciation5yr)
    .filter((v): v is number => v != null)
  if (appreciationValues.length > 0) {
    const sortedApp = [...appreciationValues].sort((a, b) => a - b)
    const midApp = Math.floor(sortedApp.length / 2)
    const medianApp = sortedApp.length % 2
      ? sortedApp[midApp]
      : (sortedApp[midApp - 1] + sortedApp[midApp]) / 2
    const isPositive = medianApp >= 0
    cards.push({
      label: '5-Year Appreciation',
      value: `${isPositive ? '+' : ''}${medianApp.toFixed(1)}%`,
      sub: `Median home value change over 5 years`,
      highlight: isPositive ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
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
            className={`border rounded-lg p-3 min-w-0 ${card.highlight || 'bg-gray-50 border-gray-200'}`}
          >
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className="text-lg font-semibold text-gray-900 truncate">{card.value}</div>
            {card.sub && <div className="text-xs text-gray-500 mt-0.5 truncate">{card.sub}</div>}
          </div>
        ))}
      </div>
      {dataDate && (
        <div className="text-[10px] text-gray-400 mt-2 opacity-60">
          Data: Zillow ({new Date(dataDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}) {meta?.aeiYear && `· AEI (${meta.aeiYear})`}
        </div>
      )}
    </div>
  )
}
