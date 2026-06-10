import './Timeline.css'
import React, { useRef, useState, useEffect } from 'react'
import { useProjectStore, Clip } from '../store/projectStore'
import { AudioWaveform } from './AudioWaveform'
import { calculateKenBurnsTransform } from '../lib/kenBurns'

const getMediaUrl = (path: string): string => {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('file://')) return path
  return `file:///${path.replace(/\\/g, '/')}`
}

// ---------------------------------------------------------------------------
// Sub-components — each applies dynamic values imperatively via a ref so that
// no `style` prop is needed in JSX (satisfies the no-inline-styles lint rule).
// ---------------------------------------------------------------------------

type DivProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'style'>

/** Sets `minWidth` on the inner div whenever the value changes. */
function WithMinWidth({
  minWidth,
  className,
  children
}: DivProps & { minWidth: number }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.style.minWidth = `${minWidth}px`
  }, [minWidth])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** Renders a single ruler tick mark at the given `left` offset. */
function TickMark({ left, label }: { left: number; label: string }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.style.left = `${left}px`
  }, [left])
  return (
    <div ref={ref} className="timeline-style-5">
      {label}
    </div>
  )
}

/** Renders a clip block with all dynamic positional / visual styles applied via ref. */
function ClipBlock({
  left,
  width,
  backgroundColor,
  border,
  opacity,
  cursor,
  className,
  children,
  ...rest
}: DivProps & {
  left: number
  width: number
  backgroundColor: string
  border: string
  opacity: number
  cursor: string
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.left = `${left}px`
    el.style.width = `${width}px`
    el.style.backgroundColor = backgroundColor
    el.style.border = border
    el.style.opacity = String(opacity)
    el.style.cursor = cursor
  }, [left, width, backgroundColor, border, opacity, cursor])
  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  )
}

/** Offsets the audio waveform by `left` pixels (accounts for sourceOffset). */
function WaveformOffset({
  left,
  children
}: {
  left: number
  children: React.ReactNode
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.style.left = `${left}px`
  }, [left])
  return (
    <div ref={ref} className="timeline-style-14">
      {children}
    </div>
  )
}

/** A fade-in or fade-out handle dot whose horizontal position tracks clip fade values. */
function FadeHandle({
  left,
  className,
  onMouseDown
}: {
  left: number
  className: string
  onMouseDown: (e: React.MouseEvent) => void
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.style.left = `${left}px`
  }, [left])
  return <div ref={ref} className={className} onMouseDown={onMouseDown} />
}

/** A Ken Burns keyframe diamond marker that resizes and changes colour when active. */
function KeyframeMarker({
  left,
  size,
  bgColor,
  title,
  onMouseDown,
  className
}: {
  left: number
  size: number
  bgColor: string
  title?: string
  onMouseDown: (e: React.MouseEvent) => void
  className: string
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.left = `${left}px`
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.backgroundColor = bgColor
  }, [left, size, bgColor])
  return <div ref={ref} className={className} title={title} onMouseDown={onMouseDown} />
}

/** Generic overlay div (razor line, crop box, duration line) that tracks a `left` + optional `width`. */
function PositionedOverlay({
  left,
  width,
  className,
  children
}: {
  left: number
  width?: number
  className: string
  children?: React.ReactNode
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.left = `${left}px`
    if (width !== undefined) el.style.width = `${width}px`
  }, [left, width])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** Positions the context menu at the cursor location. */
