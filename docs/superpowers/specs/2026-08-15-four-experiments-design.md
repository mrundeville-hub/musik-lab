# Four experiments — ASCII / CRT / geometry / fluid

Approved batch: four dense webcam experiments, each a distinct visual language.

## Shared constraints

- Folder: `src/experiments/<slug>/{metadata.ts,Experiment.tsx,index.ts}`
- Registry auto-discovers; include `emoji` + `blurb` + `CARD_LOOK` tint
- WebcamGate + `useCanvas2D` + `useAnimationLoop` + glass audio
- MediaPipe throttled ~30fps (`DETECT_MS ≈ 33`); particle caps; respect `paused`

## 1. ASCII Forecast (`ascii-forecast`)

Live ASCII weather map driven by face.

- Smile → sun glyphs (`* . o ☀`), frown → rain (`| / #`)
- Head yaw → wind drift on glyphs
- Blink → lightning flash across grid
- Glass: soft rumble / drip ticks on rain, bright chime on lightning

## 2. CRT Snow (`crt-snow`)

Webcam through a CRT / VHS stack.

- Scanlines, bloom, slight barrel feel via offscreen scale
- Pinch-release (snap) → horizontal roll
- Palm near camera → static snow
- Open mouth → tracking tears
- Glass: warm hum + crackle on snap

## 3. Orbit Loom (`orbit-loom`)

Vector springs between fingertips.

- Index/middle/ring/pinky tips = nodes; springs between neighbours + cross links
- Fist (tips clustered) → orbits collapse; open hand → expand
- Two hands → two clusters with a weak bridge
- Glass: pluck on tension spikes

## 4. Mercury Face (`mercury-face`)

Liquid-metal silhouette.

- Image segmenter mask filled with mercury gradient + specular
- Head motion → surface ripple / wobble
- Pinch near silhouette → tear a droplet that falls and reabsorbs
- Glass: cold metallic tones on drip / merge

## Out of scope

- New shared libs unless a second experiment needs the same helper
- Desktop rebuild (dev/preview is enough unless asked)
