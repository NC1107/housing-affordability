import { useState } from 'react'
import type { HousingDataEntry, AffordabilityInputs, AffordabilityTier } from '../types'
import { getAffordabilityTier } from '../services/mortgage'

interface HousingTableProps {
  entries: HousingDataEntry[]
  affordability?: AffordabilityInputs
  onZipClick?: (lat: number, lon: number, zip: string) => void
}

const tierBgClass: Record<AffordabilityTier, string> = {
  affordable: 'bg-green-50',
  stretch: 'bg-amber-50',
  unaffordable: 'bg-red-50',
  unknown: '',
}

type SortKey = 'zip' | 'medianHomeValue' | 'medianRent'
type SortDir = 'asc' | 'desc'

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function HousingTable({ entries, affordability, onZipClick }: HousingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('medianHomeValue')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  if (!entries.length) return null

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...entries].sort((a, b) => {
    const aVal = a[sortKey]
    const bVal = b[sortKey]
    if (aVal === null && bVal === null) return 0
    if (aVal === null) return 1
    if (bVal === null) return -1
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="overflow-auto max-h-64 border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th
              onClick={() => handleSort('zip')}
              className="text-left px-3 py-2 text-gray-600 font-medium cursor-pointer hover:text-gray-900"
            >
              ZIP{arrow('zip')}
            </th>
            <th
              onClick={() => handleSort('medianHomeValue')}
              className="text-right px-3 py-2 text-gray-600 font-medium cursor-pointer hover:text-gray-900"
            >
              Home Value{arrow('medianHomeValue')}
            </th>
            <th
              onClick={() => handleSort('medianRent')}
              className="text-right px-3 py-2 text-gray-600 font-medium cursor-pointer hover:text-gray-900"
            >
              Rent{arrow('medianRent')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((entry) => {
            const tier = affordability
              ? getAffordabilityTier(entry.medianHomeValue, affordability)
              : 'unknown'
            return (
            <tr
              key={entry.zip}
              className={`${tierBgClass[tier]} hover:brightness-95 ${onZipClick ? 'cursor-pointer' : ''}`}
              onClick={() => onZipClick?.(entry.lat, entry.lon, entry.zip)}
            >
              <td className="px-3 py-2 font-mono text-gray-700">
                {entry.zip}
                {entry.name && (
                  <span className="text-gray-400 font-sans ml-1 text-xs">{entry.name}</span>
                )}
              </td>
              <td className="text-right px-3 py-2 text-gray-700">
                {formatCurrency(entry.medianHomeValue)}
              </td>
              <td className="text-right px-3 py-2 text-gray-700">
                {formatCurrency(entry.medianRent)}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
