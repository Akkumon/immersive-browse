export class LiquidSound {
  private context?: AudioContext
  private output?: GainNode
  muted = false

  async enable() {
    this.context ??= new AudioContext()
    if (!this.output) {
      this.output = this.context.createGain()
      this.output.gain.value = 0.16
      this.output.connect(this.context.destination)
    }
    await this.context.resume()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    this.output?.gain.setTargetAtTime(muted ? 0 : 0.16, this.context?.currentTime ?? 0, 0.025)
  }

  private tone(frequency: number, duration: number, gain: number, slide = 0) {
    if (!this.context || !this.output || this.muted) return
    const now = this.context.currentTime
    const osc = this.context.createOscillator()
    const amp = this.context.createGain()
    const filter = this.context.createBiquadFilter()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency, now)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration)
    filter.type = 'bandpass'
    filter.frequency.value = frequency * 1.7
    filter.Q.value = 2.8
    amp.gain.setValueAtTime(0.0001, now)
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.012)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(filter).connect(amp).connect(this.output)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  focus(intensity = 1) { this.tone(820 + intensity * 100, 0.11, 0.05, 130) }
  select() { this.tone(1120, 0.16, 0.085, -320) }
  bloom() { this.tone(340, 0.45, 0.075, 440) }
  confirm() { this.tone(680, 0.24, 0.06, 520) }
  move(speed: number) {
    if (speed < 0.25) return
    this.tone(180 + Math.min(speed, 5) * 42, 0.08, Math.min(0.025, speed * 0.004), 35)
  }
}
