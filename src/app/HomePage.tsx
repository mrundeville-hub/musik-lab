import { useState } from 'react'
import { Link } from 'react-router-dom'

import { experiments } from '@/experiments/registry'
import { CARD_LOOK } from '@/experiments/cardLooks'
import { Window } from '@/shared/components/aqua/Window'
import { Toolbar, ToolbarButton } from '@/shared/components/aqua/Toolbar'
import { FinderRow } from '@/shared/components/aqua/FinderRow'
import { Logo } from '@/shared/components/Logo'

type Source = 'all' | 'camera' | 'canvas'

export function HomePage() {
  const [view, setView] = useState<'list' | 'icons'>('icons')
  const [source, setSource] = useState<Source>('all')
  const [query, setQuery] = useState('')

  const cameraCount = experiments.filter((e) => e.metadata.needsWebcam).length
  const canvasCount = experiments.length - cameraCount

  const visible = experiments.filter(({ metadata: m }) => {
    if (source === 'camera' && !m.needsWebcam) return false
    if (source === 'canvas' && m.needsWebcam) return false
    if (query) {
      const q = query.toLowerCase()
      const hay = `${m.title} ${m.slug} ${m.tags.join(' ')} ${m.description} ${m.blurb ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="desktop grid min-h-dvh place-items-center p-4 sm:p-6">
      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <Logo size={18} />
            musik.lab
          </span>
        }
        className="aqua-pop flex h-[min(86dvh,760px)] min-h-[520px] w-[min(96vw,1040px)]"
        toolbar={
          <Toolbar>
            <Logo size={28} />
            <div className="leading-tight">
              <div className="font-serif text-[17px] text-ink2">musik.lab</div>
              <div className="text-[10px] text-ink-dim">webcam experiments · local</div>
            </div>
            <ToolbarButton active={view === 'icons'} onClick={() => setView('icons')} title="Cards">
              ▦
            </ToolbarButton>
            <ToolbarButton active={view === 'list'} onClick={() => setView('list')} title="List">
              ☰
            </ToolbarButton>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="ml-auto w-40 rounded-full border border-black/20 bg-white px-3 py-1 text-[12px] text-ink2 outline-none placeholder:text-ink-dim focus:border-aqua-blue"
            />
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
        <div className="flex h-full min-h-0">
            <nav className="hidden w-36 shrink-0 flex-col gap-0.5 border-r border-win-line bg-[#dfe4ea] p-2 text-[12px] sm:flex">
              <SidebarItem active={source === 'all'} onClick={() => setSource('all')}>
                All <span className="text-ink-dim">({experiments.length})</span>
              </SidebarItem>
              <SidebarItem active={source === 'camera'} onClick={() => setSource('camera')}>
                Camera <span className="text-ink-dim">({cameraCount})</span>
              </SidebarItem>
              <SidebarItem active={source === 'canvas'} onClick={() => setSource('canvas')}>
                Canvas <span className="text-ink-dim">({canvasCount})</span>
              </SidebarItem>
            </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            {view === 'list' ? (
              <div>
                <div className="grid grid-cols-[1.8rem_1fr_5rem_6rem] gap-2 border-b border-win-line bg-[#e9e9ec] px-3 py-1 text-[11px] uppercase tracking-wide text-ink-dim">
                  <span />
                  <span>Name</span>
                  <span>Kind</span>
                  <span>Tag</span>
                </div>
                {visible.map(({ metadata: m }, i) => (
                  <FinderRow
                    key={m.slug}
                    index={i}
                    emoji={m.emoji}
                    name={m.title}
                    kind={m.needsWebcam ? 'camera' : 'canvas'}
                    tag={m.tags[0] ? `/${m.tags[0]}` : ''}
                    href={`/e/${m.slug}`}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-2">
                {visible.map(({ metadata: m }) => {
                  const look = CARD_LOOK[m.slug] ?? { from: '#eee', to: '#ccc' }
                  return (
                    <Link
                      key={m.slug}
                      to={`/e/${m.slug}`}
                      className="group flex items-stretch overflow-hidden rounded-[10px] border border-black/12 bg-white shadow-[0_1px_0_rgba(255,255,255,0.85)_inset] transition hover:-translate-y-0.5 hover:border-aqua-blue/50 hover:shadow-[0_8px_18px_rgba(40,50,80,0.1)]"
                    >
                      <div
                        className="grid w-[4.5rem] shrink-0 place-items-center text-[32px] leading-none"
                        style={{
                          background: `linear-gradient(160deg, ${look.from}, ${look.to})`,
                          color: look.ink ?? '#1a1a1a',
                        }}
                      >
                        <span aria-hidden>{m.emoji ?? '✦'}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2.5">
                        <div className="truncate text-[13px] font-semibold text-ink2">{m.title}</div>
                        <p className="text-[12px] leading-snug text-ink-dim">{m.blurb ?? m.description}</p>
                      </div>
                    </Link>
                  )
                })}
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
