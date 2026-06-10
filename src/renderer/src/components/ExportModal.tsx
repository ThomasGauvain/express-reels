/* eslint-disable @typescript-eslint/no-explicit-any */
import './ExportModal.css'
import { useState, useRef, useEffect } from 'react'
import { X, Video, Smartphone, Monitor, Image, Loader2 } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { ExportEngine } from './ExportEngine'

export function ExportModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const { exportSettings, setExportSettings } = useProjectStore()
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressBarRef = useRef<HTMLDivElement>(null)

  // Dragging state
  const modalRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const currentPos = useRef({ x: 0, y: 0 })

  useEffect((): void => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progress}%`
    }
  }, [progress])

  const handleExport = async (): Promise<void> => {
    setIsExporting(true)
    setProgress(0)
  }

  const handleExportComplete = async (blob: Blob): Promise<void> => {
    setIsExporting(false)

    // Save file via IPC
    const buffer = await blob.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )

    const format = currentSettings.format
    await window.electron.ipcRenderer.invoke('save-video', base64, format)
    onClose()
  }

  const handleExportError = (err: Error): void => {
    console.error('Export failed', err)
    setIsExporting(false)
    alert('Export failed: ' + err.message)
  }

  const aspectRatios = [
    {
      id: '16:9',
      name: 'YouTube / X / Standard',
      icon: <Monitor size={24} />,
      width: 1920,
      height: 1080
    },
    {
      id: '9:16',
      name: 'TikTok / Facebook Reels / IG',
      icon: <Smartphone size={24} />,
      width: 1080,
      height: 1920
    },
    {
      id: '4:5',
      name: 'Instagram / FB Post',
      icon: <Image size={24} />,
      width: 1080,
      height: 1350
    },
    { id: '1:1', name: 'Square / X', icon: <Video size={24} />, width: 1080, height: 1080 }
  ]

  const currentSettings = exportSettings || {
    format: 'webm',
    aspectRatio: '9:16',
    resolution: 1080
  }

  return (
    <div className="modal-overlay exportmodal-style-1" onClick={onClose}>
      {isExporting && (
        <ExportEngine
          onProgress={setProgress}
          onComplete={handleExportComplete}
          onError={handleExportError}
        />
      )}
      <div
        ref={modalRef}
        className="modal-content exportmodal-style-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header"
          onPointerDown={(e) => {
            isDragging.current = true
            dragStartPos.current = {
              x: e.clientX - currentPos.current.x,
              y: e.clientY - currentPos.current.y
            }
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (isDragging.current) {
              currentPos.current = {
                x: e.clientX - dragStartPos.current.x,
                y: e.clientY - dragStartPos.current.y
              }
              if (modalRef.current) {
                modalRef.current.style.transform = `translate(${currentPos.current.x}px, ${currentPos.current.y}px)`
              }
            }
          }}
          onPointerUp={(e) => {
            isDragging.current = false
            ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
          }}
        >
          <h2>Export Video</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            disabled={isExporting}
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body exportmodal-style-3">
          {isExporting ? (
            <div className="exportmodal-style-4">
              <Loader2 size={48} className="spin" color="var(--color-accent)" />
              <div className="exportmodal-style-5">
                <div className="exportmodal-style-6">Rendering Video...</div>
                <div className="exportmodal-style-7">Please do not close the application.</div>
              </div>
              <div className="exportmodal-style-8">
                <div ref={progressBarRef} className="progress-bar-fill" />
              </div>
              <div className="exportmodal-style-9">{progress}%</div>
            </div>
          ) : (
            <>
              <div>
                <div className="exportmodal-style-10">Aspect Ratio</div>
                <div className="exportmodal-style-11">
                  {aspectRatios.map((ar) => (
                    <div
                      key={ar.id}
                      onClick={() =>
                        setExportSettings({
                          aspectRatio: ar.id as any,
                          resolution: (ar.width > ar.height ? ar.height : ar.width) as
                            | 1080
                            | 720
                            | 2160
                        })
                      }
                      className={`aspect-ratio-box ${currentSettings.aspectRatio === ar.id ? 'active' : ''}`}
                    >
                      <div className="aspect-ratio-icon">{ar.icon}</div>
                      <div className="exportmodal-style-12">
                        <div className="aspect-ratio-name">{ar.name}</div>
                        <div className="exportmodal-style-13">
                          {ar.width} x {ar.height}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="exportmodal-style-14">Format</div>
                <select
                  className="settings-input exportmodal-style-15"
                  title="Export Format"
                  aria-label="Export Format"
                  value={currentSettings.format}
                  onChange={(e) => setExportSettings({ format: e.target.value as any })}
                >
                  <option value="webm">WebM (High Quality, Fast Render)</option>
                  <option value="mp4">MP4 (Social Media Standard)</option>
                </select>
                {currentSettings.format === 'mp4' && (
                  <div className="exportmodal-style-16">
                    Note: MP4 export requires FFmpeg conversion after rendering. It may take
                    slightly longer.
                  </div>
                )}
              </div>

              <button onClick={handleExport} className="exportmodal-style-17">
                Start Export
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
