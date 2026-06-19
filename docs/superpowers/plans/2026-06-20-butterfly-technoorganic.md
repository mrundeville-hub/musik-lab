# Butterfly Technoorganic ASCII Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the butterfly into a dense, monochrome, procedurally-built ASCII form over the live webcam, with natural flapping/flight and a falling pollen of glyph particles.

**Architecture:** Replace the hand-drawn sprite in `src/experiments/butterfly/Experiment.tsx` with a density field sampled on a grid into a `Cell[]` at module load; render each cell per-frame through the existing 3D projection, picking a ramp glyph by density+depth+flap. Add non-sinusoidal flap dynamics, flap-coupled bob, heading wander, glide phases, and a small pollen particle pool.

**Tech Stack:** React 19, Canvas 2D, existing hooks (`useCanvas2D`, `useAnimationLoop`, `useGlassAudio`), MediaPipe hand landmarker.

## Testing note (deviation from TDD)

No unit-test framework in this repo. Per-task gate is `npm run build` (tsc + vite) and `npm run lint`, both clean (one pre-existing warning in `ascii-ripple/Experiment.tsx` is unrelated and acceptable). The final task is manual browser verification via `npm run dev`.

## Global Constraints

- Only file touched: `src/experiments/butterfly/Experiment.tsx`.
- Do NOT change `metadata.ts`, `index.ts`, shared hooks/components, or audio/MediaPipe/perch logic.
- Camera stays bright: keep `drawDimWebcam(ctx, video, width, height, 1)`.
- Hard caps: `MAX_CELLS = 800`, `MAX_PARTICLES = 60`.
- Monochrome only — no colored glyphs.
- 60fps cap is already enforced by `useAnimationLoop`; do not add another loop.
- Keep the existing painter's-order z-sort and quantized font-size batching.

---

### Task 1: Monochrome palette + long ramp

Swap the green palette for a grey density function and widen the ramp. Keeps the current hand-drawn sprite so the change is isolated and visually verifiable (butterfly turns into grey shimmering glyphs).

**Files:**
- Modify: `src/experiments/butterfly/Experiment.tsx`

**Interfaces:**
- Produces: `grey(v: number): string` and a widened `RAMP` consumed by all later tasks.

- [ ] **Step 1: Replace the color palette block with a `grey()` helper**

Replace the `C` array (lines ~23–33, the `// ── color palette ──` block) with:

```tsx
// ── monochrome density → grey ─────────────────────────────────
function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
// dense core → near-white, sparse edge → mid-grey
function grey(v: number) {
  const l = Math.round(90 + 154 * clamp01(v))
  return `rgb(${l},${l},${l})`
}
```

- [ ] **Step 2: Widen the ramp**

Replace the `RAMP` constant line with:

```tsx
const RAMP = ' .·:;-~=+*coOS%#H@'
```

- [ ] **Step 3: Recolor the draw loop to use density, not color index**

In `drawBfly`, replace the per-cell fill section (the block that currently reads
`ctx.fillStyle = 'rgba(0,0,0,0.75)'` … `ctx.fillStyle = C[p.ci]` …) with:

