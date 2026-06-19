# Aqua / Brushed-Metal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin musik.lab into a classic Mac OS X (Aqua / brushed-metal) interface — a centered Finder-style launcher window listing experiments, opening into an Aqua-framed experiment view — without touching `src/experiments/*` or any hook/recorder/audio logic.

**Architecture:** Add an Aqua design-token layer + helper CSS in `src/index.css` (Tailwind v4 `@theme`). Build three reusable chrome primitives (`Window`, `Toolbar`, `FinderRow`) under `src/shared/components/aqua/`. Rewrite `HomePage` (launcher) and `ExperimentShell` (experiment window) on top of them, and reskin `WebcamGate` + `FpsMeter`. Experiments, hooks, registry, and routing are unchanged.

**Tech Stack:** React 19, react-router-dom, Tailwind CSS v4 (`@tailwindcss/vite`, CSS-based `@theme` — there is no `tailwind.config`), Vite, TypeScript.

## Testing note (deviation from TDD)

This repo has **no unit-test framework** (no vitest/jest in `package.json`). This work is a pure visual reskin with no new logic. Per-task verification is therefore:
- `npm run build` (runs `tsc -b && vite build`) → must pass with no type errors.
- `npm run lint` (runs `eslint .`) → must pass clean.

A final task does manual browser verification via `npm run dev`. No fake unit tests are written for CSS/markup.

## Global Constraints

- Tailwind v4: design tokens are declared as CSS custom properties inside the `@theme { }` block in `src/index.css`; a `--color-x: #hex` token becomes the utility `bg-x` / `text-x` / `border-x`. There is no JS config file.
- Do **not** edit anything under `src/experiments/`, `src/shared/hooks/`, `src/shared/lib/`, `src/experiments/registry.ts`, or `src/main.tsx`.
- Keep all existing `--color-lab-*` and `--font-*` tokens in place (experiments and the dark canvas reference them). Aqua tokens are **added alongside**, not replacing them.
- Recording/audio/fps behavior must remain functionally identical — only the surrounding markup/classes change.
- Path alias `@/` → `src/`.
- Aqua palette (verbatim): desktop gradient `#cfcdc8 → #b6b3ad`; metal toolbar `#d8d8d8 → #b8b8b8`; window body `#ececec`; rows `#ffffff` / alt `#f3f3f6`; selection blue `#3b7dff`; traffic lights `#ff5f57 / #febc2e / #28c840`; ink `#2a2a2a`; dim ink `#7a7a7a`.
- UI font stack (verbatim): `-apple-system, "Lucida Grande", "Helvetica Neue", Helvetica, Arial, sans-serif`.

---

### Task 1: Aqua design tokens + helper CSS

**Files:**
- Modify: `src/index.css` (add tokens to `@theme`, add helper classes at end)

**Interfaces:**
- Produces (Tailwind utilities + classes consumed by all later tasks):
  - Color utilities: `aqua-blue`, `metal-top`, `metal-bot`, `win-body`, `row`, `row-alt`, `win-line`, `ink2`, `ink-dim`, `tl-red`, `tl-yellow`, `tl-green`.
  - Font: `font-ui`.
  - Classes: `.desktop` (full-bleed desktop background), `.metal` (brushed-metal gradient+texture), `.lozenge` (Aqua toolbar button), `.win-shadow` (soft window drop shadow), `.halftone` (dither overlay), `.aqua-pop` (scale/fade-in mount animation).

- [ ] **Step 1: Add Aqua tokens to the `@theme` block**

In `src/index.css`, inside the existing `@theme { ... }` block (after the `--color-lab-screen` line, before `--font-serif`), add:

```css
  /* --- aqua redesign tokens --- */
  --color-aqua-blue: #3b7dff;
  --color-metal-top: #d8d8d8;
  --color-metal-bot: #b8b8b8;
  --color-win-body: #ececec;
  --color-row: #ffffff;
  --color-row-alt: #f3f3f6;
  --color-win-line: #c4c2bd;
  --color-ink2: #2a2a2a;
  --color-ink-dim: #7a7a7a;
  --color-tl-red: #ff5f57;
  --color-tl-yellow: #febc2e;
  --color-tl-green: #28c840;
  --font-ui: -apple-system, 'Lucida Grande', 'Helvetica Neue', Helvetica, Arial, sans-serif;
```

