import type { TravelMode } from '../types'

interface ControlsProps {
  mode: TravelMode
  onModeChange: (mode: TravelMode) => void
  minutes: number
  onMinutesChange: (minutes: number) => void
  disabled?: boolean
}

export default function Controls({
  mode,
  onModeChange,
  minutes,
  onMinutesChange,
  disabled,
}: ControlsProps) {
  return (
    <div className="space-y-4">
      {/* Travel mode toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Travel Mode
        </label>
        <div className="flex rounded-lg overflow-hidden border border-gray-300" role="group" aria-label="Travel mode selection">
          <button
            onClick={() => onModeChange('drive')}
            disabled={disabled}
            aria-pressed={mode === 'drive'}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors
              ${mode === 'drive'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Driving
          </button>
          <button
            onClick={() => onModeChange('transit')}
            disabled={disabled}
            aria-pressed={mode === 'transit'}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300
              ${mode === 'transit'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Public Transit
          </button>
        </div>
      </div>

      {/* Time slider */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Travel Time: <span className="font-semibold text-blue-600">{minutes} min</span>
        </label>
        <input
          type="range"
          min={5}
          max={60}
          step={5}
          value={minutes}
          onChange={(e) => onMinutesChange(parseInt(e.target.value))}
          disabled={disabled}
          aria-valuemin={5}
          aria-valuemax={60}
          aria-valuenow={minutes}
          aria-valuetext={`${minutes} minutes`}
          className="w-full accent-blue-600 disabled:opacity-50"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>5 min</span>
          <span>30 min</span>
          <span>60 min</span>
        </div>
      </div>
    </div>
  )
}
