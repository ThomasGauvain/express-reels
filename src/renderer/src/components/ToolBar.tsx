import React from 'react'
import {
  MousePointer2,
  Scissors,
  Move,
  Trash2,
  Copy,
  SplitSquareHorizontal,
  Save
} from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { useShallow } from 'zustand/react/shallow'

export function ToolBar(): React.ReactElement {
  const {
    activeTool,
    setActiveTool,
    selectedClipId,
    removeClip,
    rangeMarkers,
    rangeSelectedTrackIds
  } = useProjectStore(
    useShallow((s) => ({
      activeTool: s.activeTool,
      setActiveTool: s.setActiveTool,
      selectedClipId: s.selectedClipId,
      removeClip: s.removeClip,
      rangeMarkers: s.rangeMarkers,
      rangeSelectedTrackIds: s.rangeSelectedTrackIds
    }))
  )

  return (
    <div className="panel panel-d-tools">
      <button
        className={`tool-btn ${activeTool === 'pointer' ? 'active' : ''}`}
        onClick={() => setActiveTool('pointer')}
        title="Pointer (V)"
      >
        <MousePointer2 size={18} />
      </button>
      <button
        className={`tool-btn ${activeTool === 'razor' ? 'active' : ''}`}
        onClick={() => setActiveTool('razor')}
        title="Razor/Slice (C)"
      >
        <Scissors size={18} />
      </button>
      <button
        className={`tool-btn ${activeTool === 'crop' ? 'active' : ''}`}
        onClick={() => setActiveTool('crop')}
        title="Crop/Ripple Delete (X)"
      >
        <Move size={18} />
      </button>

      <div className="tool-divider" />

      <button
        className={`tool-btn ${activeTool === 'range-copy' ? 'active' : ''}`}
        onClick={() => setActiveTool('range-copy')}
        title="Range Copy"
      >
        <Copy size={18} />
      </button>
      {activeTool === 'range-copy' &&
        rangeSelectedTrackIds.length > 0 &&
        rangeMarkers.start !== null &&
        rangeMarkers.end !== null && (
          <button
            className="tool-btn text-blue-400 animate-pulse"
            onClick={() => useProjectStore.getState().executeRangeAction('copy')}
            title="Execute Copy"
          >
            <Save size={14} /> <span className="execute-action-text">COPY</span>
          </button>
        )}

      <button
        className={`tool-btn ${activeTool === 'range-cut' ? 'active' : ''}`}
        onClick={() => setActiveTool('range-cut')}
        title="Range Cut"
      >
        <SplitSquareHorizontal size={18} />
      </button>
      {activeTool === 'range-cut' &&
        rangeSelectedTrackIds.length > 0 &&
        rangeMarkers.start !== null &&
        rangeMarkers.end !== null && (
          <button
            className="tool-btn text-blue-400 animate-pulse"
            onClick={() => useProjectStore.getState().executeRangeAction('cut')}
            title="Execute Cut"
          >
            <Save size={14} /> <span className="execute-action-text">CUT</span>
          </button>
        )}

      <div className="tool-divider" />

      <button
        className={`tool-btn delete-tool-btn ${selectedClipId ? 'active-delete' : 'disabled-delete'}`}
        onClick={() => {
          const state = useProjectStore.getState()
          if (state.activeKeyframeId && state.selectedClipId) {
            const clip = state.clips.find((c) => c.id === state.selectedClipId)
            if (clip?.kenBurnsEffect?.keyframes?.find((k) => k.id === state.activeKeyframeId)) {
              state.saveHistory()
              state.removeKenBurnsKeyframe(state.selectedClipId, state.activeKeyframeId)
              state.setActiveKeyframeId(null)
              return
            } else if (clip?.audioConfig?.keyframes?.find((k) => k.id === state.activeKeyframeId)) {
              state.saveHistory()
              state.removeAudioKeyframe(state.selectedClipId, state.activeKeyframeId)
              state.setActiveKeyframeId(null)
              return
            }
          }
          if (selectedClipId) {
            removeClip(selectedClipId)
          }
        }}
        title={
          useProjectStore.getState().activeKeyframeId
            ? 'Delete Selected Keyframe (Del/Backspace)'
            : 'Delete Selected Clip (Del/Backspace)'
        }
        disabled={!selectedClipId}
      >
        <Trash2 size={18} />
      </button>
    </div>
  )
}
