import { describe, expect, it } from 'vitest'
import { AdaptivePointFilter, classifyGesture, FistShuffleRecognizer, fistShuffleVector, GestureStabilizer, HandSelectionIntent, IndexAirTapRecognizer, ModalFistCloseRecognizer, palmMotionVector, landmarkToNdc, type Point3 } from './gestures'
import { smoothFollow, wrap } from './physics'

const hand = Array.from({ length: 21 }, (): Point3 => ({ x: 0.5, y: 0.5, z: 0 }))

const posedHand = (pose: 'open' | 'fist') => {
  const points = hand.map((point) => ({ ...point }))
  points[0] = { x: 0.5, y: 0.9, z: 0 }
  points[9] = { x: 0.5, y: 0.65, z: 0 }
  const fingers = [[6, 8, 0.43], [10, 12, 0.49], [14, 16, 0.55], [18, 20, 0.61]]
  for (const [pip, tip, x] of fingers) {
    points[pip] = { x, y: 0.63, z: 0 }
    points[tip] = { x, y: pose === 'open' ? 0.3 : 0.72, z: 0 }
  }
  points[4] = { x: 0.32, y: 0.62, z: 0 }
  return points
}

describe('gesture utilities', () => {
  it('maps mirrored camera coordinates into NDC', () => {
    expect(landmarkToNdc({ x: 0.2, y: 0.25, z: 0 })).toEqual({ x: 0.6000000000000001, y: 0.5 })
  })

  it('recognises a thumb-index pinch', () => {
    const points = posedHand('open')
    points[4] = { x: 0.43, y: 0.3, z: 0 }
    points[8] = { x: 0.44, y: 0.3, z: 0 }
    expect(classifyGesture(points)).toBe('pinch')
  })

  it('recognises an index-thumb tap with the remaining fingers curled', () => {
    const points = posedHand('fist')
    points[4] = { x: 0.44, y: 0.48, z: 0 }
    points[8] = { x: 0.45, y: 0.48, z: 0 }
    expect(classifyGesture(points)).toBe('pinch')
  })

  it('separates an open palm from a closed fist', () => {
    expect(classifyGesture(posedHand('open'))).toBe('palm')
    const fist = posedHand('fist')
    fist[4] = { x: 0.42, y: 0.71, z: 0 }
    expect(classifyGesture(fist)).toBe('grab')
  })

  it('keeps a tilted palm active when one fingertip is foreshortened', () => {
    const palm = posedHand('open')
    palm[20] = { x: palm[20].x, y: 0.67, z: 0 }
    expect(classifyGesture(palm)).toBe('palm')
  })

  it('wraps spatial coordinates around the catalog field', () => {
    expect(wrap(12, 20)).toBe(-8)
    expect(wrap(-12, 20)).toBe(8)
  })

  it('returns every palm movement sample in every direction without a swipe gate', () => {
    const origin = { x: 0, y: 0 }
    expect(palmMotionVector(origin, { x: 0.2, y: 0 })).toEqual({ x: 0.2, y: 0 })
    expect(palmMotionVector(origin, { x: 0, y: -0.2 })).toEqual({ x: 0, y: -0.2 })
    expect(palmMotionVector(origin, { x: -0.16, y: 0.16 })).toEqual({ x: -0.16, y: 0.16 })
    expect(palmMotionVector(origin, { x: 0.03, y: 0.01 })).toEqual({ x: 0.03, y: 0.01 })
    expect(palmMotionVector(origin, { x: 0.02, y: 0 })).toEqual({ x: 0.02, y: 0 })
  })

  it('stabilizes active gestures without delaying point feedback', () => {
    const stabilizer = new GestureStabilizer()
    expect(stabilizer.update('point')).toBe('point')
    expect(stabilizer.update('pinch')).toBe('point')
    expect(stabilizer.update('pinch')).toBe('pinch')
    expect(stabilizer.update('grab')).toBe('pinch')
    expect(stabilizer.update('pinch')).toBe('pinch')
  })

  it('does not re-arm a palm wave from a one-frame classification wobble', () => {
    const stabilizer = new GestureStabilizer()
    expect(stabilizer.update('palm')).toBe('idle')
    expect(stabilizer.update('palm')).toBe('palm')
    expect(stabilizer.update('point')).toBe('palm')
    expect(stabilizer.update('palm')).toBe('palm')
  })

  it('accepts an intentional fist after two raw samples without another dwell', () => {
    const stabilizer = new GestureStabilizer()
    stabilizer.update('palm')
    stabilizer.update('palm')
    expect(stabilizer.update('grab')).toBe('palm')
    expect(stabilizer.update('grab')).toBe('grab')
  })

  it('locks targeting during a forward air tap and commits the locked card', () => {
    const intent = new HandSelectionIntent()
    expect(intent.update('point', false)).toEqual({ trackTarget: true, select: false, armed: false })
    intent.update('point', false)
    intent.update('point', false)
    expect(intent.update('point', false)).toEqual({ trackTarget: true, select: false, armed: true })
    expect(intent.update('point', false, true)).toEqual({ trackTarget: false, select: false, armed: true })
    expect(intent.update('point', false, true, true)).toEqual({ trackTarget: false, select: true, armed: false })
  })

  it('never selects from palm navigation or while the catalog is moving', () => {
    const intent = new HandSelectionIntent()
    intent.update('palm', true)
    expect(intent.update('point', false, true, true).select).toBe(false)
    expect(intent.update('point', true)).toEqual({ trackTarget: false, select: false, armed: false })
    expect(intent.update('point', true, true, true).select).toBe(false)
  })

  it('recognises one deliberate forward index tap and requires retraction', () => {
    const tap = new IndexAirTapRecognizer()
    for (let frame = 0; frame < 4; frame++) expect(tap.update('point', 0)).toEqual({ candidate: false, commit: false })
    expect(tap.update('point', 0.08)).toEqual({ candidate: true, commit: false })
    expect(tap.update('point', 0.17)).toEqual({ candidate: true, commit: true })
    expect(tap.update('point', 0.2)).toEqual({ candidate: true, commit: false })
    tap.update('point', 0.02)
    tap.update('point', 0.02)
    expect(tap.update('point', 0.1)).toEqual({ candidate: true, commit: false })
  })

  it('cancels air-tap calibration when the hand stops pointing', () => {
    const tap = new IndexAirTapRecognizer()
    for (let frame = 0; frame < 4; frame++) tap.update('point', 0)
    expect(tap.update('palm', 0.3)).toEqual({ candidate: false, commit: false })
    expect(tap.update('point', 0.3)).toEqual({ candidate: false, commit: false })
  })

  it('releases a half-pressed air tap when the pointing finger moves laterally', () => {
    const tap = new IndexAirTapRecognizer()
    for (let frame = 0; frame < 4; frame++) tap.update('point', 0, { x: 0, y: 0 })
    expect(tap.update('point', 0.08, { x: 0.01, y: 0 })).toEqual({ candidate: true, commit: false })
    expect(tap.update('point', 0.1, { x: 0.12, y: 0 })).toEqual({ candidate: false, commit: false })
  })

  it('times out a stalled air tap so pointing can resume', () => {
    const tap = new IndexAirTapRecognizer()
    for (let frame = 0; frame < 4; frame++) tap.update('point', 0, { x: 0, y: 0 })
    expect(tap.update('point', 0.08, { x: 0, y: 0 }).candidate).toBe(true)
    let decision = { candidate: true, commit: false }
    for (let frame = 0; frame < 8; frame++) decision = tap.update('point', 0.1, { x: 0, y: 0 })
    expect(decision).toEqual({ candidate: false, commit: false })
  })

  it('filters resting point jitter but follows deliberate movement promptly', () => {
    const filter = new AdaptivePointFilter()
    expect(filter.update({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    const jitter = filter.update({ x: 0.004, y: -0.003 })
    expect(Math.abs(jitter.x)).toBeLessThan(0.004)
    const moved = filter.update({ x: 0.3, y: 0.2 })
    expect(moved.x).toBeGreaterThan(0.25)
    expect(moved.y).toBeGreaterThan(0.16)
  })

  it('fires one fist shuffle per closed-fist hold and rearms after release', () => {
    const shuffle = new FistShuffleRecognizer()
    expect(shuffle.update('grab')).toBe(true)
    expect(shuffle.update('grab')).toBe(false)
    shuffle.update('palm')
    expect(shuffle.update('grab')).toBe(true)
  })

  it('produces a strong, changing viewport throw for each fist shuffle', () => {
    const first = fistShuffleVector(0, 20, 15)
    const second = fistShuffleVector(1, 20, 15)
    expect(Math.hypot(first.x, first.y)).toBeCloseTo(48)
    expect(second).not.toEqual(first)
  })

  it('fills display frames between palm samples without overshooting', () => {
    let current = 0
    const target = 1
    const frames: number[] = []
    for (let frame = 0; frame < 4; frame++) {
      current = smoothFollow(current, target, 1 / 60, 30)
      frames.push(current)
    }
    expect(frames[0]).toBeGreaterThan(0)
    expect(frames[0]).toBeLessThan(1)
    expect(frames).toEqual([...frames].sort((a, b) => a - b))
    expect(frames.at(-1)).toBeLessThanOrEqual(1)
  })

  it('closes a modal only after an open palm deliberately becomes a fist', () => {
    const close = new ModalFistCloseRecognizer()
    expect(close.update('grab', true).commit).toBe(false)
    expect(close.update('palm', true).armed).toBe(false)
    expect(close.update('palm', true).armed).toBe(true)
    expect(close.update('idle', true).armed).toBe(true)
    expect(close.update('grab', true)).toEqual({ armed: false, candidate: false, commit: true })
    expect(close.update('grab', true).commit).toBe(false)
  })

  it('does not retain modal-close intent after the modal is gone', () => {
    const close = new ModalFistCloseRecognizer()
    close.update('palm', true)
    close.update('palm', true)
    expect(close.update('idle', false)).toEqual({ armed: false, candidate: false, commit: false })
    expect(close.update('grab', true).commit).toBe(false)
  })
})
