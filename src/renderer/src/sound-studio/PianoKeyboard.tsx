import React, { useRef, useCallback, useLayoutEffect, useState } from 'react'
import { Music, Radio, Wind, Guitar } from 'lucide-react'
import type { Instrument } from '../store/soundStudioStore'
import { useSoundStudioStore } from '../store/soundStudioStore'
import { audioEngine } from './audioEngine'

interface PianoKeyboardProps {
  selectedInstrument?: Instrument
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_NOTES = new Set(['C#', 'D#', 'F#', 'G#', 'A#'])

interface PianoKey {
  note: string
  octave: number
  isBlack: boolean
}

function buildKeys(startOctave = 1, endOctave = 7): PianoKey[] {
  const keys: PianoKey[] = []
  for (let oct = startOctave; oct <= endOctave; oct++) {
    NOTE_NAMES.forEach((note) => {
      keys.push({ note, octave: oct, isBlack: BLACK_NOTES.has(note) })
    })
  }
  return keys
}

const ALL_KEYS = buildKeys(1, 7)

const WHITE_KEY_W = 36
const BLACK_KEY_W = 22

export function PianoKeyboard({ selectedInstrument }: PianoKeyboardProps): React.ReactElement {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [octaveView, setOctaveView] = useState(3)
  const scrollRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef<HTMLDivElement>(null)
  const selectedTrackId = useSoundStudioStore((s) => s.selectedTrackId)
  const currentBeat = useSoundStudioStore((s) => s.currentBeat)
  const addClip = useSoundStudioStore((s) => s.addClip)

  const whiteKeys = ALL_KEYS.filter((k) => !k.isBlack)
  const totalWidth = whiteKeys.length * WHITE_KEY_W

  // Apply dynamic piano width imperatively to avoid style={{}} in JSX
  useLayoutEffect(() => {
    keysRef.current?.style.setProperty('--piano-w', `${totalWidth}px`)
  }, [totalWidth])

  // Scroll to current octave view on mount / octave change
  useLayoutEffect(() => {
    if (scrollRef.current) {
      const whitesBefore = whiteKeys.filter((k) => k.octave < octaveView).length
      scrollRef.current.scrollLeft = whitesBefore * WHITE_KEY_W
    }
  }, [octaveView, whiteKeys])

  const handleKeyPress = useCallback(
    (key: PianoKey) => {
      const pitch = `${key.note}${key.octave}`
      setActiveKey(pitch)
      setTimeout(() => setActiveKey(null), 200)

      const preset = selectedInstrument?.synthPreset
      if (preset) {
        audioEngine.previewSynth(preset, pitch)
      }

      if (selectedTrackId) {
        addClip({
          trackId: selectedTrackId,
          startBeat: currentBeat,
          durationBeats: 1,
          pitch,
          velocity: 90
        })
      }
    },
    [selectedTrackId, currentBeat, addClip, selectedInstrument]
  )

  // Build per-key position CSS — no style={{}} needed on any key element
  const keyCss = [
    // White keys: left = index * WHITE_KEY_W
    ...whiteKeys.map((key, i) => {
      const pitch = `${key.note}${key.octave}`
      return `.ss-piano-key[data-pitch="${pitch}"] { --key-x: ${i * WHITE_KEY_W}px; }`
    }),
    // Black keys: positioned relative to preceding white key
    ...ALL_KEYS.filter((k) => k.isBlack).map((key) => {
      const pitch = `${key.note}${key.octave}`
      const noteIdx = NOTE_NAMES.indexOf(key.note)
      const prevWhiteNote = NOTE_NAMES[noteIdx - 1]
      const whiteIdx = whiteKeys.findIndex(
        (w) => w.note === prevWhiteNote && w.octave === key.octave
      )
      if (whiteIdx < 0) return ''
      const leftPos = whiteIdx * WHITE_KEY_W + WHITE_KEY_W - BLACK_KEY_W / 2
      return `.ss-piano-key[data-pitch="${pitch}"] { --key-x: ${leftPos}px; }`
    })
  ]
    .filter(Boolean)
    .join('\n')

  const renderGraphic = (): React.ReactElement => {
    const color = 'var(--color-text-muted)'
    if (!selectedInstrument) return <Music size={48} color={color} />
    if (selectedInstrument.category === 'synth') return <Radio size={48} color={color} />
    if (selectedInstrument.category === 'strings') return <Guitar size={48} color={color} />
    if (selectedInstrument.category === 'wind') return <Wind size={48} color={color} />
    return <Music size={48} color={color} />
  }

  return (
    <div className="ss-piano-wrapper">
      <div className="ss-piano-graphic-container">{renderGraphic()}</div>
      <div className="ss-piano-controls">
        <span className="ss-piano-controls-label">Octave</span>
        <button className="ss-btn" onClick={() => setOctaveView((o) => Math.max(1, o - 1))}>
          −
        </button>
        <span className="ss-piano-octave-display">{octaveView}</span>
        <button className="ss-btn" onClick={() => setOctaveView((o) => Math.min(7, o + 1))}>
          +
        </button>
        <span className="ss-piano-controls-hint">
          {selectedInstrument ? selectedInstrument.name : 'Select an instrument from the list'}
        </span>
      </div>
      <div className="ss-piano-keyboard" ref={scrollRef}>
        {/* Dynamic key positions — no style={{}} on any element */}
        <style>{keyCss}</style>
        <div className="ss-piano-keys" ref={keysRef}>
          {/* White keys */}
          {whiteKeys.map((key) => {
            const pitch = `${key.note}${key.octave}`
            return (
              <button
                key={pitch}
                className={`ss-piano-key white ${activeKey === pitch ? 'active' : ''}`}
                data-pitch={pitch}
                onMouseDown={() => handleKeyPress(key)}
                title={pitch}
              />
            )
          })}

          {/* Black keys */}
          {ALL_KEYS.filter((k) => k.isBlack).map((key) => {
            const pitch = `${key.note}${key.octave}`
            const noteIdx = NOTE_NAMES.indexOf(key.note)
            const prevWhiteNote = NOTE_NAMES[noteIdx - 1]
            const whiteIdx = whiteKeys.findIndex(
              (w) => w.note === prevWhiteNote && w.octave === key.octave
            )
            if (whiteIdx < 0) return null
            return (
              <button
                key={pitch}
                className={`ss-piano-key black ${activeKey === pitch ? 'active' : ''}`}
                data-pitch={pitch}
                onMouseDown={() => handleKeyPress(key)}
                title={pitch}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
