/// <reference lib="webworker" />
import { HandLandmarker } from '@mediapipe/tasks-vision'
import wasmLoaderPath from './runtime/vision_wasm_module_internal.js?url'
import wasmBinaryPath from './runtime/vision_wasm_module_internal.wasm?url'

let landmarker: HandLandmarker | undefined

self.onmessage = async (event: MessageEvent) => {
  if (event.data.type === 'init') {
    try {
      const vision = { wasmLoaderPath, wasmBinaryPath }
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      self.postMessage({ type: 'ready' })
    } catch (error) {
      self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Hand tracker failed to load' })
    }
    return
  }

  if (event.data.type === 'frame' && landmarker) {
    const bitmap = event.data.bitmap as ImageBitmap
    try {
      const result = landmarker.detectForVideo(bitmap, event.data.timestamp)
      self.postMessage({
        type: 'result',
        landmarks: result.landmarks[0]?.map(({ x, y, z }) => ({ x, y, z })) ?? [],
        handedness: result.handedness[0]?.[0]?.categoryName ?? null,
      })
    } catch (error) {
      self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Tracking frame failed' })
    } finally {
      bitmap.close()
    }
  }
}

export {}
