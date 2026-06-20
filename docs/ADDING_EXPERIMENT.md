# Adding an experiment

1. Create `src/experiments/<slug>/` with three files:

   - `metadata.ts` — `export default { ... } satisfies ExperimentMetadata`
   - `Experiment.tsx` — default-export a component accepting `ExperimentProps` (`{ paused }`)
   - `index.ts` — `export { default } from './Experiment'`

2. That's it. The registry (`src/experiments/registry.ts`) picks the folder up
   automatically via `import.meta.glob`; the home page and `/e/<slug>` route appear
   without touching shell code. Component code is lazy-loaded only when opened.

## Rules

- **Respect `paused`.** Use `useAnimationLoop(cb, paused)` for canvas work, or
  R3F's `frameloop={paused ? 'never' : 'always'}` for WebGL.
- **Clean up everything** on unmount: RAF (handled by `useAnimationLoop`),
  media streams (handled by `useWebcam`), event listeners, WebGL contexts.
  Reset works by remounting — unmount must leave nothing behind.
- **Webcam/mic**: set `needsWebcam`/`needsAudio` in metadata, start the stream
  only from a user gesture via `useWebcam`, and render a fallback for
  `denied`/`error` states.
- **DPR & resize**: `useCanvas2D` handles both; for raw WebGL cap DPR at 2.
- Keep per-experiment assets/shaders/utils inside the experiment folder.
  Promote to `src/shared/` only when a second experiment needs the same thing.

## Manual QA checklist

- [ ] loads, animates, ~60fps on desktop
- [ ] pause freezes (fps shows `--`, CPU/GPU drops)
- [ ] reset restores the initial state
- [ ] resize + fullscreen keep correct proportions/DPR
- [ ] back to home → no console errors, camera light off, CPU idle
- [ ] usable on a narrow viewport
