/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useProjectStore, MediaItem } from '../store/projectStore'
import { Image as ImageIcon, Video, Music, Scissors, UploadCloud } from 'lucide-react'
import { AudioBrowserModal } from './AudioBrowserModal'

export function MediaLibrary(): React.ReactElement {
  const {
    mediaLibrary,
    deletedSections,
    addMedia,
    selectedMediaId,
    setSelectedMediaId,
    removeMedia
  } = useProjectStore()
  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'deleted'>('media')
  const [isDragging, setIsDragging] = useState(false)
  const [showAudioBrowser, setShowAudioBrowser] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(
    null
  )
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMediaId) {
        removeMedia(selectedMediaId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedMediaId, removeMedia])

  useEffect(() => {
    const handleClick = (): void => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  useLayoutEffect(() => {
    if (contextMenuRef.current && contextMenu) {
      contextMenuRef.current.style.top = `${contextMenu.y}px`
      contextMenuRef.current.style.left = `${contextMenu.x}px`
    }
  }, [contextMenu])

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (): void => {
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleImportClick = async (): Promise<void> => {
    const filePaths: string[] = await window.electron.ipcRenderer.invoke('dialog:openFile')
    if (filePaths && filePaths.length > 0) {
      processFilePaths(filePaths)
    }
  }

  const processFilePaths = async (filePaths: string[]): Promise<void> => {
    console.log('Processing paths:', filePaths)

    const newItems: MediaItem[] = await Promise.all(
      filePaths.map(async (filePath) => {
        const name = filePath.split('\\').pop() || filePath.split('/').pop() || 'Unknown'

        let type: 'image' | 'video' | 'audio' = 'image'
        const ext = name.toLowerCase().split('.').pop()
        if (['mp4', 'mov'].includes(ext!)) type = 'video'
        if (['mp3', 'wav'].includes(ext!)) type = 'audio'

        const id = crypto.randomUUID()
        let thumbnail: string | undefined = undefined

        if (type === 'image' || type === 'video') {
          try {
            const { generateThumbnail } = await import('../lib/thumbnails')
            const sourceUrl = `file:///${filePath.replace(/\\/g, '/')}`
            const base64Data = await generateThumbnail(sourceUrl, type)
            thumbnail = (await window.api.saveThumbnail(id, base64Data)) ?? undefined
          } catch (err) {
            console.error(`Failed to generate thumbnail for ${name}:`, err)
            thumbnail = `file:///${filePath.replace(/\\/g, '/')}`
          }
        }

        console.log(`Processed file ${name}:`, { filePath, type, thumbnail })

        return { id, path: filePath, name, type, thumbnail }
      })
    )

    console.log('Adding new items to store:', newItems)
    addMedia(newItems)

    if (newItems.every((item) => item.type === 'audio')) {
      setActiveTab('audio')
    } else if (newItems.some((item) => item.type === 'image' || item.type === 'video')) {
      setActiveTab('media')
    }
  }

  const processFiles = async (files: FileList | File[]): Promise<void> => {
    const filePaths = Array.from(files)
      .map((f) => (f as any).path)
      .filter(Boolean)
    if (filePaths.length > 0) {
      processFilePaths(filePaths)
    }
  }

  const displayedItems = mediaLibrary.filter((item) => {
    if (activeTab === 'audio') return item.type === 'audio'
    return item.type === 'image' || item.type === 'video' || item.type === 'composition'
  })

  const itemCount = activeTab === 'deleted' ? deletedSections.length : displayedItems.length
  const columns = Math.min(Math.max(itemCount, 1), 4)

  return (
    <div
      className="panel panel-a-media"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Tabs */}
      <div className="ml-tabs">
        <button
          className={`ml-tab${activeTab === 'media' ? ' ml-tab--active' : ''}`}
          onClick={() => setActiveTab('media')}
        >
          Media
        </button>
        <button
          className={`ml-tab${activeTab === 'audio' ? ' ml-tab--active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          Audio
        </button>
        <button
          className={`ml-tab${activeTab === 'deleted' ? ' ml-tab--active' : ''}`}
          onClick={() => setActiveTab('deleted')}
          title="Deleted Sections"
        >
          Deleted
        </button>
      </div>

      {/* Grid */}
      <div className={`ml-grid ml-grid--cols-${columns}`}>
        {displayedItems.length === 0 && !isDragging && (
          <div className="ml-empty">Drag &amp; drop files here</div>
        )}

        {activeTab !== 'deleted'
          ? displayedItems.map((item) => {
              const isSelected = item.id === selectedMediaId

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/express-reels-media', item.id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => setSelectedMediaId(item.id)}
                  onDoubleClick={() => {
                    const v1Clips = useProjectStore
                      .getState()
                      .clips.filter((c) => c.trackId === 'v1')
                    const maxTime =
                      v1Clips.length > 0
                        ? Math.max(...v1Clips.map((c) => c.startTime + c.duration))
                        : 0
                    const newId = crypto.randomUUID()
                    useProjectStore.getState().addClip({
                      id: newId,
                      mediaId: item.id,
                      trackId: 'v1',
                      startTime: maxTime,
                      duration: item.duration || 5,
                      sourceOffset: 0
                    })
                    useProjectStore.getState().setSelectedClipId(newId)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setSelectedMediaId(item.id)
                    setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id })
                  }}
                  className={`ml-item${isSelected ? ' ml-item--selected' : ''}`}
                >
                  {item.thumbnail ? (
                    <img
                      className="ml-item-thumb"
                      src={item.thumbnail.split('\\').join('/')}
                      alt={item.name}
                    />
                  ) : (
                    <div className="ml-item-placeholder">
                      {item.type === 'composition' ? (
                        <Scissors size={24} color="var(--color-text-muted)" />
                      ) : (
                        <Music size={24} color="var(--color-text-muted)" />
                      )}
                    </div>
                  )}

                  {/* Info overlay */}
                  <div className="ml-item-info">
                    <span className="ml-item-name" title={item.name}>
                      {item.name}
                    </span>
                    <div className="ml-item-type-icon">
                      {item.type === 'video' && <Video size={10} color="white" />}
                      {item.type === 'image' && <ImageIcon size={10} color="white" />}
                      {item.type === 'audio' && <Music size={10} color="white" />}
                      {item.type === 'composition' && <Scissors size={10} color="white" />}
                    </div>
                  </div>
                </div>
              )
            })
          : deletedSections.map((section) => {
              const item = mediaLibrary.find((m) => m.id === section.originalClip.mediaId)
              if (!item) return null

              return (
                <div
                  key={section.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/express-reels-clip-restore',
                      JSON.stringify(section.originalClip)
                    )
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="ml-deleted-item"
                >
                  {item.thumbnail ? (
                    <img
                      className="ml-item-thumb"
                      src={item.thumbnail.split('\\').join('/')}
                      alt={item.name}
                    />
                  ) : (
                    <div className="ml-item-placeholder">
                      <Scissors size={24} color="var(--color-text-muted)" />
                    </div>
                  )}

                  <div className="ml-deleted-badge">
                    {section.originalClip.duration.toFixed(1)}s
                  </div>
                </div>
              )
            })}
      </div>

      {/* Drag Overlay */}
      {isDragging && (
        <div className="ml-drag-overlay">
          <UploadCloud size={48} className="ml-drag-icon" />
          <div className="ml-drag-text">Drop files to import</div>
        </div>
      )}

      {/* Import Button */}
      <div className="ml-footer">
        <button className="ml-import-btn" onClick={handleImportClick}>
          + Import Local Media
        </button>

        <div className="ml-browser-row">
          <button
            onClick={() => (window as any).electron?.ipcRenderer?.send('sound-studio:open')}
            className="ml-browse-btn ml-browse-btn--studio"
            title="Open Sound Studio"
          >
            🎵 Sound Studio
          </button>
          <button onClick={() => setShowAudioBrowser(true)} className="ml-browse-btn">
            <Music size={14} /> Browse Audio
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="ml-context-menu">
          <button
            className="ml-context-menu-btn"
            onClick={() => {
              removeMedia(contextMenu.itemId)
              setContextMenu(null)
            }}
          >
            Delete from Project
          </button>
        </div>
      )}

      {showAudioBrowser && <AudioBrowserModal onClose={() => setShowAudioBrowser(false)} />}
    </div>
  )
}
