import { type ReactElement, useEffect, useRef } from 'react'
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
import { useShallow } from 'zustand/react/shallow'

declare global {
  interface Window {
    logDebug?: (msg: string) => void
  }
}

function App(): ReactElement {
  // Auto-migrate old media files to have attributions
  const hasMigrated = useRef(false)
  useEffect(() => {
    if (hasMigrated.current) return
    hasMigrated.current = true

    const migrateAttributions = async (): Promise<void> => {
      const state = useProjectStore.getState()
      const freesoundKey = state.aiKeys.freesound
      const jamendoKey = state.aiKeys.jamendo
      let modified = false

      const updatedLibrary = [...state.mediaLibrary]

      for (let i = 0; i < updatedLibrary.length; i++) {
        const item = { ...updatedLibrary[i] }
        if (item.type === 'audio' && !item.attribution) {
          if (item.id.startsWith('freesound-') && freesoundKey) {
            try {
              const fsId = item.id.replace('freesound-', '')
              const res = await fetch(
                `https://freesound.org/apiv2/sounds/${fsId}/?token=${freesoundKey}&fields=id,username,license`
              )
              if (res.ok) {
                const audio = await res.json()
                if (audio.license && !audio.license.toLowerCase().includes('zero')) {
                  item.attribution = `Sound by ${audio.username || 'Creator'} on Freesound.org (${audio.license})`
                  modified = true
                }
              }
            } catch (e) {
              console.error('Migration Freesound error', e)
            }
          }
          if (item.id.startsWith('jamendo-') && jamendoKey) {
            try {
              const jId = item.id.replace('jamendo-', '')
              const res = await fetch(
                `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoKey}&format=json&id=${jId}`
              )
              if (res.ok) {
                const data = await res.json()
                if (data.results && data.results.length > 0) {
                  const track = data.results[0]
                  if (track.license_ccurl && !track.license_ccurl.includes('publicdomain')) {
                    item.attribution = `Music by ${track.artist_name || 'Artist'} from Jamendo (CC BY)`
                    modified = true
                  } else if (!track.license_ccurl) {
                    item.attribution = `Music by ${track.artist_name || 'Artist'} from Jamendo`
                    modified = true
                  }
                }
              }
            } catch (e) {
              console.error('Migration Jamendo error', e)
            }
          }
        }
        updatedLibrary[i] = item
      }

      if (modified) {
        useProjectStore.setState({ mediaLibrary: updatedLibrary })
        useProjectStore.getState().saveHistory()
        console.log('Successfully migrated existing media to include attributions!')
      }
    }

    migrateAttributions()
  }, [])

  useEffect(() => {
    // Reverse accidental duration: 5 bug for overlays (Wait for state to load)
    const unsub = useProjectStore.subscribe((state) => {
      if (state.clips.length === 0) return
      let hasCorrupted = false
      const restoredClips = state.clips.map((clip) => {
        if (clip.duration === 5) {
          const media = state.mediaLibrary.find((m) => m.id === clip.mediaId)
          const isOverlay = (clip.name || media?.name || '').toLowerCase().includes('overlay')
          if (isOverlay) {
            hasCorrupted = true
            return { ...clip, duration: Infinity }
          }
        }
        return clip
      })
      if (hasCorrupted) {
        useProjectStore.setState({ clips: restoredClips })
      }
    })

    // Catch invisible runtime errors
    const debugDiv = document.createElement('div')
    debugDiv.style.position = 'fixed'
    debugDiv.style.top = '10px'
    debugDiv.style.right = '10px'
    debugDiv.style.background = 'rgba(0,0,0,0.8)'
    debugDiv.style.color = 'lime'
    debugDiv.style.zIndex = '999999'
    debugDiv.style.padding = '10px'
    debugDiv.style.pointerEvents = 'auto'
    debugDiv.style.userSelect = 'text'
    debugDiv.style.fontFamily = 'monospace'
    debugDiv.style.whiteSpace = 'pre-wrap'
    debugDiv.style.maxWidth = '400px'
    debugDiv.style.maxHeight = '300px'
    debugDiv.style.overflow = 'auto'
    debugDiv.style.borderRadius = '4px'
    debugDiv.style.setProperty('-webkit-app-region', 'no-drag')
    document.body.appendChild(debugDiv)

    const logLines: string[] = []

    const updateDebugDiv = (): void => {
      if (logLines.length === 0) {
        debugDiv.style.display = 'none'
      } else {
        debugDiv.style.display = 'block'
        debugDiv.innerText = logLines.join('\n') + '\n\n(Double-click to clear)'
      }
    }

    updateDebugDiv() // start hidden

    window.logDebug = (msg: string) => {
      logLines.push(msg)
      if (logLines.length > 10) logLines.shift()
      updateDebugDiv()
    }

    debugDiv.ondblclick = () => {
      logLines.length = 0
      updateDebugDiv()
    }

    const oldError = console.error
    console.error = (...args) => {
      window.logDebug?.('ERROR: ' + args.join(' '))
      oldError(...args)
    }
    const handleError = (e: ErrorEvent): void => {
      window.logDebug?.(`[Window Error] ${e.message} @ ${e.filename}:${e.lineno}`)
    }
    window.addEventListener('error', handleError)

    return () => {
      document.body.removeChild(debugDiv)
      console.error = oldError
      window.removeEventListener('error', handleError)
      unsub()
    }
  }, [])

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
