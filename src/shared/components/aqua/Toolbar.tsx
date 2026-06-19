import type { ReactNode } from 'react'

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="metal flex h-11 shrink-0 items-center gap-2 border-b border-black/15 px-3">
      {children}
    </div>
  )
}

export function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick?: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button type="button" title={title} onClick={onClick} className="lozenge" data-active={active}>
      {children}
    </button>
  )
}
