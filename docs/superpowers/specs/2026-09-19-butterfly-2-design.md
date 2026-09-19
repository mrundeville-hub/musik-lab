# Butterfly 2.0 Design

## Goal

Add a separate `/e/butterfly-2` experiment. A procedural ASCII butterfly flies
over the mirrored webcam and lands on the nearest tracked index fingertip. Its
landing starts a radial transformation from that fingertip: the photographic
webcam becomes a high-contrast green ASCII portrait on black. The transformation
reverses when the butterfly leaves.

The existing `/e/butterfly` experiment remains available and unchanged.

## Experience

### Flight mode

- Show the mirrored webcam at full brightness.
- Render a detailed monochrome swallowtail-like ASCII butterfly above it.
- Show the tracked index fingertip as a small green target.
- The butterfly wanders, occasionally glides, approaches the nearest index
  fingertip, and perches when it reaches the target.

### Landing transition

- The landing point is the tracked index fingertip position at the instant the
  butterfly perches.
- A circular wave expands from that point until it covers the stage.
- Inside the wave, show the webcam as green ASCII on a true black background.
- Outside the wave, keep showing the photographic webcam.
- Use a soft transition edge about 80 CSS pixels wide; blend both renderings
  only within that edge.
- Keep the butterfly light grey/white above the green portrait so it remains
  distinct.

### Perched mode

- Keep the full stage in live green ASCII while the butterfly remains perched.
- Continue updating the ASCII portrait from the camera; this is not a frozen
  frame.
- Keep the butterfly attached to the current fingertip position.

### Takeoff transition

- If the fingertip is no longer tracked, the butterfly takes off.
- Collapse the same radial wave back toward the last fingertip position.
- Restore the full-brightness photographic webcam when the radius reaches zero.

## ASCII Portrait Quality

Render the portrait on the existing Canvas 2D stage. Each frame:

1. Mirror and downsample the webcam into a reusable offscreen canvas where one
   source pixel corresponds to one glyph cell.
2. Compute luminance using Rec. 709 coefficients:
   `0.2126 * r + 0.7152 * g + 0.0722 * b`.
3. Apply black/white-point normalization and a gamma curve so faces, hands, and
   clothing remain legible across normal indoor lighting.
4. Estimate local edges from neighboring luminance samples using a compact
   Sobel gradient and add a bounded edge boost. This preserves eyes, lips,
   fingers, and clothing contours without introducing a second vision model.
5. Select glyphs from a luminance ramp such as
   ` .,:;irsXA253hMHGS#9B&@`.
6. Skip near-black cells so the background remains truly black.
7. Draw visible glyphs in phosphor green (`#39ff14`) with a restrained darker
   green shadow. Vary brightness by source luminance rather than using one flat
   green.

Start with cells around 7×12 CSS pixels and calibrate against the stage size.
The grid may adapt by viewport width, but it must stay dense enough for facial
features and coarse enough to sustain smooth interaction.

## Butterfly

Use the new procedural geometry already drafted for Butterfly 2.0:

- pointed forewings, rounded hindwings, and swallowtails;
- radial and cross-wing veins;
- eyespots, marginal lunules, and an iridescent hindwing region;
- mirrored geometry and stable structural glyphs for body, antennae, and legs.

Keep veins visually stable while the membrane subtly changes glyphs. Let the
iridescent region shimmer more strongly. Retain shaped flapping, banking,
gliding, pollen, fingertip approach, perch behavior, and existing glass-audio
interaction.

## Architecture

Create a self-contained `src/experiments/butterfly-2/` folder:

- `metadata.ts` registers the new `butterfly-2` slug.
- `index.ts` exports the experiment.
- `geometry.ts` owns pure butterfly field generation.
- `geometry.test.ts` verifies silhouette, symmetry, veins, tails, eyespots, and
  a non-saturated density distribution.
- `asciiPortrait.ts` owns pure luminance, normalization, edge, glyph, and wave
  calculations.
- `asciiPortrait.test.ts` verifies image-to-glyph and radial-mask behavior.
- `Experiment.tsx` owns React lifecycle, MediaPipe tracking, animation state,
  audio, compositing, and drawing.

Use only existing React, Canvas 2D, MediaPipe, and audio utilities. Add no
dependency and do not modify shared modules unless a concrete duplicated need
appears during implementation.

The registry already discovers experiment folders through `import.meta.glob`,
so no explicit route registration should be necessary.

## State and Data Flow

Maintain an explicit visual state:

- `photo`: wave radius is zero.
- `revealing`: landing has occurred and radius expands.
- `ascii`: radius covers the stage.
- `hiding`: takeoff has occurred and radius contracts.

The butterfly's `perched` transition starts `revealing`. Loss of the tracked
finger starts `hiding`. Reacquiring a finger during `hiding` does not
immediately reverse the transition; the butterfly must approach and land again.
This prevents flicker from momentary MediaPipe landmark loss.

The wave radius is measured from the stored transition origin to the farthest
stage corner. Its duration is approximately 700 ms and uses eased progress.
Canvas resize recomputes the required maximum radius without restarting the
active transition.

## Performance

- Reuse the offscreen canvas, typed luminance buffer, projection buffer, and
  particle pool.
- Request the 2D sampling context with `willReadFrequently: true`.
- Run MediaPipe at its existing throttled cadence, independent of rendering.
- Process only one pixel per ASCII cell, never full-resolution `getImageData`.
- Avoid allocations inside the animation loop.
- Respect `paused` through `useAnimationLoop`.

Target smooth desktop rendering. Validate performance in a real browser with a
real or fake camera; headless MediaPipe frame rate alone is not a reliable
performance measurement.

## Failure and Cleanup

- `WebcamGate` continues to handle camera permission and failure states.
- If MediaPipe is not ready, the butterfly remains in idle flight.
- If a video frame is temporarily unavailable, retain a black stage rather
  than reading invalid pixel data.
- Close the hand landmarker on unmount and leave no animation, media, or audio
  work running after navigation.

## Verification

Automated:

- Geometry and ASCII helper tests pass under Vitest.
- Registry tests discover unique `butterfly` and `butterfly-2` slugs.
- TypeScript build and ESLint pass without new warnings.

Manual:

- Both Butterfly versions appear as separate cards and routes.
- Flight mode shows the normal mirrored camera.
- Landing launches the wave exactly from the index fingertip.
- The completed view is a live, detailed green ASCII portrait on black.
- The light butterfly remains readable over the portrait.
- Removing the finger reverses the wave and restores the normal camera.
- Pause, reset, resize, fullscreen, recording, sound toggle, and route cleanup
  continue to work.

## Out of Scope

- Replacing or removing the original Butterfly experiment.
- Person segmentation or background removal.
- WebGL shaders.
- User controls for glyph ramp, color, or resolution.
- Additional gestures beyond index-fingertip tracking.
