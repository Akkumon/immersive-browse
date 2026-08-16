# ADR 0005: React shell with a direct Three engine

Status: Accepted

Use React and TypeScript for product state and DOM overlays, while a small imperative engine owns the renderer, scene, raycasting, recycling, and physics. Do not introduce React Three Fiber for this experiment.
