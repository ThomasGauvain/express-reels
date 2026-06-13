import React, { useState, useCallback, useRef, useLayoutEffect } from 'react'
import { X, Save, FolderOpen, Download, Send } from 'lucide-react'
import { InstrumentLibrary } from './InstrumentLibrary'
import { CommandLibrary } from './CommandLibrary'
import { CompositionCopilot } from './CompositionCopilot'
import { InstrumentPanel } from './InstrumentPanel'
import { StudioTimeline } from './StudioTimeline'
import { useSoundStudioStore } from '../store/soundStudioStore'
import { audioEngine } from './audioEngine'

export function SoundStudio(): React.ReactElement {
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [timelineHeight, setTimelineHeight] = useState(280)
  const resizingRef = useRef<null | 'sidebar' | 'timeline'>(null)
  const startPosRef = useRef(0)
  const startSizeRef = useRef(0)
  const copilotSendRef = useRef<((prompt: string) => void) | null>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const clearAll = useSoundStudioStore((s) => s.clearAll)
  const undo = useSoundStudioStore((s) => s.undo)
  const redo = useSoundStudioStore((s) => s.redo)
  const tracks = useSoundStudioStore((s) => s.tracks)
  const clips = useSoundStudioStore((s) => s.clips)
  const bpm = useSoundStudioStore((s) => s.bpm)
  const totalMeasures = useSoundStudioStore((s) => s.totalMeasures)
  const beatsPerMeasure = useSoundStudioStore((s) => s.beatsPerMeasure)

  // ── Window controls ──────────────────────────────────────────────────────────
  interface SsApi {
    minimize: () => void
    maximize: () => void
    close: () => void
    saveProject: (data: string) => Promise<string | null>
    openProject: () => Promise<{ data: string } | null>
    exportAudio: (b64: string, fmt: string) => Promise<string | false>
    sendToLibrary: (item: string) => void
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssApi = (window as any).soundStudioApi as SsApi | undefined

  const handleMinimize = (): void => ssApi?.minimize()
  const handleMaximize = (): void => ssApi?.maximize()
  const handleClose = (): void => ssApi?.close()

  // ── Resize handlers ──────────────────────────────────────────────────────────
  const startResize = useCallback(
    (type: 'sidebar' | 'timeline', e: React.MouseEvent) => {
      e.preventDefault()
      resizingRef.current = type
      startPosRef.current = type === 'sidebar' ? e.clientX : e.clientY
      startSizeRef.current = type === 'sidebar' ? sidebarWidth : timelineHeight

      const onMove = (ev: MouseEvent): void => {
        const delta =
          type === 'sidebar' ? ev.clientX - startPosRef.current : ev.clientY - startPosRef.current
        if (type === 'sidebar') {
          setSidebarWidth(Math.max(160, Math.min(400, startSizeRef.current + delta)))
        } else {
          setTimelineHeight(
            Math.max(160, Math.min(window.innerHeight * 0.6, startSizeRef.current - delta))
          )
        }
      }
      const onUp = (): void => {
        resizingRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [sidebarWidth, timelineHeight]
  )

  // Apply dynamic resize dimensions imperatively to avoid style={{}} in JSX
  useLayoutEffect(() => {
    sidebarRef.current?.style.setProperty('--ss-sidebar-w', `${sidebarWidth}px`)
  }, [sidebarWidth])

  useLayoutEffect(() => {
    timelineRef.current?.style.setProperty('--ss-timeline-h', `${timelineHeight}px`)
  }, [timelineHeight])

  // ── Save / Open ──────────────────────────────────────────────────────────────
  const handleSave = async (): Promise<void> => {
    try {
      const data = JSON.stringify({ tracks, clips, bpm, totalMeasures, beatsPerMeasure }, null, 2)
      await ssApi?.saveProject(data)
    } catch (e) {
      alert(`Failed to save project: ${e instanceof Error ? e.message : String(e)}`)
      console.error('Save Project Error:', e)
    }
  }

  const handleOpen = async (): Promise<void> => {
    const result = await ssApi?.openProject()
    if (result?.data) {
      try {
        const parsed = JSON.parse(result.data)
        const { setBpm, setTotalMeasures, setBeatsPerMeasure } = useSoundStudioStore.getState()
        if (parsed.bpm) setBpm(parsed.bpm)
        if (parsed.totalMeasures) setTotalMeasures(parsed.totalMeasures)
        if (parsed.beatsPerMeasure) setBeatsPerMeasure(parsed.beatsPerMeasure)
        useSoundStudioStore.setState({ tracks: parsed.tracks || [], clips: parsed.clips || [] })
      } catch (e) {
        console.error('Failed to parse project file', e)
      }
    }
  }

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleExport = async (format: 'wav' | 'mp3' | 'aac'): Promise<void> => {
    await audioEngine.preloadAllSamples()
    const wavBuffer = await audioEngine.exportToWav(
      clips,
      tracks,
      bpm,
      totalMeasures,
      beatsPerMeasure
    )

    // Safely convert to base64 using FileReader
    const blob = new Blob([wavBuffer], { type: 'audio/wav' })
    const base64 = await blobToBase64(blob)

    await ssApi?.exportAudio(base64, format)
  }

  const handleSendToLibrary = async (): Promise<void> => {
    await audioEngine.preloadAllSamples()
    const wavBuffer = await audioEngine.exportToWav(
      clips,
      tracks,
      bpm,
      totalMeasures,
      beatsPerMeasure
    )
    const blob = new Blob([wavBuffer], { type: 'audio/wav' })
    const base64 = await blobToBase64(blob)
    ssApi?.sendToLibrary(JSON.stringify({ type: 'audio-export', bpm, base64 }))
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const key = e.key.toLowerCase()

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
        e.preventDefault()
        redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedClipId, removeClip } = useSoundStudioStore.getState()
        if (selectedClipId) {
          removeClip(selectedClipId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // Apply Electron window drag regions via JS — avoids CSS linter warnings
  // (-webkit-app-region has no standard equivalent and can't be suppressed in VS Code's CSS validator)
  React.useEffect(() => {
    const drag = (sel: string): void => {
      ;(document.querySelector(sel) as HTMLElement | null)?.style.setProperty(
        '-webkit-app-region',
        'drag'
      )
    }
    const noDrag = (sel: string): void => {
      ;(document.querySelector(sel) as HTMLElement | null)?.style.setProperty(
        '-webkit-app-region',
        'no-drag'
      )
    }
    drag('.ss-titlebar')
    drag('.ss-titlebar-title')
    noDrag('.ss-titlebar-btns')
    noDrag('.ss-titlebar-actions')
  }, [])

  return (
    <div className="ss-root">
      {/* Title Bar */}
      <div className="ss-titlebar">
        <div className="ss-titlebar-btns">
          <button className="ss-titlebar-btn close" onClick={handleClose} title="Close" />
          <button className="ss-titlebar-btn minimize" onClick={handleMinimize} title="Minimize" />
          <button className="ss-titlebar-btn maximize" onClick={handleMaximize} title="Maximize" />
        </div>
        <span className="ss-titlebar-title">🎵 Sound Studio</span>
        <div className="ss-titlebar-actions">
          <button className="ss-btn" onClick={handleOpen} title="Open Project">
            <FolderOpen size={11} /> Open
          </button>
          <button className="ss-btn" onClick={handleSave} title="Save Project">
            <Save size={11} /> Save
          </button>
          <button className="ss-btn" onClick={() => handleExport('wav')} title="Export WAV">
            <Download size={11} /> WAV
          </button>
          <button className="ss-btn" onClick={() => handleExport('mp3')} title="Export MP3">
            <Download size={11} /> MP3
          </button>
          <button className="ss-btn" onClick={() => handleExport('aac')} title="Export AAC">
            <Download size={11} /> AAC
          </button>
          <button className="ss-btn" onClick={handleSendToLibrary} title="Send to Main App Library">
            <Send size={11} /> Send to Library
          </button>
          <button className="ss-btn danger" onClick={clearAll} title="Clear All Tracks">
            <X size={11} /> Clear
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="ss-body">
        {/* Left Sidebar */}
        <div className="ss-sidebar" ref={sidebarRef}>
          <InstrumentLibrary />
          <CommandLibrary onCommand={(prompt) => copilotSendRef.current?.(prompt)} />
          <CompositionCopilot onSendRef={copilotSendRef} />
        </div>

        {/* Resize handle — sidebar */}
        <div
          className="ss-resize-handle-v"
          onMouseDown={(e) => startResize('sidebar', e)}
          title="Drag to resize"
        />

        {/* Main area */}
        <div className="ss-main">
          {/* Instrument Panel */}
          <div className="ss-instrument-panel">
            <InstrumentPanel />
          </div>

          {/* Resize handle — timeline */}
          <div
            className="ss-resize-handle-h"
            onMouseDown={(e) => startResize('timeline', e)}
            title="Drag to resize timeline"
          />

          {/* Timeline */}
          <div className="ss-timeline-wrapper" ref={timelineRef}>
            <StudioTimeline cellWidth={40} />
          </div>
        </div>
      </div>
    </div>
  )
}
