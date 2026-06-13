/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useRef, useState, useMemo } from 'react'
import { useProjectStore, Clip, MediaItem } from '../store/projectStore'
import { calculateKenBurnsTransform } from '../lib/kenBurns'
import { Play, Pause, Square, SkipBack, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import './LivePreview.css'

// --- Helper ---
const getMediaUrl = (path: string) => {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('file://')) return path
  return `file:///${path.replace(/\\/g, '/')}`
}

// --- Global Audio Context ---
let sharedAudioCtx: AudioContext | null = null
const getSharedAudioCtx = () => {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return sharedAudioCtx
}

// --- Audio Player Component ---
const AudioPlayer = ({ clip }: { clip: Clip }) => {
  const media = useProjectStore((s) => s.mediaLibrary.find((m) => m.id === clip.mediaId))
  const audioRef = useRef<HTMLAudioElement>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const pannerRef = useRef<StereoPannerNode | null>(null)
  const bassRef = useRef<BiquadFilterNode | null>(null)
  const midRef = useRef<BiquadFilterNode | null>(null)
  const trebleRef = useRef<BiquadFilterNode | null>(null)
  const compRef = useRef<DynamicsCompressorNode | null>(null)

  useEffect(() => {
    if (!audioRef.current) return
    const el = audioRef.current as any

    if (!el.__audioCtx) {
      const ctx = getSharedAudioCtx()
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      const panner = ctx.createStereoPanner()
      const bass = ctx.createBiquadFilter()
      bass.type = 'lowshelf'
      bass.frequency.value = 250

      const mid = ctx.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = 1000
      mid.Q.value = 1

      const treble = ctx.createBiquadFilter()
      treble.type = 'highshelf'
      treble.frequency.value = 4000

      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -24
      comp.knee.value = 30
      comp.ratio.value = 1
      comp.attack.value = 0.003
      comp.release.value = 0.25

      source.connect(bass)
      bass.connect(mid)
      mid.connect(treble)
      treble.connect(comp)
      comp.connect(panner)
      panner.connect(gain)
      gain.connect(ctx.destination)

      el.__audioCtx = ctx
      el.__source = source
      el.__gain = gain
      el.__panner = panner
      el.__bass = bass
      el.__mid = mid
      el.__treble = treble
      el.__comp = comp
    }

    ctxRef.current = el.__audioCtx
    sourceRef.current = el.__source
    gainRef.current = el.__gain
    pannerRef.current = el.__panner
    bassRef.current = el.__bass
    midRef.current = el.__mid
    trebleRef.current = el.__treble
    compRef.current = el.__comp

    return () => {
      // Do not close the context, let it persist with the DOM node
    }
  }, [])

  useEffect(() => {
    // Initial sync
    const state = useProjectStore.getState()
    if (audioRef.current) {
      const playbackRate = clip.audioConfig?.playbackRate || 1
      const localTime = clip.sourceOffset + (state.playhead - clip.startTime) * playbackRate
      const isActive =
        state.playhead >= clip.startTime && state.playhead < clip.startTime + clip.duration
      if (isActive) {
        audioRef.current.currentTime = localTime
        audioRef.current.playbackRate = playbackRate
        audioRef.current.preservesPitch = true
      }
    }

    return useProjectStore.subscribe((state, prevState) => {
      if (!audioRef.current || !ctxRef.current) return

      const playbackRate = clip.audioConfig?.playbackRate || 1
      const localTime = clip.sourceOffset + (state.playhead - clip.startTime) * playbackRate
      const isActive =
        state.playhead >= clip.startTime && state.playhead < clip.startTime + clip.duration

      if (isActive) {
        if (audioRef.current.playbackRate !== playbackRate) {
          audioRef.current.playbackRate = playbackRate
        }
        if (audioRef.current.preservesPitch !== true) {
          audioRef.current.preservesPitch = true
        }
        // Audio Processing Updates
        if (
          gainRef.current &&
          pannerRef.current &&
          bassRef.current &&
          midRef.current &&
          trebleRef.current &&
          compRef.current
        ) {
          const config = clip.audioConfig || {
            volume: 1,
            bass: 0,
            mid: 0,
            treble: 0,
            pan: 0,
            compression: false,
            reverb: false
          }

          pannerRef.current.pan.value = config.pan
          bassRef.current.gain.value = config.bass
          midRef.current.gain.value = config.mid
          trebleRef.current.gain.value = config.treble
          compRef.current.ratio.value = config.compression ? 12 : 1

          let currentVolume = config.volume
          const clipTime = state.playhead - clip.startTime

          // Keyframe Interpolation
          if (config.keyframes && config.keyframes.length > 0) {
            const sortedKfs = [...config.keyframes].sort((a, b) => a.time - b.time)
            if (clipTime <= sortedKfs[0].time) {
              currentVolume = config.volume * sortedKfs[0].volume
            } else if (clipTime >= sortedKfs[sortedKfs.length - 1].time) {
              currentVolume = config.volume * sortedKfs[sortedKfs.length - 1].volume
            } else {
              // Find the two surrounding keyframes
              for (let i = 0; i < sortedKfs.length - 1; i++) {
                if (clipTime >= sortedKfs[i].time && clipTime < sortedKfs[i + 1].time) {
                  const kf1 = sortedKfs[i]
                  const kf2 = sortedKfs[i + 1]
                  const progress = (clipTime - kf1.time) / (kf2.time - kf1.time)
                  const interpolatedVolume = kf1.volume + (kf2.volume - kf1.volume) * progress
                  currentVolume = config.volume * interpolatedVolume
                  break
                }
              }
            }
          }

          if (clip.fadeIn && clipTime < clip.fadeIn) {
            currentVolume *= clipTime / clip.fadeIn
          }
          if (clip.fadeOut && clipTime > clip.duration - clip.fadeOut) {
            currentVolume *= (clip.duration - clipTime) / clip.fadeOut
          }

          gainRef.current.gain.setTargetAtTime(
            Math.max(0, currentVolume),
            ctxRef.current.currentTime,
            0.05
          )
        }

        const isScrubbing = !state.isPlaying
        const justStartedPlaying = state.isPlaying && !prevState.isPlaying
        const massiveDrift = Math.abs(audioRef.current.currentTime - localTime) > 1.0

        if (isScrubbing || justStartedPlaying || massiveDrift) {
          if (Math.abs(audioRef.current.currentTime - localTime) > 0.1) {
            audioRef.current.currentTime = localTime
          }
        }

        if (state.isPlaying && audioRef.current.paused) {
          if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
          audioRef.current.play().catch((e) => {
            if (e.name !== 'AbortError') {
              console.log(`[AudioPlayer] Play blocked:`, e)
            }
          })
        } else if (!state.isPlaying && !audioRef.current.paused) {
          audioRef.current.pause()
        }
      } else {
        if (!audioRef.current.paused) {
          audioRef.current.pause()
        }
      }
    })
  }, [clip])

  if (!media) return null
  // crossOrigin="anonymous" is required for MediaElementAudioSourceNode
  return (
    <audio ref={audioRef} src={getMediaUrl(media.path)} preload="auto" crossOrigin="anonymous" />
  )
}

