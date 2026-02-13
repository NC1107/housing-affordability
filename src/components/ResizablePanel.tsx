import { useState, useRef, useEffect, type ReactNode } from 'react'

interface ResizablePanelProps {
  children: ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  storageKey?: string
}

export default function ResizablePanel({
  children,
  defaultWidth = 360,
  minWidth = 280,
  maxWidth = 600,
  storageKey = 'sidebar-width',
}: ResizablePanelProps) {
  // Load initial width from localStorage
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return defaultWidth
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (parsed >= minWidth && parsed <= maxWidth) return parsed
    }
    return defaultWidth
  })

  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const rafRef = useRef<number>()

  function handleMouseDown(e: React.MouseEvent) {
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
    e.preventDefault()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      setWidth((w) => Math.max(minWidth, w - 10))
      e.preventDefault()
    } else if (e.key === 'ArrowRight') {
      setWidth((w) => Math.min(maxWidth, w + 10))
      e.preventDefault()
    }
  }

  useEffect(() => {
    if (!isResizing) return

    function handleMouseMove(e: MouseEvent) {
      if (rafRef.current) return // Skip if frame pending

      rafRef.current = requestAnimationFrame(() => {
        const delta = e.clientX - startXRef.current
        const newWidth = startWidthRef.current + delta
        const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
        setWidth(clampedWidth)
        rafRef.current = undefined
      })
    }

    function handleMouseUp() {
      setIsResizing(false)
    }

    // Set cursor globally during resize
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, minWidth, maxWidth])

  // Persist width to localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, width.toString())
  }, [width, storageKey])

  return (
    <>
      {/* Sidebar */}
      <div
        style={{ width: `${width}px` }}
        className="flex flex-col border-r border-gray-200 bg-gray-50/50 overflow-y-auto relative flex-shrink-0"
      >
        {children}
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-label="Resize sidebar"
        className={`
          relative w-1 hover:w-1.5 cursor-col-resize transition-all group
          ${isResizing ? 'w-1.5 bg-blue-500' : 'bg-gray-200 hover:bg-blue-400'}
        `}
      >
        {/* Optional: Grip dots */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
          <div className="w-1 h-1 rounded-full bg-gray-400" />
          <div className="w-1 h-1 rounded-full bg-gray-400" />
          <div className="w-1 h-1 rounded-full bg-gray-400" />
        </div>
      </div>
    </>
  )
}
