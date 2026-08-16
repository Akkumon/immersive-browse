import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowsOut, ChatText, Flag, Pause, Play, Screencast, SpeakerHigh } from '@phosphor-icons/react'
import type { Show } from '../data/catalog'
import { useDialogFocus } from '../lib/useDialogFocus'

export function StaticPlayer({ show, onClose }: { show: Show; onClose: () => void }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(18)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setProgress((value) => (value + 0.18) % 100), 1000)
    return () => clearInterval(timer)
  }, [playing])

  const dialogRef = useDialogFocus<HTMLElement>(onClose)

  return (
    <section ref={dialogRef} className="static-player" role="dialog" aria-modal="true" aria-label={`${show.title} player`}>
      <div className="player-image" style={{ backgroundImage: `url(${show.image})` }} />
      <div className="player-vignette" aria-hidden="true" />
      <button className="player-back" data-spatial-action onClick={onClose} aria-label="Back"><ArrowLeft weight="bold" /></button>
      <div className="player-title"><strong>{show.title}</strong><span>Static preview</span></div>
      <div className="player-controls">
        <input aria-label="Playback position" type="range" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} style={{ '--progress': `${progress}%` } as React.CSSProperties} />
        <div className="player-control-row">
          <div className="player-control-group">
            <button onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</button>
            <button onClick={() => setProgress((value) => Math.max(0, value - 10))} aria-label="Back 10 seconds"><span className="ten">10</span></button>
            <button onClick={() => setProgress((value) => Math.min(100, value + 10))} aria-label="Forward 10 seconds"><span className="ten">10</span></button>
            <button aria-label="Volume"><SpeakerHigh weight="fill" /></button>
          </div>
          <div className="episode-label">{show.title} <span>Preview</span></div>
          <div className="player-control-group player-secondary">
            <button aria-label="Next"><Play weight="fill" /></button><button aria-label="Cast"><Screencast /></button><button aria-label="Subtitles"><ChatText /></button><button aria-label="Report"><Flag /></button><button aria-label="Fullscreen"><ArrowsOut /></button>
          </div>
        </div>
      </div>
    </section>
  )
}