function ContextMenuOverlay({
  x,
  y,
  className,
  children
}: {
  x: number
  y: number
  className: string
  children: React.ReactNode
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [x, y])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Timeline(): React.ReactElement {
  const {
    tracks,
    clips,
    setPlayhead,
    activeTool,
    mediaLibrary,
    addClip,
    updateClip,
    splitClip,
    deleteSection,
    selectedClipId,
    activeKeyframeId,
    targetDuration,
    rangeMarkers,
    setRangeMarkers,
    rangeSelectedTrackIds,
    setRangeSelectedTracks
  } = useProjectStore()
  const timelineRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const rulerScrollRef = useRef<HTMLDivElement>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(40)

  // Crop tool state
  const [cropDragStart, setCropDragStart] = useState<number | null>(null)
  const [cropDragEnd, setCropDragEnd] = useState<number | null>(null)
  const [trackContextMenu, setTrackContextMenu] = useState<{
    x: number
    y: number
    trackId: string
    trackIndex: number
  } | null>(null)

  const [clipContextMenu, setClipContextMenu] = useState<{
    x: number
    y: number
    clipId: string
  } | null>(null)

  // Dragging clip state
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<number>(0)

  // Range state
  const [draggingRangeMarker, setDraggingRangeMarker] = useState<'start' | 'end' | null>(null)

  // Resizing clip state
  const [resizingClipId, setResizingClipId] = useState<string | null>(null)
  const [resizeEdge, setResizeEdge] = useState<'left' | 'right' | null>(null)
  const [resizeStartData, setResizeStartData] = useState<{
    originalDuration: number
    originalPlaybackRate: number
  } | null>(null)
  const [isAltPressed, setIsAltPressed] = useState(false)
  const lastMouseXRef = useRef<number>(0)
  const [dragAnimal, setDragAnimal] = useState<'turtle' | 'bunny' | null>(null)

  // Fading clip state
  const [fadingClipId, setFadingClipId] = useState<string | null>(null)
  const [fadeEdge, setFadeEdge] = useState<'left' | 'right' | null>(null)

  // Dragging keyframe state
  const [draggingKeyframeId, setDraggingKeyframeId] = useState<{
    clipId: string
    kfId: string
    type: 'kenburns' | 'audio'
    startY?: number
    startVolume?: number
  } | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') setIsAltPressed(true)
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const inputType = (target as HTMLInputElement).type
        // Only block shortcuts if the user is typing in a text-based field
        if (inputType === 'text' || inputType === 'number' || target.tagName === 'TEXTAREA') return
      }
      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useProjectStore.getState().undo()
        return
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault()
        useProjectStore.getState().redo()
        return
      }
      if (
        e.key === 'Delete' ||
        e.key === 'Backspace' ||
        e.key === 'Del' ||
        e.code === 'Delete' ||
        e.code === 'Backspace'
      ) {
        const state = useProjectStore.getState()
        let keyframeDeleted = false
        if (state.activeKeyframeId && state.selectedClipId) {
          const clip = state.clips.find((c) => c.id === state.selectedClipId)
          if (clip?.kenBurnsEffect?.keyframes?.find((k) => k.id === state.activeKeyframeId)) {
            state.saveHistory()
            state.removeKenBurnsKeyframe(state.selectedClipId, state.activeKeyframeId)
            state.setActiveKeyframeId(null)
            keyframeDeleted = true
          } else if (clip?.audioConfig?.keyframes?.find((k) => k.id === state.activeKeyframeId)) {
            state.saveHistory()
            state.removeAudioKeyframe(state.selectedClipId, state.activeKeyframeId)
            state.setActiveKeyframeId(null)
            keyframeDeleted = true
          }
        }
        if (!keyframeDeleted && state.selectedClipId) {
          state.removeClip(state.selectedClipId)
        }
      }
    }
    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') setIsAltPressed(false)
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
    }
  }, [])

  const getTimeFromEvent = (e: React.MouseEvent | React.DragEvent): number => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    // 80 is the width of the track headers (the left column)
    const scrollLeft = scrollContainerRef.current ? scrollContainerRef.current.scrollLeft : 0
    const x = e.clientX - rect.left - 80 + scrollLeft
    return Math.max(0, x / pixelsPerSecond)
  }

  const getTrackFromEvent = (e: React.MouseEvent): string | null => {
    if (!scrollContainerRef.current) return null
    const rect = scrollContainerRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top + scrollContainerRef.current.scrollTop
    const trackIndex = Math.floor(y / 60)
    return tracks[Math.max(0, Math.min(tracks.length - 1, trackIndex))]?.id || null
  }

  useEffect(() => {
    const handleWheelNative = (e: WheelEvent): void => {
      if (e.ctrlKey) {
        e.preventDefault()
        const zoomFactor = Math.exp(-e.deltaY * 0.002)
        setPixelsPerSecond((prev) => Math.max(0.33, Math.min(400, prev * zoomFactor)))
      }
    }
    const el = timelineRef.current
    if (el) {
      el.addEventListener('wheel', handleWheelNative, { passive: false })
    }
    return () => {
      if (el) el.removeEventListener('wheel', handleWheelNative)
    }
  }, [])

  // --- MOUSE EVENTS --- //

  const handleMouseMove = (e: React.MouseEvent): void => {
    const currentX = e.clientX
    const deltaX = currentX - lastMouseXRef.current
    lastMouseXRef.current = currentX
    const time = getTimeFromEvent(e)
    setHoverTime(time)
    if (isScrubbing) {
      setPlayhead(time)
      // Pause playback while scrubbing if it was playing
      if (useProjectStore.getState().isPlaying) {
        useProjectStore.getState().setIsPlaying(false)
      }
      return
    }
    if (activeTool === 'crop' && cropDragStart !== null) {
      setCropDragEnd(time)
    }
    if (draggingKeyframeId) {
      const { clipId, kfId, type, startY, startVolume } = draggingKeyframeId
      const clip = clips.find((c) => c.id === clipId)
      if (clip) {
        let newKfTime = time - clip.startTime
        newKfTime = Math.max(0, Math.min(clip.duration, newKfTime))

        if (type === 'kenburns') {
          useProjectStore.getState().updateKenBurnsKeyframe(clipId, kfId, { time: newKfTime })
        } else if (type === 'audio' && startY !== undefined && startVolume !== undefined) {
          const dy = e.clientY - startY
          let newVolume = startVolume - dy * (2.0 / 52)
          newVolume = Math.max(0, Math.min(2.0, newVolume))
          useProjectStore
            .getState()
            .updateAudioKeyframe(clipId, kfId, { time: newKfTime, volume: newVolume })
        }
      }
      return
    }
    if (draggingClipId) {
      // We are moving a clip
      const clip = clips.find((c) => c.id === draggingClipId)
      if (clip) {
        const newStart = Math.max(0, time - dragOffset)

        // Snapping logic
        const snapThreshold = 10 / pixelsPerSecond // 10 pixels snapping distance
        let snapTarget = newStart
        let minDiff = snapThreshold

        // Function to test snap target
        const trySnap = (targetTime: number, myTime: number): void => {
          const diff = Math.abs(myTime - targetTime)
          if (diff < minDiff) {
            minDiff = diff
            snapTarget = targetTime - (myTime - newStart)
          }
        }

        // Snap to Playhead
        const playhead = useProjectStore.getState().playhead
        trySnap(playhead, newStart)
        trySnap(playhead, newStart + clip.duration)

        // Snap to other clips
        clips.forEach((otherClip) => {
          if (otherClip.id === clip.id) return
          const otherEnd = otherClip.startTime + otherClip.duration
          trySnap(otherClip.startTime, newStart)
          trySnap(otherEnd, newStart)
          trySnap(otherClip.startTime, newStart + clip.duration)
          trySnap(otherEnd, newStart + clip.duration)
        })
        const newTrackId = getTrackFromEvent(e) || clip.trackId
        updateClip(clip.id, {
          startTime: Math.max(0, snapTarget),
          trackId: newTrackId
        })
      }
    }
    if (resizingClipId && resizeEdge) {
      const clip = clips.find((c) => c.id === resizingClipId)
      if (clip) {
        const snapThreshold = 10 / pixelsPerSecond
        let minDiff = snapThreshold
        const trySnapToPoint = (targetTime: number, testTime: number): number | null => {
          const diff = Math.abs(testTime - targetTime)
          if (diff < minDiff) {
            minDiff = diff
            return targetTime
          }
          return null
        }

        const isStretching = e.altKey && resizeStartData

        if (isStretching) {
          if (resizeEdge === 'left') {
            if (deltaX > 0) setDragAnimal('bunny')
            else if (deltaX < 0) setDragAnimal('turtle')
          } else {
            if (deltaX < 0) setDragAnimal('bunny')
            else if (deltaX > 0) setDragAnimal('turtle')
          }
        } else {
          setDragAnimal(null)
        }

        if (resizeEdge === 'left') {
          // Changing start time and duration
          let newStart = Math.min(time, clip.startTime + clip.duration - 0.1) // Minimum 0.1s
          let snapTarget = newStart

          // Check snaps
          const playhead = useProjectStore.getState().playhead
          const s1 = trySnapToPoint(playhead, newStart)
          if (s1 !== null) snapTarget = s1
          clips.forEach((otherClip) => {
            if (otherClip.id === clip.id) return
            const s2 = trySnapToPoint(otherClip.startTime, newStart)
            if (s2 !== null) snapTarget = s2
            const s3 = trySnapToPoint(otherClip.startTime + otherClip.duration, newStart)
            if (s3 !== null) snapTarget = s3
          })
          newStart = Math.max(0, Math.min(snapTarget, clip.startTime + clip.duration - 0.1))

          const newDuration = clip.startTime + clip.duration - newStart

          if (isStretching && resizeStartData) {
            const newPlaybackRate =
              (resizeStartData.originalDuration * resizeStartData.originalPlaybackRate) /
              newDuration
            updateClip(clip.id, {
              startTime: newStart,
              duration: newDuration,
              audioConfig: {
                ...(clip.audioConfig || {
                  volume: 1,
                  bass: 0,
                  mid: 0,
                  treble: 0,
                  pan: 0,
                  compression: false,
                  reverb: false
                }),
                playbackRate: newPlaybackRate
              }
            })
          } else {
            const timeDiff = newStart - clip.startTime
            updateClip(clip.id, {
              startTime: newStart,
              duration: newDuration,
              sourceOffset: clip.sourceOffset + timeDiff
            })
          }
        } else {
          // Changing duration
          let newEnd = time
          let snapTarget = newEnd
          const playhead = useProjectStore.getState().playhead
          const s1 = trySnapToPoint(playhead, newEnd)
          if (s1 !== null) snapTarget = s1
          clips.forEach((otherClip) => {
            if (otherClip.id === clip.id) return
            const s2 = trySnapToPoint(otherClip.startTime, newEnd)
            if (s2 !== null) snapTarget = s2
            const s3 = trySnapToPoint(otherClip.startTime + otherClip.duration, newEnd)
            if (s3 !== null) snapTarget = s3
          })
          newEnd = Math.max(clip.startTime + 0.1, snapTarget)

          const newDuration = newEnd - clip.startTime

          if (isStretching && resizeStartData) {
            const newPlaybackRate =
              (resizeStartData.originalDuration * resizeStartData.originalPlaybackRate) /
              newDuration
            updateClip(clip.id, {
              duration: newDuration,
              audioConfig: {
                ...(clip.audioConfig || {
                  volume: 1,
                  bass: 0,
                  mid: 0,
                  treble: 0,
                  pan: 0,
                  compression: false,
                  reverb: false
                }),
                playbackRate: newPlaybackRate
              }
            })
          } else {
            updateClip(clip.id, { duration: newDuration })
          }
        }
      }
    }
    if (fadingClipId && fadeEdge) {
      const clip = clips.find((c) => c.id === fadingClipId)
      if (clip) {
        if (fadeEdge === 'left') {
          // fade in
          const newFadeIn = Math.max(0, Math.min(clip.duration, time - clip.startTime))
          updateClip(clip.id, { fadeIn: newFadeIn })
        } else {
          // fade out
          const newFadeOut = Math.max(
            0,
            Math.min(clip.duration, clip.startTime + clip.duration - time)
          )
          updateClip(clip.id, { fadeOut: newFadeOut })
        }
      }
    }
    if (activeTool === 'range-copy' || activeTool === 'range-cut') {
      if (draggingRangeMarker === 'start') {
        setRangeMarkers(time, rangeMarkers.end)
      } else if (draggingRangeMarker === 'end') {
        setRangeMarkers(rangeMarkers.start, time)
      }
    }
  }

  const handleMouseDown = (e: React.MouseEvent): void => {
    const time = getTimeFromEvent(e)
    if (activeTool === 'pointer') {
      // Playhead seeking if clicking empty space or ruler or playhead line
      const target = e.target as HTMLElement
      if (
        (typeof target.className === 'string' && target.className.includes('timeline-bg')) ||
        target.closest('.ruler-area') ||
        target.closest('.playhead-handle') ||
        target.closest('.playhead-line')
      ) {
        setPlayhead(time)
        setIsScrubbing(true)
      }
    } else if (activeTool === 'crop') {
      // Crop start is not an immediate state change, history is saved on deleteSection
      setCropDragStart(time)
      setCropDragEnd(time)
    } else if (activeTool === 'razor') {
      // Find clip under cursor to split
      // Handled in clip onClick instead, or we can find it here:
      // We'll rely on clip onClick for razor instead for simplicity
    } else if (activeTool === 'range-copy' || activeTool === 'range-cut') {
      const target = e.target as HTMLElement
      const closestLane = target.closest ? target.closest('.timeline-style-10') : null
      const closestClip = target.closest ? target.closest('.timeline-style-11') : null

      // If they clicked the context menu, let it handle itself
      if (target.closest && target.closest('.timeline-style-26')) return

      if (rangeMarkers.start === null) {
        setRangeMarkers(time, null)

        let trackId: string | null = null
        if (closestLane) trackId = closestLane.getAttribute('data-track-id')
        if (!trackId && closestClip) trackId = closestClip.getAttribute('data-track-id')
        if (!trackId) trackId = getTrackFromEvent(e)

        if (trackId) {
          useProjectStore.getState().setRangeMasterTrackId(trackId)
          setRangeSelectedTracks([trackId])
        } else {
          useProjectStore.getState().setRangeMasterTrackId(null)
          setRangeSelectedTracks([])
        }
      } else if (rangeMarkers.end === null) {
        setRangeMarkers(rangeMarkers.start, time)
      } else {
        setRangeMarkers(time, null)
        setRangeSelectedTracks([])
        useProjectStore.getState().setRangeMasterTrackId(null)
        const trackId = getTrackFromEvent(e)
        if (trackId) {
          useProjectStore.getState().setRangeMasterTrackId(trackId)
          setRangeSelectedTracks([trackId])
        }
      }
    }
  }

  const handleMouseUp = (): void => {
    if (activeTool === 'crop' && cropDragStart !== null && cropDragEnd !== null) {
      const start = Math.min(cropDragStart, cropDragEnd)
      const end = Math.max(cropDragStart, cropDragEnd)
      if (end - start > 0.1) {
        deleteSection(start, end)
      }
      setCropDragStart(null)
      setCropDragEnd(null)
    }
    setIsScrubbing(false)
    setDraggingClipId(null)
    setResizingClipId(null)
    setResizeEdge(null)
    setResizeStartData(null)
    setDragAnimal(null)
    setFadingClipId(null)
    setFadeEdge(null)
    setDraggingKeyframeId(null)
    setDraggingRangeMarker(null)
  }

  // --- DRAG AND DROP (From Library) --- //

  const handleDrop = (e: React.DragEvent, trackId: string): void => {
    e.preventDefault()
    const mediaId = e.dataTransfer.getData('application/express-reels-media')
    const rangeData = e.dataTransfer.getData('application/express-reels-range-block')
    const restoreData = e.dataTransfer.getData('application/express-reels-clip-restore')
    const time = getTimeFromEvent(e)
    if (rangeData) {
      handleRangeBlockDrop(JSON.parse(rangeData), time)
    } else if (mediaId) {
      const media = mediaLibrary.find((m) => m.id === mediaId)
      const track = tracks.find((t) => t.id === trackId)
      if (media && track) {
        // Validation rules
        const effectiveType =
          media.type === 'composition' && media.masterType ? media.masterType : media.type
        if (effectiveType === 'audio' && track.type !== 'audio') {
          alert('Audio files must be placed in an Audio track.')
          return
        }
        if ((effectiveType === 'image' || effectiveType === 'video') && track.type !== 'video') {
          alert('Video and image files must be placed in a Video track.')
          return
        }
        const newId = crypto.randomUUID()
        addClip({
          id: newId,
          mediaId,
          trackId,
          startTime: time,
          duration: media.duration || 5,
          // Default 5s for images
          sourceOffset: 0
        })
        useProjectStore.getState().setSelectedClipId(newId)
      }
    } else if (restoreData) {
      const originalClip = JSON.parse(restoreData) as Clip
      const newId = crypto.randomUUID()
      addClip({
        ...originalClip,
        id: newId,
        // New ID
        trackId,
        startTime: time
      })
      useProjectStore.getState().setSelectedClipId(newId)
    }
  }

  const handleRangeBlockDrop = (
    data: {
      tool: string
      start: number
      end: number
      trackIds: string[]
      masterType?: 'video' | 'audio' | 'effect'
    },
    dropTime: number
  ): void => {
    const { tool, start, end, trackIds, masterType = 'video' } = data
    useProjectStore.getState().saveHistory()

    const allClips = useProjectStore.getState().clips
    const affectedClips = allClips.filter(
      (c) => trackIds.includes(c.trackId) && c.startTime < end && c.startTime + c.duration > start
    )

    const subClipsToBundle: Clip[] = []

    affectedClips.forEach((clip) => {
      const sliceStart = Math.max(clip.startTime, start)
      const sliceEnd = Math.min(clip.startTime + clip.duration, end)
      const sliceDuration = sliceEnd - sliceStart
      if (sliceDuration <= 0) return

      const internalStartTime = sliceStart - start
      const newSourceOffset = clip.sourceOffset + (sliceStart - clip.startTime)

      const subClip: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: internalStartTime,
        duration: sliceDuration,
        sourceOffset: newSourceOffset
      }
      subClipsToBundle.push(subClip)

      if (tool === 'range-cut') {
        const leftDuration = start - clip.startTime
        const rightDuration = clip.startTime + clip.duration - end

        if (leftDuration > 0 && rightDuration > 0) {
          updateClip(clip.id, { duration: leftDuration })
          addClip({
            ...clip,
            id: crypto.randomUUID(),
            startTime: end,
            duration: rightDuration,
            sourceOffset: clip.sourceOffset + (end - clip.startTime)
          })
        } else if (leftDuration > 0) {
          updateClip(clip.id, { duration: leftDuration })
        } else if (rightDuration > 0) {
          updateClip(clip.id, {
            startTime: end,
            duration: rightDuration,
            sourceOffset: clip.sourceOffset + (end - clip.startTime)
          })
        } else {
          useProjectStore.getState().removeClip(clip.id)
        }
      }
    })

    if (subClipsToBundle.length === 0) return

    const newTrackId = crypto.randomUUID()
    useProjectStore.getState().addTrack({
      id: newTrackId,
      name: `Composition Track`,
      type: masterType
    })

    const compoundDuration = end - start

    const compoundClip: Clip = {
      id: crypto.randomUUID(),
      mediaId: '',
      trackId: newTrackId,
      startTime: dropTime,
      duration: compoundDuration,
      sourceOffset: 0,
      isCollapsed: true,
      subClips: subClipsToBundle,
      subTracks: tracks.filter((t) => trackIds.includes(t.id))
    }

    addClip(compoundClip)
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    if (pixelsPerSecond > 100) {
      const ms = Math.floor((seconds % 1) * 10)
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Calculate dynamic tick interval based on zoom level
  const getTickInterval = (): number => {
    if (pixelsPerSecond > 150) return 0.5 // half second
    if (pixelsPerSecond > 50) return 1 // 1 second
    if (pixelsPerSecond > 20) return 5 // 5 seconds
    if (pixelsPerSecond > 10) return 10 // 10 seconds
    if (pixelsPerSecond > 5) return 30 // 30 seconds
    if (pixelsPerSecond > 1) return 60 // 1 minute
    return 300 // 5 minutes
  }
  const tickInterval = getTickInterval()
  // Total timeline width (at least 5 minutes visually, or max clip end)
  const maxClipTime = clips.length > 0 ? Math.max(...clips.map((c) => c.startTime + c.duration)) : 0
  const totalTimelineSeconds = Math.max(300, maxClipTime + 60) // At least 5 mins, or clip end + 1min padding
  const totalTicks = Math.ceil(totalTimelineSeconds / tickInterval)

  return (
    <div
      className="timeline-container timeline-style-1"
      ref={timelineRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* RULER */}
      <div className="timeline-bg ruler-area timeline-style-2">
        {/* Fixed 80px spacer — stays in place, never scrolls */}
        <div className="timeline-style-3" />
        {/* Scrollable tick zone — rulerScrollRef syncs this with the track scroll */}
        <div ref={rulerScrollRef} className="timeline-ruler-scroll">
          <WithMinWidth
            minWidth={totalTimelineSeconds * pixelsPerSecond}
            className="timeline-style-4"
          >
            {/* Tick marks */}
            {Array.from({ length: totalTicks }).map((_, i) => (
              <TickMark
                key={i}
                left={i * tickInterval * pixelsPerSecond}
                label={formatTime(i * tickInterval)}
              />
            ))}

            {/* Master Playhead Indicator */}
            <PlayheadIndicator pixelsPerSecond={pixelsPerSecond} />
          </WithMinWidth>
        </div>
      </div>

      {/* TRACKS */}
      <div
        className="timeline-bg timeline-style-6"
        ref={scrollContainerRef}
        onScroll={(e) => {
          if (rulerScrollRef.current) {
            rulerScrollRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft
          }
        }}
      >
        <WithMinWidth
          minWidth={80 + totalTimelineSeconds * pixelsPerSecond}
          className="timeline-style-7"
        >
          {tracks.map((track, i) => (
            <div key={track.id} className="timeline-style-8">
              {/* Track Header */}
              <div
                onContextMenu={(e) => {
                  e.preventDefault()
                  setTrackContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    trackId: track.id,
                    trackIndex: i
                  })
                }}
                className="timeline-style-9"
              >
                {track.name}
              </div>

              {/* Track Lane */}
              <div
                data-track-id={track.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, track.id)}
                onClick={(e) => {
                  if (activeTool === 'range-copy' || activeTool === 'range-cut') {
                    if (e.ctrlKey || e.metaKey) {
                      setRangeSelectedTracks((prev) =>
                        prev.includes(track.id)
                          ? prev.filter((id) => id !== track.id)
                          : [...prev, track.id]
                      )
                    } else if (e.shiftKey && rangeSelectedTrackIds.length > 0) {
                      const lastSelectedId = rangeSelectedTrackIds[rangeSelectedTrackIds.length - 1]
                      const lastIdx = tracks.findIndex((t) => t.id === lastSelectedId)
                      const currentIdx = i
                      const startIdx = Math.min(lastIdx, currentIdx)
                      const endIdx = Math.max(lastIdx, currentIdx)
                      const newIds = new Set(rangeSelectedTrackIds)
                      for (let j = startIdx; j <= endIdx; j++) {
                        newIds.add(tracks[j].id)
                      }
                      setRangeSelectedTracks(Array.from(newIds))
                    } else {
                      setRangeSelectedTracks([track.id])
                    }
                  }
                }}
                className={`timeline-style-10 timeline-style-36 ${
                  (activeTool === 'range-copy' || activeTool === 'range-cut') &&
                  rangeSelectedTrackIds.includes(track.id)
                    ? 'range-selected-track'
                    : ''
                }`}
              >
                {/* Range Selection Overlay Box */}
                {(activeTool === 'range-copy' || activeTool === 'range-cut') &&
                  rangeSelectedTrackIds.includes(track.id) &&
                  rangeMarkers.start !== null &&
                  rangeMarkers.end !== null && (
                    <RangeOverlayBox
                      start={rangeMarkers.start}
                      end={rangeMarkers.end}
                      pixelsPerSecond={pixelsPerSecond}
                      onDragStart={(e) => {
                        let masterType: 'video' | 'audio' | 'effect' = 'video'
                        const state = useProjectStore.getState()
                        if (state.rangeMasterTrackId) {
                          const mTrack = tracks.find((t) => t.id === state.rangeMasterTrackId)
                          if (mTrack) masterType = mTrack.type
                        }

                        e.dataTransfer.setData(
                          'application/express-reels-range-block',
                          JSON.stringify({
                            tool: activeTool,
                            start: Math.min(rangeMarkers.start!, rangeMarkers.end!),
                            end: Math.max(rangeMarkers.start!, rangeMarkers.end!),
                            trackIds: rangeSelectedTrackIds,
                            masterType
                          })
                        )
                        e.dataTransfer.effectAllowed = 'copyMove'
                      }}
                    />
                  )}
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const media = mediaLibrary.find((m) => m.id === clip.mediaId)
                    const isSelected = clip.id === selectedClipId
                    return (
                      <ClipBlock
                        key={clip.id}
                        data-track-id={track.id}
                        left={clip.startTime * pixelsPerSecond}
                        width={Math.max(2, clip.duration * pixelsPerSecond)}
                        backgroundColor={
                          track.type === 'effect'
                            ? '#8b5cf6'
                            : track.type === 'video'
                              ? '#3b82f6'
                              : '#10b981'
                        }
                        border={isSelected ? '2px solid white' : '1px solid rgba(255,255,255,0.2)'}
                        opacity={draggingClipId === clip.id ? 0.7 : 1}
                        cursor={activeTool === 'razor' ? 'crosshair' : 'grab'}
                        className={`timeline-style-11 ${clip.isCollapsed ? 'compound-clip-block' : ''}`}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setClipContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            clipId: clip.id
                          })
                        }}
                        onMouseDown={(e) => {
                          if (activeTool === 'range-copy' || activeTool === 'range-cut') {
                            return
                          }
                          e.stopPropagation()
                          if (activeTool === 'razor') {
                            splitClip(clip.id, getTimeFromEvent(e))
                          } else if (activeTool === 'pointer') {
                            useProjectStore.getState().saveHistory()
                            useProjectStore.getState().setSelectedClipId(clip.id)
                            useProjectStore.getState().setActiveKeyframeId(null)
                            setDraggingClipId(clip.id)
                            setDragOffset(getTimeFromEvent(e) - clip.startTime)

                            // Sync playhead so LivePreview shows what we are editing
                            const currentPlayhead = useProjectStore.getState().playhead
                            if (
                              currentPlayhead < clip.startTime ||
                              currentPlayhead >= clip.startTime + clip.duration
                            ) {
                              useProjectStore.getState().setPlayhead(clip.startTime)
                            }
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (track.type === 'video') {
                            e.stopPropagation()
                            const localTime = getTimeFromEvent(e) - clip.startTime

                            // Initialize default transform if it's the very first keyframe,
                            // otherwise calculate current transform at this exact moment
                            let currentTransform = { x: 0, y: 0, zoom: 1 }
                            if (clip.kenBurnsEffect && clip.kenBurnsEffect.keyframes.length > 0) {
                              currentTransform = calculateKenBurnsTransform(
                                clip.kenBurnsEffect,
                                localTime
                              )
                            }

                            const newId = crypto.randomUUID()
                            useProjectStore.getState().saveHistory()

                            // Make sure the clip HAS a KenBurns effect object before adding keyframe
                            if (!clip.kenBurnsEffect) {
                              useProjectStore.getState().setKenBurnsEffect(clip.id, {
                                id: crypto.randomUUID(),
                                mediaId: clip.mediaId,
                                easing: 'ease-in-out',
                                constrainToFrame: true,
                                keyframes: []
                              })
                            }

                            useProjectStore.getState().addKenBurnsKeyframe(clip.id, {
                              id: newId,
                              time: localTime,
                              x: currentTransform.x,
                              y: currentTransform.y,
                              zoom: currentTransform.zoom
                            })
                            useProjectStore.getState().setActiveKeyframeId(newId)
                            useProjectStore.getState().setSelectedClipId(clip.id)
                          }
                        }}
                      >
                        {media?.thumbnail && track.type === 'video' && (
                          <img
                            src={media.thumbnail}
                            alt="Clip thumbnail"
                            draggable={false}
                            className="timeline-style-12"
                          />
                        )}
                        {track.type === 'audio' && media && (
                          <div className="timeline-style-13">
                            <WaveformOffset left={-clip.sourceOffset * pixelsPerSecond}>
                              <AudioWaveform
                                src={getMediaUrl(media.path)}
                                pixelsPerSecond={pixelsPerSecond}
                                height={52}
                              />
                            </WaveformOffset>
                          </div>
                        )}

                        {/* Audio Volume Rubber Band */}
                        {track.type === 'audio' && (
                          <svg
                            width="100%"
                            height="100%"
                            className="timeline-style-33"
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              const localTime = getTimeFromEvent(e) - clip.startTime
                              const rect = (e.target as SVGElement).getBoundingClientRect()
                              const y = e.clientY - rect.top
                              const volume = Math.max(0, Math.min(2.0, 2.0 - (y / 52) * 2.0))

                              const newId = crypto.randomUUID()
                              useProjectStore.getState().saveHistory()
                              useProjectStore.getState().addAudioKeyframe(clip.id, {
                                id: newId,
                                time: localTime,
                                volume: volume
                              })
                              useProjectStore.getState().setActiveKeyframeId(newId)
                              useProjectStore.getState().setSelectedClipId(clip.id)
                            }}
                          >
                            {(() => {
                              const kfs = [...(clip.audioConfig?.keyframes || [])].sort(
                                (a, b) => a.time - b.time
                              )
                              if (kfs.length === 0) {
                                return (
                                  <line
                                    x1="0"
                                    y1="26"
                                    x2={clip.duration * pixelsPerSecond}
                                    y2="26"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    strokeOpacity="0.5"
                                    className="timeline-style-34"
                                  />
                                )
                              }

                              const points: string[] = []
                              const firstY = 52 - (kfs[0].volume / 2.0) * 52
                              points.push(`0,${firstY}`)

                              kfs.forEach((kf) => {
                                const x = kf.time * pixelsPerSecond
                                const y = 52 - (kf.volume / 2.0) * 52
                                points.push(`${x},${y}`)
                              })

                              const lastY = 52 - (kfs[kfs.length - 1].volume / 2.0) * 52
                              points.push(`${clip.duration * pixelsPerSecond},${lastY}`)

                              return (
                                <polyline
                                  points={points.join(' ')}
                                  fill="none"
                                  stroke="white"
                                  strokeWidth="1.5"
                                  className="timeline-style-34"
                                />
                              )
                            })()}

                            {(clip.audioConfig?.keyframes || []).map((kf) => {
                              const isKfActive = kf.id === activeKeyframeId
                              const x = kf.time * pixelsPerSecond
                              const y = 52 - (kf.volume / 2.0) * 52
                              return (
                                <circle
                                  key={kf.id}
                                  cx={x}
                                  cy={y}
                                  r={isKfActive ? 5 : 4}
                                  fill={isKfActive ? '#fff' : 'var(--color-accent)'}
                                  stroke="#000"
                                  strokeWidth="1"
                                  className="timeline-style-35"
                                  onMouseDown={(e) => {
                                    e.stopPropagation()
                                    useProjectStore.getState().saveHistory()
                                    useProjectStore.getState().setActiveKeyframeId(kf.id)
                                    useProjectStore.getState().setSelectedClipId(clip.id)
                                    setDraggingKeyframeId({
                                      clipId: clip.id,
                                      kfId: kf.id,
                                      type: 'audio',
                                      startY: e.clientY,
                                      startVolume: kf.volume
                                    })
                                  }}
                                />
                              )
                            })}
                          </svg>
                        )}
                        <span className="timeline-style-15">
                          {clip.name ||
                            media?.name ||
                            (track.type === 'effect' ? 'Effect' : 'Clip')}
                        </span>

                        {/* Fade Ramps */}
                        <svg width="100%" height="100%" className="timeline-style-16">
                          {clip.fadeIn && clip.fadeIn > 0 ? (
                            <polygon
                              points={`0,0 ${clip.fadeIn * pixelsPerSecond},0 0,52`}
                              fill="rgba(0,0,0,0.6)"
                            />
                          ) : null}
                          {clip.fadeOut && clip.fadeOut > 0 ? (
                            <polygon
                              points={`${clip.duration * pixelsPerSecond},0 ${(clip.duration - clip.fadeOut) * pixelsPerSecond},0 ${clip.duration * pixelsPerSecond},52`}
                              fill="rgba(0,0,0,0.6)"
                            />
                          ) : null}
                        </svg>

                        {/* Fade Handles */}
                        {activeTool === 'pointer' && (
                          <>
                            <FadeHandle
                              left={(clip.fadeIn || 0) * pixelsPerSecond}
                              className="timeline-style-17"
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                useProjectStore.getState().saveHistory()
                                setFadingClipId(clip.id)
                                setFadeEdge('left')
                              }}
                            />
                            <FadeHandle
                              left={(clip.duration - (clip.fadeOut || 0)) * pixelsPerSecond}
                              className="timeline-style-18"
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                useProjectStore.getState().saveHistory()
                                setFadingClipId(clip.id)
                                setFadeEdge('right')
                              }}
                            />
                          </>
                        )}

                        {/* Edge Resizers */}
                        {activeTool === 'pointer' && (
                          <>
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                useProjectStore.getState().saveHistory()
                                setResizingClipId(clip.id)
                                setResizeEdge('left')
                                setResizeStartData({
                                  originalDuration: clip.duration,
                                  originalPlaybackRate: clip.audioConfig?.playbackRate || 1
                                })
                              }}
                              className={`timeline-style-19 ${
                                resizingClipId === clip.id && dragAnimal
                                  ? dragAnimal === 'bunny'
                                    ? 'cursor-bunny'
                                    : 'cursor-turtle'
                                  : isAltPressed
                                    ? 'cursor-speed'
                                    : 'cursor-scissors'
                              }`}
                            />
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                useProjectStore.getState().saveHistory()
                                setResizingClipId(clip.id)
                                setResizeEdge('right')
                                setResizeStartData({
                                  originalDuration: clip.duration,
                                  originalPlaybackRate: clip.audioConfig?.playbackRate || 1
                                })
                              }}
                              className={`timeline-style-20 ${
                                resizingClipId === clip.id && dragAnimal
                                  ? dragAnimal === 'bunny'
                                    ? 'cursor-bunny'
                                    : 'cursor-turtle'
                                  : isAltPressed
                                    ? 'cursor-speed'
                                    : 'cursor-scissors'
                              }`}
                            />
                          </>
                        )}

                        {/* Keyframe Markers */}
                        {clip.kenBurnsEffect?.keyframes.map((kf) => {
                          const isKfActive = kf.id === activeKeyframeId
                          return (
                            <KeyframeMarker
                              key={kf.id}
                              left={kf.time * pixelsPerSecond}
                              size={isKfActive ? 12 : 8}
                              bgColor={isKfActive ? '#fff' : 'var(--color-accent)'}
                              title={`Keyframe at ${kf.time}s`}
                              className="timeline-style-21"
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                useProjectStore.getState().saveHistory()
                                useProjectStore.getState().setActiveKeyframeId(kf.id)
                                useProjectStore.getState().setSelectedClipId(clip.id)
                                setDraggingKeyframeId({
                                  clipId: clip.id,
                                  kfId: kf.id,
                                  type: 'kenburns'
                                })
                              }}
                            />
                          )
                        })}
                      </ClipBlock>
                    )
                  })}
              </div>
            </div>
          ))}

          {/* Drop Zone for Range Blocks (New Track) */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const rangeBlockData = e.dataTransfer.getData('application/express-reels-range-block')
              if (rangeBlockData) {
                e.preventDefault()
                const data = JSON.parse(rangeBlockData)
                handleRangeBlockDrop(data, getTimeFromEvent(e))
              }
            }}
            className="timeline-style-10 timeline-style-38"
          >
            Drag Range Block Here to Create New Track
          </div>
        </WithMinWidth>

        {/* Playhead Line Overlay */}
        <PlayheadLine pixelsPerSecond={pixelsPerSecond} />

        {/* Range Markers */}
        {rangeMarkers.start !== null && (
          <RangeMarkerLine
            time={rangeMarkers.start}
            pixelsPerSecond={pixelsPerSecond}
            color="#22c55e"
            onMouseDown={(e) => {
              e.stopPropagation()
              setDraggingRangeMarker('start')
            }}
          />
        )}
        {rangeMarkers.end !== null && (
          <RangeMarkerLine
            time={rangeMarkers.end}
            pixelsPerSecond={pixelsPerSecond}
            color="#ef4444"
            onMouseDown={(e) => {
              e.stopPropagation()
              setDraggingRangeMarker('end')
            }}
          />
        )}

        {/* Razor Hover Line */}
        {activeTool === 'razor' && hoverTime !== null && (
          <PositionedOverlay
            left={80 + hoverTime * pixelsPerSecond}
            className="timeline-style-22"
          />
        )}

        {/* Crop Selection Box */}
        {activeTool === 'crop' && cropDragStart !== null && cropDragEnd !== null && (
          <PositionedOverlay
            left={80 + Math.min(cropDragStart, cropDragEnd) * pixelsPerSecond}
            width={Math.abs(cropDragEnd - cropDragStart) * pixelsPerSecond}
            className="timeline-style-23"
          />
        )}

        {/* Target Duration Cutoff Line */}
        {targetDuration !== null && (
          <PositionedOverlay
            left={80 + targetDuration * pixelsPerSecond}
            className="timeline-style-24"
          >
            <div className="timeline-style-25">EXPORT END</div>
          </PositionedOverlay>
        )}
      </div>

      {trackContextMenu && (
        <>
          <div
            onClick={() => setTrackContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setTrackContextMenu(null)
            }}
            className="timeline-style-26"
          />
          <ContextMenuOverlay
            x={trackContextMenu.x}
            y={trackContextMenu.y}
            className="timeline-style-27"
          >
            <button
              className="context-menu-item timeline-style-28"
              onClick={() => {
                const track = tracks[trackContextMenu.trackIndex]
                useProjectStore.getState().addTrack(
                  {
                    id: `${track.type.charAt(0)}${Date.now()}`,
                    name: `New ${track.type === 'video' ? 'Video' : track.type === 'audio' ? 'Audio' : 'Effect'} Track`,
                    type: track.type
                  },
                  trackContextMenu.trackIndex + 1
                )
                setTrackContextMenu(null)
              }}
            >
              Add Track Below
            </button>
            <button
              className="context-menu-item timeline-style-29"
              onClick={() => {
                useProjectStore.getState().removeTrack(trackContextMenu.trackId)
                setTrackContextMenu(null)
              }}
            >
              Delete Track
            </button>
            {useProjectStore.getState().rangeSelectedTrackIds.length > 0 &&
              useProjectStore.getState().rangeMarkers.start !== null &&
              useProjectStore.getState().rangeMarkers.end !== null && (
                <>
                  {activeTool === 'range-copy' && (
                    <button
                      className="context-menu-item text-blue-400 font-bold"
                      onClick={() => {
                        useProjectStore.getState().executeRangeAction('copy')
                        setTrackContextMenu(null)
                      }}
                    >
                      Execute Copy
                    </button>
                  )}
                  {activeTool === 'range-cut' && (
                    <button
                      className="context-menu-item text-blue-400 font-bold"
                      onClick={() => {
                        useProjectStore.getState().executeRangeAction('cut')
                        setTrackContextMenu(null)
                      }}
                    >
                      Execute Cut
                    </button>
                  )}
                </>
              )}
          </ContextMenuOverlay>
        </>
      )}
      {/* Clip Context Menu */}
      {clipContextMenu && (
        <>
          <div
            className="fixed inset-0 z-[9999]"
            onClick={() => setClipContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setClipContextMenu(null)
            }}
          />
          <ContextMenuOverlay
            x={clipContextMenu.x}
            y={clipContextMenu.y}
            className="timeline-style-42"
          >
            {(() => {
              const clip = clips.find((c) => c.id === clipContextMenu.clipId)
              if (!clip) {
                if (
                  useProjectStore.getState().rangeSelectedTrackIds.length > 0 &&
                  useProjectStore.getState().rangeMarkers.start !== null &&
                  useProjectStore.getState().rangeMarkers.end !== null
                ) {
                  return (
                    <>
                      {activeTool === 'range-copy' && (
                        <button
                          className="context-menu-item text-blue-400 font-bold"
                          onClick={() => {
                            useProjectStore.getState().executeRangeAction('copy')
                            setClipContextMenu(null)
                          }}
                        >
                          Execute Copy
                        </button>
                      )}
                      {activeTool === 'range-cut' && (
                        <button
                          className="context-menu-item text-blue-400 font-bold"
                          onClick={() => {
                            useProjectStore.getState().executeRangeAction('cut')
                            setClipContextMenu(null)
                          }}
                        >
                          Execute Cut
                        </button>
                      )}
                    </>
                  )
                }
                return null
              }
              if (clip.isCollapsed) {
                return (
                  <>
                    <button
                      className="timeline-style-43"
                      onClick={() => {
                        useProjectStore.getState().saveHistory()
                        useProjectStore.getState().removeClip(clip.id)

                        clip.subTracks?.forEach((t) => {
                          if (!tracks.find((existing) => existing.id === t.id)) {
                            useProjectStore.getState().addTrack(t)
                          }
                        })
                        clip.subClips?.forEach((sc) => {
                          addClip({
                            ...sc,
                            id: crypto.randomUUID(),
                            trackId: sc.trackId,
                            startTime: clip.startTime + sc.startTime,
                            sourceOffset: sc.sourceOffset + clip.sourceOffset
                          })
                        })
                        setClipContextMenu(null)
                      }}
                    >
                      Expand Composition
                    </button>
                    <button
                      className="timeline-style-43 text-red-400 hover:bg-red-500/20"
                      onClick={() => {
                        useProjectStore.getState().saveHistory()
                        updateClip(clip.id, { isCollapsed: false, subClips: [], subTracks: [] })
                        setClipContextMenu(null)
                      }}
                    >
                      Collapse (Flatten)
                    </button>
                    {useProjectStore.getState().rangeSelectedTrackIds.length > 0 &&
                      useProjectStore.getState().rangeMarkers.start !== null &&
                      useProjectStore.getState().rangeMarkers.end !== null && (
                        <>
                          {activeTool === 'range-copy' && (
                            <button
                              className="context-menu-item text-blue-400 font-bold"
                              onClick={() => {
                                useProjectStore.getState().executeRangeAction('copy')
                                setClipContextMenu(null)
                              }}
                            >
                              Execute Copy
                            </button>
                          )}
                          {activeTool === 'range-cut' && (
                            <button
                              className="context-menu-item text-blue-400 font-bold"
                              onClick={() => {
                                useProjectStore.getState().executeRangeAction('cut')
                                setClipContextMenu(null)
                              }}
                            >
                              Execute Cut
                            </button>
                          )}
                        </>
                      )}
                  </>
                )
              }
              return (
                <button
                  className="timeline-style-43"
                  onClick={() => {
                    setClipContextMenu(null)
                  }}
                >
                  Clip Properties
                </button>
              )
            })()}
          </ContextMenuOverlay>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Playhead sub-components (defined after Timeline so they can reference store)
// ---------------------------------------------------------------------------

const PlayheadIndicator = ({
  pixelsPerSecond
}: {
  pixelsPerSecond: number
}): React.ReactElement => {
  const playhead = useProjectStore((s) => s.playhead)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.style.left = `${playhead * pixelsPerSecond}px`
  }, [playhead, pixelsPerSecond])
  return (
    <div ref={ref} className="playhead-handle timeline-style-30">
      {/* Triangle indicator — left:-4px is in CSS (.timeline-style-31) */}
      <div className="timeline-style-31" />
    </div>
  )
}

