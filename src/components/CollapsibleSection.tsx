import { useState, useId, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: string
  defaultExpanded?: boolean
  children: ReactNode
  badge?: string | number
  summary?: ReactNode
}

export default function CollapsibleSection({
  title,
  defaultExpanded = true,
  children,
  badge,
  summary,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const panelId = useId()

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`Toggle ${title} section`}
        className="w-full flex items-center justify-between text-sm font-semibold
                   text-gray-700 hover:text-gray-900 py-2 md:py-1 group"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge !== undefined && (
            <span className="text-xs font-normal text-gray-600
                           bg-gray-100 px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </span>
        <span
          className="text-gray-400 group-hover:text-gray-600
                    transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          &#9662;
        </span>
      </button>
      {!expanded && summary && (
        <div className="text-xs text-gray-500 mt-1">{summary}</div>
      )}
      <div
        id={panelId}
        aria-hidden={!expanded}
        className={`overflow-hidden transition-all duration-200 ease-in-out
                    ${expanded ? 'max-h-[2000px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'}`}
      >
        {children}
      </div>
    </div>
  )
}