// --- Video/Overlay Player Component ---
const VideoPlayer = ({
  clip,
  media,
  transform,
  zIndex,
  className,
  dataClipId,
  isMainTrack
}: {
  clip: Clip
  media: MediaItem
  transform: string
  zIndex: number
  className?: string
  dataClipId: string
  isMainTrack: boolean
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isBuffering, setIsBuffering] = useState(() => {
    const p = useProjectStore.getState().playhead
    return p >= clip.startTime - 2 && p < clip.startTime + (clip.duration || 5) + 2
  })

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.style.transform = transform
      videoRef.current.style.zIndex = zIndex.toString()
      const targetName = (clip.name || media?.name || '').toLowerCase()
      const isExplicitOverlay = targetName.includes('overlay') || targetName.includes('screen')
      videoRef.current.style.mixBlendMode =
        isExplicitOverlay || !isMainTrack ? 'screen' : 'normal'
    }
  }, [transform, zIndex, clip, media, isBuffering, isMainTrack])

  useEffect(() => {
    // Initial sync
    const state = useProjectStore.getState()
    if (videoRef.current) {
      const playbackRate = clip.audioConfig?.playbackRate || 1
      const localTime = (clip.sourceOffset || 0) + (state.playhead - clip.startTime) * playbackRate
      const isActive =
        state.playhead >= clip.startTime && state.playhead < clip.startTime + clip.duration
      videoRef.current.style.visibility = isActive ? 'visible' : 'hidden'
      if (isActive) {
        videoRef.current.currentTime = localTime
        videoRef.current.playbackRate = playbackRate
      }

      // Initial src buffer sync
      const isBuffering =
        state.playhead >= clip.startTime - 2 &&
        state.playhead < clip.startTime + (clip.duration || 5) + 2

      if (isBuffering && !videoRef.current.hasAttribute('src')) {
        videoRef.current.src = getMediaUrl(media.path || media.thumbnail || '')
        videoRef.current.load()
      }
    }

    return useProjectStore.subscribe((state, prevState) => {
      const newIsBuffering =
        state.playhead >= clip.startTime - 2 &&
        state.playhead < clip.startTime + (clip.duration || 5) + 2

      setIsBuffering(newIsBuffering)

      if (!videoRef.current) return

      const playbackRate = clip.audioConfig?.playbackRate || 1
      const localTime = (clip.sourceOffset || 0) + (state.playhead - clip.startTime) * playbackRate

      const isActive =
        state.playhead >= clip.startTime && state.playhead < clip.startTime + clip.duration

      if (isActive) {
        if (videoRef.current.playbackRate !== playbackRate) {
          videoRef.current.playbackRate = playbackRate
        }
        // Video Opacity Fades
        let currentOpacity = 1
        const clipTime = state.playhead - clip.startTime
        if (clip.fadeIn && clipTime < clip.fadeIn) {
          currentOpacity = clipTime / clip.fadeIn
        }
        if (clip.fadeOut && clipTime > clip.duration - clip.fadeOut) {
          currentOpacity = (clip.duration - clipTime) / clip.fadeOut
        }
        videoRef.current.style.opacity = currentOpacity.toString()
        videoRef.current.style.visibility = 'visible'
      } else {
        videoRef.current.style.visibility = 'hidden'
      }

      if (isActive) {
        const isScrubbing = !state.isPlaying
        const justStartedPlaying = state.isPlaying && !prevState.isPlaying

        if (isScrubbing || justStartedPlaying) {
          if (Math.abs(videoRef.current.currentTime - localTime) > 0.1) {
            videoRef.current.currentTime = localTime
          }
        }

        if (state.isPlaying && videoRef.current.paused) {
          videoRef.current.play().catch((e) => {
            if (e.name !== 'AbortError') {
              console.log(`[VideoPlayer] Play blocked:`, e)
            }
          })
        } else if (!state.isPlaying && !videoRef.current.paused) {
          videoRef.current.pause()
        }
      } else {
        if (!videoRef.current.paused) {
          videoRef.current.pause()
        }
      }
    })
  }, [clip, media])

  // Visibility and active state are handled by React

  if (!isBuffering) return null

  return (
    <video
      ref={videoRef}
      src={getMediaUrl(media.path || media.thumbnail || '')}
      className={`${className || ''} pointer-events-none`}
      data-clip-id={dataClipId}
      playsInline
      muted
      loop
    />
  )
}

