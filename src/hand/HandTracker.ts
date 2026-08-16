import { classifyGesture, GestureStabilizer, landmarkToNdc, type Gesture, type Point3 } from '../lib/gestures'

export type TrackingUpdate = {
  visible: boolean
  point: { x: number; y: number }
  screenPoint: { x: number; y: number }
  gesture: Gesture
  handedness?: string
}

export class HandTracker {
  private worker = new Worker(new URL('./hand.worker.ts', import.meta.url), { type: 'module' })
  private video = document.createElement('video')
  private stream?: MediaStream
  private frame = 0
  private ready = false
  private busy = false
  private disposed = false
  private lastSample = 0
  private stabilizer = new GestureStabilizer()
  private resolveWorkerReady?: () => void
  private rejectWorkerReady?: (error: Error) => void
  private workerReady: Promise<void>

  constructor(
    private onUpdate: (update: TrackingUpdate) => void,
    private onStatus: (status: 'loading' | 'ready' | 'lost' | 'error', message?: string) => void,
  ) {
    this.video.muted = true
    this.video.playsInline = true
    this.worker.onmessage = this.onWorkerMessage
    this.workerReady = new Promise<void>((resolve, reject) => {
      this.resolveWorkerReady = resolve
      this.rejectWorkerReady = reject
    })
  }

  async start() {
    this.onStatus('loading')
    this.worker.postMessage({ type: 'init' })
    await this.workerReady
    this.onStatus('loading', 'Hand model ready')
    if (this.disposed) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    })
    this.video.srcObject = this.stream
    await this.video.play()
    this.onStatus('ready')
    this.frame = requestAnimationFrame(this.sample)
  }

  private onWorkerMessage = (event: MessageEvent) => {
    if (event.data.type === 'ready') {
      this.ready = true
      this.resolveWorkerReady?.()
      this.resolveWorkerReady = undefined
      this.rejectWorkerReady = undefined
      return
    }
    if (event.data.type === 'error') {
      this.busy = false
      const error = new Error(event.data.message)
      if (!this.ready) this.rejectWorkerReady?.(error)
      this.ready = false
      this.onStatus('error', error.message)
      return
    }
    if (event.data.type === 'result') {
      this.busy = false
      const landmarks = event.data.landmarks as Point3[]
      if (!landmarks.length) {
        this.stabilizer.reset()
        this.onUpdate({ visible: false, point: { x: 0, y: 0 }, screenPoint: { x: 0.5, y: 0.12 }, gesture: 'idle' })
        this.onStatus('lost')
        return
      }
      const point = landmarkToNdc(landmarks[8])
      this.onStatus('ready')
      this.onUpdate({
        visible: true,
        point,
        screenPoint: { x: (point.x + 1) / 2, y: 1 - (point.y + 1) / 2 },
        gesture: this.stabilizer.update(classifyGesture(landmarks)),
        handedness: event.data.handedness,
      })
    }
  }

  private sample = async (time: number) => {
    if (this.disposed) return
    if (this.ready && !this.busy && this.video.readyState >= 2 && time - this.lastSample > 45) {
      this.busy = true
      this.lastSample = time
      try {
        const bitmap = await createImageBitmap(this.video)
        this.worker.postMessage({ type: 'frame', bitmap, timestamp: time }, [bitmap])
      } catch {
        this.busy = false
      }
    }
    this.frame = requestAnimationFrame(this.sample)
  }

  dispose() {
    this.disposed = true
    this.rejectWorkerReady?.(new Error('Hand tracker disposed'))
    this.resolveWorkerReady = undefined
    this.rejectWorkerReady = undefined
    cancelAnimationFrame(this.frame)
    this.worker.terminate()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.video.srcObject = null
  }
}
