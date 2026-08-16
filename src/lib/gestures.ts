export type Point3 = { x: number; y: number; z: number }
export type Gesture = 'point' | 'pinch' | 'grab' | 'palm' | 'idle'

export type HandSelectionDecision = {
  trackTarget: boolean
  select: boolean
  armed: boolean
}

export class HandSelectionIntent {
  private previous: Gesture = 'idle'
  private pointFrames = 0
  private armed = false

  update(gesture: Gesture, catalogMoving: boolean, pinchCandidate = false): HandSelectionDecision {
    let trackTarget = false
    let select = false

    if (catalogMoving || gesture === 'grab' || gesture === 'palm') {
      this.pointFrames = 0
      this.armed = false
    } else if (gesture === 'point') {
      if (!pinchCandidate) {
        trackTarget = true
        this.pointFrames = this.previous === 'point' ? this.pointFrames + 1 : 1
        this.armed = this.pointFrames >= 2
      }
    } else if (gesture === 'pinch') {
      // Commit against the target locked by the preceding point pose. The
      // inward fingertip motion of the tap must never retarget the ray.
      select = this.previous === 'point' && this.armed
      this.pointFrames = 0
      this.armed = false
    } else {
      this.pointFrames = 0
      this.armed = false
    }

    this.previous = gesture
    return { trackTarget, select, armed: this.armed }
  }

  reset() {
    this.previous = 'idle'
    this.pointFrames = 0
    this.armed = false
  }
}

export class GestureStabilizer {
  private current: Gesture = 'idle'
  private candidate: Gesture = 'idle'
  private candidateFrames = 0

  update(next: Gesture) {
    if (next === this.current) {
      this.candidate = next
      this.candidateFrames = 0
      return this.current
    }
    if (next !== this.candidate) {
      this.candidate = next
      this.candidateFrames = 1
    } else {
      this.candidateFrames += 1
    }
    // Intent gating happens after stabilization, so two pinch samples are
    // enough to preserve a quick thumb-index tap without accepting a blip.
    const threshold = next === 'pinch'
      ? 2
      : this.current === 'palm'
        ? 3
        : this.current === 'pinch'
          ? 2
          : next === 'grab' || next === 'palm'
            ? 2
            : 1
    if (this.candidateFrames >= threshold) {
      this.current = next
      this.candidateFrames = 0
    }
    return this.current
  }

  reset() {
    this.current = 'idle'
    this.candidate = 'idle'
    this.candidateFrames = 0
  }
}

const distance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export function classifyGesture(landmarks: Point3[]): Gesture {
  if (landmarks.length < 21) return 'idle'
  const palmScale = Math.max(distance(landmarks[0], landmarks[9]), 0.025)
  const extended = [8, 12, 16, 20].filter(
    (tip) => distance(landmarks[tip], landmarks[0]) > distance(landmarks[tip - 2], landmarks[0]) * 1.16,
  ).length
  const curled = [8, 12, 16, 20].filter(
    (tip) => distance(landmarks[tip], landmarks[0]) < distance(landmarks[tip - 2], landmarks[0]) * 0.94,
  ).length
  // Resolve a fist before thumb/index proximity: those fingertips naturally
  // sit close together in a closed hand and must never masquerade as a pinch.
  if (curled === 4) return 'grab'

  const pinch = distance(landmarks[4], landmarks[8]) / palmScale
  if (pinch < 0.36) return 'pinch'
  if (extended === 4) return 'palm'

  const indexExtended = distance(landmarks[8], landmarks[0]) > distance(landmarks[6], landmarks[0]) * 1.18
  const othersCurled = [12, 16, 20].filter(
    (tip) => distance(landmarks[tip], landmarks[0]) < distance(landmarks[tip - 2], landmarks[0]) * 0.98,
  ).length
  if (indexExtended && othersCurled >= 2) return 'point'
  return 'idle'
}

export function landmarkToNdc(point: Point3) {
  return { x: (1 - point.x) * 2 - 1, y: -(point.y * 2 - 1) }
}

export function palmSwipeVector(
  origin: { x: number; y: number },
  point: { x: number; y: number },
  elapsedMs: number,
) {
  const x = point.x - origin.x
  const y = point.y - origin.y
  if (elapsedMs > 520 || Math.hypot(x, y) <= 0.17) return { x: 0, y: 0 }
  return { x, y }
}
