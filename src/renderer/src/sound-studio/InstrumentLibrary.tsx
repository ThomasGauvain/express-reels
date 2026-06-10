import React, { useState } from 'react'
import { Music, Drum, Wind, Zap, Radio } from 'lucide-react'
import {
  BUILT_IN_INSTRUMENTS,
  type Instrument,
  type InstrumentCategory,
  useSoundStudioStore
} from '../store/soundStudioStore'

const CATEGORIES: { id: InstrumentCategory; label: string; icon: React.ReactElement }[] = [
  { id: 'percussion', label: 'Percussion', icon: <Drum size={12} /> },
  { id: 'strings', label: 'Strings', icon: <Music size={12} /> },
  { id: 'wind', label: 'Wind', icon: <Wind size={12} /> },
  { id: 'synth', label: 'Synth', icon: <Zap size={12} /> },
  { id: 'midi', label: 'MIDI', icon: <Radio size={12} /> }
]

export function InstrumentLibrary(): React.ReactElement {
  const [openCategories, setOpenCategories] = useState<Set<InstrumentCategory>>(
    new Set(['percussion', 'synth'])
  )
  const selectedInstrumentId = useSoundStudioStore((s) => s.selectedInstrumentId)
  const setSelectedInstrumentId = useSoundStudioStore((s) => s.setSelectedInstrumentId)
  const addTrack = useSoundStudioStore((s) => s.addTrack)

  const toggleCategory = (cat: InstrumentCategory): void => {
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const handleSelect = (instrument: Instrument): void => {
    setSelectedInstrumentId(instrument.id)
  }

  const handleDoubleClick = (instrument: Instrument): void => {
    addTrack(instrument)
  }

  return (
    <div className="ss-instr-library-wrapper">
      <div className="ss-section-header">🎸 Instruments</div>
      <div className="ss-instrument-library">
        {CATEGORIES.map((cat) => {
          const instruments = BUILT_IN_INSTRUMENTS.filter((i) => i.category === cat.id)
          const isOpen = openCategories.has(cat.id)
          return (
            <div key={cat.id} className="ss-instr-category">
              <div
                className="ss-instr-category-header"
                onClick={() => toggleCategory(cat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && toggleCategory(cat.id)}
              >
                {cat.icon}
                <span>{cat.label}</span>
                <span className={`ss-instr-category-chevron ${isOpen ? 'open' : ''}`}>▶</span>
              </div>
              {isOpen && (
                <div className="ss-instr-list">
                  {instruments.map((instr) => (
                    <div
                      key={instr.id}
                      className={`ss-instr-item ${selectedInstrumentId === instr.id ? 'selected' : ''}`}
                      onClick={() => handleSelect(instr)}
                      onDoubleClick={() => handleDoubleClick(instr)}
                      role="button"
                      tabIndex={0}
                      title="Click to select · Double-click to add track"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleDoubleClick(instr)
                      }}
                    >
                      <span>{instr.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
