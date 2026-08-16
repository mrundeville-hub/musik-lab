# Cat Gestures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 9:16 webcam experiment that maps six hand gestures to matching cat-meme images (meme on top, horizontal webcam strip below), then rebuild the Mac Electron app and push to GitHub.

**Architecture:** New auto-registered experiment `cat-gestures` using existing MediaPipe Hand + Face landmarkers. Pure geometry classifier (`classifyGesture`) drives which meme URL is shown; UI mirrors `flower-control` stack with a taller 9:16 shell stage. Last meme sticks after first detection; cold start top is black.

**Tech Stack:** React 19, Vite, `@mediapipe/tasks-vision` (HandLandmarker + FaceLandmarker), Tailwind, Vitest, Electron Builder (Mac).

## Global Constraints

- No new npm dependencies.
- Follow `docs/ADDING_EXPERIMENT.md` folder contract (`metadata.ts`, `Experiment.tsx`, `index.ts`).
- Respect `paused`; clean up landmarker + RAF on unmount.
- Assets stay inside `src/experiments/cat-gestures/`.
- Spec: `docs/superpowers/specs/2026-08-16-cat-gestures-design.md`.
- Prefer `rtk` prefix for shell commands when available; otherwise run bare.

## File structure

| File | Responsibility |
|------|----------------|
| `src/experiments/cat-gestures/classifyGesture.ts` | Pure landmark → gesture id (or null) |
| `src/experiments/cat-gestures/classifyGesture.test.ts` | Unit tests for classifier |
| `src/experiments/cat-gestures/memes.ts` | Gesture id → imported image URL map |
| `src/experiments/cat-gestures/assets/*` | Six meme images from the user |
| `src/experiments/cat-gestures/Experiment.tsx` | WebcamGate stage, detection loop, layout |
| `src/experiments/cat-gestures/metadata.ts` | ExperimentMetadata |
| `src/experiments/cat-gestures/index.ts` | Re-export default |
| `src/shared/components/ExperimentShell.tsx` | 9:16 portrait stage for this slug |

---

### Task 1: Gesture classifier (TDD)

**Files:**
- Create: `src/experiments/cat-gestures/classifyGesture.ts`
- Test: `src/experiments/cat-gestures/classifyGesture.test.ts`

**Interfaces:**
- Produces:
  - `export type CatGesture = 'pray' | 'pointUp' | 'shy' | 'fist' | 'shush' | 'shaka'`
  - `export type Lm = { x: number; y: number; z?: number }`
  - `export function classifyGesture(hands: Lm[][], mouth: Lm | null): CatGesture | null`
- Hand landmark indices (MediaPipe): wrist=0, thumb tip=4, index tip=8, middle tip=12, ring tip=16, pinky tip=20; PIP joints 6/10/14/18; thumb IP=3.
- Mouth: midpoint of face landmarks 13 and 14 (upper/lower inner lip), or null if no face.

**Priority (first match wins):** shy → pray → shush → pointUp → shaka → fist.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { classifyGesture, type Lm } from './classifyGesture'

