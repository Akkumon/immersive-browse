import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { CatalogCanvas, type HandInput } from './components/CatalogCanvas'
import { DetailOverlay } from './components/DetailOverlay'
import { Gate } from './components/Gate'
import { NotchHud } from './components/NotchHud'
import { StaticPlayer } from './components/StaticPlayer'
import type { Show } from './data/catalog'
import { HandTracker, type TrackingUpdate } from './hand/HandTracker'
import { ModalFistCloseRecognizer } from './lib/gestures'
import { LiquidSound } from './lib/sound'

type TrackingStatus = 'idle' | 'loading' | 'ready' | 'lost' | 'error'

const readSet = (key: string) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]')
    return new Set<string>(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

export function App() {
  const rendererOnly = new URLSearchParams(location.search).has('qa-renderer-only')
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('reduce-motion')
  const sound = useMemo(() => new LiquidSound(), [])
  const tracker = useRef<HandTracker | undefined>(undefined)
  const startGuard = useRef(false)
  const handVisible = useRef(false)
  const catalogInput = useRef<((update: HandInput) => void) | null>(null)
  const spatialInputBlocked = useRef(false)
  const modalAim = useRef({ x: 0.5, y: 0.12 })
  const spatialTarget = useRef<HTMLElement | undefined>(undefined)
  const modalFistClose = useRef(new ModalFistCloseRecognizer())
  const airTapHandled = useRef(false)
  const surfaceChangedAt = useRef(0)
  const [started, setStarted] = useState(rendererOnly)
  const [starting, setStarting] = useState(false)
  const [gateError, setGateError] = useState('')
  const [selected, setSelected] = useState<Show>()
  const [playing, setPlaying] = useState<Show>()
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('idle')
  const [renderer, setRenderer] = useState('Starting renderer')
  const [handModelReady, setHandModelReady] = useState(false)
  const [trackingMessage, setTrackingMessage] = useState('')
  const [muted, setMuted] = useState(false)
  const [liked, setLiked] = useState(() => readSet('immersive-liked'))
  const [listed, setListed] = useState(() => readSet('immersive-watchlist'))
  const [hand, setHand] = useState<TrackingUpdate>({
    point: { x: 0, y: 0 }, screenPoint: { x: 0.5, y: 0.12 }, gesture: 'idle', visible: false, airTapCandidate: false, airTap: false,
  })

  const handleTracking = useCallback((update: TrackingUpdate) => {
    const blocked = spatialInputBlocked.current || performance.now() - surfaceChangedAt.current < 300
    catalogInput.current?.(blocked
      ? { ...update, visible: false, gesture: 'idle', airTapCandidate: false, airTap: false }
      : update)
    setHand(update)
  }, [])
  const handleTrackingStatus = useCallback((status: 'loading' | 'ready' | 'lost' | 'error', message?: string) => {
    setTrackingStatus(status)
    if (message) setTrackingMessage(message)
    if (message === 'Hand model ready') setHandModelReady(true)
  }, [])

  const start = async () => {
    if (startGuard.current) return
    startGuard.current = true
    setStarting(true)
    setGateError('')
    try {
      await sound.enable()
      if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => undefined)
      setStarted(true)
      const handTracker = new HandTracker(handleTracking, handleTrackingStatus)
      tracker.current = handTracker
      await handTracker.start()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Camera was unavailable'
      tracker.current?.dispose()
      tracker.current = undefined
      setStarted(true)
      setTrackingStatus('error')
      setTrackingMessage(message)
      setGateError(`${message}. Pointer controls are still available.`)
    } finally {
      startGuard.current = false
      setStarting(false)
    }
  }

  useEffect(() => () => tracker.current?.dispose(), [])

  const choose = useCallback((show: Show) => {
    surfaceChangedAt.current = performance.now()
    spatialInputBlocked.current = true
    sound.bloom()
    setSelected(show)
  }, [sound])
  useEffect(() => { handVisible.current = hand.visible }, [hand.visible])
  spatialInputBlocked.current = Boolean(selected || playing)

  const trackPointer = useCallback((point: { x: number; y: number }, active: boolean) => {
    if (handVisible.current) return
    setHand((current) => ({ ...current, screenPoint: point, gesture: active ? 'grab' : 'point', airTapCandidate: false, airTap: false }))
  }, [])

  useEffect(() => {
    spatialTarget.current?.removeAttribute('data-spatial-target')
    spatialTarget.current = undefined

    if ((!selected && !playing) || !hand.visible) {
      if (!hand.airTap) airTapHandled.current = false
      return
    }
    if (hand.gesture === 'point' && !hand.airTapCandidate) modalAim.current = hand.screenPoint
    if (hand.gesture !== 'point') {
      if (!hand.airTap) airTapHandled.current = false
      return
    }

    const x = modalAim.current.x * window.innerWidth
    const y = modalAim.current.y * window.innerHeight
    const target = document.elementsFromPoint(x, y)
      .map((element) => element.closest<HTMLElement>('[data-spatial-action]'))
      .find((element): element is HTMLElement => Boolean(element))
    if (target) {
      target.setAttribute('data-spatial-target', 'true')
      spatialTarget.current = target
    }

    if (!hand.airTap) {
      airTapHandled.current = false
    } else if (!airTapHandled.current) {
      airTapHandled.current = true
      if (target && performance.now() - surfaceChangedAt.current > 350) target.click()
    }

    return () => target?.removeAttribute('data-spatial-target')
  }, [hand, playing, selected])

  useEffect(() => {
    const modalOpen = Boolean(selected && !playing)
    const decision = modalFistClose.current.update(hand.gesture, modalOpen && hand.visible)
    if (decision.commit) {
      surfaceChangedAt.current = performance.now()
      spatialInputBlocked.current = false
      sound.confirm()
      setSelected(undefined)
    }
  // Consume every tracker sample: the recognizer's palm/fist stability counts
  // consecutive samples even when the public gesture label stays unchanged.
  }, [hand, playing, selected, sound])

  const toggleStored = (key: string, id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem(key, JSON.stringify([...next]))
      return next
    })
    sound.confirm()
  }

  if (!started) return <Gate onStart={start} error={gateError} busy={starting} />

  return (
    <main
      className="experience"
      data-tracking-status={trackingStatus}
      data-tracking-message={trackingMessage}
      data-hand-model={handModelReady ? 'ready' : 'pending'}
      data-renderer={renderer}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <CatalogCanvas sound={sound} inputRef={catalogInput} onSelect={choose} onTrackingPoint={trackPointer} onRenderer={setRenderer} />
      <NotchHud point={hand.screenPoint} gesture={hand.gesture} activationCandidate={hand.airTapCandidate} activation={hand.airTap} />
      <div className="brand-corner" aria-label="Netflix Immersive Browse"><span>N</span><small>IMMERSIVE BROWSE</small></div>
      <button className="sound-toggle" onClick={() => { sound.setMuted(!muted); setMuted(!muted) }} aria-label={muted ? 'Turn sound on' : 'Mute interaction sounds'}>
        {muted ? <SpeakerSlash /> : <SpeakerHigh />}
      </button>
      {selected && !playing && (
        <DetailOverlay
          show={selected}
          liked={liked.has(selected.id)}
          listed={listed.has(selected.id)}
          onClose={() => setSelected(undefined)}
          onPlay={() => { surfaceChangedAt.current = performance.now(); sound.select(); setPlaying(selected) }}
          onLike={() => toggleStored('immersive-liked', selected.id, setLiked)}
          onList={() => toggleStored('immersive-watchlist', selected.id, setListed)}
        />
      )}
      {playing && <StaticPlayer show={playing} onClose={() => setPlaying(undefined)} />}
    </main>
  )
}