// --- Image Player Component ---
const ImagePlayer = ({
  clip,
  media,
  transform,
  zIndex,
  className,
  dataClipId
}: {
  clip: Clip
  media: MediaItem
  transform: string
  zIndex: number
  className?: string
  dataClipId: string
}) => {
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (imgRef.current) {
      imgRef.current.style.transform = transform
      imgRef.current.style.zIndex = zIndex.toString()
      const targetName = (clip.name || media?.name || '').toLowerCase()
      const isExplicitOverlay = targetName.includes('overlay') || targetName.includes('screen')
      // Only apply screen to images if they explicitly say overlay (images can have natural transparency)
      imgRef.current.style.mixBlendMode = isExplicitOverlay ? 'screen' : 'normal'
    }
  }, [transform, zIndex, clip, media])

  useEffect(() => {
    const state = useProjectStore.getState()
    if (imgRef.current) {
      const isActive =
        state.playhead >= clip.startTime && state.playhead < clip.startTime + (clip.duration || 5)
      imgRef.current.style.visibility = isActive ? 'visible' : 'hidden'
    }

    return useProjectStore.subscribe((state) => {
      if (!imgRef.current) return
      const isActive =
        state.playhead >= clip.startTime && state.playhead < clip.startTime + (clip.duration || 5)

      if (isActive) {
        let currentOpacity = 1
        const clipTime = state.playhead - clip.startTime
        if (clip.fadeIn && clipTime < clip.fadeIn) {
          currentOpacity = clipTime / clip.fadeIn
        }
        if (clip.fadeOut && clipTime > (clip.duration || 5) - clip.fadeOut) {
          currentOpacity = ((clip.duration || 5) - clipTime) / clip.fadeOut
        }
        imgRef.current.style.opacity = currentOpacity.toString()
        imgRef.current.style.visibility = 'visible'
      } else {
        imgRef.current.style.visibility = 'hidden'
      }
    })
  }, [clip])

  return (
    <img
      ref={imgRef}
      src={getMediaUrl(media.path || media.thumbnail || '')}
      className={`${className || ''} pointer-events-none`}
      data-clip-id={dataClipId}
      draggable={false}
      alt="Media"
    />
  )
}

