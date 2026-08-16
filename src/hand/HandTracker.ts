import { AdaptivePointFilter, classifyGesture, GestureStabilizer, indexForwardDepth, IndexAirTapRecognizer, landmarkToNdc, type Gesture, type Point3 } from '../lib/gestures'

export type TrackingUpdate = {
  visible: boolean
  point: { x: number; y: number }
  screenPoint: { x: number; y: number }
  gesture: Gesture
  airTapCandidate: boolean
  airTap: boolean
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
  private missedFrames = 0
  private lastUpdate?: TrackingUpdate
  private stabilizer = new GestureStabilizer()
  private airTap = new IndexAirTapRecognizer()
  private pointFilter = new AdaptivePointFilter()
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
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
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
        this.missedFrames += 1
        if (this.lastUpdate && this.missedFrames <= 3) {
          // Bridge a few dropped detections without inventing movement. This
          // prevents a momentary landmark miss from breaking an active wave.
          this.onUpdate({
            ...this.lastUpdate,
            point: { ...this.lastUpdate.point },
            screenPoint: { ...this.lastUpdate.screenPoint },
            airTapCandidate: false,
            airTap: false,
          })
          return
        }
        this.stabilizer.reset()
        this.airTap.reset()
        this.pointFilter.reset()
        this.lastUpdate = undefined
        this.onUpdate({ visible: false, point: { x: 0, y: 0 }, screenPoint: { x: 0.5, y: 0.12 }, gesture: 'idle', airTapCandidate: false, airTap: false })
        this.onStatus('lost')
        return
      }
      this.missedFrames = 0
      const rawGesture = classifyGesture(landmarks)
      const gesture = this.stabilizer.update(rawGesture)
      const source = gesture === 'palm' || gesture === 'grab'
        ? [0, 5, 9, 13, 17].reduce(
            (center, index) => ({
              x: center.x + landmarks[index].x / 5,
              y: center.y + landmarks[index].y / 5,
              z: center.z + landmarks[index].z / 5,
            }),
            { x: 0, y: 0, z: 0 },
          )
        : landmarks[8]
      const rawPoint = landmarkToNdc(source)
      const point = gesture === 'point' ? this.pointFilter.update(rawPoint) : rawPoint
      if (gesture !== 'point') this.pointFilter.reset()
      const airTap = this.airTap.update(gesture, indexForwardDepth(landmarks), rawPoint)
      this.onStatus('ready')
      const update: TrackingUpdate = {
        visible: true,
        point,
        screenPoint: { x: (point.x + 1) / 2, y: 1 - (point.y + 1) / 2 },
        gesture,
        airTapCandidate: airTap.candidate,
        airTap: airTap.commit,
        handedness: event.data.handedness,
      }
      this.lastUpdate = update
      this.onUpdate(update)
    }
  }

  private sample = async (time: number) => {
    if (this.disposed) return
    if (this.ready && !this.busy && this.video.readyState >= 2 && time - this.lastSample > 24) {
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
