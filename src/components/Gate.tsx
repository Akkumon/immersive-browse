import { LiquidMetal } from '@paper-design/shaders-react'
import GradientBlinds from './GradientBlinds/GradientBlinds'

const gateColors = ['#000000', '#070707', '#3b0308', '#e50914', '#160104', '#000000']

export function Gate({ onStart, error, busy = false }: { onStart: () => void; error?: string; busy?: boolean }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <main className="gate">
      <GradientBlinds
        className="gate-blinds"
        dpr={1.25}
        paused={reducedMotion}
        gradientColors={gateColors}
        angle={-18}
        noise={0.08}
        blindCount={14}
        blindMinWidth={72}
        mouseDampening={0.22}
        mirrorGradient
        spotlightRadius={0.72}
        spotlightSoftness={1.65}
        spotlightOpacity={0.48}
        distortAmount={0.65}
        shineDirection="left"
        mixBlendMode="normal"
      />
      <div className="gate-shade" aria-hidden="true" />
      <section className="gate-content">
        <h1>Find your binge</h1>
        <div className="start-button-frame">
          <button className="start-button" onClick={onStart} disabled={busy} aria-busy={busy}>
            <span className="start-button-metal" aria-hidden="true">
              <LiquidMetal
                speed={1}
                softness={0.1}
                repetition={2}
                shiftRed={0.3}
                shiftBlue={0.3}
                distortion={0.07}
                contour={0.4}
                scale={0.6}
                rotation={0}
                shape="diamond"
                angle={70}
                colorBack="#00000000"
                colorTint="#FFFFFF"
                style={{ height: '600px', width: '800px' }}
              />
            </span>
            <span className="start-button-fill" aria-hidden="true" />
            <span className="start-button-label">Find Now</span>
          </button>
          <span className="start-button-corners" aria-hidden="true">
            <i className="start-button-corner is-top-left" />
            <i className="start-button-corner is-top-right" />
            <i className="start-button-corner is-bottom-right" />
            <i className="start-button-corner is-bottom-left" />
          </span>
        </div>
        {error && <p className="gate-error">{error}</p>}
      </section>
    </main>
  )
}
