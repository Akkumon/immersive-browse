import { describe, expect, it } from 'vitest'
import { classifyGesture, GestureStabilizer, palmSwipeVector, landmarkToNdc, type Point3 } from './gestures'
import { wrap } from './physics'

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

  it('separates an open palm from a closed fist', () => {
    expect(classifyGesture(posedHand('open'))).toBe('palm')
    const fist = posedHand('fist')
    fist[4] = { x: 0.42, y: 0.71, z: 0 }
    expect(classifyGesture(fist)).toBe('grab')
  })

  it('wraps spatial coordinates around the catalog field', () => {
    expect(wrap(12, 20)).toBe(-8)
    expect(wrap(-12, 20)).toBe(8)
  })

  it('accepts intentional palm pushes in every direction', () => {
    const origin = { x: 0, y: 0 }
    expect(palmSwipeVector(origin, { x: 0.2, y: 0 }, 240)).toEqual({ x: 0.2, y: 0 })
    expect(palmSwipeVector(origin, { x: 0, y: -0.2 }, 240)).toEqual({ x: 0, y: -0.2 })
    expect(palmSwipeVector(origin, { x: -0.16, y: 0.16 }, 240)).toEqual({ x: -0.16, y: 0.16 })
    expect(palmSwipeVector(origin, { x: 0.12, y: 0.05 }, 240)).toEqual({ x: 0, y: 0 })
    expect(palmSwipeVector(origin, { x: 0.2, y: 0 }, 600)).toEqual({ x: 0, y: 0 })
  })

  it('stabilizes active gestures without delaying point feedback', () => {
    const stabilizer = new GestureStabilizer()
    expect(stabilizer.update('point')).toBe('point')
    expect(stabilizer.update('pinch')).toBe('point')
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
})
