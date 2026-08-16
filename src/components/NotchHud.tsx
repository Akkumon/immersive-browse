import { useEffect, useRef } from 'react'
import type { Gesture } from '../lib/gestures'

type Props = {
  point: { x: number; y: number }
  gesture: Gesture
  activationCandidate: boolean
  activation: boolean
}

export function NotchHud({ point, gesture, activationCandidate, activation }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trail = useRef<{ x: number; y: number; active: boolean }[]>([])

  useEffect(() => {
    trail.current.push({ x: point.x, y: point.y, active: gesture === 'grab' || gesture === 'palm' || activationCandidate || activation })
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
      const previous = trail.current[index - 1]
      if (previous) {
        context.beginPath()
        context.moveTo(16 + previous.x * (width - 32), 8 + previous.y * (height - 16))
        context.lineTo(x, y)
        context.lineWidth = 1.2 + alpha * 1.8
        context.lineCap = 'round'
        context.strokeStyle = sample.active ? `rgba(229,9,20,${alpha})` : `rgba(80,235,155,${alpha})`
        context.stroke()
      }
      if (index === trail.current.length - 1) {
        context.beginPath()
        context.arc(x, y, 2.2, 0, Math.PI * 2)
        context.fillStyle = sample.active ? '#e50914' : '#50eb9b'
        context.fill()
      }
    })
  }, [activation, activationCandidate, gesture, point])

  return (
    <div className="notch-hud" aria-label="Interaction trail">
      <canvas ref={canvasRef} width={160} height={30} aria-hidden="true" />
    </div>
  )
}
