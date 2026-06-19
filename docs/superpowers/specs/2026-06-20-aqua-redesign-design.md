# musik.lab — Aqua / Brushed-Metal Redesign

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation plan

## Goal

Reskin the musik.lab web app into a minimalist classic Mac OS X (Aqua / brushed
metal) interface. On open, the user sees a single centered Finder-style window
listing the experiments. Opening an experiment transitions that window into the
live experiment view (camera/canvas full, Aqua chrome around it).

The experiments themselves (`src/experiments/*`) and the hooks/audio/recording
logic are **not** changed. This is a shell + widget reskin only.

## Aesthetic references

- Mac OS X Finder window (brushed metal toolbar, traffic-light controls, soft shadows, Lucida Grande).
- Halftone/dithered face poster — drives experiment previews (dithered frames).
- Monospace vinyl label (`24 05 24`) — drives small "label" metadata (version, dates, counters).

## Design system

**Palette**
- Desktop background: warm neutral gradient, subtly noised (grey-beige, like the Finder reference).
- Window: brushed-metal toolbar `#d8d8d8 → #b8b8b8` with fine texture; body `#ececec` / white list rows.
- Traffic lights: `#ff5f57 / #febc2e / #28c840` (close / minimize / zoom), glossy.
- Selection accent: Aqua blue `#3b7dff` (selected list row).
- Text: graphite `#2a2a2a`, secondary `#7a7a7a`.

**Typography**
- UI / menus / lists: system sans (`-apple-system, "Lucida Grande", Helvetica`), small and crisp.
- Monospace for labels (dates, version, counters).
- Halftone/dither treatment for experiment previews.

**Reusable widgets**
- `Window` — titlebar with traffic lights + brushed-metal toolbar + body.
- `Toolbar` — lozenge buttons (icon view / list view), search pill on the right.
- `FinderList` — zebra rows, icon + name + kind + tag column, status bar at bottom.

Replaces the existing `lab-bg / lab-ink / serif / ASCII` token set with an Aqua
token set in `index.css` + Tailwind config.

## Screen 1 — Launcher (Finder window)

Single centered window on a neutral desktop. This is the app's opening state.

```
┌─────────────────────────────────────────────────┐
│ ● ● ●          musik.lab                         │  titlebar, traffic lights left
├─────────────────────────────────────────────────┤
│ [ ▦ icons ] [ ☰ list ]        🔍 search…   v0.1  │  brushed-metal toolbar
├──────────────┬──────────────────────────────────┤
│ SIDEBAR      │  NAME            KIND     TAG      │  column headers (list view)
│ ▸ All  (11)  │  ▦ breath-garden camera   /calm   │
│ ▸ Camera (9) │  ▦ butterfly     camera   /play   │  zebra rows, Aqua-blue selection
│ ▸ Canvas (2) │  ▦ constellation camera   /space  │
│ TAGS         │  …                                │
├──────────────┴──────────────────────────────────┤
│ 11 modules · camera ready ●         mp4 / webm    │  status bar
└─────────────────────────────────────────────────┘
```

- **Icon view**: tiles with halftone-dithered previews. **List view**: compact Finder list. Toggle in toolbar.
- Sidebar = former tag filters as a Finder source list (`All / Camera / Canvas` + tags).
- Search pill filters live.
- Status bar carries former info: module count, camera readiness, export formats.
- Click/double-click a row → window transitions into Screen 2.
- Mobile: window goes full-screen; sidebar collapses to a dropdown; list view by default.

Touches: rewrite `src/app/HomePage.tsx`.

## Screen 2 — Experiment view (camera + recording)

Window "flows" (scale/opacity transition) from the launcher. Experiment
canvas fills the window body; Aqua chrome frames it without covering it.

```
┌──────────────────────────────────────────────────────────┐
│ ● ● ●        butterfly — musik.lab                  ⤢      │  ● close → back to launcher
├──────────────────────────────────────────────────────────┤
│ ◀ Lab     butterfly            🔴 REC 00:12     ◉ sound ▦  │  brushed-metal toolbar, lozenge buttons
├──────────────────────────────────────────────────────────┤
│              [ live experiment canvas, full ]              │  recording = thin red frame
├──────────────────────────────────────────────────────────┤
│  60 fps · 4:3 · audio on            ⏺ record   ⤓ save mp4  │  status bar + primary actions
└──────────────────────────────────────────────────────────┘
```

Mapping onto existing logic (experiments untouched):
- `← Lab` / red traffic light → back to launcher.
- `⏺ record` / `REC 00:12` timer → existing `useRecorder` (incl. audio capture).
- `◉ sound` → existing `SoundToggle`. `60 fps` → existing `FpsMeter`. Reskinned to Aqua lozenges; behavior unchanged.
- `WebcamGate` (camera permission) → Aqua sheet sliding from the titlebar, replacing the current screen.
- Recording highlighted by a thin red frame around the canvas (replaces prior overlay).

Touches: rewrite `src/shared/components/ExperimentShell.tsx`, reskin
`WebcamGate.tsx`, `SoundToggle.tsx`, `FpsMeter.tsx`, `StatusBadge.tsx`.

## Scope

In: design tokens (`index.css` / Tailwind), new `Window` / `Toolbar` /
`FinderList` components, rewrite `HomePage` and `ExperimentShell` + the 4 chrome
widgets.

Out: `src/experiments/*`, hooks, audio capture, recorder logic, routing.
