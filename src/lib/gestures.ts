export type Point3 = { x: number; y: number; z: number }
export type Gesture = 'point' | 'pinch' | 'grab' | 'palm' | 'idle'

export type HandSelectionDecision = {
  trackTarget: boolean
  select: boolean
  armed: boolean
}

export class HandSelectionIntent {
  private pointFrames = 0
  private armed = false

  update(gesture: Gesture, catalogMoving: boolean, activationCandidate = false, activate = false): HandSelectionDecision {
    let trackTarget = false
    let select = false

    if (catalogMoving || gesture === 'grab' || gesture === 'palm') {
      this.pointFrames = 0
      this.armed = false
    } else if (gesture === 'point') {
      if (activate) {
        select = this.armed
        this.pointFrames = 0
        this.armed = false
      } else if (!activationCandidate) {
        trackTarget = true
        this.pointFrames += 1
        this.armed = this.pointFrames >= 4
      }
    } else {
      this.pointFrames = 0
      this.armed = false
    }

    return { trackTarget, select, armed: this.armed }
  }

  reset() {
    this.pointFrames = 0
    this.armed = false
  }
}

export type AirTapDecision = { candidate: boolean; commit: boolean }

export type ModalFistCloseDecision = { armed: boolean; candidate: boolean; commit: boolean }

export class FistShuffleRecognizer {
  private fired = false

  update(gesture: Gesture) {
    if (gesture !== 'grab') {
      this.fired = false
      return false
    }
    if (this.fired) return false
    // GestureStabilizer has already required consecutive raw fist samples.
    // Committing here avoids stacking a second, user-visible dwell delay.
    this.fired = true
    return true
  }

  reset() {
    this.fired = false
  }
}

export function fistShuffleVector(sequence: number, width: number, height: number) {
  const phase = 0.6 + (sequence + 1) * 2.399963229728653
  const x = Math.cos(phase)
  const y = Math.sin(phase) * 0.72
  const length = Math.hypot(x, y) || 1
  const speed = Math.max(width, height) * 2.4
  return { x: x / length * speed, y: y / length * speed }
}

export class AdaptivePointFilter {
  private value?: { x: number; y: number }

  update(point: { x: number; y: number }) {
    if (!this.value) {
      this.value = { ...point }
      return { ...point }
    }
    const distance = Math.hypot(point.x - this.value.x, point.y - this.value.y)
    // Settle camera noise without adding perceptible latency to deliberate aim.
    const alpha = Math.min(0.94, 0.5 + distance * 2.2)
    this.value.x += (point.x - this.value.x) * alpha
    this.value.y += (point.y - this.value.y) * alpha
    return { ...this.value }
  }

  reset() {
    this.value = undefined
  }
}

/**
 * Recognises the deliberate motion of closing an open hand into a fist. A fist
 * pose by itself cannot dismiss a modal; the recogniser must first see a stable
 * palm and tolerates a short ambiguous transition while the fingers curl.
 */
export class ModalFistCloseRecognizer {
  private palmFrames = 0
  private transitionFrames = 0
  private armed = false
  private committed = false

  update(gesture: Gesture, active: boolean): ModalFistCloseDecision {
    if (!active) {
      this.reset()
      return { armed: false, candidate: false, commit: false }
    }

    if (gesture === 'palm') {
      this.palmFrames += 1
      this.transitionFrames = 0
      this.committed = false
      if (this.palmFrames >= 2) this.armed = true
      return { armed: this.armed, candidate: false, commit: false }
    }

    if (gesture === 'grab' && this.armed && !this.committed) {
      this.transitionFrames = 0
      // The shared stabilizer has already confirmed the fist across raw camera
      // samples, so this transition can commit without another dwell.
      this.committed = true
      this.armed = false
      return { armed: false, candidate: false, commit: true }
    }

    if (this.armed) {
      this.transitionFrames += 1
      if (this.transitionFrames > 12) this.reset()
    }
    return { armed: this.armed, candidate: false, commit: false }
  }

