import React, { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useShallow } from 'zustand/react/shallow'
import { parseLightroomXmp, ParsedXmpEdits } from '../lib/xmpParser'
import './StillsSlidersPanel.css' // Reuse same styles for list
import './StillsPresetsPanel.css'

interface Preset {
  id: string
  name: string
  edits: ParsedXmpEdits
}

export function StillsPresetsPanel(): React.ReactElement {
  const [presets, setPresets] = useState<Preset[]>([])

  const { selectedMediaId, updateMediaStillsData, mediaLibrary } = useProjectStore(
    useShallow((s) => ({
      selectedMediaId: s.selectedMediaId,
      updateMediaStillsData: s.updateMediaStillsData,
      mediaLibrary: s.mediaLibrary
    }))
  )

  const selectedImage = mediaLibrary.find((m) => m.id === selectedMediaId && m.type === 'image')

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files)

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.xmp')) {
        const text = await file.text()
        const parsedEdits = parseLightroomXmp(text)

        setPresets((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: file.name.replace('.xmp', ''),
            edits: parsedEdits
          }
        ])
      }
    }
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }

  const applyPreset = (preset: Preset): void => {
    if (!selectedImage) return
    const currentEdits = selectedImage.edits || {}
    updateMediaStillsData(selectedImage.id, {
      edits: {
        ...currentEdits,
        ...preset.edits
      }
    })
  }

  return (
    <div className="stills-panel stills-left-panel" onDrop={handleDrop} onDragOver={handleDragOver}>
      <h3>Edit Presets</h3>

      {presets.length === 0 ? (
        <p className="stills-placeholder-text">Drop .xmp Lightroom Presets here.</p>
      ) : (
        <div className="stills-sliders-container stills-presets-list">
          {presets.map((preset) => (
            <button key={preset.id} className="preset-btn" onClick={() => applyPreset(preset)}>
              {preset.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
