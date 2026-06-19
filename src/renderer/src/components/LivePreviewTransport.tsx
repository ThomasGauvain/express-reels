import React, { useRef, useEffect } from 'react'
import { Play, Pause, Square, SkipBack, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { usePlaybackStore } from '../store/playbackStore'

export function LivePreviewTransport(): React.ReactElement {
  const targetDuration = useProjectStore((s) => s.targetDuration)
  const setTargetDuration = useProjectStore((s) => s.setTargetDuration)
  const autoAdjustTargetDuration = useProjectStore((s) => s.autoAdjustTargetDuration)
  const setAutoAdjustTargetDuration = useProjectStore((s) => s.setAutoAdjustTargetDuration)
  const isKenBurnsLocked = useProjectStore((s) => s.isKenBurnsLocked)
  const setKenBurnsLocked = useProjectStore((s) => s.setKenBurnsLocked)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const setIsPlaying = usePlaybackStore((s) => s.setIsPlaying)
  const setPlayhead = usePlaybackStore((s) => s.setPlayhead)

  return (
    <div className="live-preview-transport">
      {/* Target Duration Input */}
      <div className="live-preview-target-dur">
        <label className="live-preview-target-dur-label" title="Target Project Duration">
          Target:
        </label>
        <input
          type="number"
          className="hide-spinners live-preview-time-input"
          title="Target Duration Minutes"
          min="0"
          step="1"
          value={targetDuration !== null ? Math.floor(targetDuration / 60) || '' : ''}
          placeholder="Min"
          onChange={(e) => {
            const m = Math.max(0, parseInt(e.target.value) || 0)
            const s = targetDuration !== null ? Math.floor(targetDuration % 60) : 0
            const total = m * 60 + s
            setTargetDuration(total <= 0 && e.target.value === '' ? null : total)
          }}
        />
        <span className="live-preview-time-sep">:</span>
        <input
          type="number"
          className="hide-spinners live-preview-time-input"
          min="0"
          max="59"
          step="1"
          value={
            targetDuration !== null
              ? Math.floor(targetDuration % 60) || (targetDuration === 0 ? '0' : '')
              : ''
          }
          title="Target Duration Seconds"
          placeholder="Sec"
          onChange={(e) => {
            const m = targetDuration !== null ? Math.floor(targetDuration / 60) : 0
            let s = parseInt(e.target.value) || 0
            s = Math.max(0, Math.min(59, s))
            const total = m * 60 + s
            setTargetDuration(total <= 0 && e.target.value === '' && m === 0 ? null : total)
          }}
        />
        <label
          className="live-preview-lock-label"
          title="Auto-adjust target duration when clips are resized"
        >
          <input
            type="checkbox"
            checked={!autoAdjustTargetDuration}
            onChange={(e) => setAutoAdjustTargetDuration(!e.target.checked)}
            className="live-preview-lock-input"
          />
          Lock Duration
        </label>
        <label
          className="live-preview-lock-label live-preview-lock-kb"
          title="Lock Ken Burns canvas editing"
        >
          <input
            type="checkbox"
            checked={isKenBurnsLocked}
            onChange={(e) => setKenBurnsLocked(e.target.checked)}
            className="live-preview-lock-input"
          />
          Lock KB
        </label>
      </div>

      {/* Playback Buttons */}
      <div className="live-preview-buttons">
        {useProjectStore.getState().selectedClipId && (
          <button
            onClick={() => {
              const state = useProjectStore.getState()
              if (state.activeKeyframeId && state.selectedClipId) {
                const clip = state.clips.find((c) => c.id === state.selectedClipId)
                if (clip?.kenBurnsEffect?.keyframes?.find((k) => k.id === state.activeKeyframeId)) {
                  state.saveHistory()
                  state.removeKenBurnsKeyframe(state.selectedClipId, state.activeKeyframeId)
                  state.setActiveKeyframeId(null)
                  return
                } else if (
                  clip?.audioConfig?.keyframes?.find((k) => k.id === state.activeKeyframeId)
                ) {
                  state.saveHistory()
                  state.removeAudioKeyframe(state.selectedClipId, state.activeKeyframeId)
                  state.setActiveKeyframeId(null)
                  return
                }
              }
              // Fallback to deleting clip
              state.removeClip(state.selectedClipId!)
              state.setSelectedClipId(null)
            }}
            className="live-preview-btn live-preview-btn-danger"
            title={
              useProjectStore.getState().activeKeyframeId
                ? 'Delete Selected Keyframe'
                : 'Delete Selected Clip'
            }
          >
            <Trash2 size={16} />
          </button>
        )}

        <div className="live-preview-divider" />
        <button
          onClick={() => setPlayhead(0)}
          className="live-preview-btn"
          title="Reset to beginning"
        >
          <SkipBack size={16} />
        </button>

        <button
          onClick={() => setPlayhead((prev) => Math.max(0, prev - 0.1))}
          className="live-preview-btn"
          title="Step backward"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          onClick={() => {
            setPlayhead(0)
            setIsPlaying(false)
          }}
          className="live-preview-btn"
          title="Stop"
        >
          <Square size={14} fill="currentColor" />
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="live-preview-btn-main"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>

        <button
          onClick={() => setPlayhead((prev) => prev + 0.1)}
          className="live-preview-btn"
          title="Step forward"
        >
          <ChevronRight size={18} />
        </button>

        <PlayheadTime />
      </div>
    </div>
  )
}

const PlayheadTime = (): React.ReactElement => {
  const ref = useRef<HTMLDivElement>(null)

  const formatTime = (timeInSeconds: number): string => {
    const mins = Math.floor(timeInSeconds / 60)
      .toString()
      .padStart(2, '0')
    const secs = Math.floor(timeInSeconds % 60)
      .toString()
      .padStart(2, '0')
    const ms = Math.floor((timeInSeconds % 1) * 100)
      .toString()
      .padStart(2, '0')
    return `${mins}:${secs}.${ms}`
  }

  useEffect(() => {
    const unsub = usePlaybackStore.subscribe((state, prevState) => {
      if (ref.current && state.playhead !== prevState.playhead) {
        ref.current.innerText = formatTime(state.playhead)
      }
    })

    if (ref.current) {
      ref.current.innerText = formatTime(usePlaybackStore.getState().playhead)
    }

    return unsub
  }, [])

  return (
    <div ref={ref} className="live-preview-time-display">
      {formatTime(usePlaybackStore.getState().playhead)}
    </div>
  )
}
