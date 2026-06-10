import { type ReactElement } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { TitleBar } from './components/TitleBar'
import { MediaLibrary } from './components/MediaLibrary'
import { EffectsPalette } from './components/EffectsPalette'
import { LivePreview } from './components/LivePreview'
import { CopilotSidebar } from './components/CopilotSidebar'
import {
  MousePointer2,
  Scissors,
  Move,
  Trash2,
  Copy,
  SplitSquareHorizontal,
  Save
} from 'lucide-react'
import { Timeline } from './components/Timeline'
import { useProjectStore } from './store/projectStore'

function App(): ReactElement {
  const {
    activeTool,
    setActiveTool,
    selectedClipId,
    removeClip,
    rangeMarkers,
    rangeSelectedTrackIds
  } = useProjectStore()

  return (
    <>
      <TitleBar />

      <PanelGroup direction="horizontal" style={{ flex: 1, overflow: 'hidden' }}>
        {/* LEFT SIDEBAR: Library & AI */}
        <Panel defaultSize={20} minSize={15} maxSize={40}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={50} minSize={20}>
              <MediaLibrary />
            </Panel>
            <PanelResizeHandle className="resize-handle-v" />
            <Panel defaultSize={50} minSize={20}>
              <CopilotSidebar />
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="resize-handle-h" />

        {/* MAIN WORKSPACE: Effects, Preview, Timeline */}
        <Panel defaultSize={80} minSize={50}>
          <PanelGroup direction="vertical">
            {/* Top Workspace */}
            <Panel defaultSize={70} minSize={40}>
              <PanelGroup direction="horizontal">
                {/* PANEL B: Effects Palette */}
                <Panel defaultSize={25} minSize={15} maxSize={40}>
                  <EffectsPalette />
                </Panel>

                <PanelResizeHandle className="resize-handle-h" />

                {/* PANEL C: Live Preview */}
                <Panel defaultSize={70} minSize={30}>
                  <LivePreview />
                </Panel>

                <PanelResizeHandle className="resize-handle-h" />

                {/* PANEL D: Tool Bar */}
                <Panel defaultSize={5} minSize={3} maxSize={8}>
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
                        if (selectedClipId) {
                          removeClip(selectedClipId)
                        }
                      }}
                      title="Delete Selected Clip (Del/Backspace)"
                      disabled={!selectedClipId}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>

            <PanelResizeHandle className="resize-handle-v" />

            {/* Bottom Workspace: Timeline */}
            <Panel defaultSize={30} minSize={15}>
              <Timeline />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </>
  )
}

export default App
