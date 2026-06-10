/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'
import { calculateKenBurnsTransform } from '../lib/kenBurns'

interface AudioElementWithGain extends HTMLAudioElement {
  __gain?: GainNode
}

export function ExportEngine({
  onProgress,
  onComplete,
  onError
}: {
  onProgress: (p: number) => void
  onComplete: (blob: Blob) => void
  onError: (err: Error) => void
}): React.ReactElement | null {
  const { clips, mediaLibrary, tracks, exportSettings } = useProjectStore.getState()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({})
  const audioRefs = useRef<Record<string, AudioElementWithGain>>({})
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const animationFrameIdRef = useRef<number>(0)
  const isRunning = useRef(false)

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

  // Find max duration
  const maxDuration = Math.max(...clips.map((c) => c.startTime + c.duration), 1)

  useEffect(() => {
    const initExport = async (): Promise<void> => {
      if (isRunning.current) return
      isRunning.current = true

      try {
        const canvas = canvasRef.current
        if (!canvas) throw new Error('Canvas missing')

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context missing')

        // 1. Setup AudioContext and Destination
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const destNode = audioCtx.createMediaStreamDestination()

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
            const media = mediaLibrary.find((m) => m.id === clip.mediaId)
            if (!media || media.type === 'audio') return resolve()
            const el = document.createElement(media.type === 'image' ? 'img' : 'video') as any
            el.src = getMediaUrl(media.path)
            el.crossOrigin = 'anonymous'
            if (media.type === 'video') {
              el.muted = true
              el.onloadeddata = () => resolve()
              el.onerror = () => resolve()
            } else {
              el.onload = () => resolve()
              el.onerror = () => resolve()
            }
            videoRefs.current[clip.id] = el
          })
        })

        // Preload audios
        const audioPromises = audioClips.map((clip) => {
          return new Promise<void>((resolve) => {
            const media = mediaLibrary.find((m) => m.id === clip.mediaId)
            if (!media) return resolve()
            const el = new Audio(getMediaUrl(media.path)) as AudioElementWithGain
            el.crossOrigin = 'anonymous'
            el.onloadeddata = () => {
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

              // Apply basic volume for export (more complex EQ can be added here)
              gain.gain.value = config.volume
              source.connect(gain)
              gain.connect(destNode)

              el.__gain = gain
              audioRefs.current[clip.id] = el
              resolve()
            }
            el.onerror = () => resolve()
          })
        })

        await Promise.all([...promises, ...audioPromises])

        // 2. Setup MediaRecorder
        const canvasStream = canvas.captureStream(30) // 30 FPS
        const masterStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...destNode.stream.getAudioTracks()
        ])

        // We always record webm; mp4 transcoding happens post-export if needed
        const recorder = new MediaRecorder(masterStream, { mimeType: 'video/webm;codecs=vp9' })
        const chunks: BlobPart[] = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' })
          onComplete(blob)
        }

        mediaRecorderRef.current = recorder
        recorder.start()

        // 3. Render Loop
        const startTime = performance.now()
        // Start all audio clips at correct offsets using timeouts, since they are HTML5 Audio elements
        // A more robust way is to just use standard DOM play() synced to performance.now()
        Object.values(audioRefs.current).forEach((el) => el.pause())

        const renderFrame = (): void => {
          const now = performance.now()
          const t = (now - startTime) / 1000

          if (t > maxDuration) {
            recorder.stop()
            Object.values(videoRefs.current).forEach((el) => el.pause && el.pause())
            Object.values(audioRefs.current).forEach((el) => el.pause())
            audioCtx.close()
            return
          }

          onProgress(Math.floor((t / maxDuration) * 100))

          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, width, height)

          // Draw visual clips
          for (const clip of visualClips) {
            const el = videoRefs.current[clip.id] as any
            if (!el) continue

            const localTime = t - clip.startTime + clip.sourceOffset
            const isActive = t >= clip.startTime && t < clip.startTime + clip.duration

            if (isActive) {
              // Sync video element time
              if (el.tagName === 'VIDEO') {
                if (Math.abs(el.currentTime - localTime) > 0.1) el.currentTime = localTime
                if (el.paused) el.play().catch(() => {})
              }

              ctx.save()

              // Opacity
              let opacity = 1
              const clipTime = t - clip.startTime
              if (clip.fadeIn && clipTime < clip.fadeIn) opacity = clipTime / clip.fadeIn
              if (clip.fadeOut && clipTime > clip.duration - clip.fadeOut)
                opacity = (clip.duration - clipTime) / clip.fadeOut
              ctx.globalAlpha = opacity

              // Transform
              const effect = clip.kenBurnsEffect
              if (effect && effect.keyframes && effect.keyframes.length > 0) {
                const kfProgress = effect.keyframes.length === 1 ? 0 : clipTime / clip.duration
                const { x, y, zoom: scale } = calculateKenBurnsTransform(effect, kfProgress)

                // Canvas transform: origin is center
                ctx.translate(width / 2, height / 2)
                ctx.scale(scale, scale)
                ctx.translate(x, y)
                // Draw image centered
                const drawW = el.videoWidth || el.naturalWidth || width
                const drawH = el.videoHeight || el.naturalHeight || height

                // We need to calculate object-fit cover logic if we want it to look exactly like the DOM
                // For MVP, just center it with aspect ratio preservation
                const scaleW = width / drawW
                const scaleH = height / drawH
                const coverScale = Math.max(scaleW, scaleH)
                const finalW = drawW * coverScale
                const finalH = drawH * coverScale

                ctx.drawImage(el, -finalW / 2, -finalH / 2, finalW, finalH)
              } else {
                // No effect, just object-fit cover
                const drawW = el.videoWidth || el.naturalWidth || width
                const drawH = el.videoHeight || el.naturalHeight || height
                const scaleW = width / drawW
                const scaleH = height / drawH
                const coverScale = Math.max(scaleW, scaleH)
                const finalW = drawW * coverScale
                const finalH = drawH * coverScale
                ctx.translate(width / 2, height / 2)
                ctx.drawImage(el, -finalW / 2, -finalH / 2, finalW, finalH)
              }

              ctx.restore()
            } else {
              if (el.tagName === 'VIDEO' && !el.paused) el.pause()
            }
          }

          // Handle Audio Fades
          for (const clip of audioClips) {
            const el = audioRefs.current[clip.id] as any
            if (!el) continue

            const localTime = t - clip.startTime + clip.sourceOffset
            const isActive = t >= clip.startTime && t < clip.startTime + clip.duration

            if (isActive) {
              if (Math.abs(el.currentTime - localTime) > 0.1) el.currentTime = localTime
              if (el.paused) el.play().catch(() => {})

              let currentVolume = clip.audioConfig?.volume ?? 1
              const clipTime = t - clip.startTime
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
            }
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
      isRunning.current = false
      cancelAnimationFrame(animationFrameIdRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      Object.values(capturedVideoRefs).forEach((el) => el.pause && el.pause())
      Object.values(capturedAudioRefs).forEach((el) => el.pause && el.pause())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} width={width} height={height} className="export-canvas" />
}
