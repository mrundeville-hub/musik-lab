# Butterfly Experiment — Technoorganic ASCII Redesign

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation plan

## Goal

Rework the butterfly experiment so the butterfly is complex and beautiful — a
dense, monochrome ASCII form (in the spirit of the "NEO TECHNOORGANIC WORLD"
reference) rendered over the live webcam — with natural flight, natural wing
flapping, and per-frame symbol morphing so it reads as a living thing made of
characters. A trailing pollen of glyph particles falls from the wings.

All interaction, hand-tracking, perching, and audio behavior stays as-is. Only
the visual construction of the butterfly and its motion dynamics change.

## File scope

- Modify: `src/experiments/butterfly/Experiment.tsx` (the only file touched).
- Unchanged: `metadata.ts`, `index.ts`, all shared hooks/components
  (`useGlassAudio`, `useAnimationLoop`, `useCanvas2D`, MediaPipe lib,
  `WebcamGate`, `SoundToggle`, `drawDimWebcam`).

The new density-field geometry and the particle pool live as functions/types
inside `Experiment.tsx`, matching the current single-file structure.

## Visual system

- **Monochrome.** Replace the green palette array `C[]` with `grey(value)`:
  density `value ∈ [0,1]` maps to a hue from `#f4f4f4` (dense core) down to
  `#5a5a5a` (sparse edge). Each glyph keeps its dark backing
  (`rgba(0,0,0,0.75)` offset draw) for legibility over the bright camera.
- **Camera stays bright:** `drawDimWebcam(ctx, video, w, h, 1)` (unchanged).
- **Long ramp:** `RAMP = ' .·:;-~=+*coOS%#H@'` (sparse→dense; weighted toward
  the organic glyphs `O H L S % /` seen in the reference).
- **Glyph selection per cell, per frame:**
  `value = clamp(d * (0.5 + 0.5*depth01) + shimmer + noise)` then
  `ch = RAMP[round(value * (RAMP.length-1))]`, where:
  - `d` = the cell's base density from the field (below),
  - `depth01` = current perspective depth (front cells denser/brighter),
  - `shimmer` = `0.12 * sin(wingPhase*1.6 + cell.phase)` (flap-coupled),
  - `noise` = small per-cell static jitter so symbols flicker/morph subtly.
  Static cells (body/antennae) keep their structural glyph, no ramp
  substitution (same rule as today).

## Procedural wing geometry (density field)

Built once at module load by sampling a field `d(u,v) ∈ [0,1]` on a grid in
local wing-space, then converting to the existing `Cell` shape
`[row, col, char, baseDensity, isStatic]`. A grid cell becomes a `Cell` only if
`d > THRESHOLD` (e.g. 0.06), so the interior is dense and the edges fall off
into a sparse stipple instead of filling a rectangle.

Field = max/sum of these layers (left side; right side is mirrored):

- **Silhouette:** forewing + hindwing as parametric superellipse-style blobs in
  normalized wing coordinates; base density falls off toward the rim.
- **Rim:** a narrow high-density ring near the silhouette boundary → crisp edge.
- **Veins:** a few rays from the wing root; density spikes along each line.
- **Eyespots:** 1–2 Gaussian density peaks (value ≈ 1.0) per wing.
- **Body / antennae:** center column + antennae cells, flagged `isStatic`.

Grid resolution is a single constant tuned so the active-cell count lands at
≈500–800 (a hard cap constant `MAX_CELLS` clamps it). The resulting cell array
replaces the hand-drawn `SPRITE`; the existing 3D projection
(fold→bank→pitch→yaw→perspective), painter's-order z-sort, and quantized font
sizing are reused unchanged aside from operating on more cells.

## Natural flight & wing flapping

Modify dynamics only; the idle/approach/perch FSM and finger-perch logic are
unchanged.

- **Flap curve (non-sinusoidal):** shape the phase with
  `shaped = wingPhase + 0.4*sin(wingPhase)` before the cosine, making the
  downstroke sharper than the upstroke.
- **Flap amplitude by state:** flying/accelerating → wide energetic flap;
  gliding (moving steadily) → flap amplitude decays, wings held open; perched →
  rare gentle quiver (as today).
- **Per-side phase offset:** a small fixed offset (fraction of a radian) between
  left and right so wings aren't perfectly synchronous.
- **Bob:** vertical bob coupled to flap phase (`y += bobAmp * sin(wingPhase)`) —
  the butterfly lifts on each beat. Primary naturalness cue.
- **Wander:** add a slow smooth-noise heading drift to the idle float so the
  path is irregular rather than a clean Lissajous.
- **Glide phases:** on a timer, the butterfly periodically stops flapping and
  coasts along its banked arc (flap amplitude eased toward 0), then resumes.

## Pollen particles

- A small fixed-size pool, cap `MAX_PARTICLES ≈ 60`.
- On the peak of each downstroke, emit 1–2 glyph particles (`· . : ˚ *`) from
  the projected wing-tip positions.
- Each particle drifts down-and-back with light gravity and fades out over
  ~0.8–1.4 s (alpha → 0). Drawn in the same monochrome, dimmer than the body.

## Performance

- Hard caps: `MAX_CELLS ≈ 800`, `MAX_PARTICLES ≈ 60`.
- Painter's-order z-sort retained; 60fps cap already enforced by
  `useAnimationLoop`.
- If a low-end machine drops frames, lower the single grid-resolution constant
  to reduce active glyphs.

## Out of scope

Audio (bells/sparkles/chords), MediaPipe hand detection, perch snapping,
`WebcamGate`, `SoundToggle`, metadata, routing, and the rest of the app.
