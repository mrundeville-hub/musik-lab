# Cat Gestures — Hand Meme Experiment

**Date:** 2026-08-16  
**Status:** Approved design, ready for implementation plan

## Goal

Add a new webcam experiment: show a hand gesture to the camera and display the
matching cat-meme image above a live webcam strip. Portrait stage is **9:16**.
Ship in the Electron Mac desktop app and push to GitHub (`musik-lab`).

## Layout

Mirror `flower-control` stacking, but taller:

```
┌─────────────────┐
│                 │
│   cat meme      │  ← object-cover, fills remaining height
│   (or black)    │
│                 │
├─────────────────┤
│  mirrored webcam│  ← horizontal 16:9 strip (aspect-video)
└─────────────────┘
         9:16 stage
```

- ExperimentShell: treat this slug like `flower-control` but with
  `aspect-[9/16]` (and footer label `9:16`), not 3:4 / 4:3.
- Top starts **black** until the first recognized gesture.
- After that, when no gesture is detected, **keep the last meme**.

## Gestures → assets

Six user-provided images live in
`src/experiments/cat-gestures/assets/` (imported as static URLs).

| Id | Gesture | Detection sketch | Asset |
|----|---------|------------------|-------|
| `pray` | 🙏 folded hands | Two hands, palms facing, wrists near, fingertips near | `pray.jpg` (or `.png`/`.webp`) |
| `pointUp` | ☝️ index up | One hand: index extended up; tip **not** near mouth | `point-up.*` |
| `shy` | 👉👈 fingers toward each other | Two hands; both index tips extended and near each other | `shy.*` |
| `fist` | 👊 closed fist | One hand: all fingertips curled toward palm | `fist.*` |
| `shush` | 🤫 quiet | Index extended up **and** tip near mouth (face landmarks) | `shush.*` |
| `shaka` | 🤙 call me | Thumb + pinky extended; middle three curled | `shaka.*` |

Priority when multiple rules could fire (first match wins):

1. `shy` (two-hand index meet)  
2. `pray` (two-hand palms together)  
3. `shush` (index up + near mouth)  
4. `pointUp` (index up alone)  
5. `shaka`  
6. `fist`

## Recognition

- Reuse `createHandLandmarker(2)` and `createFaceLandmarker()` from
  `src/shared/lib/mediapipe.ts`. No new npm deps.
- Classify from landmark geometry (finger extension + pairwise distances), not
  MediaPipe GestureRecognizer (missing shaka / pray / shy / shush).
- **Shush vs point-up:** if index is up and tip is within a small normalized
  radius of the mouth midpoint (face landmarks 13/14 or equivalent lip center),
  classify `shush`; otherwise `pointUp`.
- Debounce: require the same label for N consecutive detection frames
  (~3–5 at ~20–30 Hz) before committing a meme change.
- When `paused`, freeze classification and leave the current meme.

## File scope

New experiment folder (registry auto-discovers):

- `src/experiments/cat-gestures/metadata.ts`
- `src/experiments/cat-gestures/Experiment.tsx`
- `src/experiments/cat-gestures/index.ts`
- `src/experiments/cat-gestures/assets/*` (six meme images)
- Optional tiny `classifyGesture.ts` + one unit test for pure geometry helpers

Shell tweak:

- `src/shared/components/ExperimentShell.tsx` — portrait aspect for
  `cat-gestures` as `9/16` (generalize the current `flower-control`-only check)

Out of scope: audio, recording UX changes beyond existing shell record button,
new shared hooks, GestureRecognizer model download.

## Desktop + ship

1. Implement + vitest for classifier helpers.  
2. Manual QA: camera, each gesture, pause/reset, leave route (camera off).  
3. `npm run desktop:build` (Mac).  
4. Commit, push to `origin` (`https://github.com/mrundeville-hub/musik-lab.git`).

## Success criteria

- Experiment appears on home and at `/e/cat-gestures`.  
- Stage is visibly 9:16; webcam strip bottom; meme top.  
- All six gestures switch to the correct image with stable debounce.  
- Cold start top is black; after first hit, absent gesture keeps last image.  
- Desktop Mac build succeeds; changes pushed to GitHub.
