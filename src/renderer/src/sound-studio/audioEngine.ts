/**
 * Sound Studio Audio Engine
 * Manages Web Audio API playback, sample loading, synth generation, and WAV export.
 */

import type { NoteClip, SoundTrack, SynthPreset, ClipEffects } from '../store/soundStudioStore'
import { BUILT_IN_INSTRUMENTS } from '../store/soundStudioStore'

// ─── Note frequency table ──────────────────────────────────────────────────────

const NOTE_FREQUENCIES: Record<string, number> = {}
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
for (let octave = 0; octave <= 8; octave++) {
  NOTE_NAMES.forEach((note, i) => {
    const midi = octave * 12 + i + 12
    NOTE_FREQUENCIES[`${note}${octave}`] = 440 * Math.pow(2, (midi - 69) / 12)
  })
}

// ─── Sample paths (drum kit) ──────────────────────────────────────────────────

const DRUM_SAMPLE_PATHS: Record<string, string> = {
  'drum-kick': '/samples/drums/kick.wav',
  'drum-snare': '/samples/drums/snare.wav',
  'drum-hihat-closed': '/samples/drums/hihat-closed.wav',
  'drum-hihat-open': '/samples/drums/hihat-open.wav',
  'drum-crash': '/samples/drums/crash.wav',
  'drum-ride': '/samples/drums/ride.wav',
  'drum-tom-high': '/samples/drums/tom-high.wav',
  'drum-tom-mid': '/samples/drums/tom-mid.wav',
  'drum-tom-floor': '/samples/drums/tom-floor.wav',
  'drum-cowbell': '/samples/drums/cowbell.wav'
}

// ─── Engine Class ─────────────────────────────────────────────────────────────

export class AudioEngine {
  private ctx: AudioContext | null = null
  private sampleCache: Map<string, AudioBuffer> = new Map()
  private scheduledNodes: AudioBufferSourceNode[] = []
  private animFrameId: number | null = null

  // ─── Context ──────────────────────────────────────────────────────────────────

  getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  // ─── Sample Loading ────────────────────────────────────────────────────────────

  async loadSample(instrumentId: string): Promise<AudioBuffer | null> {
    const path = DRUM_SAMPLE_PATHS[instrumentId]
    if (!path) return null

    if (this.sampleCache.has(instrumentId)) {
      return this.sampleCache.get(instrumentId)!
    }

    try {
      const ctx = this.getContext()
      const response = await fetch(path)
      if (!response.ok) throw new Error(`Failed to fetch ${path}`)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      this.sampleCache.set(instrumentId, audioBuffer)
      return audioBuffer
    } catch (e) {
      console.warn(`[AudioEngine] Could not load sample for ${instrumentId}:`, e)
      return null
    }
  }

  async preloadAllSamples(): Promise<void> {
    await Promise.all(Object.keys(DRUM_SAMPLE_PATHS).map((id) => this.loadSample(id)))
  }

  // ─── Effects Chain ─────────────────────────────────────────────────────────────

  private buildEffectsChain(
    ctx: AudioContext | OfflineAudioContext,
    effects: ClipEffects,
    volume: number,
    pan: number
  ): { input: AudioNode; output: AudioNode } {
    // Bass EQ
    const bassFilter = ctx.createBiquadFilter()
    bassFilter.type = 'lowshelf'
    bassFilter.frequency.value = 80
    bassFilter.gain.value = effects.eq.bass

    // Mid EQ
    const midFilter = ctx.createBiquadFilter()
    midFilter.type = 'peaking'
    midFilter.frequency.value = 1000
    midFilter.gain.value = effects.eq.mid

    // Treble EQ
    const trebleFilter = ctx.createBiquadFilter()
    trebleFilter.type = 'highshelf'
    trebleFilter.frequency.value = 10000
    trebleFilter.gain.value = effects.eq.treble

    // Compressor
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = effects.compression.threshold
    compressor.ratio.value = effects.compression.ratio
    compressor.knee.value = 5
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    // Volume
    const gainNode = ctx.createGain()
    gainNode.gain.value = volume

    // Pan
    const pannerNode = ctx.createStereoPanner()
    pannerNode.pan.value = pan

    // Chain: bass → mid → treble → compressor → gain → pan → output
    bassFilter.connect(midFilter)
    midFilter.connect(trebleFilter)
    trebleFilter.connect(compressor)
    compressor.connect(gainNode)
    gainNode.connect(pannerNode)
    pannerNode.connect(ctx.destination)

    return { input: bassFilter, output: pannerNode }
  }

