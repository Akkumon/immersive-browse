# ADR 0004: On-device hand tracking

Status: Accepted

Use MediaPipe Hand Landmarker with locally hosted WASM and model files. Sample the camera into a worker, support one active hand, return landmarks only, and retain complete pointer/touch control when camera access fails.
