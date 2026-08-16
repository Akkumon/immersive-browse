# Immersive Browse

A local-first Three.js experiment that turns a curated Netflix catalog frame into an infinite spherical lattice of custom TSL liquid-glass tiles. It supports pointer, touch, and on-device MediaPipe hand gestures, with Netflix-style detail and static-player overlays.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL, choose **Enter Immersive Browse**, and allow camera access for gesture control. Pointer and touch remain available when camera access is denied.

## Controls

- Point or move the pointer to focus a tile.
- Aim with the index finger, then tap index to thumb (or click) to open the locked show. The target freezes as contact begins, so the tap cannot drift into a neighboring card.
- Move an open palm horizontally, vertically, or diagonally for direct catalog navigation.
- Close your fist to launch one rapid, interruptible momentum shuffle; open it before shuffling again.
- Use Play, Watchlist, and Like from the detail overlay.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

Camera frames stay on-device. The browser worker returns hand landmarks only; it does not upload or display the camera feed. Passive hand presence never commits an action: forward tap, fist, and palm gestures are stabilized before they act.

For local QA, append `?force-webgl=1` to exercise the WebGL2 backend, `?reduce-motion=1` to exercise reduced motion, or `?qa-renderer-only=1` to start the renderer without camera/audio/fullscreen permission prompts.
