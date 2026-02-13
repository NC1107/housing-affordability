import { useState } from 'react'

interface SearchBarProps {
  onSearch: (address: string) => void
  onClear?: () => void
  disabled?: boolean
  incomeMode?: boolean
  onIncomeSearch?: () => void
}

export default function SearchBar({ onSearch, onClear, disabled, incomeMode, onIncomeSearch }: SearchBarProps) {
  const [value, setValue] = useState('')

  const hasAddress = value.trim().length > 0
  const isIncomeMode = incomeMode && !hasAddress

  function handleSubmit() {
    if (hasAddress) {
      onSearch(value.trim())
    } else if (isIncomeMode && onIncomeSearch) {
      onIncomeSearch()
    }
  }

  function handleClear() {
    setValue('')
    onClear?.()
  }

  const buttonDisabled = disabled || (!hasAddress && !isIncomeMode)

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Work Address
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={incomeMode ? 'Enter work address (optional)' : 'Enter work address...'}
            disabled={disabled}
            className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {value && !disabled && (
            <button
              onClick={handleClear}
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2
                         text-gray-400 hover:text-gray-600
                         p-1.5 md:p-0.5 rounded-full hover:bg-gray-100
                         transition-colors"
              aria-label="Clear address"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0
                         00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10
                         11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1
                         1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={buttonDisabled}
          className={`px-4 py-2 text-white text-sm font-medium rounded-lg
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors whitespace-nowrap
                     ${isIncomeMode
                       ? 'bg-green-600 hover:bg-green-700 active:bg-green-800'
                       : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}
        >
          {isIncomeMode ? 'Search by Income' : 'Search'}
        </button>
      </div>
    </div>
  )
}
