import { useState } from 'react'

interface POIFilterProps {
  // Will be used later when we implement actual POI functionality
}

interface POIType {
  id: string
  label: string
  icon: string
  enabled: boolean
}

export default function POIFilter({}: POIFilterProps) {
  const [pois, setPois] = useState<POIType[]>([
    { id: 'parks', label: 'Parks', icon: '🌳', enabled: false },
    { id: 'libraries', label: 'Libraries', icon: '📚', enabled: false },
    { id: 'schools', label: 'Schools', icon: '🏫', enabled: false },
    { id: 'hospitals', label: 'Hospitals', icon: '🏥', enabled: false },
    { id: 'grocery', label: 'Grocery Stores', icon: '🛒', enabled: false },
    { id: 'transit', label: 'Transit Stops', icon: '🚇', enabled: false },
    { id: 'restaurants', label: 'Restaurants', icon: '🍽️', enabled: false },
    { id: 'gyms', label: 'Gyms', icon: '💪', enabled: false },
  ])

  const handleToggle = (id: string) => {
    setPois(pois.map(poi =>
      poi.id === id ? { ...poi, enabled: !poi.enabled } : poi
    ))
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 mb-2">
        Select points of interest to display on the map (coming soon)
      </div>

      <div className="grid grid-cols-2 gap-2">
        {pois.map(poi => (
          <label
            key={poi.id}
            className={`
              flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors
              ${poi.enabled
                ? 'bg-blue-50 border-blue-300'
                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              }
            `}
          >
            <input
              type="checkbox"
              checked={poi.enabled}
              onChange={() => handleToggle(poi.id)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-base">{poi.icon}</span>
            <span className="text-xs font-medium text-gray-700">{poi.label}</span>
          </label>
        ))}
      </div>

      {pois.some(p => p.enabled) && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-xs text-amber-700">
            ℹ️ POI display is coming soon. Selected filters are saved for future use.
          </div>
        </div>
      )}
    </div>
  )
}
