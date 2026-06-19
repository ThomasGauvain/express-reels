import React from 'react'
import { useProjectStore } from '../store/projectStore'
import { useShallow } from 'zustand/react/shallow'
import './StillsSlidersPanel.css'

export function StillsSlidersPanel(): React.ReactElement | null {
  const { mediaLibrary, selectedMediaId, updateMediaStillsData } = useProjectStore(
    useShallow((s) => ({
      mediaLibrary: s.mediaLibrary,
      selectedMediaId: s.selectedMediaId,
      updateMediaStillsData: s.updateMediaStillsData
    }))
  )

  const selectedImage = mediaLibrary.find((m) => m.id === selectedMediaId && m.type === 'image')

  if (!selectedImage) {
    return (
      <div className="stills-panel stills-sliders-panel">
        <h3>Light & Color</h3>
        <p className="stills-placeholder-text">Select an image to edit.</p>
      </div>
    )
  }

  const edits = selectedImage.edits || {}

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>, key: string): void => {
    updateMediaStillsData(selectedImage.id, {
      edits: {
        ...edits,
        [key]: parseFloat(e.target.value)
      }
    })
  }

  const sliders = [
    { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.1, defaultValue: 0 },
    { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'whites', label: 'Whites', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'temperature', label: 'Temp', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'skinTone', label: 'Skin Tone Correct', min: -100, max: 100, step: 1, defaultValue: 0 },
    { key: 'denoise', label: 'AI Denoise', min: 0, max: 100, step: 1, defaultValue: 0 }
  ]

  return (
    <div className="stills-panel stills-sliders-panel">
      <h3>Light & Color</h3>
      <div className="stills-sliders-container">
        {sliders.map((s) => {
          const value = (edits[s.key] !== undefined ? edits[s.key] : s.defaultValue) as number
          return (
            <div key={s.key} className="stills-slider-row">
              <div className="slider-header">
                <span className="slider-label">{s.label}</span>
                <span className="slider-value">
                  {value > 0 ? '+' : ''}
                  {value}
                </span>
              </div>
              <input
                type="range"
                title={s.label}
                aria-label={s.label}
                min={s.min}
                max={s.max}
                step={s.step}
                value={value as number}
                onChange={(e) => handleSliderChange(e, s.key)}
                onDoubleClick={() =>
                  updateMediaStillsData(selectedImage.id, {
                    edits: { ...edits, [s.key]: s.defaultValue }
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
