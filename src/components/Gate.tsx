export function Gate({ onStart, error, busy = false }: { onStart: () => void; error?: string; busy?: boolean }) {
  return (
    <main className="gate">
      <section className="gate-content">
        <h1>Immersive Browse</h1>
        <button className="start-button" onClick={onStart} disabled={busy} aria-busy={busy}>
          Enter Immersive Browse
        </button>
        {error && <p className="gate-error">{error}</p>}
      </section>
    </main>
  )
}