- [ ] **Step 2: Add Aqua helper classes at the end of `src/index.css`**

Append to the end of `src/index.css`:

```css
/* --- aqua redesign helpers --------------------------------------------- */

.desktop {
  background:
    radial-gradient(120% 120% at 50% 0%, #d4d2cc 0%, #b6b3ad 100%);
}

.metal {
  background:
    repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.5) 0 1px, transparent 1px 2px),
    linear-gradient(to bottom, var(--color-metal-top), var(--color-metal-bot));
  background-blend-mode: soft-light, normal;
}

.win-shadow {
  box-shadow:
    0 22px 70px -20px rgba(0, 0, 0, 0.55),
    0 2px 0 rgba(255, 255, 255, 0.6) inset;
}

.lozenge {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  border: 1px solid #9a988f;
  border-radius: 7px;
  padding: 0.28rem 0.7rem;
  font-size: 11px;
  color: var(--color-ink2);
  background: linear-gradient(to bottom, #fdfdfd, #d9d7d1);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset;
  transition:
    filter 0.12s ease,
    transform 0.06s ease;
}
.lozenge:hover {
  filter: brightness(1.04);
}
.lozenge:active {
  transform: translateY(1px);
}
.lozenge[data-active='true'] {
  background: linear-gradient(to bottom, #4f8bff, #2f6df0);
  border-color: #2a5fd0;
  color: #fff;
}

.halftone {
  background-image: radial-gradient(rgba(0, 0, 0, 0.55) 38%, transparent 39%);
  background-size: 4px 4px;
}

@keyframes aqua-pop {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.aqua-pop {
  animation: aqua-pop 0.32s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .aqua-pop {
    animation: none;
  }
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: PASS (no type errors; bundles emitted). New CSS classes/tokens don't break compilation.

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(redesign): add Aqua design tokens and helper CSS"
```

---

### Task 2: Aqua chrome primitives — Window, Toolbar, TrafficLights, FinderRow

**Files:**
- Create: `src/shared/components/aqua/Window.tsx`
- Create: `src/shared/components/aqua/Toolbar.tsx`
- Create: `src/shared/components/aqua/FinderRow.tsx`

**Interfaces:**
- Consumes: Aqua utilities/classes from Task 1.
- Produces (consumed by Tasks 3–5):
  - `Window(props: { title: string; onClose?: () => void; toolbar?: ReactNode; footer?: ReactNode; bodyClassName?: string; className?: string; children: ReactNode })`
  - `Toolbar(props: { children: ReactNode })` and `ToolbarButton(props: { active?: boolean; onClick?: () => void; title?: string; children: ReactNode })`
  - `FinderRow(props: { index: number; selected?: boolean; onClick?: () => void; name: string; kind: string; tag: string; href?: string })`

- [ ] **Step 1: Create `Window.tsx`**

```tsx
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
      <div className="metal relative flex h-9 shrink-0 items-center px-3 border-b border-black/15">
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
```

- [ ] **Step 2: Create `Toolbar.tsx`**

```tsx
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
```

- [ ] **Step 3: Create `FinderRow.tsx`**

```tsx
import { Link } from 'react-router-dom'

export function FinderRow({
  index,
  selected,
  onClick,
  name,
  kind,
  tag,
  href,
}: {
  index: number
  selected?: boolean
  onClick?: () => void
  name: string
  kind: string
  tag: string
  href?: string
}) {
  const base =
    'grid grid-cols-[1.4rem_1fr_5rem_6rem] items-center gap-2 px-3 py-1.5 text-[13px] cursor-default'
  const tone = selected
    ? 'bg-aqua-blue text-white'
    : index % 2 === 0
      ? 'bg-row text-ink2'
      : 'bg-row-alt text-ink2'
  const content = (
    <>
      <span aria-hidden className="halftone size-3.5 rounded-[3px] border border-black/20" />
      <span className="truncate font-medium">{name}</span>
      <span className={selected ? 'text-white/80' : 'text-ink-dim'}>{kind}</span>
      <span className={`truncate ${selected ? 'text-white/80' : 'text-ink-dim'}`}>{tag}</span>
    </>
  )
  if (href) {
    return (
      <Link to={href} className={`${base} ${tone}`} onClick={onClick}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`w-full text-left ${base} ${tone}`}>
      {content}
    </button>
  )
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: PASS. (Components are exported; unused-import lint does not apply to module exports.)

- [ ] **Step 5: Verify lint passes**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/aqua/
git commit -m "feat(redesign): add Aqua Window/Toolbar/FinderRow primitives"
```