// --- Effect Overlay Component ---
const EffectOverlay = ({ clip, zIndex }: { clip: Clip; zIndex: number }) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.zIndex = zIndex.toString()
      if (clip.effect?.cssFilter) {
        ref.current.style.backdropFilter = clip.effect.cssFilter
        ;(ref.current.style as any).WebkitBackdropFilter = clip.effect.cssFilter
      }
    }
  }, [clip.effect?.cssFilter, zIndex])

  return <div ref={ref} className="live-preview-effect-overlay" data-effect-id={clip.id} />
}

// --- Flatten Compound Clips for Rendering ---
const flattenClips = (clips: Clip[], mediaItems: any[]): Clip[] => {
  const flattened: Clip[] = []
  for (const clip of clips) {
    const media = mediaItems.find((m) => m.id === clip.mediaId)
    const isComposition = media?.type === 'composition'
    const subClips = isComposition ? media.subClips : clip.subClips

    if ((clip.isCollapsed || isComposition) && subClips) {
      const innerFlattened = flattenClips(subClips, mediaItems)
      for (const sub of innerFlattened) {
        let globalStart = clip.startTime + (sub.startTime - clip.sourceOffset)
        let globalOffset = sub.sourceOffset
        let globalDuration = sub.duration

        if (globalStart < clip.startTime) {
          const diff = clip.startTime - globalStart
          globalStart = clip.startTime
          globalOffset += diff
          globalDuration -= diff
        }

        const globalEnd = globalStart + globalDuration
        const clipEnd = clip.startTime + clip.duration
        if (globalEnd > clipEnd) {
          globalDuration -= globalEnd - clipEnd
        }

        if (globalDuration > 0) {
          flattened.push({
            ...sub,
            id: `${clip.id}_${sub.id}`,
            trackId: clip.trackId,
            startTime: globalStart,
            sourceOffset: globalOffset,
            duration: globalDuration
          })
        }
      }
    } else {
      flattened.push(clip)
    }
  }
  return flattened
}