  reset() {
    this.palmFrames = 0
    this.transitionFrames = 0
    this.armed = false
    this.committed = false
  }
}

/**
 * Recognises a short, relative forward stroke of the index finger. The depth
 * value is normalised against palm size, so moving the whole hand toward the
 * camera does not resemble an air tap as easily as raw landmark Z would.
 */
export class IndexAirTapRecognizer {
  private phase: 'calibrating' | 'ready' | 'pressing' | 'committed' = 'calibrating'
  private pointFrames = 0
  private baseline = 0
  private releaseFrames = 0
  private pressFrames = 0
  private pressOrigin?: { x: number; y: number }

  update(gesture: Gesture, depth: number, point?: { x: number; y: number }): AirTapDecision {
    if (gesture !== 'point' || !Number.isFinite(depth)) {
      this.reset()
      return { candidate: false, commit: false }
    }

    this.pointFrames += 1
    if (this.phase === 'calibrating') {
      this.baseline = this.pointFrames === 1 ? depth : this.baseline + (depth - this.baseline) * 0.35
      if (this.pointFrames >= 4) this.phase = 'ready'
      return { candidate: false, commit: false }
    }

    const travel = depth - this.baseline
    if (this.phase === 'ready') {
      if (travel > 0.075) {
        this.phase = 'pressing'
        this.pressFrames = 1
        this.pressOrigin = point ? { ...point } : undefined
        return { candidate: true, commit: false }
      }
      this.baseline += (depth - this.baseline) * 0.1
      return { candidate: false, commit: false }
    }

    if (this.phase === 'pressing') {
      this.pressFrames += 1
      const planarTravel = point && this.pressOrigin
        ? Math.hypot(point.x - this.pressOrigin.x, point.y - this.pressOrigin.y)
        : 0
      // A user moving the pointing ray across the catalog is aiming, not
      // pressing. Likewise, a partial depth stroke must not freeze aim forever.
      if (planarTravel > 0.065 || this.pressFrames > 6) {
        this.phase = 'ready'
        this.baseline = depth
        this.pressFrames = 0
        this.pressOrigin = undefined
        return { candidate: false, commit: false }
      }
      if (travel > 0.16) {
        this.phase = 'committed'
        return { candidate: true, commit: true }
      }
      if (travel < 0.025) this.phase = 'ready'
      return { candidate: this.phase === 'pressing', commit: false }
    }

    if (travel < 0.045) this.releaseFrames += 1
    else this.releaseFrames = 0
    if (this.releaseFrames >= 2) {
      this.phase = 'ready'
      this.releaseFrames = 0
      this.baseline = depth
      this.pressOrigin = undefined
      this.pressFrames = 0
      return { candidate: false, commit: false }
    }
    return { candidate: true, commit: false }
  }

  reset() {
    this.phase = 'calibrating'
    this.pointFrames = 0
    this.baseline = 0
    this.releaseFrames = 0
    this.pressFrames = 0
    this.pressOrigin = undefined
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
    const threshold = next === 'pinch' || next === 'grab'
      ? 2
      : this.current === 'palm'
        ? 3
        : this.current === 'pinch'
          ? 2
          : next === 'palm'
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

export function indexForwardDepth(landmarks: Point3[]) {
  if (landmarks.length < 21) return 0
  const palmScale = Math.max(distance(landmarks[0], landmarks[9]), 0.025)
  return (landmarks[5].z - landmarks[8].z) / palmScale
}

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
  // A real open hand often loses one fingertip to foreshortening. Requiring all
  // four fingers made palm navigation flicker to idle whenever the hand tilted.
  if (extended >= 3) return 'palm'

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

export function palmMotionVector(
  previous: { x: number; y: number },
  point: { x: number; y: number },
) {
  return { x: point.x - previous.x, y: point.y - previous.y }
}