---

### Task 3: Rewrite HomePage as the Finder launcher window

**Files:**
- Modify (full rewrite): `src/app/HomePage.tsx`

**Interfaces:**
- Consumes: `Window`, `Toolbar`, `ToolbarButton` (Task 2), `FinderRow` (Task 2), `experiments` from `@/experiments/registry`.
- Produces: the `/` route view. No exports consumed by other tasks.

- [ ] **Step 1: Replace the entire contents of `src/app/HomePage.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/HomePage.tsx
git commit -m "feat(redesign): Finder-window launcher (HomePage)"
```

---

### Task 4: Rewrite ExperimentShell as an Aqua experiment window

**Files:**
- Modify (full rewrite): `src/shared/components/ExperimentShell.tsx`

**Interfaces:**
- Consumes: `Window` (Task 2), `Toolbar`/`ToolbarButton` (Task 2), `FpsMeter` (`@/shared/components/FpsMeter`, restyled in Task 6 but signature `{ paused: boolean }` unchanged), `useRecorder` (`@/shared/hooks/useRecorder` — unchanged, returns `{ recording, seconds, start, stop }`), `ExperimentEntry` type.
- Produces: the experiment view rendered by `/e/:slug`.

- [ ] **Step 1: Replace the entire contents of `src/shared/components/ExperimentShell.tsx`**

```tsx
import { Suspense, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { FpsMeter } from '@/shared/components/FpsMeter'
import { Window } from '@/shared/components/aqua/Window'
import { Toolbar, ToolbarButton } from '@/shared/components/aqua/Toolbar'
import { useRecorder } from '@/shared/hooks/useRecorder'
import type { ExperimentEntry } from '@/shared/types'

export function ExperimentShell({ entry }: { entry: ExperimentEntry }) {
  const { metadata: meta, Component } = entry
  const navigate = useNavigate()
  const [paused, setPaused] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [infoOpen, setInfoOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const { recording, seconds, start, stop } = useRecorder(meta.slug)
  const isPortraitStage = meta.slug === 'flower-control'

  const toggleRecording = useCallback(() => {
    if (recording) stop()
    else if (stageRef.current) start(stageRef.current)
  }, [recording, start, stop])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stageRef.current?.requestFullscreen()
  }, [])

  return (
    <div className="desktop grid min-h-dvh place-items-center p-4 sm:p-8">
      <Window
        title={`${meta.title} — musik.lab`}
        onClose={() => navigate('/')}
        className="aqua-pop h-[min(88dvh,760px)] w-[min(95vw,1000px)]"
        bodyClassName="bg-[#1c1b1f] grid place-items-center p-4"
        toolbar={
          <Toolbar>
            <ToolbarButton onClick={() => navigate('/')} title="Back to lab">
              ◀ Lab
            </ToolbarButton>
            <span className="text-[12px] font-medium text-ink2">{meta.title}</span>
            {recording && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                <span className="size-2 animate-pulse rounded-full bg-red-600" />
                REC {seconds}s
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <ToolbarButton onClick={() => setPaused((p) => !p)} title="Pause / resume">
                {paused ? '▶' : '❚❚'}
              </ToolbarButton>
              <ToolbarButton onClick={() => setResetKey((k) => k + 1)} title="Reset">
                ↻
              </ToolbarButton>
              <ToolbarButton onClick={toggleFullscreen} title="Fullscreen">
                ⤢
              </ToolbarButton>
              <ToolbarButton active={infoOpen} onClick={() => setInfoOpen((o) => !o)} title="Info">
                ?
              </ToolbarButton>
            </div>
          </Toolbar>
        }
        footer={
          <>
            <span className="flex items-center gap-3">
              <FpsMeter paused={paused} />
              <span>{meta.needsWebcam ? (isPortraitStage ? '3:4' : '4:3') : 'canvas · 4:3'}</span>
            </span>
            <button
              onClick={toggleRecording}
              className="lozenge"
              data-active={recording}
              title={recording ? 'Stop recording' : 'Record'}
            >
              <span
                className={recording ? 'size-2 rounded-[2px] bg-red-500' : 'size-2 rounded-full bg-red-500'}
              />
              {recording ? `stop · ${seconds}s` : 'record'}
            </button>
          </>
        }
      >
        <figure
          className={[
            'relative w-full self-center',
            isPortraitStage
              ? 'aspect-[3/4] max-w-[min(90%,calc((88dvh-8rem)*3/4))]'
              : 'aspect-[4/3] max-w-[min(96%,calc((88dvh-8rem)*4/3))]',
          ].join(' ')}
        >
          <div
            ref={stageRef}
            data-recording-stage
            className={[
              'relative size-full overflow-hidden rounded-[6px] bg-lab-screen transition-shadow',
              recording ? 'ring-2 ring-red-500' : 'ring-1 ring-black/40',
            ].join(' ')}
          >
            <Suspense
              fallback={
                <div className="grid size-full place-items-center font-ui text-xs text-white/70">
                  loading…
                </div>
              }
            >
              <Component key={resetKey} paused={paused} />
            </Suspense>
          </div>
          {infoOpen && (
            <p className="absolute inset-x-0 bottom-2 mx-2 rounded-md bg-white/90 p-2 text-[11px] leading-5 text-ink2 shadow">
              {meta.controls || meta.description}
            </p>
          )}
        </figure>
      </Window>
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/ExperimentShell.tsx
git commit -m "feat(redesign): Aqua experiment window (ExperimentShell)"
```

