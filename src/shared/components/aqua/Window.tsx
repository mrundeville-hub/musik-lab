import type { ReactNode } from 'react'

function TrafficLights({ onClose }: { onClose?: () => void }) {
  const dot = 'size-3 rounded-full border'
  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`${dot} border-black/15 bg-tl-red transition hover:brightness-110`}
      />
      <span className={`${dot} border-black/15 bg-tl-yellow`} />
      <span className={`${dot} border-black/15 bg-tl-green`} />
    </div>
  )
}

export function Window({
  title,
  onClose,
  toolbar,
  footer,
  bodyClassName = '',
  className = '',
  children,
}: {
  title: string
  onClose?: () => void
  toolbar?: ReactNode
  footer?: ReactNode
  bodyClassName?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`win-shadow flex flex-col overflow-hidden rounded-[10px] border border-win-line font-ui text-ink2 ${className}`}
    >
      {/* titlebar */}
      <div className="metal relative flex h-9 shrink-0 items-center border-b border-black/15 px-3">
        <TrafficLights onClose={onClose} />
        <span className="pointer-events-none absolute inset-x-0 text-center text-[13px] font-semibold text-ink2/80">
          {title}
        </span>
      </div>
      {toolbar}
      <div className={`flex-1 overflow-auto bg-win-body ${bodyClassName}`}>{children}</div>
      {footer && (
        <div className="metal flex h-7 shrink-0 items-center justify-between border-t border-black/15 px-3 text-[11px] text-ink-dim">
          {footer}
        </div>
      )}
    </div>
  )
}
