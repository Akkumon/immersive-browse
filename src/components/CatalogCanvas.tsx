import { useEffect, useRef, type MutableRefObject } from 'react'
import { CatalogEngine } from '../engine/CatalogEngine'
import type { Show } from '../data/catalog'
import { catalog } from '../data/catalog'
import type { Gesture } from '../lib/gestures'
import type { LiquidSound } from '../lib/sound'

export type HandInput = { point: { x: number; y: number }; gesture: Gesture; visible: boolean; airTapCandidate: boolean; airTap: boolean }

export function CatalogCanvas({
  sound,
  inputRef,
  onSelect,
  onTrackingPoint,
  onRenderer,
}: {
  sound: LiquidSound
  inputRef: MutableRefObject<((hand: HandInput) => void) | null>
  onSelect: (show: Show) => void
  onTrackingPoint: (point: { x: number; y: number }, active: boolean) => void
  onRenderer: (label: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const engine = new CatalogEngine(canvas, catalog, { onSelect, onTrackingPoint, onRenderer }, sound)
    const updateHand = (hand: HandInput) => engine.updateHand(hand.point, hand.gesture, hand.visible, hand.airTapCandidate, hand.airTap)
    inputRef.current = updateHand
    void engine.init().catch((error) => {
      console.error('Catalog renderer failed to initialize', error)
      engine.dispose()
      onRenderer('Renderer unavailable')
    })
    return () => {
      if (inputRef.current === updateHand) inputRef.current = null
      engine.dispose()
    }
  }, [inputRef, onRenderer, onSelect, onTrackingPoint, sound])

  return <canvas ref={canvasRef} className="catalog-canvas" tabIndex={0} aria-label="Interactive show catalog. Drag or use arrow keys to browse; click or press Enter for details." />
}