---

### Task 5: Reskin WebcamGate to Aqua

**Files:**
- Modify: `src/shared/components/WebcamGate.tsx` (only the JSX/classes in the `state !== 'active'` branch and the wrapper; keep all hook logic, `attachVideo`, `videoRef`, `state`, `start` exactly as-is)

**Interfaces:**
- Consumes: `useWebcam` (unchanged). Same props `{ hint, children }`.
- Produces: same render contract (children called with the live `HTMLVideoElement`).

- [ ] **Step 1: Replace the returned JSX in `WebcamGate.tsx`**

Keep the imports, `useWebcam`, `videoEl` state, and `attachVideo` callback unchanged. Replace only the `return (...)` block with:

```tsx
  return (
    <div className="relative h-full w-full">
      <video ref={attachVideo} playsInline muted className="hidden" />

      {state === 'active' && videoEl && children(videoEl)}

      {state !== 'active' && (
        <div className="grid h-full place-items-center bg-[#1c1b1f] px-6 text-center font-ui text-white/85">
          <div className="w-[min(90%,340px)] overflow-hidden rounded-[10px] border border-black/40 bg-win-body text-ink2 win-shadow">
            <div className="metal flex h-8 items-center border-b border-black/15 px-3 text-[12px] font-semibold">
              Camera
            </div>
            <div className="flex flex-col items-center gap-4 p-6">
              {state === 'idle' && (
                <>
                  <div className="halftone size-14 rounded-md border border-black/20 bg-white/70" />
                  <p className="text-[13px] leading-relaxed text-ink2">{hint}</p>
                  <button onClick={() => void start()} className="lozenge" data-active>
                    Enable camera
                  </button>
                  <p className="text-[11px] text-ink-dim">Video stays on this device.</p>
                </>
              )}
              {state === 'requesting' && <p className="text-[13px] text-ink2">Requesting camera…</p>}
              {(state === 'denied' || state === 'error') && (
                <>
                  <p className="text-[13px] font-semibold text-red-600">
                    {state === 'denied' ? 'Camera access denied' : 'Camera unavailable'}
                  </p>
                  <p className="text-[12px] leading-relaxed text-ink-dim">
                    This experiment needs a webcam. Check browser permissions and try again.
                  </p>
                  <button onClick={() => void start()} className="lozenge">
                    Retry
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/WebcamGate.tsx
git commit -m "feat(redesign): Aqua WebcamGate dialog"
```

