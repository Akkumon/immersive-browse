# Immersive Browse — Shared Context

Immersive Browse is a local-first, publicly hostable prototype that turns a curated Netflix catalog snapshot into an unbounded, curved field of liquid-glass show tiles. It is not a live Netflix integration.

## Product language

- **Source Frame** — the Paper artboard that supplies approved category names, artwork, and ordering.
- **Catalog Surface** — the spatial field that recycles content as it moves.
- **Catalog Band** — one unlabeled horizontal strip in the compact tile lattice.
- **Show Tile** — a thick refractive card containing one still image.
- **Elastic Focus Field** — the focused tile's lift plus the smaller deformation passed into neighboring tiles.
- **Point** — aiming with an index finger or pointer without activation.
- **Pinch Select** — index-to-thumb activation of the focused tile.
- **Grab Pan** — closed-hand direct manipulation of the surface.
- **Palm Push** — one deliberate open-palm directional swipe that hands 2D velocity to the surface without entering continuous drag.
- **Momentum Release** — velocity passed from a released drag into interruptible inertial motion.
- **Detail Overlay** — focused information above a subdued surface, with Play, Watchlist, Like, and Close.
- **Static Player** — Netflix-like player chrome over a still thumbnail; playback controls are simulated.
- **Notch HUD** — compact top-center abstract mirrored fingertip trail; never a camera preview or instruction panel.
- **Liquid Resonance** — restrained procedural Web Audio feedback tied to focus, motion, selection, and confirmation.
- **Presentation Mode** — fullscreen, camera-enabled state entered from the single start gate.

## Guardrails

The camera feed remains on-device. MediaPipe receives sampled frames in a worker and only hand landmarks return to the UI. Pointer and touch controls remain fully usable when camera or gesture tracking is unavailable. Motion and transparency preferences are honored.
