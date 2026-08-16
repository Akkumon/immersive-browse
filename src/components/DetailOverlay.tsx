import { Check, Heart, Play, Plus, X } from '@phosphor-icons/react'
import type { Show } from '../data/catalog'
import { useDialogFocus } from '../lib/useDialogFocus'

type Props = {
  show: Show
  liked: boolean
  listed: boolean
  onClose: () => void
  onPlay: () => void
  onLike: () => void
  onList: () => void
}

export function DetailOverlay({ show, liked, listed, onClose, onPlay, onLike, onList }: Props) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose)

  return (
    <div className="overlay-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="detail-overlay" role="dialog" aria-modal="true" aria-label={`${show.title} details`}>
        <div className="detail-art">
          <img className="detail-artwork" src={show.image} alt="" decoding="async" />
          <div className="detail-sheen" aria-hidden="true" />
          <button className="icon-button close-button" onClick={onClose} aria-label="Close details"><X weight="bold" /></button>
          <div className="detail-heading">
            <span className="netflix-series">N SERIES</span>
            <h2>{show.title}</h2>
            <div className="detail-actions">
              <button className="play-button" data-spatial-action onClick={onPlay}><Play weight="fill" /> Play</button>
              <button className={`icon-button ${listed ? 'is-active' : ''}`} data-spatial-action onClick={onList} aria-label={listed ? 'Remove from watchlist' : 'Add to watchlist'} title="Watchlist">
                {listed ? <Check weight="bold" /> : <Plus weight="bold" />}
              </button>
              <button className={`icon-button ${liked ? 'is-active' : ''}`} data-spatial-action onClick={onLike} aria-label={liked ? 'Unlike' : 'Like'} title="Like">
                <Heart weight={liked ? 'fill' : 'bold'} />
              </button>
            </div>
          </div>
        </div>
        <div className="detail-copy">
          <div className="detail-meta">
            <span className="match">98% Match</span><span>{show.year}</span><span>{show.runtime}</span><span className="rating">{show.rating}</span><span>HD</span>
          </div>
          <div className="detail-grid">
            <p>{show.description}</p>
            <dl><div><dt>Genres</dt><dd>{show.genres}</dd></div><div><dt>This show is</dt><dd>Immersive · Bold · Gripping</dd></div></dl>
          </div>
        </div>
      </section>
    </div>
  )
}