---

### Task 6: Reskin FpsMeter + Aqua 404, then full verification

**Files:**
- Modify: `src/shared/components/FpsMeter.tsx` (only the returned `<span>` classes)
- Modify (full rewrite): `src/app/ExperimentPage.tsx` (only the 404 branch markup; keep the routing/`getExperiment` logic and the `ExperimentShell` return unchanged)

**Interfaces:**
- Consumes: everything from prior tasks.
- Produces: final styled views.

- [ ] **Step 1: Restyle FpsMeter span**

In `src/shared/components/FpsMeter.tsx`, replace the returned `<span ...>` line's `className` with:

```tsx
    <span className="text-[11px] tabular-nums text-ink-dim">
```

(Leave the `fps:` text and logic unchanged.)

- [ ] **Step 2: Restyle the 404 branch of `ExperimentPage.tsx`**

Replace only the `if (!entry) { return (...) }` block's JSX with:

```tsx
    return (
      <main className="desktop grid h-dvh place-items-center">
        <div className="win-shadow w-[min(90vw,360px)] overflow-hidden rounded-[10px] border border-win-line bg-win-body font-ui text-ink2">
          <div className="metal flex h-8 items-center border-b border-black/15 px-3 text-[12px] font-semibold">
            musik.lab
          </div>
          <div className="flex flex-col items-center gap-4 p-7 text-center">
            <div className="halftone size-12 rounded-md border border-black/20 bg-white/70" />
            <p className="text-[13px]">
              Module not found — <span className="font-semibold">/{slug}</span>
            </p>
            <Link to="/" className="lozenge" data-active>
              ◀ Back to lab
            </Link>
          </div>
        </div>
      </main>
    )
```

(Keep the `import { Link, useParams }`, `getExperiment`, and the final
`return <ExperimentShell key={...} entry={entry} />` lines unchanged.)

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Manual browser verification**

Run: `npm run dev`, open the printed localhost URL, and confirm:
- `/` shows the centered Finder window: traffic lights, brushed-metal toolbar, list/icon toggle works, sidebar All/Camera/Canvas filters, search filters, status bar reads "N of M modules".
- Clicking a row opens the experiment window with the pop animation; the experiment renders and is interactive.
- Record button shows REC timer + red ring around the stage; stopping produces a download (existing behavior).
- A webcam experiment shows the Aqua "Enable camera" dialog; granting starts the experiment.
- Red close light and "◀ Lab" both return to the launcher.
- Visit a bad URL (`/e/nope`) → Aqua 404 window.

Expected: all confirmed. Note any failures and fix before commit.

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/FpsMeter.tsx src/app/ExperimentPage.tsx
git commit -m "feat(redesign): Aqua FpsMeter + 404; verified full flow"
```

---

## Notes / deliberate simplifications (ponytail)

- **Window "morph" transition** is a scale/fade-in (`.aqua-pop`) on mount, not a true FLIP morph between launcher and experiment. Routing remounts the page; a real shared-element morph would need the View Transitions API and significant plumbing. Upgrade path: wrap `RouterProvider` navigations in `document.startViewTransition` if a true morph is wanted later.
- **Icon-view previews** use a CSS halftone tile with the experiment's initial, not generated preview images. If `meta.preview` images are added later, the icon-view `<div>` can render them behind the halftone.
- **SoundToggle** (`src/shared/components/SoundToggle.tsx`) is rendered *inside* experiments over the dark canvas, not part of window chrome — left as-is intentionally (its dark-glass style reads correctly on video). Restyle later only if it clashes.
- **StatusBadge** is not referenced by the redesigned launcher; left untouched.
- Old `--color-lab-*` tokens and ASCII helper classes remain in `index.css` because experiments and the dark stage still reference them. A later cleanup pass can prune any that end up unused.
```
