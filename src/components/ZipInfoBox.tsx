import { useEffect, useRef } from 'react'
import type { HousingDataEntry, AffordabilityInputs, AffordabilityTier } from '../types'
import { getAffordabilityTier } from '../services/mortgage'

interface ZipInfoBoxProps {
  entry: HousingDataEntry | null
  affordability?: AffordabilityInputs
  onClose: () => void
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatCurrency(value: number | null): string {
  if (value === null) return 'N/A'
  return currencyFormatter.format(value)
}

export default function ZipInfoBox({ entry, affordability, onClose }: ZipInfoBoxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Auto-focus close button when box opens
  useEffect(() => {
    if (entry && closeButtonRef.current) {
      closeButtonRef.current.focus()
    }
  }, [entry])

  // Handle Escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (entry) {
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [entry, onClose])

  // Click outside to close
  useEffect(() => {
    if (!entry) return

    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    // Delay to avoid immediate close from the click that opened it
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [entry, onClose])

  if (!entry) return null

  const tier = affordability
    ? getAffordabilityTier(entry.medianHomeValue, affordability)
    : 'unknown'

  const tierConfig: Record<AffordabilityTier, { bg: string; border: string; text: string; label: string }> = {
    affordable: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', label: 'Affordable' },
    stretch: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', label: 'Stretch' },
    unaffordable: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', label: 'Unaffordable' },
    unknown: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', label: 'Unknown' },
  }

  const config = tierConfig[tier]

  return (
    <div
      ref={boxRef}
      className={`
        absolute z-[1001] w-80 max-w-[calc(100vw-2rem)]
        top-4 left-4 md:top-4 md:left-4
        ${config.bg} ${config.border} border-2 rounded-lg shadow-2xl p-4
        animate-in slide-in-from-top-4 duration-300
      `}
      role="dialog"
      aria-labelledby="zip-info-title"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 id="zip-info-title" className="text-lg font-bold text-gray-900">
            {entry.zip}
          </h3>
          {(entry.name || entry.state) && (
            <div className="text-sm text-gray-600">
              {entry.name || entry.state}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 -mt-1 -mr-1">
          {/* Google Maps Link */}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${entry.lat},${entry.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded-full hover:bg-blue-100 transition-colors"
            aria-label="Open in Google Maps"
            title="Open in Google Maps"
          >
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </a>
          {/* Close Button */}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
            aria-label="Close ZIP info"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Affordability Badge */}
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${config.bg} ${config.border} border mb-3`}>
        <span className={`text-xs font-semibold ${config.text}`}>{config.label}</span>
      </div>

      {/* Data Grid */}
      <div className="space-y-2">
        <DataRow label="Median Home Value" value={formatCurrency(entry.medianHomeValue)} />
        <DataRow label="Median Rent" value={formatCurrency(entry.medianRent)} suffix="/mo" />

        {entry.landSharePct != null && (
          <DataRow label="Land Share" value={`${entry.landSharePct.toFixed(1)}%`} />
        )}

        {entry.landValuePerAcre != null && (
          <DataRow
            label="Land Value per Acre"
            value={formatCurrency(entry.landValuePerAcre)}
            tooltip="Median cost per acre of land in this ZIP code"
          />
        )}

        {/* FMR (Fair Market Rent) Data */}
        {entry.fmr && (entry.fmr.br0 || entry.fmr.br1 || entry.fmr.br2 || entry.fmr.br3 || entry.fmr.br4) && (
          <>
            <div className="border-t border-gray-200 mt-2 pt-2">
              <div className="text-xs font-medium text-gray-600 mb-1">Fair Market Rent</div>
            </div>

            {entry.fmr.br0 && <DataRow label="Studio" value={formatCurrency(entry.fmr.br0)} suffix="/mo" />}
            {entry.fmr.br1 && <DataRow label="1 Bedroom" value={formatCurrency(entry.fmr.br1)} suffix="/mo" />}
            {entry.fmr.br2 && <DataRow label="2 Bedroom" value={formatCurrency(entry.fmr.br2)} suffix="/mo" />}
            {entry.fmr.br3 && <DataRow label="3 Bedroom" value={formatCurrency(entry.fmr.br3)} suffix="/mo" />}
            {entry.fmr.br4 && <DataRow label="4 Bedroom" value={formatCurrency(entry.fmr.br4)} suffix="/mo" />}
          </>
        )}
      </div>

      {/* Additional Info */}
      {tier !== 'unknown' && affordability && affordability.annualIncome && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-600">
            Based on ${affordability.annualIncome.toLocaleString()} annual income
          </div>
        </div>
      )}
    </div>
  )
}

interface DataRowProps {
  label: string
  value: string
  suffix?: string
  tooltip?: string
}

function DataRow({ label, value, suffix, tooltip }: DataRowProps) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-sm text-gray-600" title={tooltip}>
        {label}
        {tooltip && <span className="text-gray-400 text-xs ml-1">ⓘ</span>}
      </span>
      <span className="text-sm font-semibold text-gray-900">
        {value}
        {suffix && <span className="font-normal text-gray-500">{suffix}</span>}
      </span>
    </div>
  )
}
