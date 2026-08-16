export type Point3 = { x: number; y: number; z: number }
export type Gesture = 'point' | 'pinch' | 'grab' | 'palm' | 'idle'

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
    // Selection carries the highest cost, so a pinch must remain intentional
    // for three consecutive camera samples before it can commit.
    const threshold = next === 'pinch'
      ? 3
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
  const otherFingersExtended = [12, 16, 20].filter(
    (tip) => distance(landmarks[tip], landmarks[0]) > distance(landmarks[tip - 2], landmarks[0]) * 1.12,
  ).length
  if (pinch < 0.28 && otherFingersExtended >= 2) return 'pinch'
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
