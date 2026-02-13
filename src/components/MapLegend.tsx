interface MapLegendProps {
  mode: 'choropleth' | 'zip' | 'hidden'
}

export default function MapLegend({ mode }: MapLegendProps) {
  if (mode === 'hidden') return null

  return (
    <div
      className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm border border-gray-300 rounded-lg shadow-lg p-3 z-[1000]"
      role="region"
      aria-label="Map legend"
    >
      {mode === 'choropleth' ? (
        <ChoroplethLegend />
      ) : (
        <ZipLegend />
      )}
    </div>
  )
}

function ChoroplethLegend() {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-900">Affordability by State</div>
      <div className="space-y-1">
        <LegendItem color="#15803d" label="80-100% affordable" />
        <LegendItem color="#22c55e" label="60-79% affordable" />
        <LegendItem color="#86efac" label="40-59% affordable" />
        <LegendItem color="#fbbf24" label="20-39% affordable" />
        <LegendItem color="#f97316" label="10-19% affordable" />
        <LegendItem color="#dc2626" label="0-9% affordable" />
      </div>
      <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
        Click a state to see ZIP codes
      </div>
    </div>
  )
}

function ZipLegend() {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-900">ZIP Code Affordability</div>
      <div className="space-y-1">
        <LegendItem color="#22c55e" label="Affordable" sublabel="≤28% housing DTI" />
        <LegendItem color="#fbbf24" label="Stretch" sublabel="28-36% total DTI" />
        <LegendItem color="#ef4444" label="Unaffordable" sublabel=">36% total DTI" />
        <LegendItem color="#f3f4f6" label="No data" border="dashed" />
      </div>
      <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
        Based on your income inputs
      </div>
    </div>
  )
}

interface LegendItemProps {
  color: string
  label: string
  sublabel?: string
  border?: 'solid' | 'dashed'
}

function LegendItem({ color, label, sublabel, border = 'solid' }: LegendItemProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={`w-4 h-4 rounded flex-shrink-0 ${border === 'dashed' ? 'border-2 border-dashed border-gray-400' : ''}`}
        style={{ backgroundColor: border === 'solid' ? color : undefined }}
        aria-hidden="true"
      />
      <div>
        <div className="text-gray-700 font-medium">{label}</div>
        {sublabel && <div className="text-gray-500 text-[10px]">{sublabel}</div>}
      </div>
    </div>
  )
}