export function LivePreview(): React.ReactElement | null {
  // Only subscribe to the exact state we need for RENDER.
  const setPlayhead = useProjectStore((s) => s.setPlayhead)
  const updateKenBurnsKeyframe = useProjectStore((s) => s.updateKenBurnsKeyframe)

  const isPlaying = useProjectStore((s) => s.isPlaying)
  const tracks = useProjectStore((s) => s.tracks)
  const rawClips = useProjectStore((s) => s.clips)
  const mediaItems = useProjectStore((s) => s.mediaLibrary)
  const allClips = useMemo(() => flattenClips(rawClips, mediaItems), [rawClips, mediaItems])
  const activeKeyframeId = useProjectStore((s) => s.activeKeyframeId)
  const selectedClipId = useProjectStore((s) => s.selectedClipId)
  const mediaLibrary = useProjectStore((s) => s.mediaLibrary)
  const targetDuration = useProjectStore((s) => s.targetDuration)
  const setTargetDuration = useProjectStore((s) => s.setTargetDuration)
  const autoAdjustTargetDuration = useProjectStore((s) => s.autoAdjustTargetDuration)
  const setAutoAdjustTargetDuration = useProjectStore((s) => s.setAutoAdjustTargetDuration)
  const isKenBurnsLocked = useProjectStore((s) => s.isKenBurnsLocked)
  const setKenBurnsLocked = useProjectStore((s) => s.setKenBurnsLocked)
  const setIsPlaying = useProjectStore((s) => s.setIsPlaying)

  const audioClips = allClips.filter(
    (c) => tracks.find((t) => t.id === c.trackId)?.type === 'audio'
  )
  const visualClips = allClips.filter(
    (c) => !c.effect && tracks.find((t) => t.id === c.trackId)?.type === 'video'
  )

  // Higher track index means bottom layer, so reverse sort by index to render bottom-to-top
  const sortedVisualClips = [...visualClips].sort((a, b) => {
    const idxA = tracks.findIndex((t) => t.id === a.trackId)
    const idxB = tracks.findIndex((t) => t.id === b.trackId)
    return idxB - idxA
  })

  const requestRef = useRef<number>(0)
  const previousTimeRef = useRef<number | undefined>(undefined)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Interactive editing state
  const draggingClip =
    sortedVisualClips.find((c) => c.id === selectedClipId) ||
    sortedVisualClips[sortedVisualClips.length - 1]
  const effect = draggingClip?.kenBurnsEffect

  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false)
  const dragStartPosRef = useRef({ x: 0, y: 0 })
  const originalKfPosRef = useRef({ x: 0, y: 0 })
  const currentDragPosRef = useRef({ x: 0, y: 0 })

  const updateFrameStyles = (state: ReturnType<typeof useProjectStore.getState>, time: number) => {
    if (!canvasRef.current) return
    const currentActiveClips = state.clips.filter(
      (c) => time >= c.startTime && time < c.startTime + c.duration
    )

    // Ken Burns
    currentActiveClips.forEach((clip) => {
      if (clip.kenBurnsEffect) {
        const el = canvasRef.current!.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement
        if (el) {
          const localClipTime = time - clip.startTime
          const t = calculateKenBurnsTransform(clip.kenBurnsEffect, localClipTime)
          el.style.transform = `scale(${t.zoom}) translate(${t.x}%, ${t.y}%)`
        }
      }
    })

    // Effects
    canvasRef.current.style.filter = 'none'
    state.clips
      .filter((c) => c.effect)
      .forEach((clip) => {
        const el = canvasRef.current!.querySelector(`[data-effect-id="${clip.id}"]`) as HTMLElement
        if (el) {
          const isActive = time >= clip.startTime && time < clip.startTime + clip.duration
          if (isActive) {
            let currentOpacity = 1
            const clipTime = time - clip.startTime
            if (clip.fadeIn && clipTime < clip.fadeIn) {
              currentOpacity = clipTime / clip.fadeIn
            }
            if (clip.fadeOut && clipTime > clip.duration - clip.fadeOut) {
              currentOpacity = (clip.duration - clipTime) / clip.fadeOut
            }
            el.style.opacity = currentOpacity.toString()
            el.style.visibility = 'visible'
          } else {
            el.style.visibility = 'hidden'
          }
        }
      })
  }

  // Playback Loop
  const animate = (time: number) => {
    if (previousTimeRef.current != undefined) {
      const state = useProjectStore.getState()
      const deltaTime = (time - previousTimeRef.current) / 1000

      const newTime = state.playhead + deltaTime
      const maxTime =
        state.clips.length > 0 ? Math.max(...state.clips.map((c) => c.startTime + c.duration)) : 5
      const finalTime = newTime > maxTime + 1 ? 0 : newTime

      setPlayhead(finalTime)
      updateFrameStyles(state, finalTime)
    }
    previousTimeRef.current = time
    requestRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate)
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
      previousTimeRef.current = undefined
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  useEffect(() => {
    return useProjectStore.subscribe((state, prevState) => {
      if (!state.isPlaying && state.playhead !== prevState.playhead) {
        updateFrameStyles(state, state.playhead)
      }
    })
  }, [])

  const localClipTime = draggingClip
    ? useProjectStore.getState().playhead - draggingClip.startTime
    : 0
  const getEditingKeyframe = () => {
    if (!draggingClip || !effect) return null
    if (activeKeyframeId) {
      return effect.keyframes.find((k) => k.id === activeKeyframeId) || null
    }
    if (effect.keyframes.length === 0) return null
    return [...effect.keyframes].sort(
      (a, b) => Math.abs(a.time - localClipTime) - Math.abs(b.time - localClipTime)
    )[0]
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (isKenBurnsLocked || !draggingClip || isPlaying) return
    const kf = getEditingKeyframe()
    if (!kf) return

    e.preventDefault()
    const zoomDelta = e.deltaY * -0.005
    const newZoom = Math.max(
      effect?.constrainToFrame !== false ? 1 : 0.1,
      Math.min(5, kf.zoom + zoomDelta)
    )

    updateKenBurnsKeyframe(draggingClip.id, kf.id, { zoom: newZoom })
    if (!activeKeyframeId) useProjectStore.getState().setActiveKeyframeId(kf.id)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isKenBurnsLocked || !draggingClip || isPlaying) return
    const kf = getEditingKeyframe()
    if (!kf) return

    useProjectStore.getState().saveHistory()

    setIsDraggingCanvas(true)
    dragStartPosRef.current = { x: e.clientX, y: e.clientY }
    originalKfPosRef.current = { x: kf.x, y: kf.y }
    currentDragPosRef.current = { x: kf.x, y: kf.y }
    if (!activeKeyframeId) useProjectStore.getState().setActiveKeyframeId(kf.id)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isKenBurnsLocked || !isDraggingCanvas || !draggingClip) return
    const kf = getEditingKeyframe()
    if (!kf) return

    const dx = e.clientX - dragStartPosRef.current.x
    const dy = e.clientY - dragStartPosRef.current.y
    const sensitivity = 0.2 / kf.zoom

    let newX = originalKfPosRef.current.x + dx * sensitivity
    let newY = originalKfPosRef.current.y + dy * sensitivity

    const maxPan = effect?.constrainToFrame !== false ? ((kf.zoom - 1) / (2 * kf.zoom)) * 100 : 200
    newX = Math.max(-maxPan, Math.min(maxPan, newX))
    newY = Math.max(-maxPan, Math.min(maxPan, newY))

    currentDragPosRef.current = { x: newX, y: newY }

    if (canvasRef.current) {
      const el = canvasRef.current.querySelector(
        `[data-clip-id="${draggingClip.id}"]`
      ) as HTMLElement
      if (el) el.style.transform = `scale(${kf.zoom}) translate(${newX}%, ${newY}%)`
    }
  }

  const handleMouseUp = () => {
    if (isDraggingCanvas && draggingClip) {
      const kf = getEditingKeyframe()
      if (kf) {
        updateKenBurnsKeyframe(draggingClip.id, kf.id, {
          x: currentDragPosRef.current.x,
          y: currentDragPosRef.current.y
        })
      }
    }
    setIsDraggingCanvas(false)
  }

  const currentPlayhead = useProjectStore.getState().playhead

  return (
    <div className="panel panel-c-preview live-preview-container">
      {/* Hidden Audio Elements */}
      {audioClips.map((clip) => (
        <AudioPlayer key={clip.id} clip={clip} />
      ))}

      {/* Canvas Area */}
      <div
        className="live-preview-canvas-wrapper"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={canvasRef}
          className="live-preview-canvas"
          data-cursor={
            draggingClip && !isPlaying ? (isDraggingCanvas ? 'grabbing' : 'grab') : 'default'
          }
        >
          {sortedVisualClips.length > 0 ? (
            sortedVisualClips.map((clip, i) => {
              const media = mediaLibrary.find((m) => m.id === clip.mediaId)
              if (!media) return null

              let t = { x: 0, y: 0, zoom: 1 }
              if (clip.kenBurnsEffect) {
                const kf =
                  clip.id === draggingClip?.id && activeKeyframeId && !isPlaying
                    ? clip.kenBurnsEffect.keyframes.find((k) => k.id === activeKeyframeId)
                    : null
                if (kf) t = { x: kf.x, y: kf.y, zoom: kf.zoom }
                else
                  t = calculateKenBurnsTransform(
                    clip.kenBurnsEffect,
                    currentPlayhead - clip.startTime
                  )
              }

              const transformStr = `scale(${t.zoom}) translate(${t.x}%, ${t.y}%)`

              const isMainTrack =
                tracks.findIndex((t) => t.id === clip.trackId) === tracks.length - 1

              if (media.type === 'video') {
                return (
                  <VideoPlayer
                    key={clip.id}
                    clip={clip}
                    media={media}
                    transform={transformStr}
                    zIndex={i}
                    className="live-preview-media-item"
                    dataClipId={clip.id}
                    isMainTrack={isMainTrack}
                  />
                )
              } else {
                return (
                  <ImagePlayer
                    key={clip.id}
                    clip={clip}
                    media={media}
                    transform={transformStr}
                    zIndex={i}
                    className="live-preview-media-item"
                    dataClipId={clip.id}
                  />
                )
              }
            })
          ) : (
            <div className="live-preview-empty">No media selected</div>
          )}

          {/* Effect Overlays */}
          {allClips
            .filter((clip) => clip.effect)
            .map((clip, i) => (
              <EffectOverlay key={clip.id} clip={clip} zIndex={100 + i} />
            ))}
        </div>
      </div>

      {/* Transport Controls */}
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
          {selectedClipId && (
            <button
              onClick={() => {
                useProjectStore.getState().removeClip(selectedClipId)
                useProjectStore.getState().setSelectedClipId(null)
              }}
              className="live-preview-btn live-preview-btn-danger"
              title="Delete Selected Clip"
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
    </div>
  )
}

const PlayheadTime = () => {
  const playhead = useProjectStore((s) => s.playhead)
  const formatTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60)
      .toString()
      .padStart(2, '0')
    const secs = Math.floor(timeInSeconds % 60)
      .toString()
      .padStart(2, '0')
    const ms = Math.floor((timeInSeconds % 1) * 100)
      .toString()
      .padStart(2, '0')
    return `00:${mins}:${secs}:${ms}`
  }
  return <div className="live-preview-time-display">{formatTime(playhead)}</div>
}
