import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { CatalogCanvas } from './components/CatalogCanvas'
import { DetailOverlay } from './components/DetailOverlay'
import { Gate } from './components/Gate'
import { NotchHud } from './components/NotchHud'
import { StaticPlayer } from './components/StaticPlayer'
import type { Show } from './data/catalog'
import { HandTracker, type TrackingUpdate } from './hand/HandTracker'
import type { Gesture } from './lib/gestures'
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
  const [hand, setHand] = useState<{ point: { x: number; y: number }; screenPoint: { x: number; y: number }; gesture: Gesture; visible: boolean }>({
    point: { x: 0, y: 0 }, screenPoint: { x: 0.5, y: 0.12 }, gesture: 'idle', visible: false,
  })

  const handleTracking = useCallback((update: TrackingUpdate) => setHand(update), [])
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
    sound.bloom()
    setSelected(show)
  }, [sound])
  useEffect(() => { handVisible.current = hand.visible }, [hand.visible])

  const trackPointer = useCallback((point: { x: number; y: number }, active: boolean) => {
    if (handVisible.current) return
    setHand((current) => ({ ...current, screenPoint: point, gesture: active ? 'grab' : 'point' }))
  }, [])

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

  const spatialHand = selected || playing ? { ...hand, visible: false, gesture: 'idle' as const } : hand

  return (
    <main
      className="experience"
      data-tracking-status={trackingStatus}
      data-tracking-message={trackingMessage}
      data-hand-model={handModelReady ? 'ready' : 'pending'}
      data-renderer={renderer}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <CatalogCanvas sound={sound} hand={spatialHand} onSelect={choose} onTrackingPoint={trackPointer} onRenderer={setRenderer} />
      <NotchHud point={hand.screenPoint} gesture={hand.gesture} />
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
          onPlay={() => { sound.select(); setPlaying(selected) }}
          onLike={() => toggleStored('immersive-liked', selected.id, setLiked)}
          onList={() => toggleStored('immersive-watchlist', selected.id, setListed)}
        />
      )}
      {playing && <StaticPlayer show={playing} onClose={() => setPlaying(undefined)} />}
    </main>
  )
}
