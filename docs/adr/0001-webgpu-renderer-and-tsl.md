# ADR 0001: WebGPU renderer and TSL

Status: Accepted

Use Three.js `WebGPURenderer` with TSL node materials. Allow Three's WebGL2 backend fallback, keep the Three version pinned, and avoid unsupported legacy shader hooks and EffectComposer dependencies.
