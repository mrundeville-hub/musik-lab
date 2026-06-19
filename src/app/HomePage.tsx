import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { experiments } from '@/experiments/registry'
import { Window } from '@/shared/components/aqua/Window'
import { Toolbar, ToolbarButton } from '@/shared/components/aqua/Toolbar'
import { FinderRow } from '@/shared/components/aqua/FinderRow'

type Source = 'all' | 'camera' | 'canvas'

export function HomePage() {
  const [view, setView] = useState<'list' | 'icons'>('list')
  const [source, setSource] = useState<Source>('all')
  const [query, setQuery] = useState('')

  const tags = useMemo(
    () => [...new Set(experiments.flatMap((e) => e.metadata.tags))].sort(),
    [],
  )
  const cameraCount = experiments.filter((e) => e.metadata.needsWebcam).length
  const canvasCount = experiments.length - cameraCount

  const visible = experiments.filter(({ metadata: m }) => {
    if (source === 'camera' && !m.needsWebcam) return false
    if (source === 'canvas' && m.needsWebcam) return false
    if (query) {
      const q = query.toLowerCase()
      const hay = `${m.title} ${m.slug} ${m.tags.join(' ')} ${m.description}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="desktop grid min-h-dvh place-items-center p-4 sm:p-8">
      <Window
        title="musik.lab"
        className="aqua-pop h-[min(80dvh,640px)] w-[min(94vw,860px)]"
        toolbar={
          <Toolbar>
            <ToolbarButton active={view === 'icons'} onClick={() => setView('icons')} title="Icon view">
              ▦
            </ToolbarButton>
            <ToolbarButton active={view === 'list'} onClick={() => setView('list')} title="List view">
              ☰
            </ToolbarButton>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="ml-auto w-40 rounded-full border border-black/20 bg-white px-3 py-1 text-[12px] text-ink2 outline-none placeholder:text-ink-dim focus:border-aqua-blue"
            />
            <span className="text-[11px] text-ink-dim">v0.1</span>
          </Toolbar>
        }
        footer={
          <>
            <span>
              {visible.length} of {experiments.length} modules · camera ready ●
            </span>
            <span>mp4 / webm</span>
          </>
        }
      >
        <div className="flex h-full">
          {/* sidebar */}
          <nav className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-win-line bg-[#dfe4ea] p-2 text-[12px] sm:flex">
            <SidebarItem active={source === 'all'} onClick={() => setSource('all')}>
              All <span className="text-ink-dim">({experiments.length})</span>
            </SidebarItem>
            <SidebarItem active={source === 'camera'} onClick={() => setSource('camera')}>
              Camera <span className="text-ink-dim">({cameraCount})</span>
            </SidebarItem>
            <SidebarItem active={source === 'canvas'} onClick={() => setSource('canvas')}>
              Canvas <span className="text-ink-dim">({canvasCount})</span>
            </SidebarItem>
            <p className="mt-3 px-2 text-[10px] uppercase tracking-wider text-ink-dim">Tags</p>
            <div className="flex flex-wrap gap-1 px-1">
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setQuery(t)}
                  className="rounded-full border border-black/15 bg-white/70 px-2 py-0.5 text-[10px] text-ink-dim hover:border-aqua-blue"
                >
                  /{t}
                </button>
              ))}
            </div>
          </nav>

          {/* content */}
          <div className="flex-1">
            {view === 'list' ? (
              <div>
                <div className="grid grid-cols-[1.4rem_1fr_5rem_6rem] gap-2 border-b border-win-line bg-[#e9e9ec] px-3 py-1 text-[11px] uppercase tracking-wide text-ink-dim">
                  <span />
                  <span>Name</span>
                  <span>Kind</span>
                  <span>Tag</span>
                </div>
                {visible.map(({ metadata: m }, i) => (
                  <FinderRow
                    key={m.slug}
                    index={i}
                    name={m.title}
                    kind={m.needsWebcam ? 'camera' : 'canvas'}
                    tag={m.tags[0] ? `/${m.tags[0]}` : ''}
                    href={`/e/${m.slug}`}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
                {visible.map(({ metadata: m }) => (
                  <Link
                    key={m.slug}
                    to={`/e/${m.slug}`}
                    className="group flex flex-col items-center gap-2 rounded-lg p-3 text-center hover:bg-aqua-blue/10"
                  >
                    <div className="halftone grid size-16 place-items-center rounded-md border border-black/20 bg-white/70 font-ui text-2xl font-bold text-ink2/80">
                      {m.title.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[12px] font-medium text-ink2">{m.title}</span>
                    <span className="text-[10px] text-ink-dim">
                      {m.needsWebcam ? 'camera' : 'canvas'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </Window>
    </div>
  )
}

function SidebarItem({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-md px-2 py-1 text-left transition',
        active ? 'bg-aqua-blue text-white' : 'text-ink2 hover:bg-black/5',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
