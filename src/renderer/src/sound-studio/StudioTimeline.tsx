import React, { useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { Trash2, Play, Pause, Square, Plus } from 'lucide-react'
import { ClipEffectsPanel } from './ClipEffectsPanel'
import {
  useSoundStudioStore,
  BUILT_IN_INSTRUMENTS,
  type SoundStudioState
} from '../store/soundStudioStore'
import { audioEngine } from './audioEngine'

interface StudioTimelineProps {
  cellWidth: number // pixels per subdivision cell
}

const SUBDIVISION_DIVS: Record<string, number> = {
  '1/4': 1,
  '1/8': 2,
  '1/16': 4,
  '1/32': 8
}

export function StudioTimeline({ cellWidth }: StudioTimelineProps): React.ReactElement {
  const bpm = useSoundStudioStore((s) => s.bpm)
  const setBpm = useSoundStudioStore((s) => s.setBpm)
  const beatsPerMeasure = useSoundStudioStore((s) => s.beatsPerMeasure)
  const subdivision = useSoundStudioStore((s) => s.subdivision)
  const setSubdivision = useSoundStudioStore((s) => s.setSubdivision)
  const totalMeasures = useSoundStudioStore((s) => s.totalMeasures)
  const setTotalMeasures = useSoundStudioStore((s) => s.setTotalMeasures)
  const tracks = useSoundStudioStore((s) => s.tracks)
  const clips = useSoundStudioStore((s) => s.clips)
  const isPlaying = useSoundStudioStore((s) => s.isPlaying)
  const setIsPlaying = useSoundStudioStore((s) => s.setIsPlaying)
  const currentBeat = useSoundStudioStore((s) => s.currentBeat)
  const setCurrentBeat = useSoundStudioStore((s) => s.setCurrentBeat)
  const selectedTrackId = useSoundStudioStore((s) => s.selectedTrackId)
  const setSelectedTrackId = useSoundStudioStore((s) => s.setSelectedTrackId)
  const selectedClipId = useSoundStudioStore((s) => s.selectedClipId)
  const setSelectedClipId = useSoundStudioStore((s) => s.setSelectedClipId)
  const addTrack = useSoundStudioStore((s) => s.addTrack)
  const removeTrack = useSoundStudioStore((s) => s.removeTrack)
  const updateTrack = useSoundStudioStore((s) => s.updateTrack)
  const addClip = useSoundStudioStore((s) => s.addClip)

  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const playIntervalRef = useRef<number | null>(null)
  const playStartTimeRef = useRef<number>(0)
  const playStartBeatRef = useRef<number>(0)

  const divs = SUBDIVISION_DIVS[subdivision] || 4
  const totalCells = totalMeasures * beatsPerMeasure * divs
  const beatsPerCell = 1 / divs
  const totalGridWidth = totalCells * cellWidth + 100 // 100px for track labels

  // Beat → pixel offset (excluding the 100px label column)
  const beatToX = (beat: number): number => beat * divs * cellWidth + 100

  // Apply dynamic CSS custom properties imperatively to avoid style={{}} in JSX
  useLayoutEffect(() => {
    containerRef.current?.style.setProperty('--cell-w', `${cellWidth}px`)
    gridRef.current?.style.setProperty('--ss-grid-w', `${totalGridWidth}px`)
  }, [cellWidth, totalGridWidth])

  useLayoutEffect(() => {
    playheadRef.current?.style.setProperty('--ss-head-x', `${beatToX(currentBeat)}px`)
  })

  // ── Playback ───────────────────────────────────────────────────────────────────

  const stopPlayback = useCallback((): void => {
    if (playIntervalRef.current !== null) {
      clearInterval(playIntervalRef.current)
      playIntervalRef.current = null
    }
    audioEngine.stopAll()
    setIsPlaying(false)
  }, [setIsPlaying])

  const startPlayback = useCallback(async (): Promise<void> => {
    audioEngine.stopAll()
    await audioEngine.preloadAllSamples()

    const secondsPerBeat = 60 / bpm
    const startBeat = currentBeat
    playStartBeatRef.current = startBeat
    playStartTimeRef.current = performance.now() / 1000

    const ctx = audioEngine.getContext()
    const ctxStartTime = ctx.currentTime

    const scheduleBeatTime = (beat: number): number =>
      ctxStartTime + (beat - startBeat) * secondsPerBeat

    clips.forEach(async (clip) => {
      if (clip.startBeat < startBeat) return
      const track = tracks.find((t) => t.id === clip.trackId)
      if (!track || track.muted) return
      await audioEngine.scheduleClip(clip, track, scheduleBeatTime)
    })

    setIsPlaying(true)

    const startReal = performance.now()
    playIntervalRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - startReal) / 1000
      const beat = startBeat + elapsed * (bpm / 60)
      const totalBeats = totalMeasures * beatsPerMeasure
      if (beat >= totalBeats) {
        setCurrentBeat(0)
        stopPlayback()
        return
      }
      setCurrentBeat(beat)
    }, 16)
  }, [
    bpm,
    currentBeat,
    clips,
    tracks,
    totalMeasures,
    beatsPerMeasure,
    setIsPlaying,
    setCurrentBeat,
    stopPlayback
  ])

  const handlePlayPause = (): void => {
    if (isPlaying) {
      stopPlayback()
    } else {
      startPlayback()
    }
  }

  const handleStop = (): void => {
    stopPlayback()
    setCurrentBeat(0)
  }

  useEffect(() => {
    return () => {
      if (playIntervalRef.current !== null) clearInterval(playIntervalRef.current)
    }
  }, [])

  // ── Click on lane to add clip ──────────────────────────────────────────────────

  const handleLaneClick = (e: React.MouseEvent, trackId: string): void => {
    if (!selectedTrackId) return
    if (trackId !== selectedTrackId) {
      setSelectedTrackId(trackId)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const beat = Math.floor(x / cellWidth) * beatsPerCell

    const track = tracks.find((t) => t.id === trackId)
    const instrument = BUILT_IN_INSTRUMENTS.find((i) => i.id === track?.instrumentId)
    const isPercussion = instrument?.category === 'percussion'

    addClip({
      trackId,
      startBeat: beat,
      durationBeats: isPercussion ? 0.5 : divs,
      velocity: 90,
      pitch: isPercussion ? undefined : 'C4'
    })
  }

  // ── Clip colors ────────────────────────────────────────────────────────────────

  const getClipColor = (instrumentId: string): string => {
    if (instrumentId.includes('kick')) return 'var(--ss-kick)'
    if (instrumentId.includes('snare')) return 'var(--ss-snare)'
    if (instrumentId.includes('hihat')) return 'var(--ss-hihat)'
    if (instrumentId.includes('crash') || instrumentId.includes('ride')) return 'var(--ss-cymbal)'
    if (instrumentId.includes('tom')) return 'var(--ss-tom)'
    if (instrumentId.includes('cowbell')) return 'var(--ss-cowbell)'
    if (instrumentId.includes('synth')) return 'var(--ss-accent)'
    if (instrumentId.includes('strings') || instrumentId.includes('guitar')) return '#f77f00'
    if (instrumentId.includes('wind')) return '#4cc9f0'
    if (instrumentId.includes('midi')) return '#00d4aa'
    return 'var(--ss-accent-2)'
  }

  // Build dynamic CSS for per-tick and per-clip positioning
  const dynamicCss = [
    // Ruler ticks
    ...Array.from(
      { length: totalCells + 1 },
      (_, i) => `.ss-ruler-tick[data-tick="${i}"] { --ss-tick-x: ${i * cellWidth}px; }`
    ),
    // Clips
    ...clips.map((clip) => {
      const clipX = clip.startBeat * divs * cellWidth
      const clipW = Math.max(cellWidth, clip.durationBeats * divs * cellWidth)
      const color = getClipColor(tracks.find((t) => t.id === clip.trackId)?.instrumentId ?? '')
      const isClipSelected = clip.id === selectedClipId
      const border = isClipSelected ? '#fff' : `${color}88`
      return [
        `.ss-note-clip[data-clip="${clip.id}"] {`,
        `  --ss-clip-x: ${clipX}px;`,
        `  --ss-clip-w: ${clipW}px;`,
        `  --ss-clip-color: ${color};`,
        `  --ss-clip-border: ${border};`,
        `}`
      ].join('\n')
    })
  ].join('\n')

  return (
    <div className="ss-timeline-container" ref={containerRef}>
      {/* Toolbar */}
      <div className="ss-timeline-toolbar">
        {/* Playback controls */}
        <button className="ss-timeline-play-btn" onClick={handlePlayPause}>
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button className="ss-btn" onClick={handleStop} title="Stop">
          <Square size={10} />
        </button>

        {/* Divider */}
        <div className="ss-toolbar-divider" />

        {/* BPM */}
        <label className="ss-toolbar-label" htmlFor="ss-bpm-input">
          BPM
        </label>
        <input
          id="ss-bpm-input"
          type="number"
          className="ss-bpm-input"
          min={40}
          max={240}
          value={bpm}
          title="Beats per minute"
          onChange={(e) => setBpm(Number(e.target.value))}
        />

        {/* Time sig */}
        <label className="ss-toolbar-label" htmlFor="ss-time-sig-select">
          Sig
        </label>
        <select
          id="ss-time-sig-select"
          className="ss-timeline-select"
          value={beatsPerMeasure}
          title="Time signature"
          onChange={(e) =>
            useSoundStudioStore.getState().setBeatsPerMeasure(Number(e.target.value))
          }
        >
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n}/4
            </option>
          ))}
        </select>

        {/* Subdivision */}
        <label className="ss-toolbar-label" htmlFor="ss-grid-select">
          Grid
        </label>
        <select
          id="ss-grid-select"
          className="ss-timeline-select"
          value={subdivision}
          title="Grid subdivision"
          onChange={(e) => setSubdivision(e.target.value as SoundStudioState['subdivision'])}
        >
          {['1/4', '1/8', '1/16', '1/32'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Measures */}
        <label className="ss-toolbar-label" htmlFor="ss-bars-input">
          Bars
        </label>
        <input
          id="ss-bars-input"
          type="number"
          className="ss-bpm-input ss-bpm-input--bars"
          min={1}
          max={64}
          value={totalMeasures}
          title="Total bars"
          onChange={(e) => setTotalMeasures(Number(e.target.value))}
        />

        {/* Current beat readout */}
        <span className="ss-toolbar-beat-counter">
          {Math.floor(currentBeat / beatsPerMeasure) + 1}:
          {Math.floor(currentBeat % beatsPerMeasure) + 1}
        </span>

        {/* Add track button */}
        <button
          className="ss-btn"
          onClick={() => {
            const inst = BUILT_IN_INSTRUMENTS[0]
            addTrack(inst)
          }}
          title="Add a new track (select instrument from library first)"
        >
          <Plus size={10} /> Track
        </button>
      </div>

      {/* Timeline Grid */}
      <div className="ss-timeline-scroll" ref={scrollRef}>
        {/* Dynamic CSS — no style={{}} needed on any element */}
        <style>{dynamicCss}</style>
        <div className="ss-timeline-grid" ref={gridRef}>
          {/* Ruler */}
          <div className="ss-timeline-ruler">
            <div className="ss-track-label-col" />
            <div className="ss-ruler-ticks">
              {Array.from({ length: totalCells + 1 }, (_, i) => {
                const beat = i * beatsPerCell
                const measure = Math.floor(beat / beatsPerMeasure)
                const beatInMeasure = Math.floor(beat % beatsPerMeasure)
                const isMeasureLine = beatInMeasure === 0 && i % divs === 0
                const isMainBeat = i % divs === 0
                // Tick line variant class — determines height/opacity
                const tickLineClass = isMeasureLine
                  ? 'ss-ruler-tick-line ss-ruler-tick-line--measure'
                  : isMainBeat
                    ? 'ss-ruler-tick-line ss-ruler-tick-line--beat'
                    : 'ss-ruler-tick-line ss-ruler-tick-line--sub'
                return (
                  <div
                    key={i}
                    className={`ss-ruler-tick ${isMeasureLine ? 'measure' : ''}`}
                    data-tick={i}
                  >
                    <div className={tickLineClass} />
                    {isMeasureLine && <span className="ss-ruler-tick-label">{measure + 1}</span>}
                    {isMainBeat && !isMeasureLine && (
                      <span className="ss-ruler-tick-label ss-ruler-tick-label--beat">
                        {beatInMeasure + 1}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Playhead */}
          <div className="ss-timeline-playhead" ref={playheadRef} />

          {/* Empty state */}
          {tracks.length === 0 && (
            <div className="ss-empty-panel">
              <div className="ss-empty-panel-icon">🎵</div>
              <div className="ss-empty-panel-title">No Tracks Yet</div>
              <div className="ss-empty-panel-desc">
                Double-click an instrument in the library to create a track, or ask the AI Copilot
                to compose something.
              </div>
            </div>
          )}

          {/* Track Rows */}
          {tracks.map((track) => {
            const instrument = BUILT_IN_INSTRUMENTS.find((i) => i.id === track.instrumentId)
            const trackClips = clips.filter((c) => c.trackId === track.id)
            const isSelected = track.id === selectedTrackId

            return (
              <div key={track.id} className="ss-track-row">
                {/* Track Label */}
                <div
                  className={`ss-track-label ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedTrackId(track.id)}
                >
                  <div className="ss-track-label-inner">
                    <div className="ss-track-label-name" title={track.name}>
                      {track.name}
                    </div>
                    <div className="ss-track-category">{instrument?.category}</div>
                  </div>
                  <button
                    className={`ss-track-mute-btn ${track.muted ? 'muted' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateTrack(track.id, { muted: !track.muted })
                    }}
                    title={track.muted ? 'Unmute' : 'Mute'}
                  >
                    {track.muted ? '✕' : 'M'}
                  </button>
                  <button
                    className="ss-track-mute-btn ss-track-mute-btn--delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTrack(track.id)
                    }}
                    title="Delete Track"
                  >
                    <Trash2 size={8} />
                  </button>
                </div>

                {/* Lane */}
                <div
                  className={`ss-track-lane ${isSelected ? 'ss-track-lane--selected' : 'ss-track-lane--idle'}`}
                  onClick={(e) => handleLaneClick(e, track.id)}
                >
                  {/* Note Clips */}
                  {trackClips.map((clip) => {
                    const isClipSelected = clip.id === selectedClipId

                    return (
                      <div
                        key={clip.id}
                        className={`ss-note-clip ${isClipSelected ? 'selected' : ''}`}
                        data-clip={clip.id}
                        onMouseDown={(e) => {
                          if (document.activeElement instanceof HTMLElement) {
                            document.activeElement.blur()
                          }
                          e.stopPropagation()
                          setSelectedClipId(clip.id)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setSelectedClipId(clip.id)
                        }}
                        title={`${clip.pitch || 'hit'} @ beat ${clip.startBeat.toFixed(2)} (right-click to edit)`}
                      >
                        <div className="ss-note-clip-label">{clip.pitch || track.name}</div>

                        {/* Volume rubber band (white) */}
                        {clip.volumeKeyframes.length > 0 && (
                          <svg className="ss-rubberband-volume">
                            <polyline
                              points={clip.volumeKeyframes
                                .map(
                                  (kf) =>
                                    `${(kf.beat - clip.startBeat) * divs * cellWidth},${(1 - kf.volume / 2) * 52}`
                                )
                                .join(' ')}
                              fill="none"
                              stroke="rgba(255,255,255,0.6)"
                              strokeWidth="1.5"
                            />
                          </svg>
                        )}

                        {/* Pan rubber band (cyan) */}
                        {clip.panKeyframes.length > 0 && (
                          <svg className="ss-rubberband-pan">
                            <polyline
                              points={clip.panKeyframes
                                .map(
                                  (kf) =>
                                    `${(kf.beat - clip.startBeat) * divs * cellWidth},${((1 - kf.pan) / 2) * 52}`
                                )
                                .join(' ')}
                              fill="none"
                              stroke="var(--ss-accent-pan)"
                              strokeWidth="1.5"
                            />
                          </svg>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Clip Effects Inspector Overlay */}
      {selectedClipId && <ClipEffectsPanel />}
    </div>
  )
}
