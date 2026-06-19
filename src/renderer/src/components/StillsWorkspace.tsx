import React, { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useProjectStore } from '../store/projectStore'
import { useShallow } from 'zustand/react/shallow'
import { Star, Flag } from 'lucide-react'
import { StillsSlidersPanel } from './StillsSlidersPanel'
import { StillsPresetsPanel } from './StillsPresetsPanel'
import { StillsCanvas } from './StillsCanvas'
import { StillsHistogram } from './StillsHistogram'
import { StillsAiAssistant } from './StillsAiAssistant'
import { extractRawThumbnail } from '../lib/rawProcessor'
import './StillsWorkspace.css'

export function StillsWorkspace(): React.ReactElement {
  const [isCropping, setIsCropping] = useState(false)
  const { mediaLibrary, selectedMediaId, setSelectedMediaId, updateMediaStillsData, addMedia } =
    useProjectStore(
      useShallow((s) => ({
        mediaLibrary: s.mediaLibrary,
        selectedMediaId: s.selectedMediaId,
        setSelectedMediaId: s.setSelectedMediaId,
        updateMediaStillsData: s.updateMediaStillsData,
        addMedia: s.addMedia
      }))
    )

  // Filter only images for the stills workflow
  const stillImages = mediaLibrary.filter((m) => m.type === 'image' && m.workspace === 'stills')
  const selectedImage = stillImages.find((m) => m.id === selectedMediaId)

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (stillImages.length === 0) return

      const currentIndex = stillImages.findIndex((m) => m.id === selectedMediaId)

      // Navigation: Arrow Keys
      if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          setSelectedMediaId(stillImages[currentIndex - 1].id)
        }
        e.preventDefault()
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < stillImages.length - 1) {
          setSelectedMediaId(stillImages[currentIndex + 1].id)
        } else if (currentIndex === -1 && stillImages.length > 0) {
          setSelectedMediaId(stillImages[0].id)
        }
        e.preventDefault()
      }

      // Ratings (1-5) and Flags (P, X, U)
      if (selectedMediaId) {
        if (['1', '2', '3', '4', '5'].includes(e.key)) {
          updateMediaStillsData(selectedMediaId, { rating: parseInt(e.key) })
          e.preventDefault()
        } else if (e.key === '0') {
          updateMediaStillsData(selectedMediaId, { rating: 0 })
          e.preventDefault()
        } else if (e.key.toLowerCase() === 'p') {
          updateMediaStillsData(selectedMediaId, { flag: 'pick' })
          e.preventDefault()
        } else if (e.key.toLowerCase() === 'x') {
          updateMediaStillsData(selectedMediaId, { flag: 'reject' })
          e.preventDefault()
        } else if (e.key.toLowerCase() === 'u') {
          updateMediaStillsData(selectedMediaId, { flag: 'none' })
          e.preventDefault()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedMediaId, stillImages, setSelectedMediaId, updateMediaStillsData])

  // Native Drag and Drop
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)

    const validExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.cr2',
      '.nef',
      '.arw',
      '.dng',
      '.tiff',
      '.webp'
    ]
    const validFiles = files.filter((f) =>
      validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
    )

    const newItems = await Promise.all(
      validFiles.map(async (file) => {
        const electronFile = file as File & { path?: string }
        const thumbUrl = await extractRawThumbnail(file)

        return {
          id: crypto.randomUUID(),
          path: thumbUrl || electronFile.path || URL.createObjectURL(file),
          name: file.name,
          type: 'image' as const,
          workspace: 'stills' as const,
          rating: 0,
          flag: 'none' as const,
          edits: {}
        }
      })
    )

    if (newItems.length > 0) {
      addMedia(newItems)
      if (!selectedMediaId) {
        setSelectedMediaId(newItems[0].id)
      }
    }
  }

  const processPathsForStills = async (paths: string[]): Promise<void> => {
    const validExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.cr2',
      '.nef',
      '.arw',
      '.dng',
      '.tiff',
      '.webp'
    ]
    const validPaths = paths.filter((p) =>
      validExtensions.some((ext) => p.toLowerCase().endsWith(ext))
    )

    const newItems = await Promise.all(
      validPaths.map(async (path) => {
        const name = path.split('\\').pop() || path.split('/').pop() || 'Unknown'
        const fileUrl =
          path.startsWith('blob:') || path.startsWith('http:')
            ? path
            : `file:///${path.replace(/\\/g, '/')}`

        let thumbUrl: string | null = null
        try {
          const res = await fetch(fileUrl)
          const blob = await res.blob()
          const fakeFile = new File([blob], name, { type: blob.type })
          thumbUrl = await extractRawThumbnail(fakeFile)
        } catch (err) {
          console.error('Error extracting thumbnail for', name, err)
        }

        return {
          id: crypto.randomUUID(),
          path: thumbUrl || path,
          name,
          type: 'image' as const,
          workspace: 'stills' as const,
          rating: 0,
          flag: 'none' as const,
          edits: {}
        }
      })
    )

    if (newItems.length > 0) {
      addMedia(newItems)
      if (!selectedMediaId) {
        setSelectedMediaId(newItems[0].id)
      }
    }
  }

  const handleImportFiles = async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filePaths: string[] = await (window as any).electron.ipcRenderer.invoke('dialog:openFile')
    if (filePaths && filePaths.length > 0) {
      processPathsForStills(filePaths)
    }
  }

  const handleImportFolder = async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filePaths: string[] = await (window as any).electron.ipcRenderer.invoke(
      'dialog:openDirectory'
    )
    if (filePaths && filePaths.length > 0) {
      processPathsForStills(filePaths)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
  }

  return (
    <div className="stills-workspace" onDrop={handleDrop} onDragOver={handleDragOver}>
      <PanelGroup direction="horizontal" style={{ flex: 1, overflow: 'hidden' }}>
        {/* LEFT PANEL: Editing Tools / Presets */}
        <Panel defaultSize={20} minSize={15} maxSize={30}>
          <StillsPresetsPanel />
        </Panel>

        <PanelResizeHandle className="resize-handle-h" />

        {/* MAIN CENTER PANEL: Live Preview & Filmstrip */}
        <Panel defaultSize={60} minSize={40}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={80} minSize={50}>
              <div className="stills-panel stills-preview-panel">
                {selectedImage ? (
                  <div className="stills-main-preview">
                    <StillsCanvas
                      imagePath={selectedImage.path}
                      edits={(selectedImage.edits as Record<string, number>) || {}}
                      isCropping={isCropping}
                      onCropComplete={(crop) => {
                        updateMediaStillsData(selectedImage.id, {
                          edits: { ...selectedImage.edits, crop }
                        })
                        setIsCropping(false)
                      }}
                    />

                    <div className="stills-toolbar-overlay">
                      <button
                        className="tool-btn"
                        onClick={() => {
                          const currentRotate = ((selectedImage.edits?.rotate as number) || 0) + 90
                          updateMediaStillsData(selectedImage.id, {
                            edits: { ...selectedImage.edits, rotate: currentRotate }
                          })
                        }}
                      >
                        Rotate 90°
                      </button>
                      <button
                        className={`tool-btn ${isCropping ? 'active' : ''}`}
                        onClick={() => setIsCropping(!isCropping)}
                      >
                        {isCropping ? 'Cancel Crop' : 'Crop'}
                      </button>
                    </div>

                    <div className="stills-overlay-info">
                      <span className="file-name">{selectedImage.name}</span>
                      <div className="rating-flags">
                        {selectedImage.flag === 'pick' && <Flag size={16} fill="white" />}
                        {selectedImage.flag === 'reject' && <Flag size={16} color="red" />}
                        {selectedImage.rating && selectedImage.rating > 0 ? (
                          <div className="stars">
                            {Array.from({ length: selectedImage.rating }).map((_, i) => (
                              <Star key={i} size={16} fill="white" />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="stills-preview-container stills-empty-container">
                    <p className="stills-placeholder-text">Drop Images Here to Import</p>
                    <div className="stills-empty-actions">
                      <button className="tool-btn" onClick={handleImportFiles}>
                        Import Files
                      </button>
                      <button className="tool-btn" onClick={handleImportFolder}>
                        Import Folder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
            <PanelResizeHandle className="resize-handle-v" />
            <Panel defaultSize={20} minSize={10} maxSize={30}>
              <div className="stills-panel stills-filmstrip-panel">
                <div className="stills-filmstrip-header">
                  <span className="stills-filmstrip-title">Filmstrip</span>
                  <div className="stills-filmstrip-actions">
                    <button className="tool-btn stills-filmstrip-btn" onClick={handleImportFiles}>
                      + Files
                    </button>
                    <button className="tool-btn stills-filmstrip-btn" onClick={handleImportFolder}>
                      + Folder
                    </button>
                  </div>
                </div>
                <div className="filmstrip-scroll">
                  {stillImages.map((img) => (
                    <div
                      key={img.id}
                      className={`filmstrip-thumbnail ${selectedMediaId === img.id ? 'selected' : ''}`}
                      onClick={() => setSelectedMediaId(img.id)}
                    >
                      <img src={img.path} alt={img.name} />
                      <div className="thumbnail-badges">
                        {img.flag === 'pick' && <Flag size={10} fill="white" />}
                        {img.flag === 'reject' && <Flag size={10} color="red" />}
                        {img.rating && img.rating > 0 ? (
                          <span className="rating-badge">{img.rating}★</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="resize-handle-h" />

        {/* RIGHT PANEL: Histogram, Edit Sliders & AI Chat */}
        <Panel defaultSize={20} minSize={15} maxSize={30}>
          <PanelGroup direction="vertical">
            {/* Histogram */}
            <Panel defaultSize={20} minSize={15} maxSize={30}>
              {selectedImage ? (
                <StillsHistogram
                  imagePath={selectedImage.path}
                  edits={(selectedImage.edits as Record<string, number>) || {}}
                />
              ) : (
                <div className="stills-panel">
                  <p className="stills-placeholder-text">Histogram</p>
                </div>
              )}
            </Panel>
            <PanelResizeHandle className="resize-handle-v" />

            <Panel defaultSize={40} minSize={20}>
              <StillsSlidersPanel />
            </Panel>
            <PanelResizeHandle className="resize-handle-v" />
            <Panel defaultSize={40} minSize={20}>
              <StillsAiAssistant />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  )
}