```tsx
    const px = Math.round(p.x), py = Math.round(p.y)
    ctx.globalAlpha = alpha
    // dark backing for legibility over the bright camera
    ctx.fillStyle = 'rgba(0,0,0,0.78)'
    ctx.fillText(ch, px + 1, py + 1)
    // monochrome: brightness follows the same value that picked the glyph
    ctx.fillStyle = grey(p.st ? 0.85 : p.d * (0.5 + 0.5 * depth01))
    ctx.fillText(ch, px, py)
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS. (`C` is now unused and removed; no `C[...]` references remain — confirm with `grep -n "C\[" src/experiments/butterfly/Experiment.tsx` returning nothing.)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit**

```bash
git add src/experiments/butterfly/Experiment.tsx
git commit -m "feat(butterfly): monochrome grey palette + wider ramp"
```

---

### Task 2: Procedural density-field geometry

Replace the hand-drawn `SPRITE` with a grid-sampled density field. This is the core change — the butterfly becomes dense and organic.

**Files:**
- Modify: `src/experiments/butterfly/Experiment.tsx`

**Interfaces:**
- Consumes: `clamp01`, `grey`, `RAMP` (Task 1), `CELL_W`, `CELL_H` (existing constants).
- Produces: `type Cell = { row: number; col: number; d: number; st: boolean; ch: string }`, the generated `CELLS: Cell[]`, and `MAX_CELLS`. Replaces the old tuple `Cell` type, the `UPPER_L/LOWER_L/ANT_L/BODY_C` sprite arrays, `mirrorCells`, `baseDensity`, and `SPRITE`.

- [ ] **Step 1: Delete the old sprite definitions**

Remove these (lines ~35–108): the tuple `type Cell`, the `baseDensity` function, `UPPER_L`, `LOWER_L`, `ANT_L`, `BODY_C`, `mirrorCells`, and `SPRITE`.

- [ ] **Step 2: Add the new Cell type + field generator**

Insert in their place:

```tsx
// [row,col] in cell units; col<0 = left wing. d = base density on the ramp.
// st = static (body/antennae keep their glyph). ch = glyph for static cells.
type Cell = { row: number; col: number; d: number; st: boolean; ch: string }

const MAX_CELLS = 800
const COLS = 14 // half-span horizontally (grid is -COLS..COLS)
const ROWS = 12 // half-span vertically  (grid is -ROWS..ROWS)
const THRESHOLD = 0.07 // wing density below this → empty (gives the silhouette)

function gauss(dx: number, dy: number, sx: number, sy: number) {
  return Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy)))
}

// Density field in normalized wing space.
// nx ∈ [0,1] outward from body, ny ∈ [-1,1] (negative = up / forewing).
function wingField(nx: number, ny: number) {
  // two overlapping lobes: forewing (upper) + hindwing (lower)
  const fore = gauss(nx - 0.52, ny + 0.48, 0.5, 0.42)
  const hind = gauss(nx - 0.42, ny - 0.46, 0.46, 0.4)
  let wing = Math.max(fore, hind)
  if (wing < THRESHOLD) return 0

  let d = wing * 0.85

  // rim: a band near the silhouette boundary → crisp dense edge
  if (wing < THRESHOLD + 0.13) d += 0.4

  // veins: rays from the wing root, density spikes along each line
  const ang = Math.atan2(ny, nx - 0.06)
  const rad = Math.hypot(nx - 0.06, ny)
  for (const v of [-0.9, -0.45, 0.2, 0.7]) {
    if (rad > 0.15 && Math.abs(ang - v) < 0.08) d += 0.3
  }

  // eyespots: two bright density peaks per wing
  d += 0.6 * gauss(nx - 0.62, ny + 0.46, 0.12, 0.12) // forewing eye
  d += 0.5 * gauss(nx - 0.5, ny - 0.46, 0.12, 0.12) // hindwing eye

  return clamp01(d)
}

function buildCells(): Cell[] {
  const cells: Cell[] = []

  // body: segmented center column (static glyphs, head → abdomen)
  const bodyGlyphs = ['@', '8', '8', '8', '8', '#', '#', '#', '8', 'o', '.']
  for (let i = 0; i < bodyGlyphs.length; i++) {
    cells.push({ row: -7 + i, col: 0, d: 0.85, st: true, ch: bodyGlyphs[i] })
  }
  // antennae (left + right), static
  const ant: Array<[number, number, string]> = [
    [-8, -1, '/'], [-9, -2, '~'], [-9, -3, '*'],
  ]
  for (const [r, c, ch] of ant) {
    cells.push({ row: r, col: c, d: 0.8, st: true, ch })
    cells.push({ row: r, col: -c, d: 0.8, st: true, ch: ch === '/' ? '\\' : ch })
  }

  // wings: sample the field on the grid, mirror to both sides
  for (let row = -ROWS; row <= ROWS; row++) {
    for (let col = 1; col <= COLS; col++) {
      const nx = col / COLS
      const ny = row / ROWS
      const d = wingField(nx, ny)
      if (d <= 0) continue
      cells.push({ row, col, d, st: false, ch: '·' })
      cells.push({ row, col: -col, d, st: false, ch: '·' })
    }
  }

  // safety cap: if the grid ever overflows, keep the densest cells
  if (cells.length > MAX_CELLS) {
    cells.sort((a, b) => b.d - a.d)
    cells.length = MAX_CELLS
  }
  return cells
}

