import React, { useRef, useState } from 'react'
import { LivePreviewTransport } from './LivePreviewTransport'
import { useProjectStore } from '../store/projectStore'
import './KenBurnsPlanner.css'

export interface KenBurnsPOINode {
  id: string
  x: number
  y: number
  zoom: number
  timeSeconds: number
  description: string
}

interface KenBurnsPlannerProps {
  mediaPath: string
  isVideo?: boolean
  nodes: KenBurnsPOINode[]
  clipId?: string | null
  onNodeUpdate: (index: number, x: number, y: number, zoom?: number, timeSeconds?: number) => void
  onAddNode?: () => void
  onRemoveNode?: (index: number) => void
}

export function KenBurnsPlanner({
  mediaPath,
  isVideo = false,
  nodes,
  clipId,
  onNodeUpdate,
  onAddNode,
  onRemoveNode
}: KenBurnsPlannerProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [draggingNodeIndex, setDraggingNodeIndex] = useState<number | null>(null)
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null)

  const handlePointerDown = (e: React.PointerEvent, index: number): void => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDraggingNodeIndex(index)
  }

  const handlePointerMove = (e: React.PointerEvent): void => {
    if (draggingNodeIndex === null || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    // Calculate percentage relative to center
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    let xPct = (px / rect.width - 0.5) * 100
    let yPct = (py / rect.height - 0.5) * 100

    // Constrain to -50 to 50
    xPct = Math.max(-50, Math.min(50, xPct))
    yPct = Math.max(-50, Math.min(50, yPct))

    onNodeUpdate(draggingNodeIndex, xPct, yPct)
  }

  const handlePointerUp = (e: React.PointerEvent): void => {
    if (draggingNodeIndex !== null) {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      setDraggingNodeIndex(null)
    }
  }

  // Convert image path to valid URL if needed
  const imageUrl =
    mediaPath.startsWith('http') ||
    mediaPath.startsWith('blob:') ||
    mediaPath.startsWith('data:') ||
    mediaPath.startsWith('file:')
      ? mediaPath
      : `file:///${mediaPath.replace(/\\/g, '/')}`

  React.useEffect(() => {
    if (!isVideo || !clipId || !videoRef.current) return

    // Initial sync
    const state = useProjectStore.getState()
    const clip = state.clips.find((c) => c.id === clipId)
    if (clip && videoRef.current) {
      const playbackRate = clip.audioConfig?.playbackRate || 1
      let localTime = (clip.sourceOffset || 0) + (state.playhead - clip.startTime) * playbackRate
      if (videoRef.current.duration > 0) {
        localTime = localTime % videoRef.current.duration
      }
      videoRef.current.currentTime = localTime
    }

    return useProjectStore.subscribe((state, prevState) => {
      if (!videoRef.current) return

      const clip = state.clips.find((c) => c.id === clipId)
      if (!clip) return

      const playbackRate = clip.audioConfig?.playbackRate || 1
      let localTime = (clip.sourceOffset || 0) + (state.playhead - clip.startTime) * playbackRate
      if (videoRef.current.duration > 0) {
        localTime = localTime % videoRef.current.duration
      }

      const isActive =
        state.playhead >= clip.startTime && state.playhead < clip.startTime + clip.duration

      if (isActive) {
        const isScrubbing = !state.isPlaying
        const justStartedPlaying = state.isPlaying && !prevState.isPlaying

        if (isScrubbing || justStartedPlaying) {
          if (Math.abs(videoRef.current.currentTime - localTime) > 0.1) {
            videoRef.current.currentTime = localTime
          }
        }

        if (state.isPlaying && videoRef.current.paused) {
          videoRef.current.play().catch(console.warn)
        } else if (!state.isPlaying && !videoRef.current.paused) {
          videoRef.current.pause()
        }
      } else {
        if (!videoRef.current.paused) {
          videoRef.current.pause()
        }
        // Even if inactive, let's keep it scrubbed to the last valid time so it doesn't freeze weirdly
        if (!state.isPlaying) {
          videoRef.current.currentTime = localTime
        }
      }
    })
  }, [isVideo, clipId])

  return (
    <div className="ken-burns-planner-wrapper">
      <div className="ken-burns-planner-canvas-container">
        <div
          className="ken-burns-planner-canvas"
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {isVideo ? (
            <video ref={videoRef} src={imageUrl} className="ken-burns-bg-image" muted playsInline />
          ) : (
            <img src={imageUrl} alt="Storyboard Reference" className="ken-burns-bg-image" />
          )}

          <svg className="ken-burns-svg-overlay">
            {/* Rule of Thirds Grid */}
            <line
              x1="33.33%"
              y1="0"
              x2="33.33%"
              y2="100%"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1="66.66%"
              y1="0"
              x2="66.66%"
              y2="100%"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1="0"
              y1="33.33%"
              x2="100%"
              y2="33.33%"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1="0"
              y1="66.66%"
              x2="100%"
              y2="66.66%"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />

            {/* Center crosshair */}
            <line
              x1="50%"
              y1="48%"
              x2="50%"
              y2="52%"
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="1"
            />
            <line
              x1="48%"
              y1="50%"
              x2="52%"
              y2="50%"
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="1"
            />

            {nodes.map((node, i) => {
              if (i === 0) return null
              const prev = nodes[i - 1]
              return (
                <line
                  key={`line-${node.id}`}
                  x1={`${prev.x + 50}%`}
                  y1={`${prev.y + 50}%`}
                  x2={`${node.x + 50}%`}
                  y2={`${node.y + 50}%`}
                  stroke="rgba(255, 255, 255, 0.4)"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                />
              )
            })}
          </svg>

          {nodes.map((node, index) => (
            <React.Fragment key={node.id}>
              <style>{`
              .node-pos-${node.id} {
                left: ${node.x + 50}%;
                top: ${node.y + 50}%;
              }
            `}</style>
              <div
                className={`ken-burns-node node-pos-${node.id} ${draggingNodeIndex === index ? 'dragging' : ''} ${selectedNodeIndex === index ? 'selected' : ''}`}
                onPointerDown={(e) => handlePointerDown(e, index)}
                onClick={() => setSelectedNodeIndex(selectedNodeIndex === index ? null : index)}
              >
                <div className="node-marker">{index + 1}</div>
                {selectedNodeIndex === index ? (
                  <div
                    className="node-zoom-popover"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="node-zoom-popover-content">
                      <label>Zoom: {node.zoom.toFixed(1)}x</label>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.1"
                        value={node.zoom}
                        title={`Zoom level for node ${index + 1}`}
                        onChange={(e) =>
                          onNodeUpdate(
                            index,
                            node.x,
                            node.y,
                            parseFloat(e.target.value),
                            node.timeSeconds
                          )
                        }
                      />
                      <label>Time: {node.timeSeconds?.toFixed(1) || 0}s</label>
                      <input
                        type="range"
                        min="0"
                        max="60"
                        step="0.5"
                        value={node.timeSeconds || 0}
                        title={`Time for node ${index + 1}`}
                        onChange={(e) =>
                          onNodeUpdate(index, node.x, node.y, node.zoom, parseFloat(e.target.value))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="node-info">
                    {node.timeSeconds?.toFixed(1) || 0}s | {node.zoom.toFixed(1)}x
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="ken-burns-planner-descriptions">
        <h4>AI Scene Director</h4>
        {nodes.length === 0 ? (
          <div className="no-nodes-msg">Ask the AI to generate Ken Burns camera keyframes.</div>
        ) : (
          nodes.map((node, i) => (
            <div key={node.id} className="poi-description-row">
              <span className="poi-number">{i + 1}</span>
              <span className="poi-text">{node.description || 'Manual Keyframe'}</span>
              {onRemoveNode && (
                <button
                  className="poi-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveNode(i)
                  }}
                  title="Remove Keyframe"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
        {onAddNode && (
          <button className="poi-add-btn" onClick={onAddNode}>
            + Add Keyframe
          </button>
        )}
      </div>

      <LivePreviewTransport />
    </div>
  )
}