const PlayheadLine = ({ pixelsPerSecond }: { pixelsPerSecond: number }): React.ReactElement => {
  const playhead = useProjectStore((s) => s.playhead)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.style.left = `${80 + playhead * pixelsPerSecond}px`
  }, [playhead, pixelsPerSecond])
  // margin-left:-1px is in CSS (.timeline-style-32)
  return <div ref={ref} className="playhead-line timeline-style-32" />
}

const RangeOverlayBox = ({
  start,
  end,
  pixelsPerSecond,
  onDragStart
}: {
  start: number
  end: number
  pixelsPerSecond: number
  onDragStart: (e: React.DragEvent) => void
}): React.ReactElement => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.left = `${Math.min(start, end) * pixelsPerSecond}px`
      ref.current.style.width = `${Math.abs(end - start) * pixelsPerSecond}px`
    }
  }, [start, end, pixelsPerSecond])

  return <div ref={ref} draggable onDragStart={onDragStart} className="timeline-style-37" />
}

const RangeMarkerLine = ({
  pixelsPerSecond,
  time,
  color,
  onMouseDown
}: {
  pixelsPerSecond: number
  time: number
  color: string
  onMouseDown: (e: React.MouseEvent) => void
}): React.ReactElement => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.left = `${80 + time * pixelsPerSecond}px`
      ref.current.style.backgroundColor = color
      ref.current.style.boxShadow = `0 0 4px ${color}`
    }
  }, [time, pixelsPerSecond, color])
  return <div ref={ref} onMouseDown={onMouseDown} className="timeline-style-39" />
}
