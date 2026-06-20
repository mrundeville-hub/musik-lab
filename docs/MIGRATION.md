# Migrating old projects

Old projects are rewritten, not copied. Per project:

## 1. Analyze the source

Open the old project folder and record here, in a section per project:

- **Idea** — what it is in one sentence
- **Visual core** — what makes it look the way it does (the part to preserve)
- **Mechanic** — how the user interacts with it
- **Dependencies** — libraries/APIs it used; note outdated ones and modern replacements

## 2. Rewrite

- New folder under `src/experiments/<slug>/` following ADDING_EXPERIMENT.md
- Use shared hooks (`useAnimationLoop`, `useCanvas2D`, `useWebcam`) instead of
  hand-rolled loops/resize/camera code
- Replace outdated dependencies (e.g. old three.js → current three + R3F)
- Add `paused` support, reset-safety (clean unmount), DPR handling, fallbacks
- Improve what's weak: performance, color, typography of in-canvas text

## 3. Finish

- `metadata.ts` with `status: 'migrated'`, tags, controls, perf notes
- Run the manual QA checklist
- Bump to `status: 'polished'` after a dedicated polish pass

---

## Source projects

### ASCII_ripp → `ascii-ripple` (migrated)

- **Idea**: webcam ASCII mirror with wave-equation ripples triggered by fingertips.
- **Visual core**: 62-char ramp, 18×26 cells, discrete wave sim (damping 0.94,
  strength 800), gradient-based glyph displacement ("refraction").
- **Replaced**: legacy `@mediapipe/hands` → `@mediapipe/tasks-vision` HandLandmarker;
  450-line monolith → shared hooks; pointer fallback kept.
- **Dropped for now**: synthesized glass sound effects (candidate for a shared audio util).

### ascii-garden → `ascii-garden` (migrated)

- **Idea**: pinch gesture drops water; drops grow staged ASCII flowers over grass.
- **Visual core**: 20-char ramp, 9-level gray palette, flower state machine
  (stem heights [2..17], petal counts [0..7]), pinch = thumb–index distance < 4.2
  grid units held 300ms+, EMA smoothing 0.42.
- **Replaced**: vendored vision_bundle.mjs + local wasm → npm `@mediapipe/tasks-vision`
  (CDN wasm/model); vanilla JS globals → React refs.
- **Dropped for now**: MP4 recording, 8-bit sound synthesis.

### asciishadow → `ascii-shadow` (migrated)

- **Idea**: matrix rain rendered only through dark areas of the video (shadow as screen).
- **Visual core**: per-column drops (random length 5–25, speed 0.2–1.0),
  trail fade 0.3+0.7, luminance threshold gating, glyph churn.
- **Kept**: 4 theme presets (matrix/terminal/ghost/cyber) as in-experiment buttons.
- **Dropped for now**: file upload, custom charset input, GIF export (gif.js is
  unmaintained — if export returns, use MediaRecorder).

### EyeType → `eye-type` (migrated)

- **Idea**: face landmarker finds eye anchors; letters of a word pour from the eyes
  as 2D rigid bodies and pile up.
- **Visual core**: canvas-rasterized letter sprites (cached per char), Rapier physics
  (gravity scale 0.78, restitution 0.14, z-rotation only), undersized colliders for
  tight stacking, orthographic camera over mirrored dimmed webcam backdrop.
- **Replaced**: 12fps detection throttle kept; unused zustand dropped; letter cap 600
  (was 2400) for safety inside the shared shell.
- **Dropped for now**: screen recording, collision audio.
