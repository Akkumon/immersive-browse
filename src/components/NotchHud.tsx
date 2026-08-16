import { useEffect, useRef } from 'react'
import type { Gesture } from '../lib/gestures'

type Props = {
  point: { x: number; y: number }
  gesture: Gesture
}

export function NotchHud({ point, gesture }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trail = useRef<{ x: number; y: number; active: boolean }[]>([])

  useEffect(() => {
    trail.current.push({ x: point.x, y: point.y, active: gesture === 'grab' || gesture === 'pinch' })
    trail.current = trail.current.slice(-18)
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')!
    const { width, height } = canvas
    context.clearRect(0, 0, width, height)
    trail.current.forEach((sample, index) => {
      const alpha = (index + 1) / trail.current.length
      const x = 16 + sample.x * (width - 32)
      const y = 8 + sample.y * (height - 16)
      context.beginPath()
      context.arc(x, y, 1.5 + alpha * 2.2, 0, Math.PI * 2)
      context.fillStyle = sample.active ? `rgba(229,9,20,${alpha})` : `rgba(80,235,155,${alpha})`
      context.fill()
    })
  }, [gesture, point])

  return (
    <div className="notch-hud" aria-label="Interaction trail">
      <canvas ref={canvasRef} width={160} height={30} aria-hidden="true" />
    </div>
  )
}