const CELLS: Cell[] = buildCells()
```

- [ ] **Step 3: Rebuild the projection buffer from `CELLS`**

Replace the `PROJ` definition line (`const PROJ: ProjCell[] = SPRITE.map(...)`) with:

```tsx
const PROJ: ProjCell[] = CELLS.map(() => ({ x: 0, y: 0, z: 0, ch: '', ci: 0, s: 1, d: 0.5, st: false, ph: 0 }))
```

And in the `ProjCell` interface, the `ci` field is no longer used — leave it (harmless) or remove it; if removed, also remove `p.ci = ci` and `ci` reads. To keep the diff small, **remove** `ci` from `ProjCell` and from the projection loop.

- [ ] **Step 4: Update the projection loop to read `CELLS`**

Replace the body of the `for (let i = 0; i < SPRITE.length; i++)` loop in `drawBfly` with one that reads the object cells:

```tsx
  for (let i = 0; i < CELLS.length; i++) {
    const cell = CELLS[i]
    let x = cell.col * CELL_W
    const y0 = cell.row * CELL_H
    let z = 0
    if (!cell.st) {
      z = -Math.abs(x) * sinF
      x = x * cosF
    }
    const xb = x * cosB + z * sinB
    const zb = -x * sinB + z * cosB
    const yp = y0 * cosP - zb * sinP
    const zp = y0 * sinP + zb * cosP
    const X = xb * cosY - yp * sinY
    const Y = xb * sinY + yp * cosY
    const s = FOCAL / (FOCAL + zp)
    const p = PROJ[i]
    p.x = b.x + X * s
    p.y = b.y + Y * s
    p.z = zp
    p.ch = cell.ch
    p.s = s
    p.st = cell.st
    p.d = cell.d
    p.ph = i
  }
```

(The `SPRITE.length` reference in the `for` header is now `CELLS.length`; ensure no other `SPRITE` reference remains — `grep -n "SPRITE" src/experiments/butterfly/Experiment.tsx` must return nothing.)

- [ ] **Step 5: Confirm the glyph-pick in the draw loop uses `RAMP` + shimmer + noise**

In the second loop of `drawBfly` (the one that draws each `p`), the dynamic-cell branch should read:

```tsx
    if (!p.st) {
      const shimmer = 0.12 * Math.sin(b.wingPhase * 1.6 + p.ph)
      const noise = 0.05 * Math.sin(p.ph * 12.9898 + b.wingPhase * 0.3)
      const value = clamp01(p.d * (0.5 + 0.5 * depth01) + shimmer + noise)
      ch = RAMP[Math.round(value * ramp)]
      alpha = 0.55 + 0.45 * depth01
    }
```

(Static cells keep `ch = p.ch`, `alpha = 1`, as before.)

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS, no type errors. `grep -n "SPRITE\|baseDensity\|mirrorCells\|C\[" src/experiments/butterfly/Experiment.tsx` returns nothing.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: PASS (0 errors).

- [ ] **Step 8: Commit**

```bash
git add src/experiments/butterfly/Experiment.tsx
git commit -m "feat(butterfly): procedural density-field wing geometry"
```

---

### Task 3: Natural flapping + flight

Shape the flap, vary its amplitude by state, add a per-side offset, flap-coupled bob, heading wander, and glide phases.

**Files:**
- Modify: `src/experiments/butterfly/Experiment.tsx`

**Interfaces:**
- Consumes: `Bfly` state, `drawBfly`, the motion update in `useAnimationLoop`.
- Produces: new `Bfly` fields `glideUntil: number`, `flapAmp: number`, `wander: number`; flap now reads `wingPhase` + per-side offset inside `drawBfly`.

- [ ] **Step 1: Extend the `Bfly` interface and `makeBfly`**

Add to the `Bfly` interface:

```tsx
  glideUntil: number // performance.now() ms until which the butterfly coasts
  flapAmp: number    // current flap amplitude (eased 0..1)
  wander: number     // accumulated heading-wander angle
