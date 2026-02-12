import { useState } from 'react'

interface SearchBarProps {
  onSearch: (address: string) => void
  disabled?: boolean
  incomeMode?: boolean
  onIncomeSearch?: () => void
}

export default function SearchBar({ onSearch, disabled, incomeMode, onIncomeSearch }: SearchBarProps) {
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

  const buttonDisabled = disabled || (!hasAddress && !isIncomeMode)

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Work Address
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={incomeMode ? 'Enter work address (optional)' : 'Enter work address...'}
          disabled={disabled}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />
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
