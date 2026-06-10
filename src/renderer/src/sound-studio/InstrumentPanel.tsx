import React, { useState } from 'react'
import { DrumKit } from './DrumKit'
import { PianoKeyboard } from './PianoKeyboard'
import { SynthPanel } from './SynthPanel'
import { BUILT_IN_INSTRUMENTS, useSoundStudioStore } from '../store/soundStudioStore'

type PanelTab = 'drums' | 'piano' | 'synth'

export function InstrumentPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<PanelTab>('drums')
  const selectedInstrumentId = useSoundStudioStore((s) => s.selectedInstrumentId)
  const selectedInstrument = BUILT_IN_INSTRUMENTS.find((i) => i.id === selectedInstrumentId)

  // Derive active tab from selected instrument without effect
  const derivedTab = React.useMemo<PanelTab>(() => {
    if (!selectedInstrument) return activeTab
    if (selectedInstrument.category === 'percussion') return 'drums'
    if (selectedInstrument.synthPreset) return 'synth'
    return 'piano'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstrumentId])

  const currentTab = derivedTab !== activeTab && selectedInstrument ? derivedTab : activeTab

  return (
    <div className="ss-instrument-panel-wrapper">
      {/* Tabs */}
      <div className="ss-panel-tabs">
        <button
          className={`ss-panel-tab ${activeTab === 'drums' ? 'active' : ''}`}
          onClick={() => setActiveTab('drums')}
        >
          🥁 Drum Kit
        </button>
        <button
          className={`ss-panel-tab ${activeTab === 'piano' ? 'active' : ''}`}
          onClick={() => setActiveTab('piano')}
        >
          🎹 Piano
        </button>
        <button
          className={`ss-panel-tab ${activeTab === 'synth' ? 'active' : ''}`}
          onClick={() => setActiveTab('synth')}
        >
          🎛 Synth
        </button>
        {selectedInstrument && (
          <span className="ss-panel-tab-label">{selectedInstrument.name}</span>
        )}
      </div>

      {/* Panel Content */}
      <div className="ss-panel-content">
        {currentTab === 'drums' && <DrumKit />}
        {currentTab === 'piano' && <PianoKeyboard selectedInstrument={selectedInstrument} />}
        {currentTab === 'synth' && <SynthPanel selectedInstrument={selectedInstrument} />}
      </div>
    </div>
  )
}