/** Build a 21-point hand; override tips/joints as needed. */
function hand(partial: Record<number, Lm>): Lm[] {
  const pts: Lm[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
  for (const [i, p] of Object.entries(partial)) pts[Number(i)] = p
  return pts
}

function curledFist(): Lm[] {
  // All tips near palm (wrist/mcp cluster) → fist
  return hand({
    0: { x: 0.5, y: 0.7 },
    4: { x: 0.52, y: 0.62 },
    8: { x: 0.5, y: 0.58 },
    12: { x: 0.48, y: 0.58 },
    16: { x: 0.46, y: 0.6 },
    20: { x: 0.44, y: 0.62 },
    5: { x: 0.5, y: 0.55 },
    9: { x: 0.48, y: 0.55 },
    13: { x: 0.46, y: 0.55 },
    17: { x: 0.44, y: 0.55 },
  })
}

function indexUp(awayFromMouth = true): Lm[] {
  const tipY = awayFromMouth ? 0.15 : 0.42
  return hand({
    0: { x: 0.5, y: 0.75 },
    5: { x: 0.5, y: 0.55 },
    6: { x: 0.5, y: 0.4 },
    8: { x: 0.5, y: tipY }, // tip above PIP → extended
    4: { x: 0.42, y: 0.55 }, // thumb not shaka-far
    12: { x: 0.5, y: 0.52 },
    10: { x: 0.5, y: 0.5 },
    16: { x: 0.48, y: 0.54 },
    14: { x: 0.48, y: 0.52 },
    20: { x: 0.46, y: 0.56 },
    18: { x: 0.46, y: 0.54 },
  })
}

describe('classifyGesture', () => {
  it('returns null for empty hands', () => {
    expect(classifyGesture([], null)).toBeNull()
  })

  it('detects fist', () => {
    expect(classifyGesture([curledFist()], null)).toBe('fist')
  })

  it('detects pointUp when index up and tip far from mouth', () => {
    const mouth = { x: 0.5, y: 0.45 }
    expect(classifyGesture([indexUp(true)], mouth)).toBe('pointUp')
  })

  it('detects shush when index tip near mouth', () => {
    const mouth = { x: 0.5, y: 0.42 }
    expect(classifyGesture([indexUp(false)], mouth)).toBe('shush')
  })

  it('detects shy when two index tips are close', () => {
    const left = hand({
      0: { x: 0.3, y: 0.7 },
      5: { x: 0.32, y: 0.5 },
      6: { x: 0.35, y: 0.4 },
      8: { x: 0.45, y: 0.35 },
      12: { x: 0.3, y: 0.5 },
      10: { x: 0.3, y: 0.48 },
      16: { x: 0.28, y: 0.52 },
      14: { x: 0.28, y: 0.5 },
      20: { x: 0.26, y: 0.54 },
      18: { x: 0.26, y: 0.52 },
      4: { x: 0.28, y: 0.55 },
    })
    const right = hand({
      0: { x: 0.7, y: 0.7 },
      5: { x: 0.68, y: 0.5 },
      6: { x: 0.65, y: 0.4 },
      8: { x: 0.5, y: 0.35 },
      12: { x: 0.7, y: 0.5 },
      10: { x: 0.7, y: 0.48 },
      16: { x: 0.72, y: 0.52 },
      14: { x: 0.72, y: 0.5 },
      20: { x: 0.74, y: 0.54 },
      18: { x: 0.74, y: 0.52 },
      4: { x: 0.72, y: 0.55 },
    })
    expect(classifyGesture([left, right], null)).toBe('shy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/experiments/cat-gestures/classifyGesture.test.ts`  
Expected: FAIL (module not found / classifyGesture not defined)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/experiments/cat-gestures/classifyGesture.ts
export type CatGesture = 'pray' | 'pointUp' | 'shy' | 'fist' | 'shush' | 'shaka'
export type Lm = { x: number; y: number; z?: number }

const dist = (a: Lm, b: Lm) => Math.hypot(a.x - b.x, a.y - b.y)

function fingerExtended(hand: Lm[], tip: number, pip: number, mcp: number) {
  // Tip farther from wrist than PIP, and roughly "out"
  const wrist = hand[0]
  return dist(hand[tip], wrist) > dist(hand[pip], wrist) * 1.08 &&
    dist(hand[tip], hand[mcp]) > dist(hand[pip], hand[mcp]) * 0.95
}

function fingerCurled(hand: Lm[], tip: number, mcp: number) {
  return dist(hand[tip], hand[mcp]) < dist(hand[0], hand[mcp]) * 0.55
}

function isFist(hand: Lm[]) {
  return [8, 12, 16, 20].every((tip, i) => fingerCurled(hand, tip, [5, 9, 13, 17][i]))
}

function isIndexUp(hand: Lm[]) {
  return (
    fingerExtended(hand, 8, 6, 5) &&
    fingerCurled(hand, 12, 9) &&
    fingerCurled(hand, 16, 13) &&
    fingerCurled(hand, 20, 17)
  )
}

function isShaka(hand: Lm[]) {
  const thumbOut = dist(hand[4], hand[17]) > dist(hand[5], hand[17]) * 0.9
  return (
    thumbOut &&
    fingerExtended(hand, 20, 18, 17) &&
    fingerCurled(hand, 8, 5) &&
    fingerCurled(hand, 12, 9) &&
    fingerCurled(hand, 16, 13)
  )
}

function isShy(a: Lm[], b: Lm[]) {
  if (!fingerExtended(a, 8, 6, 5) || !fingerExtended(b, 8, 6, 5)) return false
  return dist(a[8], b[8]) < 0.12
}

function isPray(a: Lm[], b: Lm[]) {
  // Palms facing-ish: wrists close, middle MCPs close, tips clustered
  return (
    dist(a[0], b[0]) < 0.18 &&
    dist(a[9], b[9]) < 0.14 &&
    dist(a[8], b[8]) < 0.16
  )
}

const MOUTH_RADIUS = 0.09

export function classifyGesture(hands: Lm[][], mouth: Lm | null): CatGesture | null {
  if (hands.length === 0) return null
  if (hands.length >= 2) {
    const [a, b] = hands
    if (isShy(a, b)) return 'shy'
    if (isPray(a, b)) return 'pray'
  }
  for (const h of hands) {
    if (isIndexUp(h)) {
      if (mouth && dist(h[8], mouth) < MOUTH_RADIUS) return 'shush'
      return 'pointUp'
    }
  }
  for (const h of hands) {
    if (isShaka(h)) return 'shaka'
  }
  for (const h of hands) {
    if (isFist(h)) return 'fist'
  }
  return null
}
```

Tune thresholds only if tests fail with near-miss geometry; keep helpers private.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/experiments/cat-gestures/classifyGesture.test.ts`  
Expected: PASS (all cases green). If fist/shaka/shy fail, adjust distances in the test fixtures first (fixtures must match the intended geometry), then thresholds only if needed.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/cat-gestures/classifyGesture.ts src/experiments/cat-gestures/classifyGesture.test.ts
git commit -m "feat(cat-gestures): add landmark gesture classifier"
```

---

### Task 2: Assets + meme map + scaffolding

**Files:**
- Create: `src/experiments/cat-gestures/assets/pray.webp` (or `.jpg`/`.png` — use whatever format the attached files are)
- Create: `src/experiments/cat-gestures/assets/point-up.*`
- Create: `src/experiments/cat-gestures/assets/shy.*`
- Create: `src/experiments/cat-gestures/assets/fist.*`
- Create: `src/experiments/cat-gestures/assets/shush.*`
- Create: `src/experiments/cat-gestures/assets/shaka.*`
- Create: `src/experiments/cat-gestures/memes.ts`
- Create: `src/experiments/cat-gestures/metadata.ts`
- Create: `src/experiments/cat-gestures/index.ts`
- Create: `src/experiments/cat-gestures/Experiment.tsx` (stub that compiles)

**Interfaces:**
- Consumes: `CatGesture` from `./classifyGesture`
- Produces: `MEMES: Record<CatGesture, string>` of Vite-resolved asset URLs

Mapping from user attachments:

| Attachment | File | Gesture |
|------------|------|---------|
| Image #1 (🙏 on orange cat) | `pray.*` | pray |
| Image #2 (☝️ grey cat) | `point-up.*` | pointUp |
| Image #3 (👉👈 cream cat) | `shy.*` | shy |
| Image #4 (👊 white/orange) | `fist.*` | fist |
| Image #5 (🤫 white cat) | `shush.*` | shush |
| Image #6 (🤙 grey blep) | `shaka.*` | shaka |

- [ ] **Step 1: Copy the six attached meme images into `assets/`**

If images are available in the chat/workspace as files, copy them with the names above. If only in-message images exist, save them from the conversation attachments into those paths (same binary content the user attached). Prefer `.jpg`/`.webp` as provided — do not re-encode unless needed.

- [ ] **Step 2: Write `memes.ts`**

```ts
import type { CatGesture } from './classifyGesture'
import pray from './assets/pray.jpg'
import pointUp from './assets/point-up.jpg'
import shy from './assets/shy.jpg'
import fist from './assets/fist.jpg'
import shush from './assets/shush.jpg'
import shaka from './assets/shaka.jpg'

// Adjust extensions to match actual files on disk.

export const MEMES: Record<CatGesture, string> = {
  pray,
  pointUp,
  shy,
  fist,
  shush,
  shaka,
}
```

- [ ] **Step 3: Write metadata + index + stub Experiment**

```ts
// metadata.ts
import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Cat Gestures',
  slug: 'cat-gestures',
  description:
    'Show a hand gesture to the camera and get the matching cat meme. Portrait 9:16 stack: meme on top, live webcam strip below.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'face', 'meme', 'portrait'],
  technologies: ['react', 'mediapipe hand landmarker', 'mediapipe face landmarker'],
  needsWebcam: true,
  controls:
    'pray 🙏 · point up ☝️ · shy 👉👈 · fist 👊 · shush 🤫 (finger at lips) · shaka 🤙',
  performanceNotes: 'hand+face landmarks ~20–30fps; meme swap debounced ~3–5 frames',
} satisfies ExperimentMetadata
```

```ts
// index.ts
export { default } from './Experiment'
```

```tsx
// Experiment.tsx — stub until Task 3
import type { ExperimentProps } from '@/shared/types'

export default function Experiment(_props: ExperimentProps) {
  return <div className="grid size-full place-items-center bg-black text-white/70">cat gestures</div>
}
```

- [ ] **Step 4: Verify registry picks it up**

Run: `npm test -- src/experiments/registry.test.ts` (if present) or `npm run build`  
Expected: build/tests succeed; slug `cat-gestures` present in registry if tests assert known slugs — update registry test allowlist only if it hard-fails on new folders.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/cat-gestures
git commit -m "feat(cat-gestures): add assets, metadata, and meme map"
```

---

### Task 3: Stage UI + detection loop

**Files:**
- Modify: `src/experiments/cat-gestures/Experiment.tsx`
- Modify: `src/shared/components/ExperimentShell.tsx`

**Interfaces:**
- Consumes: `classifyGesture`, `MEMES`, `createHandLandmarker`, `createFaceLandmarker`, `WebcamGate`
- Debounce: `HOLD_FRAMES = 4` consecutive same non-null labels before committing.

- [ ] **Step 1: Generalize portrait aspect in ExperimentShell**

Replace the hard-coded `flower-control` check with a small map:

```ts
const PORTRAIT_ASPECT: Record<string, string> = {
  'flower-control': '3/4',
  'cat-gestures': '9/16',
}
const portraitAspect = PORTRAIT_ASPECT[meta.slug]
const isPortraitStage = Boolean(portraitAspect)
```

Footer label: `portraitAspect?.replace('/', ':') ?? (meta.needsWebcam ? '4:3' : 'canvas · 4:3')`  
Figure class: if portrait, `aspect-[${portraitAspect}]` — use explicit classes (Tailwind needs full class strings):

```ts
const portraitClass =
  meta.slug === 'cat-gestures'
    ? 'aspect-[9/16] max-w-[min(90%,calc((88dvh-8rem)*9/16))]'
    : meta.slug === 'flower-control'
      ? 'aspect-[3/4] max-w-[min(90%,calc((88dvh-8rem)*3/4))]'
      : null
```

Keep flower-control behavior unchanged.

- [ ] **Step 2: Implement Experiment stage**

Structure (pattern from `flower-control`):

```tsx
export default function Experiment({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="enable camera, show a gesture: 🙏 ☝️ 👉👈 👊 🤫 🤙">
      {(video) => <CatGesturesStage video={video} paused={paused} />}
    </WebcamGate>
  )
}
```

`CatGesturesStage`:

1. `useEffect` load `createHandLandmarker(2)` + `createFaceLandmarker()`; close both on cleanup.
2. RAF loop (~detect every 2nd frame / min 33ms): `detectForVideo` on video; build `hands: Lm[][]` from `landmarks`; mouth = average of face landmarks `[13]` and `[14]` if present (mirror x: `1 - x` only for drawing, classification uses raw model coords consistently — **classify in the same coordinate space as landmarks from MediaPipe**, no mirror).
3. `const label = classifyGesture(hands, mouth)`; maintain `pending` + `streak`; when streak ≥ 4 and label !== committed, `setGesture(label)`.
4. Layout:

```tsx
<div className="relative h-full w-full overflow-hidden bg-black">
  <div className="grid h-full grid-rows-[1fr_auto]">
    <section className="relative min-h-0 bg-black">
      {gesture ? (
        <img src={MEMES[gesture]} alt={gesture} className="absolute inset-0 size-full object-cover" />
      ) : null}
    </section>
    <section className="relative aspect-video w-full overflow-hidden border-t border-white/15 bg-black">
      <video /* srcObject from webcam video */ playsInline muted
        className="h-full w-full -scale-x-100 object-cover" />
    </section>
  </div>
</div>
```

5. Honor `paused`: skip detect + RAF progression when paused (or skip classification updates).
6. Optional tiny HUD text of current/pending gesture — keep minimal (label only if useful for debug; prefer clean meme view).

- [ ] **Step 3: Manual smoke in browser**

Run: `npm run dev` → open `/e/cat-gestures`  
Expected: enable camera → black top → fist/point/etc switches meme → remove hands keeps last meme → pause freezes → reset remounts to black top.

- [ ] **Step 4: Commit**

```bash
git add src/experiments/cat-gestures/Experiment.tsx src/shared/components/ExperimentShell.tsx
git commit -m "feat(cat-gestures): 9:16 meme stage with hand+face detection"
```

---

### Task 4: Desktop build + push

**Files:** none new (build artifacts stay untracked)

- [ ] **Step 1: Run unit tests + production build**

```bash
npm test
npm run build
```

Expected: all tests pass; Vite build succeeds including `cat-gestures` chunk and assets.

- [ ] **Step 2: Build Mac desktop app**

```bash
npm run desktop:build
```

Expected: electron-builder produces dmg/zip under `dist/` (or `release/` per electron-builder defaults). Fix any path/camera entitlement issues if the build fails.

- [ ] **Step 3: Launch desktop briefly for smoke (optional if CI-less)**

```bash
npm run desktop
```

Expected: app opens; Cat Gestures listed; camera works in Electron.

- [ ] **Step 4: Push to GitHub**

```bash
git status
git push -u origin HEAD
```

Expected: remote `https://github.com/mrundeville-hub/musik-lab.git` updated (branch currently ahead of origin). Do not force-push. Include all cat-gestures commits from Tasks 1–3; do not commit unrelated dirty files (`.commandcode/`, unrelated package churn) unless they are required for the build — leave them out.

- [ ] **Step 5: Confirm remote**

```bash
git status
gh repo view --web  # or gh browse
```

Expected: clean sync with origin (or only unrelated local dirt remaining).

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| 9:16 stage, meme top, webcam bottom | 3 |
| Six gesture → image mappings | 2 |
| Shush = index near mouth; else pointUp | 1, 3 |
| Black top until first gesture; then sticky last | 3 |
| Debounce | 3 |
| Hand + Face landmarker, no new deps | 1, 3 |
| Experiment folder auto-registry | 2 |
| Desktop Mac rebuild | 4 |
| Push to GitHub | 4 |
| Classifier unit test | 1 |
