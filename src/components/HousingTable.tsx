import { useState, useEffect, useRef, useMemo } from 'react'
import type { HousingDataEntry, AffordabilityInputs, AffordabilityTier } from '../types'
import { getAffordabilityTier } from '../services/mortgage'
import { formatCurrency as _formatCurrency } from '../utils/format'

interface HousingTableProps {
  entries: HousingDataEntry[]
  affordability?: AffordabilityInputs
  onZipClick?: (lat: number, lon: number, zip: string) => void
  highlightedZip?: string | null
}

const tierBgClass: Record<AffordabilityTier, string> = {
  affordable: 'bg-green-50',
  stretch: 'bg-amber-50',
  unaffordable: 'bg-red-50',
  unknown: '',
}

type SortKey = 'zip' | 'medianHomeValue' | 'medianRent' | 'landSharePct' | 'landValuePerAcre'
type SortDir = 'asc' | 'desc'

function formatCurrency(value: number | null): string {
  return _formatCurrency(value, '—')
}

export default function HousingTable({ entries, affordability, onZipClick, highlightedZip }: HousingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('medianHomeValue')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const highlightedRowRef = useRef<HTMLTableRowElement>(null)

  // Memoize data presence checks to avoid repeated .some() calls
  const hasLandData = useMemo(
    () => entries.some(e => e.landSharePct != null),
    [entries]
  )

  const hasLandPerAcre = useMemo(
    () => entries.some(e => e.landValuePerAcre != null),
    [entries]
  )

  // Memoize affordability tier map to avoid recalculating on every render
  const tierMap = useMemo(() => {
    if (!affordability) return new Map<string, AffordabilityTier>()

    const map = new Map<string, AffordabilityTier>()
    for (const entry of entries) {
      map.set(entry.zip, getAffordabilityTier(entry.medianHomeValue, affordability))
    }
    return map
  }, [entries, affordability])

  useEffect(() => {
    if (highlightedZip && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightedZip])

  if (!entries.length) return null

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Memoize sorted array to avoid sorting on every render
  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const aVal = a[sortKey] ?? null
      const bVal = b[sortKey] ?? null
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return 1
      if (bVal === null) return -1
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [entries, sortKey, sortDir])

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="overflow-auto max-h-64 border border-gray-200 rounded-lg">
      <table className="w-full text-sm min-w-[500px]" aria-label="Housing data by ZIP code">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th
              onClick={() => handleSort('zip')}
              aria-sort={sortKey === 'zip' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              scope="col"
              className="text-left px-3 py-2 text-gray-600 font-medium cursor-pointer hover:text-gray-900"
            >
              ZIP{arrow('zip')}
            </th>
            <th
              onClick={() => handleSort('medianHomeValue')}
              aria-sort={sortKey === 'medianHomeValue' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              scope="col"
              className="text-right px-3 py-2 text-gray-600 font-medium cursor-pointer hover:text-gray-900"
            >
              Home Value{arrow('medianHomeValue')}
            </th>
            <th
              onClick={() => handleSort('medianRent')}
              aria-sort={sortKey === 'medianRent' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              scope="col"
              className="text-right px-3 py-2 text-gray-600 font-medium cursor-pointer hover:text-gray-900"
            >
              Rent{arrow('medianRent')}
            </th>
            {hasLandData && (
              <th
                onClick={() => handleSort('landSharePct')}
                aria-sort={sortKey === 'landSharePct' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                scope="col"
                className="text-right px-3 py-2 text-gray-600 font-medium cursor-pointer hover:text-gray-900 hidden md:table-cell"
              >
                Land %{arrow('landSharePct')}
              </th>
            )}
            {hasLandPerAcre && (
              <th
                onClick={() => handleSort('landValuePerAcre')}
                aria-sort={sortKey === 'landValuePerAcre' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                scope="col"
                title="Median cost per acre of land (excluding improvements)"
                className="text-right px-3 py-2 text-gray-600 font-medium cursor-pointer hover:text-gray-900 hidden md:table-cell"
              >
                $/Acre{arrow('landValuePerAcre')}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((entry) => {
            const tier = tierMap.get(entry.zip) ?? 'unknown'
            const isHighlighted = entry.zip === highlightedZip

            const handleKeyDown = (e: React.KeyboardEvent) => {
              if ((e.key === 'Enter' || e.key === ' ') && onZipClick) {
                e.preventDefault()
                onZipClick(entry.lat, entry.lon, entry.zip)
              }
            }

            return (
            <tr
              key={entry.zip}
              ref={isHighlighted ? highlightedRowRef : undefined}
              tabIndex={onZipClick ? 0 : undefined}
              onKeyDown={handleKeyDown}
              className={`${tierBgClass[tier]} hover:brightness-95 ${onZipClick ? 'cursor-pointer' : ''} ${isHighlighted ? 'ring-2 ring-blue-400 ring-inset' : ''} focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none py-3 md:py-2`}
              onClick={() => onZipClick?.(entry.lat, entry.lon, entry.zip)}
            >
              <td className="px-3 py-2 font-mono text-gray-700">
                {entry.zip}
                {entry.name && (
                  <span className="text-gray-500 font-sans ml-1 text-xs">{entry.name}</span>
                )}
              </td>
              <td className="text-right px-3 py-2 text-gray-700">
                {formatCurrency(entry.medianHomeValue)}
              </td>
              <td className="text-right px-3 py-2 text-gray-700">
                {formatCurrency(entry.medianRent)}
              </td>
              {hasLandData && (
                <td className="text-right px-3 py-2 text-gray-700 hidden md:table-cell">
                  {entry.landSharePct != null ? `${entry.landSharePct.toFixed(1)}%` : '—'}
                </td>
              )}
              {hasLandPerAcre && (
                <td className="text-right px-3 py-2 text-gray-700 hidden md:table-cell">
                  {entry.landValuePerAcre != null ? formatCurrency(entry.landValuePerAcre) : '—'}
                </td>
              )}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
