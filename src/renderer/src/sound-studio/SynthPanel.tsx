import React from 'react'
import type { Instrument, OscillatorType } from '../store/soundStudioStore'
import { BUILT_IN_INSTRUMENTS, useSoundStudioStore } from '../store/soundStudioStore'
import { audioEngine } from './audioEngine'

interface SynthPanelProps {
  selectedInstrument?: Instrument
}

const OSC_TYPES: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle']

export function SynthPanel({ selectedInstrument }: SynthPanelProps): React.ReactElement {
  const selectedTrackId = useSoundStudioStore((s) => s.selectedTrackId)
  const tracks = useSoundStudioStore((s) => s.tracks)

  const track = tracks.find((t) => t.id === selectedTrackId)
  const instrument =
    selectedInstrument ||
    (track ? BUILT_IN_INSTRUMENTS.find((i) => i.id === track.instrumentId) : undefined)
  const preset = instrument?.synthPreset

  if (!preset || !instrument) {
    return (
      <div className="ss-empty-panel">
        <div className="ss-empty-panel-icon">🎛</div>
        <div className="ss-empty-panel-title">No Synth Selected</div>
        <div className="ss-empty-panel-desc">
          Select a Synth instrument from the library on the left to see its controls.
        </div>
      </div>
    )
  }

  const handlePreview = (): void => {
    audioEngine.previewSynth(preset, 'C4')
  }

  const sliderRow = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number
  ): React.ReactElement => (
    <div className="ss-slider-item">
      <span className="ss-slider-label">{label}</span>
      <input
        type="range"
        className="ss-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        readOnly
        title={`${value.toFixed(2)}`}
      />
      <span className="ss-slider-value">{value.toFixed(2)}</span>
    </div>
  )

  return (
    <div className="ss-synth-panel">
      {/* Oscillator */}
      <div className="ss-synth-group">
        <div className="ss-synth-group-title">Oscillator</div>
        <div className="ss-osc-btns">
          {OSC_TYPES.map((type) => (
            <button
              key={type}
              className={`ss-osc-btn ${preset.oscillatorType === type ? 'active' : ''}`}
              onClick={handlePreview}
              title={`${type} wave`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* ADSR Envelope */}
      <div className="ss-synth-group">
        <div className="ss-synth-group-title">Envelope (ADSR)</div>
        <div className="ss-slider-row">
          {sliderRow('Attack', preset.attack, 0, 2, 0.001)}
          {sliderRow('Decay', preset.decay, 0, 2, 0.001)}
          {sliderRow('Sustain', preset.sustain, 0, 1, 0.01)}
          {sliderRow('Release', preset.release, 0, 4, 0.01)}
        </div>
      </div>

      {/* Filter */}
      <div className="ss-synth-group">
        <div className="ss-synth-group-title">Filter</div>
        <div className="ss-slider-row">
          {sliderRow('Cutoff', preset.filterCutoff, 20, 20000, 1)}
          {sliderRow('Resonance', preset.filterResonance, 0.1, 30, 0.1)}
        </div>
      </div>

      {/* LFO */}
      <div className="ss-synth-group">
        <div className="ss-synth-group-title">LFO</div>
        <div className="ss-slider-row">
          {sliderRow('Rate', preset.lfoRate, 0, 20, 0.1)}
          {sliderRow('Depth', preset.lfoDepth, 0, 2000, 1)}
        </div>
      </div>

      {/* Distortion */}
      <div className="ss-synth-group">
        <div className="ss-synth-group-title">Drive / Distortion</div>
        <div className="ss-slider-row">{sliderRow('Drive', preset.distortion, 0, 1, 0.01)}</div>
        <button className="ss-btn ss-btn--full-width primary" onClick={handlePreview}>
          ▶ Preview Sound
        </button>
      </div>
    </div>
  )
}
