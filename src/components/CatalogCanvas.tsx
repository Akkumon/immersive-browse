import { useEffect, useRef } from 'react'
import { CatalogEngine } from '../engine/CatalogEngine'
import type { Show } from '../data/catalog'
import { catalog } from '../data/catalog'
import type { Gesture } from '../lib/gestures'
import type { LiquidSound } from '../lib/sound'

type HandInput = { point: { x: number; y: number }; gesture: Gesture; visible: boolean; pinchCandidate: boolean }

export function CatalogCanvas({
  sound,
  hand,
  onSelect,
  onTrackingPoint,
  onRenderer,
}: {
  sound: LiquidSound
  hand: HandInput
  onSelect: (show: Show) => void
  onTrackingPoint: (point: { x: number; y: number }, active: boolean) => void
  onRenderer: (label: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<CatalogEngine | undefined>(undefined)

  useEffect(() => {
    const canvas = canvasRef.current!
    const engine = new CatalogEngine(canvas, catalog, { onSelect, onTrackingPoint, onRenderer }, sound)
    engineRef.current = engine
    void engine.init().catch((error) => {
      console.error('Catalog renderer failed to initialize', error)
      engine.dispose()
      onRenderer('Renderer unavailable')
    })
    return () => engine.dispose()
  }, [onRenderer, onSelect, onTrackingPoint, sound])

  useEffect(() => {
    engineRef.current?.updateHand(hand.point, hand.gesture, hand.visible, hand.pinchCandidate)
  }, [hand])

  return <canvas ref={canvasRef} className="catalog-canvas" tabIndex={0} aria-label="Interactive show catalog. Drag or use arrow keys to browse; click or press Enter for details." />
}
