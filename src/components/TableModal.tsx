import { useEffect } from 'react'
import type { HousingDataEntry, AffordabilityInputs } from '../types'
import HousingTable from './HousingTable'

interface TableModalProps {
  isOpen: boolean
  onClose: () => void
  entries: HousingDataEntry[]
  affordability?: AffordabilityInputs
  highlightedZip: string | null
  onZipClick?: (lat: number, lon: number, zip: string) => void
}

export default function TableModal({
  isOpen,
  onClose,
  entries,
  affordability,
  highlightedZip,
  onZipClick,
}: TableModalProps) {
  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Housing Data - Full View ({entries.length} ZIPs)
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close table view"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-4">
          <HousingTable
            entries={entries}
            affordability={affordability}
            onZipClick={onZipClick}
            highlightedZip={highlightedZip}
          />
        </div>
      </div>
    </div>
  )
}
