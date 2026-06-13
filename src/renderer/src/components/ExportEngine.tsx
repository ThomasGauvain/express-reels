/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'
import { calculateKenBurnsTransform } from '../lib/kenBurns'

interface AudioElementWithGain extends HTMLAudioElement {
  __gain?: GainNode
}

export function ExportEngine({
  onProgress,
  onChunk,
  onComplete,
  onError
}: {
  onProgress: (p: number) => void
  onChunk: (chunk: Uint8Array) => void
  onComplete: () => void
  onError: (err: Error) => void
}): React.ReactElement | null {
  const { clips, mediaLibrary, tracks, exportSettings, targetDuration } = useProjectStore.getState()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({})
  const audioRefs = useRef<Record<string, AudioElementWithGain>>({})
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const animationFrameIdRef = useRef<number>(0)
  const isRunning = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Calculate resolution
  const width =
    exportSettings?.aspectRatio === '16:9'
      ? 1920
      : exportSettings?.aspectRatio === '9:16'
        ? 1080
        : exportSettings?.aspectRatio === '4:5'
          ? 1080
          : 1080
  const height =
    exportSettings?.aspectRatio === '16:9'
      ? 1080
      : exportSettings?.aspectRatio === '9:16'
        ? 1920
        : exportSettings?.aspectRatio === '4:5'
          ? 1350
          : 1080

  const getMediaUrl = (path: string): string => {
    if (!path) return ''
    if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('file://'))
      return path
    return `file:///${path.replace(/\\/g, '/')}`
  }

  const calculatedDuration = Math.max(...clips.map((c) => c.startTime + c.duration), 1)
  const maxDuration = targetDuration !== null ? targetDuration : calculatedDuration

  useEffect(() => {
    let aborted = false

    const initExport = async (): Promise<void> => {
      if (isRunning.current) return
      isRunning.current = true

      try {
        const container = document.createElement('div')
        container.style.position = 'fixed'
        container.style.top = '10px' // Place it in the viewport
        container.style.left = '10px'
        container.style.width = '100px' // Make it large enough
        container.style.height = '100px'
        container.style.opacity = '0.05' // Ensure Chrome considers it visible
        container.style.pointerEvents = 'none'
        container.style.zIndex = '9998' // Just behind the modal's 9999 z-index
        document.body.appendChild(container)
        containerRef.current = container

        const canvas = canvasRef.current
        if (!canvas) throw new Error('Canvas missing')

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context missing')

        // 1. Setup AudioContext and Destination
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()

        // Immediately suspend the audio context so its internal clock doesn't tick while we load media!
        // This prevents the massive timestamp desync that causes ffmpeg to pad the beginning with frozen frames.
        if (audioCtx.state === 'running') {
          audioCtx.suspend()
        }

        const destNode = audioCtx.createMediaStreamDestination()

        // Draw a dummy frame to initialize the canvas stream properly
        // This prevents the "frozen first few seconds" Chrome bug with MediaRecorder
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, width, height)
        const canvasStream = canvas.captureStream(30) // 30 FPS

        // Setup audio graph
        const visualClips = [
          ...clips.filter(
            (c) => !c.effect && tracks.find((t) => t.id === c.trackId)?.type === 'video'
          )
        ].sort((a, b) => {
          return (
            tracks.findIndex((t) => t.id === b.trackId) -
            tracks.findIndex((t) => t.id === a.trackId)
          )
        })
        const audioClips = clips.filter(
          (c) => tracks.find((t) => t.id === c.trackId)?.type === 'audio'
        )

        // Preload videos
        const promises = visualClips.map((clip) => {
          return new Promise<void>((resolve) => {
            let resolved = false
            const safeResolve = (): void => {
              if (!resolved) {
                resolved = true
                resolve()
              }
            }
            // Failsafe timeout to prevent infinite hang if media fails to load without error
            setTimeout(safeResolve, 5000)

            const media = mediaLibrary.find((m) => m.id === clip.mediaId)
            if (!media || media.type === 'audio') return safeResolve()
            const el = document.createElement(media.type === 'image' ? 'img' : 'video') as any
            el.src = getMediaUrl(media.path)
            el.crossOrigin = 'anonymous'
            container.appendChild(el)

            if (media.type === 'video') {
              el.style.width = '100%'
              el.style.height = '100%'
              el.style.objectFit = 'cover'
              el.muted = true
              el.playsInline = true
              el.loop = true // Ensure seamless native looping for overlays

              const handleSeek = (): void => {
                el.onseeked = null
                safeResolve()
              }
              el.onloadeddata = () => {
                if (clip.sourceOffset > 0) {
                  el.onseeked = handleSeek
                  el.currentTime = clip.sourceOffset
                } else {
                  safeResolve()
                }
              }
              el.onerror = safeResolve
            } else {
              el.onload = safeResolve
              el.onerror = safeResolve
            }
            videoRefs.current[clip.id] = el
          })
        })

        // Preload audios
        const audioPromises = audioClips.map((clip) => {
          return new Promise<void>((resolve) => {
            let resolved = false
            const safeResolve = (): void => {
              if (!resolved) {
                resolved = true
                resolve()
              }
            }
            setTimeout(safeResolve, 5000)

            const media = mediaLibrary.find((m) => m.id === clip.mediaId)
            if (!media) return safeResolve()

            const srcUrl = getMediaUrl(media.path)
            const el = new Audio(srcUrl) as AudioElementWithGain & {
              __source?: MediaElementAudioSourceNode
            }
            el.crossOrigin = 'anonymous'

            // Create Web Audio graph immediately to avoid race conditions with onloadeddata
            const source = audioCtx.createMediaElementSource(el)
            const gain = audioCtx.createGain()
            const config = clip.audioConfig || {
              volume: 1,
              bass: 0,
              mid: 0,
              treble: 0,
              pan: 0,
              compression: false,
              reverb: false
            }

            gain.gain.value = config.volume
            source.connect(gain)
            gain.connect(destNode)

            el.__gain = gain
            el.__source = source // Prevent V8 garbage collection bug!
            audioRefs.current[clip.id] = el

            el.oncanplay = safeResolve
            el.onerror = safeResolve
          })
        })

        await Promise.all([...promises, ...audioPromises])

        if (aborted) return

        // Pre-play videos that start at 0 to prevent the massive drift/seek loop at the beginning
        const prePlayPromises: Promise<void>[] = []
        const safePlay = async (el: HTMLMediaElement): Promise<void> => {
          try {
            await Promise.race([
              el.play(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ])
          } catch {
            // Ignore play errors or timeouts
          }
        }

        for (const clip of visualClips) {
          if (clip.startTime === 0) {
            const el = videoRefs.current[clip.id] as any
            if (el && el.tagName === 'VIDEO') {
              prePlayPromises.push(safePlay(el))
            }
          }
        }
        await Promise.all(prePlayPromises)

        // Resume the audio context precisely when the export is about to start
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume()
        }

        // 2. Setup MediaRecorder
        const masterStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...destNode.stream.getAudioTracks()
        ])

        const supportedTypes = [
          'video/webm; codecs=h264',
          'video/webm; codecs=avc1',
          'video/mp4; codecs=avc1',
          'video/webm; codecs=vp8' // Software fallback
        ]

        let selectedMimeType = 'video/webm; codecs=vp8'
        for (const mt of supportedTypes) {
          if (MediaRecorder.isTypeSupported(mt)) {
            selectedMimeType = mt
            break
          }
        }

        const recorder = new MediaRecorder(masterStream, {
          mimeType: selectedMimeType,
          videoBitsPerSecond: 10000000 // 10 Mbps
        })
        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0) {
            const buffer = await e.data.arrayBuffer()
            onChunk(new Uint8Array(buffer))
          }
        }
        recorder.onstop = () => {
          onComplete()
        }

        mediaRecorderRef.current = recorder

        const startTime = performance.now()
        const hasStarted = true
        let isStopping = false

        // Start with a 1000ms timeslice to avoid flooding the IPC channel and locking up the main thread
        recorder.start(1000)

        // 3. Render Loop
        let lastProgress = -1
        Object.entries(audioRefs.current).forEach(([clipId, el]) => {
          const clip = audioClips.find((c) => c.id === clipId)
          if (!clip || clip.startTime > 0) {
            el.pause()
          }
        })

        const drawFrameAt = (time: number): void => {
          ctx.clearRect(0, 0, width, height)
          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, width, height)

          // Draw visual clips
          for (const clip of visualClips) {
            const el = videoRefs.current[clip.id] as any
            if (!el) continue

            let localTime = time - clip.startTime + clip.sourceOffset
            if (el.tagName === 'VIDEO' && el.duration > 0) {
              localTime = localTime % el.duration
            }
            const isActive = time >= clip.startTime && time < clip.startTime + clip.duration

            if (isActive) {
              // Sync video element time
              if (hasStarted && el.tagName === 'VIDEO') {
                const lag = localTime - el.currentTime
                // Maintain massive drift threshold for extreme desyncs
                const massiveDrift = el.duration === Infinity ? false : Math.abs(lag) > 0.3
                if (massiveDrift && !el.seeking) {
                  el.currentTime = el.duration === Infinity ? 0 : localTime
                } else if (!massiveDrift && !el.seeking) {
                  // Gentle proportional sync for minor drifts to avoid oscillation
                  const baseRate = clip.audioConfig?.playbackRate || 1.0
                  const targetRate = baseRate + lag * 1.5
                  // Tight clamping prevents the decoder from crashing/stuttering
                  el.playbackRate = Math.max(0.8, Math.min(1.5, targetRate))
                }
                if (el.paused && !el.seeking) el.play().catch(() => {})
              }

              ctx.save()

              // Opacity
              let opacity = 1
              const clipTime = time - clip.startTime
              if (clip.fadeIn && clipTime < clip.fadeIn) {
                opacity = clipTime / clip.fadeIn
              }
              if (clip.fadeOut && clipTime > clip.duration - clip.fadeOut) {
                opacity = (clip.duration - clipTime) / clip.fadeOut
              }
              ctx.globalAlpha = opacity

              // Blending
              const media = mediaLibrary.find((m) => m.id === clip.mediaId)
              const targetName = (clip.name || media?.name || '').toLowerCase()
              if (targetName.includes('overlay')) {
                ctx.globalCompositeOperation = 'screen'
              } else {
                ctx.globalCompositeOperation = 'source-over'
              }

              // Transform
              const effect = clip.kenBurnsEffect
              if (effect && effect.keyframes && effect.keyframes.length > 0) {
                const clipTime = time - clip.startTime
                const { x, y, zoom: scale, rotation } = calculateKenBurnsTransform(effect, clipTime)

                // Canvas transform: origin is center
                ctx.translate(width / 2, height / 2)
                ctx.scale(scale, scale)
                ctx.translate((x / 100) * width, (y / 100) * height)
                if (rotation) ctx.rotate((rotation * Math.PI) / 180)

                // Draw image centered
                const drawW = el.videoWidth || el.naturalWidth || width
                const drawH = el.videoHeight || el.naturalHeight || height

                const scaleW = width / drawW
                const scaleH = height / drawH
                const containScale = Math.min(scaleW, scaleH)
                const finalW = drawW * containScale
                const finalH = drawH * containScale

                ctx.drawImage(el, -finalW / 2, -finalH / 2, finalW, finalH)
              } else {
                // No effect, just object-fit cover
                const drawW = el.videoWidth || el.naturalWidth || width
                const drawH = el.videoHeight || el.naturalHeight || height

                const scaleW = width / drawW
                const scaleH = height / drawH
                const containScale = Math.min(scaleW, scaleH)
                const finalW = drawW * containScale
                const finalH = drawH * containScale

                ctx.translate(width / 2, height / 2)
                ctx.drawImage(el, -finalW / 2, -finalH / 2, finalW, finalH)
              }

              ctx.restore()
            } else {
              if (el.tagName === 'VIDEO' && !el.paused) el.pause()
            }
          }

          // Handle audio clips
          for (const clip of audioClips) {
            const el = audioRefs.current[clip.id]
            if (!el) continue

            let localTime = time - clip.startTime + clip.sourceOffset
            if (el.duration > 0) {
              localTime = localTime % el.duration
            }
            const isActive = time >= clip.startTime && time < clip.startTime + clip.duration

            if (isActive) {
              if (hasStarted) {
                const lag = localTime - el.currentTime
                const massiveDrift = Math.abs(lag) > 0.5
                if (massiveDrift && !el.seeking) {
                  el.currentTime = localTime
                } else if (!massiveDrift && !el.seeking) {
                  // Do NOT dynamically adjust playbackRate for audio to avoid ticking artifacts!
                  const baseRate = clip.audioConfig?.playbackRate || 1.0
                  if (el.playbackRate !== baseRate) el.playbackRate = baseRate
                }
                if (el.paused && !el.seeking) el.play().catch(() => {})
              }

              let currentVolume = clip.audioConfig?.volume ?? 1
              const clipTime = time - clip.startTime
              if (clip.fadeIn && clipTime < clip.fadeIn) {
                currentVolume *= clipTime / clip.fadeIn
              }
              if (clip.fadeOut && clipTime > clip.duration - clip.fadeOut) {
                currentVolume *= (clip.duration - clipTime) / clip.fadeOut
              }

              if (el.__gain) {
                el.__gain.gain.value = currentVolume
              }
            } else {
              if (!el.paused) el.pause()
              if (el.__gain) el.__gain.gain.value = 0
            }
          }
        }

        const renderFrame = (): void => {
          if (aborted || isStopping) return
          const now = performance.now()
          const t = hasStarted ? (now - startTime) / 1000 : 0

          if (hasStarted && t >= maxDuration) {
            isStopping = true
            drawFrameAt(maxDuration) // Force draw the absolute final frame perfectly

            // Wait 100ms to ensure the canvas stream captures this final frame before killing the recorder
            setTimeout(() => {
              recorder.stop()
              Object.values(videoRefs.current).forEach((el) => el.pause && el.pause())
              Object.values(audioRefs.current).forEach((el) => el.pause())
              audioCtx.close()
            }, 100)
            return
          }

          drawFrameAt(t)
          const newProgress = Math.floor((t / maxDuration) * 100)
          if (newProgress !== lastProgress) {
            lastProgress = newProgress
            onProgress(newProgress)
          }
          animationFrameIdRef.current = requestAnimationFrame(renderFrame)
        }

        renderFrame()
      } catch (err: any) {
        onError(err)
      }
    }

    initExport()

    const capturedVideoRefs = videoRefs.current
    const capturedAudioRefs = audioRefs.current
    return () => {
      aborted = true
      isRunning.current = false
      cancelAnimationFrame(animationFrameIdRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      Object.values(capturedVideoRefs).forEach((el) => {
        el.pause && el.pause()
        el.src = ''
        el.removeAttribute('src')
      })
      Object.values(capturedAudioRefs).forEach((el) => {
        el.pause && el.pause()
        el.src = ''
        el.removeAttribute('src')
      })
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} width={width} height={height} className="export-canvas" />
}
