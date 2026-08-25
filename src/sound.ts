type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

class SoundEngine {
  private context: AudioContext | null = null
  private lastCrumpleAt = 0
  private lastBounceAt = 0

  private getContext() {
    if (this.context) return this.context
    const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext
    if (!AudioContextClass) return null
    this.context = new AudioContextClass()
    return this.context
  }

  private noise(duration: number, volume: number, frequency: number) {
    const context = this.getContext()
    if (!context) return
    void context.resume()

    const frameCount = Math.ceil(context.sampleRate * duration)
    const buffer = context.createBuffer(1, frameCount, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = Math.pow(1 - index / frameCount, 1.8)
      data[index] = (Math.random() * 2 - 1) * envelope
    }

    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = 0.7
    gain.gain.value = volume
    source.buffer = buffer
    source.connect(filter).connect(gain).connect(context.destination)
    source.start()
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine') {
    const context = this.getContext()
    if (!context) return
    void context.resume()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.72), now + duration)
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + duration)
  }

  appear() {
    this.tone(360, 0.42, 0.035)
    window.setTimeout(() => this.tone(540, 0.34, 0.022), 80)
  }

  pickUp() {
    this.tone(480, 0.08, 0.025, 'triangle')
  }

  stamp() {
    this.noise(0.11, 0.12, 920)
    this.tone(118, 0.18, 0.1, 'triangle')
  }

  crumple(intensity = 1) {
    const now = performance.now()
    if (now - this.lastCrumpleAt < 58) return
    this.lastCrumpleAt = now
    this.noise(0.075, 0.025 + intensity * 0.035, 1800 + intensity * 900)
  }

  shred() {
    this.noise(0.72, 0.075, 1300)
    this.tone(92, 0.66, 0.045, 'sawtooth')
  }

  release() {
    this.tone(392, 0.52, 0.03)
    window.setTimeout(() => this.tone(587, 0.66, 0.025), 100)
  }

  bounce(intensity: number) {
    const now = performance.now()
    if (now - this.lastBounceAt < 70) return
    this.lastBounceAt = now
    this.tone(170 + intensity * 260, 0.08, 0.012 + intensity * 0.035, 'sine')
  }

  paper() {
    this.noise(0.14, 0.038, 2400)
    this.tone(510, 0.08, 0.012, 'triangle')
  }

  magnet() {
    this.tone(210, 0.22, 0.035, 'sine')
    window.setTimeout(() => this.tone(420, 0.18, 0.024, 'triangle'), 55)
  }

  launch(material: 'steel' | 'rubber' | 'glass' | 'gravity') {
    const frequencies = { steel: 360, rubber: 130, glass: 680, gravity: 76 }
    const types: Record<typeof material, OscillatorType> = {
      steel: 'sine', rubber: 'triangle', glass: 'sine', gravity: 'sawtooth',
    }
    this.tone(frequencies[material], material === 'gravity' ? 0.26 : 0.14, 0.028, types[material])
    if (material === 'rubber') this.noise(0.06, 0.014, 420)
  }

  materialImpact(material: 'steel' | 'rubber' | 'glass' | 'gravity', intensity: number) {
    const normalized = Math.max(0.08, Math.min(1, intensity))
    if (material === 'steel') {
      this.tone(310 + normalized * 280, 0.1, 0.018 + normalized * 0.045, 'sine')
      return
    }
    if (material === 'rubber') {
      this.tone(92 + normalized * 70, 0.12, 0.024 + normalized * 0.045, 'triangle')
      this.noise(0.055, 0.008 + normalized * 0.018, 360)
      return
    }
    if (material === 'glass') {
      this.tone(720 + normalized * 560, 0.18, 0.015 + normalized * 0.04, 'sine')
      window.setTimeout(() => this.tone(1080 + normalized * 360, 0.12, 0.012, 'sine'), 28)
      return
    }
    this.tone(54 + normalized * 46, 0.3, 0.045 + normalized * 0.075, 'sawtooth')
    this.noise(0.1, 0.012 + normalized * 0.026, 180)
  }

  glassNote(radius: number, intensity: number) {
    const normalized = Math.max(0.08, Math.min(1, intensity))
    const frequency = Math.max(460, Math.min(1180, 1320 - radius * 24))
    this.tone(frequency, 0.24, 0.014 + normalized * 0.042, 'sine')
    window.setTimeout(() => this.tone(frequency * 1.5, 0.16, 0.009 + normalized * 0.014, 'sine'), 34)
  }
}

export const soundEngine = new SoundEngine()