```

And in `makeBfly`, add to the returned object:

```tsx
    glideUntil: 0, flapAmp: 1, wander: 0,
```

- [ ] **Step 2: Make `drawBfly` use a shaped flap, amplitude, and per-side offset**

Replace the `flap` computation line at the top of `drawBfly`:

```tsx
  const flap = 0.1 + 1.2 * (0.5 + 0.5 * Math.cos(b.wingPhase))
```

with a shaped, amplitude-scaled flap and a small per-side phase offset applied
inside the cell loop. First, replace that line with:

```tsx
  // non-sinusoidal: downstroke sharper than upstroke; amplitude eased by state
  const shaped = b.wingPhase + 0.4 * Math.sin(b.wingPhase)
  const flapBase = 0.1 + (0.25 + 1.05 * b.flapAmp) * (0.5 + 0.5 * Math.cos(shaped))
```

Then, inside `for (let i = 0; i < CELLS.length; i++)`, replace the wing-fold lines

```tsx
    if (!cell.st) {
      z = -Math.abs(x) * sinF
      x = x * cosF
    }
```

with a per-side offset flap (left wing slightly leads the right):

```tsx
    if (!cell.st) {
      const sideOffset = cell.col < 0 ? 0 : 0.18
      const f = flapBase + sideOffset * Math.cos(shaped)
      const cf = Math.cos(f), sf = Math.sin(f)
      z = -Math.abs(x) * sf
      x = x * cf
    }
```

And remove the now-unused `cosF`/`sinF` constants (the `const cosF = Math.cos(flap), sinF = Math.sin(flap)` line) since flap is computed per cell.

- [ ] **Step 3: Drive `flapAmp` and glide phases in the motion update**

In `useAnimationLoop`, immediately after `b.prevTime = now` (before the
"Find nearest index fingertip" section), add:

```tsx
    // glide phases: occasionally stop flapping and coast for ~0.6–1.2 s
    if (!b.perched && !nearestPending() && now > b.glideUntil && Math.random() < 0.004) {
      b.glideUntil = now + 600 + Math.random() * 600
    }
    const gliding = !b.perched && now < b.glideUntil
    const ampTarget = b.perched ? 0.25 : gliding ? 0.12 : 1
    b.flapAmp += (ampTarget - b.flapAmp) * Math.min(1, 3 * dt)
```

Since `nearest` is computed later, define a tiny helper above the loop body is
overkill — instead move the glide check to AFTER `nearest` is computed. Concretely,
place this block right after the existing `// Find nearest index fingertip`
section (after `nearest`/`nearestDist` are set) and use `nearest` directly:

```tsx
    // glide phases: occasionally stop flapping and coast for ~0.6–1.2 s
    if (!b.perched && !nearest && now > b.glideUntil && Math.random() < 0.004) {
      b.glideUntil = now + 600 + Math.random() * 600
    }
    const gliding = !b.perched && !nearest && now < b.glideUntil
    const ampTarget = b.perched ? 0.25 : gliding ? 0.12 : 1
    b.flapAmp += (ampTarget - b.flapAmp) * Math.min(1, 3 * dt)
```

(Do not add the earlier `nearestPending()` variant — use only this one.)

- [ ] **Step 4: Add heading wander + flap-coupled bob to idle flight**

In the idle `else` branch of the motion update (the Lissajous block), replace:

```tsx
      // Lissajous-like idle float
      b.floatPhase += FLOAT_SPEED
      const tx = width  * 0.5  + Math.sin(b.floatPhase * 0.71) * width  * 0.28
      const ty = height * 0.38 + Math.cos(b.floatPhase)         * height * 0.18
      b.vx += (tx - b.x) * 0.005
      b.vy += (ty - b.y) * 0.005
      b.vx *= 0.94
      b.vy *= 0.94
      b.x += b.vx
      b.y += b.vy
      b.wingPhase += WING_SPEED_FLOAT * dt
```