  // ─── Synth Note ───────────────────────────────────────────────────────────────

  private synthNote(
    ctx: AudioContext | OfflineAudioContext,
    preset: SynthPreset,
    frequency: number,
    startTime: number,
    durationSeconds: number,
    velocity: number,
    effects: ClipEffects,
    volume: number,
    pan: number
  ): void {
    const { input } = this.buildEffectsChain(ctx, effects, volume * (velocity / 127), pan)

    // Oscillator
    const osc = ctx.createOscillator()
    osc.type = preset.oscillatorType
    osc.frequency.value = frequency

    // Distortion
    let distNode: WaveShaperNode | null = null
    if (preset.distortion > 0) {
      distNode = ctx.createWaveShaper()
      const k = preset.distortion * 400
      const curve = new Float32Array(256)
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1
        curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x))
      }
      distNode.curve = curve
    }

    // Filter
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = preset.filterCutoff
    filter.Q.value = preset.filterResonance

    // LFO for filter cutoff
    if (preset.lfoDepth > 0 && preset.lfoRate > 0) {
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.frequency.value = preset.lfoRate
      lfoGain.gain.value = preset.lfoDepth
      lfo.connect(lfoGain)
      lfoGain.connect(filter.frequency)
      lfo.start(startTime)
      lfo.stop(startTime + durationSeconds + preset.release + 0.1)
    }

    // Envelope
    const envGain = ctx.createGain()
    envGain.gain.setValueAtTime(0, startTime)
    envGain.gain.linearRampToValueAtTime(1, startTime + preset.attack)
    envGain.gain.linearRampToValueAtTime(preset.sustain, startTime + preset.attack + preset.decay)
    envGain.gain.setValueAtTime(preset.sustain, startTime + durationSeconds)
    envGain.gain.linearRampToValueAtTime(0, startTime + durationSeconds + preset.release)

    // Connect chain: osc → [distortion] → filter → envGain → effects
    osc.connect(distNode ?? filter)
    if (distNode) distNode.connect(filter)
    filter.connect(envGain)
    envGain.connect(input)

    osc.start(startTime)
    osc.stop(startTime + durationSeconds + preset.release + 0.1)
  }

  // ─── Play a single drum hit (preview) ──────────────────────────────────────────

  async previewDrum(instrumentId: string): Promise<void> {
    const ctx = this.getContext()
    const buffer = await this.loadSample(instrumentId)
    if (!buffer) {
      // Fallback: short click
      this.synthNote(
        ctx,
        {
          oscillatorType: 'sine',
          attack: 0.001,
          decay: 0.1,
          sustain: 0,
          release: 0.05,
          filterCutoff: 200,
          filterResonance: 1,
          lfoRate: 0,
          lfoDepth: 0,
          distortion: 0
        },
        80,
        ctx.currentTime,
        0.1,
        100,
        {
          eq: { bass: 0, mid: 0, treble: 0 },
          compression: { threshold: -24, ratio: 2 },
          gate: { threshold: -60 },
          reverb: { mix: 0, decay: 1 }
        },
        1,
        0
      )
      return
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(ctx.currentTime)
  }

  // ─── Play a single synth note (preview) ────────────────────────────────────────

  previewSynth(preset: SynthPreset, pitch: string): void {
    const ctx = this.getContext()
    const freq = NOTE_FREQUENCIES[pitch] || 440
    this.synthNote(
      ctx,
      preset,
      freq,
      ctx.currentTime,
      0.5,
      100,
      {
        eq: { bass: 0, mid: 0, treble: 0 },
        compression: { threshold: -24, ratio: 2 },
        gate: { threshold: -60 },
        reverb: { mix: 0, decay: 1 }
      },
      1,
      0
    )
  }

  // ─── Schedule a full clip for playback ─────────────────────────────────────────

  async scheduleClip(
    clip: NoteClip,
    track: SoundTrack,
    beatToTime: (beat: number) => number
  ): Promise<void> {
    const ctx = this.getContext()
    const instrument = BUILT_IN_INSTRUMENTS.find((i) => i.id === track.instrumentId)
    if (!instrument) return

    const startTime = beatToTime(clip.startBeat)
    const duration = beatToTime(clip.startBeat + clip.durationBeats) - startTime

    if (instrument.category === 'percussion') {
      const buffer = await this.loadSample(track.instrumentId)
      if (!buffer) return

      const source = ctx.createBufferSource()
      source.buffer = buffer

      const { input } = this.buildEffectsChain(ctx, clip.effects, track.volume, track.pan)
      source.connect(input)
      source.start(Math.max(startTime, ctx.currentTime))

      if (ctx instanceof AudioContext) {
        this.scheduledNodes.push(source)
      }
    } else if (instrument.synthPreset && clip.pitch) {
      const freq = NOTE_FREQUENCIES[clip.pitch] || 440
      this.synthNote(
        ctx,
        instrument.synthPreset,
        freq,
        Math.max(startTime, ctx.currentTime),
        duration,
        clip.velocity,
        clip.effects,
        track.volume,
        track.pan
      )
    }
  }

  // ─── Stop All ─────────────────────────────────────────────────────────────────

  stopAll(): void {
    this.scheduledNodes.forEach((node) => {
      try {
        node.stop()
      } catch {
        // already stopped
      }
    })
    this.scheduledNodes = []
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  // ─── WAV Export ───────────────────────────────────────────────────────────────

  async exportToWav(
    clips: NoteClip[],
    tracks: SoundTrack[],
    bpm: number,
    totalMeasures: number,
    beatsPerMeasure: number
  ): Promise<ArrayBuffer> {
    const secondsPerBeat = 60 / bpm
    const totalBeats = totalMeasures * beatsPerMeasure
    const totalSeconds = totalBeats * secondsPerBeat + 2 // 2s tail

    const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalSeconds * 44100), 44100)

    const beatToTime = (beat: number): number => beat * secondsPerBeat

    for (const clip of clips) {
      const track = tracks.find((t) => t.id === clip.trackId)
      if (!track || track.muted) continue

      const instrument = BUILT_IN_INSTRUMENTS.find((i) => i.id === track.instrumentId)
      if (!instrument) continue

      const startTime = beatToTime(clip.startBeat)
      const duration = beatToTime(clip.durationBeats)

      if (instrument.category === 'percussion') {
        const buffer = this.sampleCache.get(track.instrumentId)
        if (!buffer) continue
        const source = offlineCtx.createBufferSource()
        source.buffer = buffer
        const { input } = this.buildEffectsChain(offlineCtx, clip.effects, track.volume, track.pan)
        source.connect(input)
        source.start(startTime)
      } else if (instrument.synthPreset && clip.pitch) {
        const freq = NOTE_FREQUENCIES[clip.pitch] || 440
        this.synthNote(
          offlineCtx,
          instrument.synthPreset,
          freq,
          startTime,
          duration,
          clip.velocity,
          clip.effects,
          track.volume,
          track.pan
        )
      }
    }

    const renderedBuffer = await offlineCtx.startRendering()
    return this.audioBufferToWav(renderedBuffer)
  }

  // ─── AudioBuffer → WAV ArrayBuffer ────────────────────────────────────────────

  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const length = buffer.length * numChannels * 2
    const arrayBuffer = new ArrayBuffer(44 + length)
    const view = new DataView(arrayBuffer)

    const writeString = (offset: number, str: string): void => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + length, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * 2, true)
    view.setUint16(32, numChannels * 2, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, length, true)

    let offset = 44
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += 2
      }
    }

    return arrayBuffer
  }
}

// Singleton instance
export const audioEngine = new AudioEngine()
