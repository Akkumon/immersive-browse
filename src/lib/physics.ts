export type Spring = { value: number; velocity: number; target: number }

export function stepSpring(spring: Spring, dt: number, stiffness = 260, damping = 30) {
  const safeDt = Math.min(dt, 1 / 20)
  const acceleration = (spring.target - spring.value) * stiffness - spring.velocity * damping
  spring.velocity += acceleration * safeDt
  spring.value += spring.velocity * safeDt
  if (Math.abs(spring.target - spring.value) < 0.0001 && Math.abs(spring.velocity) < 0.0001) {
    spring.value = spring.target
    spring.velocity = 0
  }
  return spring.value
}

export function wrap(value: number, range: number) {
  return ((value + range / 2) % range + range) % range - range / 2
}

export function dampVelocity(value: number, drag: number, dt: number) {
  return value * Math.exp(-drag * dt)
}