with:

```tsx
      // wandering idle drift: smooth-noise heading offset breaks the clean orbit
      b.floatPhase += FLOAT_SPEED
      b.wander += (Math.sin(b.floatPhase * 1.7) + Math.sin(b.floatPhase * 0.43)) * 0.5 * dt
      const wob = b.wander * 0.6
      const tx = width * 0.5 + Math.sin(b.floatPhase * 0.71 + wob) * width * 0.28
      const ty = height * 0.38 + Math.cos(b.floatPhase + wob) * height * 0.18
      b.vx += (tx - b.x) * 0.005
      b.vy += (ty - b.y) * 0.005
      b.vx *= 0.94
      b.vy *= 0.94
      b.x += b.vx
      b.y += b.vy
      // flap-coupled vertical bob — butterfly lifts on each beat
      b.x += b.vx
      b.wingPhase += WING_SPEED_FLOAT * (gliding ? 0.15 : 1) * dt
      b.y += Math.sin(b.wingPhase) * 1.4 * b.flapAmp
```

Note: the duplicate `b.x += b.vx` above is a typo — include only ONE `b.x += b.vx`
and one `b.y += b.vy`. The correct block is:

```tsx
      b.floatPhase += FLOAT_SPEED
      b.wander += (Math.sin(b.floatPhase * 1.7) + Math.sin(b.floatPhase * 0.43)) * 0.5 * dt
      const wob = b.wander * 0.6
      const tx = width * 0.5 + Math.sin(b.floatPhase * 0.71 + wob) * width * 0.28
      const ty = height * 0.38 + Math.cos(b.floatPhase + wob) * height * 0.18
      b.vx += (tx - b.x) * 0.005
      b.vy += (ty - b.y) * 0.005
      b.vx *= 0.94
      b.vy *= 0.94
      b.x += b.vx
      b.y += b.vy
      b.wingPhase += WING_SPEED_FLOAT * (gliding ? 0.15 : 1) * dt
      b.y += Math.sin(b.wingPhase) * 1.4 * b.flapAmp
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: PASS (0 errors).

- [ ] **Step 7: Commit**

```bash
git add src/experiments/butterfly/Experiment.tsx
git commit -m "feat(butterfly): natural flap curve, bob, wander, glide"
```

---

### Task 4: Pollen particles

Emit faint glyph particles from the projected wing tips on each downstroke; drift down with gravity and fade.

**Files:**
- Modify: `src/experiments/butterfly/Experiment.tsx`

**Interfaces:**
- Consumes: `grey`, `drawBfly` (for wing-tip positions), the draw loop.
- Produces: `MAX_PARTICLES`, a module-level particle pool, `emitPollen(x, y)`, and `drawParticles(ctx, dt)`.

- [ ] **Step 1: Add the particle pool + helpers (module level, after `CELLS`)**

```tsx
// ── pollen particles ──────────────────────────────────────────
const MAX_PARTICLES = 60
const POLLEN_GLYPHS = '·.:˚*'
interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; ch: string; on: boolean
}
const PARTICLES: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
  x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, ch: '·', on: false,
}))

function emitPollen(x: number, y: number) {
  const p = PARTICLES.find((q) => !q.on)
  if (!p) return
  p.on = true
  p.x = x
  p.y = y
  p.vx = (Math.random() - 0.5) * 18
  p.vy = 12 + Math.random() * 22
  p.max = 0.8 + Math.random() * 0.6
  p.life = p.max
  p.ch = POLLEN_GLYPHS[Math.floor(Math.random() * POLLEN_GLYPHS.length)]
}

function drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '10px ui-monospace, monospace'
  for (const p of PARTICLES) {
    if (!p.on) continue
    p.life -= dt
    if (p.life <= 0) { p.on = false; continue }
    p.vy += 30 * dt // gravity
    p.x += p.vx * dt
    p.y += p.vy * dt
    const a = p.life / p.max
    ctx.globalAlpha = a * 0.7
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillText(p.ch, p.x + 1, p.y + 1)
    ctx.fillStyle = grey(0.5 + 0.3 * a)
    ctx.fillText(p.ch, p.x, p.y)
  }
  ctx.globalAlpha = 1
  ctx.restore()
}
```

- [ ] **Step 2: Track wing-tip screen positions in `drawBfly`**

`drawBfly` needs to expose where the wing tips are. Add two module-level
variables updated each frame, then read them in the loop. After the projection
loop in `drawBfly`, the leftmost/rightmost projected cells are the tips. Add
before `drawBfly`:

```tsx
// updated by drawBfly each frame: outermost projected wing-tip positions
const WING_TIP_L = { x: 0, y: 0 }
const WING_TIP_R = { x: 0, y: 0 }
```

Inside `drawBfly`, right after the projection `for` loop (before the
`PROJ.sort(...)` call), add:

```tsx
  // find outermost projected cells = wing tips (for pollen emission)
  let minX = Infinity, maxX = -Infinity
  for (let i = 0; i < PROJ.length; i++) {
    const p = PROJ[i]
    if (p.x < minX) { minX = p.x; WING_TIP_L.x = p.x; WING_TIP_L.y = p.y }
    if (p.x > maxX) { maxX = p.x; WING_TIP_R.x = p.x; WING_TIP_R.y = p.y }
  }
```

- [ ] **Step 3: Emit pollen on the downstroke + draw particles**

In `useAnimationLoop`, the downstroke is when `Math.sin(b.wingPhase)` crosses
its peak. Track the previous wing phase with a ref. Add a ref near the other
refs in `Scene`:

```tsx
  const prevFlap = useRef(0)
```

Then in the loop, AFTER `drawBfly(ctx, b)` is called, add:

```tsx
    // emit pollen near the peak of each downstroke (when not perched)
    const flapSin = Math.sin(b.wingPhase)
    if (!b.perched && prevFlap.current <= 0.85 && flapSin > 0.85 && b.flapAmp > 0.5) {
      emitPollen(WING_TIP_L.x, WING_TIP_L.y)
      emitPollen(WING_TIP_R.x, WING_TIP_R.y)
    }
    prevFlap.current = flapSin
    drawParticles(ctx, dt)
```

(Particles are drawn last so pollen floats in front; emission uses the wing-tip
positions computed during the just-finished `drawBfly`.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit**

```bash
git add src/experiments/butterfly/Experiment.tsx
git commit -m "feat(butterfly): pollen particle trail from wing tips"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Build + lint once more**

Run: `npm run build && npm run lint`
Expected: both PASS (0 errors; the one pre-existing `ascii-ripple` warning is fine).

- [ ] **Step 2: Manual browser verification**

Run: `npm run dev`, open the printed URL, go to `/e/butterfly`, grant the camera, and confirm:
- The butterfly is a dense monochrome ASCII form (not green, not the old thin sprite) over the bright webcam.
- Glyphs visibly morph/shimmer frame to frame.
- Wings flap with a natural downstroke-sharper rhythm; the body bobs on each beat; the path wanders and occasionally glides.
- Faint pollen glyphs fall from the wing tips while flying and fade out.
- Pointing a finger still makes it approach and perch on the fingertip; audio still plays; the SoundToggle still works.
- Frame rate stays smooth (no obvious stutter).

Expected: all confirmed. If pollen is too sparse/dense or the form too heavy, note it (tunable via `MAX_PARTICLES`, `COLS`/`ROWS`, `THRESHOLD`) — but functional verification must pass before finishing.

- [ ] **Step 3: Stop the dev server** (kill the `npm run dev` process).

---

## Notes / deliberate simplifications (ponytail)

- Wing tips are taken as the extreme projected X cells each frame — cheap and good enough; not anatomically the "tip" during heavy fold, but visually reads as pollen leaving the wing edges.
- Glide phases use `Math.random()` per frame for onset; fine for ambience. (Note: `Math.random` is allowed in app runtime — only workflow *scripts* forbid it.)
- Density-field constants (`COLS`, `ROWS`, `THRESHOLD`, gaussian centers) are tuned values, not derived; they are the calibration knobs for the look.
