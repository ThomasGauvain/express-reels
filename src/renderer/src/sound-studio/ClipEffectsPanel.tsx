import React from 'react'
import { useSoundStudioStore } from '../store/soundStudioStore'
import { X, Sliders } from 'lucide-react'

export function ClipEffectsPanel(): React.ReactElement | null {
  const selectedClipId = useSoundStudioStore((s) => s.selectedClipId)
  const clips = useSoundStudioStore((s) => s.clips)
  const updateClip = useSoundStudioStore((s) => s.updateClip)
  const setSelectedClipId = useSoundStudioStore((s) => s.setSelectedClipId)
  const removeClip = useSoundStudioStore((s) => s.removeClip)

  const clip = clips.find((c) => c.id === selectedClipId)
  if (!clip) return null

  const fx = clip.effects

  const handleUpdate = (category: keyof typeof fx, param: string, value: number): void => {
    updateClip(clip.id, {
      effects: {
        ...fx,
        [category]: {
          ...fx[category],
          [param]: value
        }
      }
    })
  }

  const sliderRow = (
    category: keyof typeof fx,
    param: string,
    label: string,
    min: number,
    max: number,
    step: number,
    formatter: (v: number) => string = (v) => v.toFixed(1)
  ): React.ReactElement => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (fx[category] as any)[param] as number
    return (
      <div className="ss-slider-item" key={param}>
        <span className="ss-slider-label">{label}</span>
        <input
          type="range"
          className="ss-slider"
          min={min}
          max={max}
          step={step}
          value={val}
          title={formatter(val)}
          onChange={(e) => handleUpdate(category, param, parseFloat(e.target.value))}
        />
        <span className="ss-slider-value">{formatter(val)}</span>
      </div>
    )
  }

  return (
    <div className="ss-clip-effects-panel">
      <div className="ss-clip-effects-header">
        <Sliders size={12} />
        <span>Clip Inspector: {clip.pitch || 'Beat'}</span>
        <button
          className="ss-clip-effects-close ss-btn danger ss-clip-effects-delete-btn"
          onClick={() => removeClip(clip.id)}
          title="Delete Clip"
          aria-label="Delete Clip"
        >
          <X size={12} /> Delete
        </button>
        <button
          className="ss-clip-effects-close"
          onClick={() => setSelectedClipId(null)}
          title="Close Inspector"
          aria-label="Close Inspector"
        >
          <X size={12} />
        </button>
      </div>

      <div className="ss-clip-effects-body">
        {/* EQ */}
        <div className="ss-synth-group">
          <div className="ss-synth-group-title">EQ</div>
          <div className="ss-slider-row">
            {sliderRow('eq', 'bass', 'Bass', -12, 12, 1, (v) => `${v > 0 ? '+' : ''}${v}dB`)}
            {sliderRow('eq', 'mid', 'Mid', -12, 12, 1, (v) => `${v > 0 ? '+' : ''}${v}dB`)}
            {sliderRow('eq', 'treble', 'Treble', -12, 12, 1, (v) => `${v > 0 ? '+' : ''}${v}dB`)}
          </div>
        </div>

        {/* Compression & Gate */}
        <div className="ss-synth-group">
          <div className="ss-synth-group-title">Dynamics</div>
          <div className="ss-slider-row">
            {sliderRow('compression', 'threshold', 'Thresh', -60, 0, 1, (v) => `${v}dB`)}
            {sliderRow('compression', 'ratio', 'Ratio', 1, 20, 1, (v) => `${v}:1`)}
            {sliderRow('gate', 'threshold', 'Gate', -80, 0, 1, (v) => `${v}dB`)}
          </div>
        </div>

        {/* Reverb */}
        <div className="ss-synth-group">
          <div className="ss-synth-group-title">Reverb</div>
          <div className="ss-slider-row">
            {sliderRow('reverb', 'mix', 'Mix', 0, 1, 0.05, (v) => `${(v * 100).toFixed(0)}%`)}
            {sliderRow('reverb', 'decay', 'Decay', 0.1, 10, 0.1, (v) => `${v.toFixed(1)}s`)}
          </div>
        </div>
      </div>
    </div>
  )
}
