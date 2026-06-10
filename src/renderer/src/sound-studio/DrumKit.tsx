import React, { useState, useCallback } from 'react'
import { audioEngine } from './audioEngine'
import { useSoundStudioStore } from '../store/soundStudioStore'

interface DrumPiece {
  id: string
  label: string
  color: string
  size: number
  x: number // percent from center
  y: number // percent from center
  shape?: 'ellipse' | 'rect'
}

const DRUM_PIECES: DrumPiece[] = [
  // Kick (big circle at bottom center)
  { id: 'drum-kick', label: 'KICK', color: '#ff6b6b', size: 90, x: 50, y: 72, shape: 'ellipse' },
  // Snare (mid left)
  { id: 'drum-snare', label: 'SNARE', color: '#ffd93d', size: 64, x: 32, y: 62 },
  // Hi-hat closed (top left)
  {
    id: 'drum-hihat-closed',
    label: 'HH',
    color: '#4ecdc4',
    size: 44,
    x: 18,
    y: 38,
    shape: 'ellipse'
  },
  // Hi-hat open (far left)
  {
    id: 'drum-hihat-open',
    label: 'HHO',
    color: '#4ecdc4',
    size: 38,
    x: 8,
    y: 52,
    shape: 'ellipse'
  },
  // Crash cymbal (top left)
  { id: 'drum-crash', label: 'CRASH', color: '#a8dadc', size: 52, x: 22, y: 20, shape: 'ellipse' },
  // Ride cymbal (top right)
  { id: 'drum-ride', label: 'RIDE', color: '#a8dadc', size: 52, x: 78, y: 20, shape: 'ellipse' },
  // Tom high
  { id: 'drum-tom-high', label: 'TOM H', color: '#ff8c42', size: 52, x: 38, y: 32 },
  // Tom mid
  { id: 'drum-tom-mid', label: 'TOM M', color: '#ff8c42', size: 52, x: 62, y: 32 },
  // Tom floor
  { id: 'drum-tom-floor', label: 'TOM F', color: '#ff8c42', size: 60, x: 73, y: 60 },
  // Cowbell (top right area)
  { id: 'drum-cowbell', label: 'BELL', color: '#c77dff', size: 36, x: 88, y: 42, shape: 'rect' }
]

export function DrumKit(): React.ReactElement {
  const [hitting, setHitting] = useState<Set<string>>(new Set())
  const selectedTrackId = useSoundStudioStore((s) => s.selectedTrackId)
  const tracks = useSoundStudioStore((s) => s.tracks)
  const currentBeat = useSoundStudioStore((s) => s.currentBeat)
  const addClip = useSoundStudioStore((s) => s.addClip)

  const handleHit = useCallback(
    async (piece: DrumPiece) => {
      // Visual flash
      setHitting((prev) => new Set(prev).add(piece.id))
      setTimeout(
        () =>
          setHitting((prev) => {
            const next = new Set(prev)
            next.delete(piece.id)
            return next
          }),
        120
      )

      // Play sound
      await audioEngine.previewDrum(piece.id)

      // If a percussion track is selected for this instrument, place a note clip
      const track = tracks.find((t) => t.instrumentId === piece.id && t.id === selectedTrackId)
      if (track) {
        addClip({
          trackId: track.id,
          startBeat: currentBeat,
          durationBeats: 0.5,
          velocity: 100
        })
      }
    },
    [tracks, selectedTrackId, currentBeat, addClip]
  )

  return (
    <div className="ss-drum-kit">
      {/* Per-piece dynamic CSS — no style={{}} on any element */}
      <style>
        {DRUM_PIECES.map((p) => {
          const h = p.shape === 'ellipse' ? p.size * 0.35 : p.size
          const radius = p.shape === 'rect' ? '6px' : p.shape === 'ellipse' ? '50%/35%' : '50%'
          return [
            `.ss-drum-piece[data-drum="${p.id}"] {`,
            `  --drum-x: ${p.x}%;`,
            `  --drum-y: ${p.y}%;`,
            `  --drum-size: ${p.size}px;`,
            `  --drum-h: ${h}px;`,
            `  --drum-bg: radial-gradient(circle at 35% 35%, ${p.color}dd, ${p.color}88);`,
            `  --drum-radius: ${radius};`,
            `}`
          ].join('\n')
        }).join('\n')}
      </style>

      {/* SVG background for drum set visual */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="ss-drum-svg-bg"
      >
        {/* Floor/stage shadow */}
        <ellipse cx="50" cy="85" rx="42" ry="8" fill="rgba(0,0,0,0.25)" />
        {/* Kick drum body */}
        <ellipse cx="50" cy="72" rx="20" ry="14" fill="rgba(20,10,10,0.4)" />
      </svg>

      {DRUM_PIECES.map((piece) => (
        <button
          key={piece.id}
          className={`ss-drum-piece ${hitting.has(piece.id) ? 'hit' : ''}`}
          data-drum={piece.id}
          onClick={() => handleHit(piece)}
          title={piece.label}
        >
          {piece.label}
        </button>
      ))}

      <div className="ss-drum-legend">
        Click to play · Double-click instrument in list to create track
      </div>
    </div>
  )
}
