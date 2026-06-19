/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useRef, useState, useMemo } from 'react'
import { useProjectStore, Clip, MediaItem } from '../store/projectStore'
import { usePlaybackStore } from '../store/playbackStore'
import { calculateKenBurnsTransform } from '../lib/kenBurns'

import './LivePreview.css'
import { LivePreviewTransport } from './LivePreviewTransport'

// --- Helper ---
const getMediaUrl = (path: string) => {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('file://')) return path
  return path.startsWith('blob:') || path.startsWith('http:')
    ? path
    : `file:///${path.replace(/\\/g, '/')}`
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
    if (audioRef.current) {
      const playbackRate = clip.audioConfig?.playbackRate || 1
      let localTime =
        clip.sourceOffset + (usePlaybackStore.getState().playhead - clip.startTime) * playbackRate
      if (audioRef.current.duration > 0) {
        localTime = localTime % audioRef.current.duration
      }
      const isActive =
        usePlaybackStore.getState().playhead >= clip.startTime &&
        usePlaybackStore.getState().playhead < clip.startTime + clip.duration
      if (isActive) {
        audioRef.current.currentTime = localTime
        audioRef.current.playbackRate = playbackRate
        ;(audioRef.current as any).preservesPitch = true
      }
    }

    return usePlaybackStore.subscribe((state, prevState) => {
      if (!audioRef.current || !ctxRef.current) return

      const playbackRate = clip.audioConfig?.playbackRate || 1
      let localTime =
        clip.sourceOffset + (usePlaybackStore.getState().playhead - clip.startTime) * playbackRate
      if (audioRef.current.duration > 0) {
        localTime = localTime % audioRef.current.duration
      }
      const isActive =
        usePlaybackStore.getState().playhead >= clip.startTime &&
        usePlaybackStore.getState().playhead < clip.startTime + clip.duration

      if (isActive) {
        if (audioRef.current.playbackRate !== playbackRate) {
          audioRef.current.playbackRate = playbackRate
        }
        if ((audioRef.current as any).preservesPitch !== true) {
          ;(audioRef.current as any).preservesPitch = true
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
    <audio
      ref={audioRef}
      src={getMediaUrl(media.path)}
      preload="auto"
      crossOrigin="anonymous"
      loop
    />
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
    const p = usePlaybackStore.getState().playhead
    return p >= clip.startTime - 2 && p < clip.startTime + (clip.duration || 5) + 2
  })

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.style.transform = transform
      videoRef.current.style.zIndex = zIndex.toString()
      const targetName = (clip.name || media?.name || '').toLowerCase()
      const isExplicitOverlay = targetName.includes('overlay') || targetName.includes('screen')
      videoRef.current.style.mixBlendMode = isExplicitOverlay || !isMainTrack ? 'screen' : 'normal'
    }
  }, [transform, zIndex, clip, media, isBuffering, isMainTrack])

  useEffect(() => {
    // Initial sync
    if (videoRef.current) {
      const playbackRate = clip.audioConfig?.playbackRate || 1
      let localTime =
        (clip.sourceOffset || 0) +
        (usePlaybackStore.getState().playhead - clip.startTime) * playbackRate
      if (videoRef.current.duration > 0) {
        localTime = localTime % videoRef.current.duration
      }
      const isActive =
        usePlaybackStore.getState().playhead >= clip.startTime &&
        usePlaybackStore.getState().playhead < clip.startTime + clip.duration
      videoRef.current.style.visibility = isActive ? 'visible' : 'hidden'
      if (isActive) {
        videoRef.current.currentTime = localTime
        videoRef.current.playbackRate = playbackRate
      }

      // Initial src buffer sync
      const isBuffering =
        usePlaybackStore.getState().playhead >= clip.startTime - 2 &&
        usePlaybackStore.getState().playhead < clip.startTime + (clip.duration || 5) + 2

      if (isBuffering && !videoRef.current.hasAttribute('src')) {
        videoRef.current.src = getMediaUrl(media.path || media.thumbnail || '')
        videoRef.current.load()
      }
    }

    return usePlaybackStore.subscribe((state, prevState) => {
      const newIsBuffering =
        state.playhead >= clip.startTime - 2 &&
        state.playhead < clip.startTime + (clip.duration || 5) + 2

      setIsBuffering(newIsBuffering)

      if (!videoRef.current) return

      const playbackRate = clip.audioConfig?.playbackRate || 1
      let localTime =
        (clip.sourceOffset || 0) +
        (usePlaybackStore.getState().playhead - clip.startTime) * playbackRate
      if (videoRef.current.duration > 0) {
        localTime = localTime % videoRef.current.duration
      }

      const isActive =
        usePlaybackStore.getState().playhead >= clip.startTime &&
        usePlaybackStore.getState().playhead < clip.startTime + clip.duration

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
      className={`${className || ''}`}
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
    if (imgRef.current) {
      const isActive =
        usePlaybackStore.getState().playhead >= clip.startTime &&
        usePlaybackStore.getState().playhead < clip.startTime + (clip.duration || 5)
      imgRef.current.style.visibility = isActive ? 'visible' : 'hidden'
    }

    return usePlaybackStore.subscribe((state) => {
      if (!imgRef.current) return
      const isActive =
        usePlaybackStore.getState().playhead >= clip.startTime &&
        usePlaybackStore.getState().playhead < clip.startTime + (clip.duration || 5)

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
      className={`${className || ''}`}
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

// --- Text Player Component ---
const TextPlayer = ({
  clip,
  zIndex,
  className,
  dataClipId,
  transform
}: {
  clip: Clip
  zIndex: number
  className?: string
  dataClipId?: string
  transform?: string
}) => {
  const textRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const textProps = clip.textProperties

  useEffect(() => {
    const el = textRef.current
    const wrapperEl = wrapperRef.current

    if (wrapperEl) {
      wrapperEl.style.zIndex = zIndex.toString()
      if (transform) {
        wrapperEl.style.transform = transform
      } else {
        wrapperEl.style.transform = 'none'
      }
    }

    if (el && textProps) {
      el.style.fontFamily = textProps.fontFamily
      el.style.fontSize = `${textProps.fontSize}px`
      el.style.color = textProps.color
      el.style.fontWeight = textProps.fontWeight.toString()
      el.style.textAlign = textProps.textAlign || 'center'
      el.style.textShadow = textProps.dropShadow?.enabled
        ? `${textProps.dropShadow.offsetX}px ${textProps.dropShadow.offsetY}px ${textProps.dropShadow.blur}px rgba(0,0,0,0.8)`
        : 'none'
    }
  }, [transform, zIndex, textProps])

  useEffect(() => {
    return usePlaybackStore.subscribe((state) => {
      if (textRef.current) {
        const isActive =
          state.playhead >= clip.startTime &&
          state.playhead <= clip.startTime + (clip.duration || 5)

        if (isActive) {
          let currentOpacity = 1
          const clipTime = state.playhead - clip.startTime
          if (clip.fadeIn && clipTime < clip.fadeIn) {
            currentOpacity = clipTime / clip.fadeIn
          }
          if (clip.fadeOut && clipTime > (clip.duration || 5) - clip.fadeOut) {
            currentOpacity = ((clip.duration || 5) - clipTime) / clip.fadeOut
          }
          textRef.current.style.opacity = currentOpacity.toString()
          textRef.current.style.visibility = 'visible'
        } else {
          textRef.current.style.visibility = 'hidden'
        }
      }
    })
  }, [clip])

  if (!textProps) return null

  return (
    <div
      ref={wrapperRef}
      className={`${className || ''} absolute inset-0 live-preview-text-wrapper`}
      data-clip-id={dataClipId}
    >
      <div ref={textRef} className="live-preview-text-content m-0 p-0">
        {textProps.content}
      </div>
    </div>
  )
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
  const setPlayhead = usePlaybackStore((s) => s.setPlayhead)
  const updateKenBurnsKeyframe = useProjectStore((s) => s.updateKenBurnsKeyframe)

  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const tracks = useProjectStore((s) => s.tracks)
  const rawClips = useProjectStore((s) => s.clips)
  const mediaItems = useProjectStore((s) => s.mediaLibrary)
  const allClips = useMemo(() => flattenClips(rawClips, mediaItems), [rawClips, mediaItems])
  const activeKeyframeId = useProjectStore((s) => s.activeKeyframeId)
  const selectedClipId = useProjectStore((s) => s.selectedClipId)
  const mediaLibrary = useProjectStore((s) => s.mediaLibrary)
  const isKenBurnsLocked = useProjectStore((s) => s.isKenBurnsLocked)

  const audioClips = allClips?.filter((c) => {
    const type = tracks.find((t) => t.id === c.trackId)?.type
    return type === 'audio' || type === 'video'
  })
  const visualClips = allClips?.filter((c) => {
    const type = tracks.find((t) => t.id === c.trackId)?.type
    return !c.effect && (type === 'video' || type === 'text')
  })

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
    const currentActiveClips = state?.clips?.filter(
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
    state?.clips
      ?.filter((c) => c.effect)
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

      const newTime = usePlaybackStore.getState().playhead + deltaTime
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
    return usePlaybackStore.subscribe((state, prevState) => {
      if (!state.isPlaying && state.playhead !== prevState.playhead) {
        updateFrameStyles(useProjectStore.getState(), state.playhead)
      }
    })
  }, [])

  const localClipTime = draggingClip
    ? usePlaybackStore.getState().playhead - draggingClip.startTime
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

  const handleWheelRef = useRef<(e: WheelEvent) => void>(undefined)
  useEffect(() => {
    handleWheelRef.current = (e: WheelEvent) => {
      if (isKenBurnsLocked || !draggingClip || isPlaying) return
      const kf = getEditingKeyframe()
      if (!kf) return

      e.preventDefault()
      const zoomDelta = Math.sign(e.deltaY) * -0.1
      const newZoom = Math.max(
        effect?.constrainToFrame !== false ? 1 : 0.1,
        Math.min(5, kf.zoom + zoomDelta)
      )

      updateKenBurnsKeyframe(draggingClip.id, kf.id, { zoom: newZoom })
      if (!activeKeyframeId) useProjectStore.getState().setActiveKeyframeId(kf.id)
    }
  })

  const wrapperRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const listener = (e: WheelEvent) => {
      if (handleWheelRef.current) handleWheelRef.current(e)
    }
    el.addEventListener('wheel', listener, { passive: false })
    return () => el.removeEventListener('wheel', listener)
  }, [])

  // Fix stale closures during rapid drag events
  const activeDragClipRef = useRef<any>(null)
  const activeEffectRef = useRef<any>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPlaying) return

    // Implement Click-To-Select logic!
    let targetClipId: string | null = null

    const targetElement = (e.target as HTMLElement).closest('[data-clip-id]') as HTMLElement
    if (targetElement) {
      targetClipId = targetElement.getAttribute('data-clip-id')
    }

    let newDraggingClip = draggingClip
    if (targetClipId) {
      useProjectStore.getState().setSelectedClipId(targetClipId)
      newDraggingClip = sortedVisualClips.find((c) => c.id === targetClipId) || newDraggingClip
    }

    if (isKenBurnsLocked || !newDraggingClip) return

    let kf = getEditingKeyframe()
    // If the user clicked a different clip, getEditingKeyframe will have returned the old clip's keyframe
    // We need to re-evaluate it for the new clip
    if (targetClipId && targetClipId !== draggingClip?.id) {
      const effect = newDraggingClip.kenBurnsEffect
      const localTime = currentPlayhead - newDraggingClip.startTime
      kf = effect?.keyframes.find((k) => k.id === activeKeyframeId) || null
      if (!kf && effect?.keyframes.length) {
        kf = [...effect.keyframes].sort(
          (a, b) => Math.abs(a.time - localTime) - Math.abs(b.time - localTime)
        )[0]
      }
    }

    const store = useProjectStore.getState()

    if (!kf) {
      // Auto-create a Ken Burns effect and keyframe so the user can drag immediately!
      const newKfId = `kb-${crypto.randomUUID()}`
      const newEffect = newDraggingClip.kenBurnsEffect || {
        id: `kb-${crypto.randomUUID()}`,
        mediaId: newDraggingClip.mediaId,
        easing: 'ease-in-out',
        constrainToFrame: newDraggingClip.trackId?.startsWith('v') ? true : false,
        keyframes: []
      }
      const newKf = {
        id: newKfId,
        time: newDraggingClip ? currentPlayhead - newDraggingClip.startTime : 0,
        x: 0,
        y: 0,
        zoom: 1,
        rotation: 0
      }
      if (!newDraggingClip.kenBurnsEffect) {
        store.setKenBurnsEffect(newDraggingClip.id, newEffect)
      }
      store.addKenBurnsKeyframe(newDraggingClip.id, newKf)
      store.setActiveKeyframeId(newKfId)
      kf = newKf
      activeEffectRef.current = newEffect
    } else {
      activeEffectRef.current = newDraggingClip.kenBurnsEffect
    }

    store.saveHistory()

    activeDragClipRef.current = newDraggingClip
    setIsDraggingCanvas(true)
    dragStartPosRef.current = { x: e.clientX, y: e.clientY }
    originalKfPosRef.current = { x: kf.x, y: kf.y }
    currentDragPosRef.current = { x: kf.x, y: kf.y }
    if (!activeKeyframeId) store.setActiveKeyframeId(kf.id)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const currentDragClip = activeDragClipRef.current || draggingClip
    if (isKenBurnsLocked || !isDraggingCanvas || !currentDragClip) return

    let kf = getEditingKeyframe()

    // If re-render hasn't happened yet, calculate using the ref clip
    if (!kf && activeDragClipRef.current) {
      const effect = activeEffectRef.current
      if (effect) {
        const localTime = currentPlayhead - currentDragClip.startTime
        kf =
          effect.keyframes.find((k: any) => k.id === useProjectStore.getState().activeKeyframeId) ||
          null
        if (!kf && effect.keyframes.length) {
          kf = [...effect.keyframes].sort(
            (a: any, b: any) => Math.abs(a.time - localTime) - Math.abs(b.time - localTime)
          )[0]
        }
      }
    }

    if (!kf) return

    const dx = e.clientX - dragStartPosRef.current.x
    const dy = e.clientY - dragStartPosRef.current.y
    const sensitivity = 0.2 / kf.zoom

    let newX = originalKfPosRef.current.x + dx * sensitivity
    let newY = originalKfPosRef.current.y + dy * sensitivity

    const currentEffect = activeEffectRef.current || effect
    const isText = !!currentDragClip.textProperties
    const constrain = isText ? false : currentEffect?.constrainToFrame !== false
    const maxPan = constrain ? ((kf.zoom - 1) / (2 * kf.zoom)) * 100 : 200
    newX = Math.max(-maxPan, Math.min(maxPan, newX))
    newY = Math.max(-maxPan, Math.min(maxPan, newY))

    currentDragPosRef.current = { x: newX, y: newY }

    if (canvasRef.current) {
      const el = canvasRef.current.querySelector(
        `[data-clip-id="${currentDragClip.id}"]`
      ) as HTMLElement
      if (el) {
        el.style.transform = `scale(${kf.zoom}) translate(${newX}%, ${newY}%)`
      }
    }
  }

  const handleMouseUp = () => {
    const currentDragClip = activeDragClipRef.current || draggingClip
    if (isDraggingCanvas && currentDragClip) {
      let kf = getEditingKeyframe()
      if (!kf && activeEffectRef.current) {
        kf =
          activeEffectRef.current.keyframes.find(
            (k: any) => k.id === useProjectStore.getState().activeKeyframeId
          ) || null
      }
      if (kf) {
        useProjectStore.getState().updateKenBurnsKeyframe(currentDragClip.id, kf.id, {
          x: currentDragPosRef.current.x,
          y: currentDragPosRef.current.y
        })
      }
    }
    setIsDraggingCanvas(false)
  }

  const currentPlayhead = usePlaybackStore.getState().playhead

  return (
    <div className="panel panel-c-preview live-preview-container">
      {/* Hidden Audio Elements */}
      {audioClips.map((clip) => (
        <AudioPlayer key={clip.id} clip={clip} />
      ))}

      {/* Canvas Area */}
      <div
        className="live-preview-canvas-wrapper"
        ref={wrapperRef}
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

              const track = tracks.find((track) => track.id === clip.trackId)
              if (track?.type === 'text') {
                return (
                  <TextPlayer
                    key={clip.id}
                    clip={clip}
                    zIndex={i}
                    className="live-preview-media-item"
                    dataClipId={clip.id}
                    transform={transformStr}
                  />
                )
              }

              const media = mediaLibrary.find((m) => m.id === clip.mediaId)
              if (!media) return null

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
            ?.filter((clip) => clip.effect)
            .map((clip, i) => (
              <EffectOverlay key={clip.id} clip={clip} zIndex={100 + i} />
            ))}
        </div>
      </div>

      {/* Transport Controls */}
      <LivePreviewTransport />
    </div>
  )
}
