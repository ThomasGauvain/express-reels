/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'
import { calculateKenBurnsTransform } from '../lib/kenBurns'

function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16

  const result = new Uint8Array(44 + buffer.length * numChannels * 2)
  const view = new DataView(result.buffer)

  const writeString = (offset: number, string: string): void => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + buffer.length * numChannels * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, bitDepth, true)
  writeString(36, 'data')
  view.setUint32(40, buffer.length * numChannels * 2, true)

  const offset = 44
  const channelData: Float32Array[] = []
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i))
  }

  let writeIndex = offset
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = channelData[channel][i]
      sample = Math.max(-1, Math.min(1, sample))
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(writeIndex, sample, true)
      writeIndex += 2
    }
  }

  return result
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
  const videoRefs = useRef<Record<string, HTMLVideoElement | HTMLImageElement>>({})
  const isRunning = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

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
    return path.startsWith('blob:') || path.startsWith('http:')
      ? path
      : `file:///${path.replace(/\\/g, '/')}`
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
        container.style.top = '10px'
        container.style.left = '10px'
        container.style.width = '100px'
        container.style.height = '100px'
        container.style.opacity = '0.01' // Invisible to user, but kept in VRAM
        container.style.pointerEvents = 'none'
        container.style.zIndex = '9998'
        document.body.appendChild(container)
        containerRef.current = container

        const canvas = canvasRef.current
        if (!canvas) throw new Error('Canvas missing')

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context missing')

        const visualClips = [
          ...clips.filter(
            (c) =>
              !c.effect &&
              ['video', 'text'].includes(tracks.find((t) => t.id === c.trackId)?.type || '')
          )
        ].sort((a, b) => {
          return (
            tracks.findIndex((t) => t.id === b.trackId) -
            tracks.findIndex((t) => t.id === a.trackId)
          )
        })

        const audioClips = clips.filter((c) => {
          const type = tracks.find((t) => t.id === c.trackId)?.type
          return type === 'audio' || type === 'video'
        })

        // 1. Preload Videos & Images
        onProgress(2)
        const loadPromises = visualClips.map((clip) => {
          return new Promise<void>((resolve) => {
            const media = mediaLibrary.find((m) => m.id === clip.mediaId)
            if (!media || media.type === 'audio') return resolve()
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
              el.onloadeddata = () => resolve()
              el.onerror = () => resolve()
            } else {
              el.onload = () => resolve()
              el.onerror = () => resolve()
            }
            videoRefs.current[clip.id] = el
          })
        })
        await Promise.all(loadPromises)
        if (aborted) return

        // 2. Setup VideoEncoder (Offline Video Rendering)
        onProgress(5)
        const fps = exportSettings?.fps || 30
        const totalFrames = Math.ceil(maxDuration * fps)

        // Force H.264 Annex B format for flawlessly concatenable raw chunks
        const codecStr = 'avc1.4d002a'
        const videoConfig: VideoEncoderConfig = {
          codec: codecStr,
          width,
          height,
          framerate: fps,
          bitrate: exportSettings?.quality === 'high' ? 15_000_000 : 8_000_000,
          hardwareAcceleration: exportSettings?.hwAccel ? 'prefer-hardware' : 'prefer-software',
          avc: { format: 'annexb' } // CRITICAL: Raw H.264 stream without MP4 boxes
        }

        let encoderError: Error | null = null
        const videoEncoder = new VideoEncoder({
          output: (chunk) => {
            if (aborted) return
            const buffer = new ArrayBuffer(chunk.byteLength)
            chunk.copyTo(buffer)
            onChunk(new Uint8Array(buffer))
          },
          error: (e) => {
            encoderError = e
          }
        })

        const isSupported = await VideoEncoder.isConfigSupported(videoConfig)
        if (!isSupported.supported) {
          throw new Error('VideoEncoder configuration is not supported on this hardware.')
        }

        videoEncoder.configure(videoConfig)

        // 3. Render Offline Video Loop
        for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
          if (aborted) break
          if (encoderError) throw encoderError

          const t = frameIndex / fps

          ctx.clearRect(0, 0, width, height)
          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, width, height)

          const activeClips = visualClips.filter(
            (clip) => t >= clip.startTime && t < clip.startTime + (clip.duration || 5)
          )

          // Wait for all video elements to seek perfectly to the exact target frame
          await Promise.all(
            activeClips.map((clip) => {
              const el = videoRefs.current[clip.id] as any
              if (!el || el.tagName !== 'VIDEO') return Promise.resolve()

              let localTime = t - clip.startTime + (clip.sourceOffset || 0)
              if (el.duration > 0) {
                localTime = localTime % el.duration
              }

              // Only seek if we are drifted to avoid unnecessary stalls, but ensure absolute perfection
              if (Math.abs(el.currentTime - localTime) > 0.05) {
                return new Promise<void>((resolve) => {
                  // Failsafe timeout
                  const timeoutId = setTimeout(() => {
                    el.onseeked = null
                    resolve()
                  }, 1000)

                  el.onseeked = () => {
                    clearTimeout(timeoutId)
                    el.onseeked = null
                    resolve()
                  }
                  el.currentTime = localTime
                })
              }
              return Promise.resolve()
            })
          )

          if (aborted) break

          // Draw active clips perfectly
          for (const clip of activeClips) {
            const el = videoRefs.current[clip.id] as any
            const isTextClip = tracks.find((track) => track.id === clip.trackId)?.type === 'text'
            if (!el && !isTextClip) continue

            ctx.save()

            // Opacity & Transitions
            let opacity = 1
            const clipTime = t - clip.startTime
            if (clip.fadeIn && clipTime < clip.fadeIn) {
              opacity = clipTime / clip.fadeIn
            }
            if (clip.fadeOut && clipTime > (clip.duration || 5) - clip.fadeOut) {
              opacity = ((clip.duration || 5) - clipTime) / clip.fadeOut
            }
            ctx.globalAlpha = opacity

            // Draw Text Clip
            const track = tracks.find((t) => t.id === clip.trackId)
            if (track?.type === 'text' && clip.textProperties) {
              const textProps = clip.textProperties

              // Apply Ken Burns Transform
              const effect = clip.kenBurnsEffect
              if (effect && effect.keyframes && effect.keyframes.length > 0) {
                const { x, y, zoom: scale, rotation } = calculateKenBurnsTransform(effect, clipTime)
                ctx.translate(width / 2, height / 2)
                ctx.scale(scale, scale)
                ctx.translate((x / 100) * width, (y / 100) * height)
                if (rotation) ctx.rotate((rotation * Math.PI) / 180)
                ctx.translate(-width / 2, -height / 2)
              }

              // The Live Preview DOM runs at native logical resolution (1080x1920)
              // so the fontSize is already exactly 1:1 with the export canvas.
              const scaledFontSize = textProps.fontSize

              ctx.font = `${textProps.fontWeight} ${scaledFontSize}px "${textProps.fontFamily}"`
              ctx.fillStyle = textProps.color
              const align = textProps.textAlign || 'center'
              ctx.textAlign = align
              ctx.textBaseline = 'middle'
              if (textProps.dropShadow?.enabled) {
                ctx.shadowColor = 'rgba(0,0,0,0.8)'
                // Shadows should still scale visually if the text is huge, but we'll leave them literal too
                ctx.shadowOffsetX = textProps.dropShadow.offsetX
                ctx.shadowOffsetY = textProps.dropShadow.offsetY
                ctx.shadowBlur = textProps.dropShadow.blur
              } else {
                ctx.shadowColor = 'transparent'
              }

              const lines = textProps.content.split('\n')
              let maxLineWidth = 0
              lines.forEach((line) => {
                const m = ctx.measureText(line)
                if (m.width > maxLineWidth) maxLineWidth = m.width
              })

              const lineHeight = scaledFontSize * 1.2
              const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2

              let startX = width / 2
              if (align === 'left') startX = width / 2 - maxLineWidth / 2
              if (align === 'right') startX = width / 2 + maxLineWidth / 2

              lines.forEach((line, index) => {
                ctx.fillText(line, startX, startY + index * lineHeight)
              })

              ctx.restore()
              continue
            }

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
              const { x, y, zoom: scale, rotation } = calculateKenBurnsTransform(effect, clipTime)

              ctx.translate(width / 2, height / 2)
              ctx.scale(scale, scale)
              ctx.translate((x / 100) * width, (y / 100) * height)
              if (rotation) ctx.rotate((rotation * Math.PI) / 180)

              const drawW = el.videoWidth || el.naturalWidth || width
              const drawH = el.videoHeight || el.naturalHeight || height

              const scaleW = width / drawW
              const scaleH = height / drawH
              const containScale = Math.min(scaleW, scaleH)
              const finalW = drawW * containScale
              const finalH = drawH * containScale

              ctx.drawImage(el, -finalW / 2, -finalH / 2, finalW, finalH)
            } else {
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
          }

          // Force microsecond-perfect timestamp
          const frame = new VideoFrame(canvas, { timestamp: frameIndex * (1_000_000 / fps) })
          videoEncoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 })
          frame.close()

          // Yield to prevent running out of RAM if the encoder queue builds up
          while (videoEncoder.encodeQueueSize > 20) {
            await new Promise((r) => setTimeout(r, 10))
          }

          // Progress represents video encoding up to 90%
          if (frameIndex % 5 === 0) {
            onProgress(5 + Math.floor((frameIndex / totalFrames) * 85))
          }
        }

        if (aborted) return

        onProgress(90)
        await videoEncoder.flush()
        videoEncoder.close()

        // 4. Offline Audio Context Render
        onProgress(92)
        const sampleRate = 48000
        const offlineCtx = new OfflineAudioContext({
          numberOfChannels: 2,
          length: Math.ceil(maxDuration * sampleRate),
          sampleRate
        })

        // Decode audio buffers asynchronously
        await Promise.all(
          audioClips.map(async (clip) => {
            const media = mediaLibrary.find((m) => m.id === clip.mediaId)
            if (!media || (media.type !== 'audio' && media.type !== 'video')) return
            try {
              const src = getMediaUrl(media.path)
              const lowerSrc = src.toLowerCase()
              if (
                lowerSrc.endsWith('.jpg') ||
                lowerSrc.endsWith('.jpeg') ||
                lowerSrc.endsWith('.png') ||
                lowerSrc.endsWith('.gif')
              ) {
                return // Don't try to extract audio from static images
              }

              let arrayBuffer: ArrayBuffer

              if (src.startsWith('file://')) {
                const filePath = decodeURIComponent(
                  src.replace('file:///', '').replace('file://', '')
                )
                // Decode directly via ffmpeg on the backend to avoid Chromium container issues
                const pcmWavBuffer = await (window as any).electron.ipcRenderer.invoke(
                  'system:decode-audio-ffmpeg',
                  filePath
                )
                if (!pcmWavBuffer)
                  throw new Error('Failed to decode audio with ffmpeg: ' + filePath)

                // clone the buffer so we own the memory
                const freshBuffer = new ArrayBuffer(pcmWavBuffer.length)
                new Uint8Array(freshBuffer).set(pcmWavBuffer)
                arrayBuffer = freshBuffer
              } else {
                const response = await fetch(src)
                arrayBuffer = await response.arrayBuffer()
              }

              const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer)

              const source = offlineCtx.createBufferSource()
              source.buffer = audioBuffer

              const gainNode = offlineCtx.createGain()
              const config = clip.audioConfig || { volume: 1, playbackRate: 1.0 }

              // Playback Rate
              if (config.playbackRate && config.playbackRate !== 1.0) {
                source.playbackRate.value = config.playbackRate
              }

              // Volume & Transitions
              gainNode.gain.setValueAtTime(config.volume, Math.max(0, clip.startTime))
              if (clip.fadeIn) {
                gainNode.gain.setValueAtTime(0, Math.max(0, clip.startTime))
                gainNode.gain.linearRampToValueAtTime(config.volume, clip.startTime + clip.fadeIn)
              }
              if (clip.fadeOut) {
                gainNode.gain.setValueAtTime(
                  config.volume,
                  clip.startTime + clip.duration - clip.fadeOut
                )
                gainNode.gain.linearRampToValueAtTime(0, clip.startTime + clip.duration)
              }

              source.connect(gainNode)
              gainNode.connect(offlineCtx.destination)

              // Accurate start mapping
              source.start(Math.max(0, clip.startTime), clip.sourceOffset || 0, clip.duration)
            } catch (e) {
              console.error(`Audio decode error for clip ${clip.id}`, e)
            }
          })
        )

        try {
          const debugData = JSON.stringify(
            {
              tracks: tracks,
              clips: clips,
              audioClips: audioClips.map((c) => ({
                id: c.id,
                trackId: c.trackId,
                start: c.startTime,
                duration: c.duration,
                mediaId: c.mediaId
              }))
            },
            null,
            2
          )
          await (window as any).electron.ipcRenderer.invoke('debug:log', debugData)
        } catch (e) {
          console.error('Failed to log debug data', e)
        }

        onProgress(95)
        const renderedBuffer = await offlineCtx.startRendering()

        onProgress(98)
        const wavData = audioBufferToWav(renderedBuffer)

        // Send raw audio to IPC safely
        await (window as any).electron.ipcRenderer.invoke('save-audio-buffer', wavData)

        onComplete()
      } catch (err: any) {
        onError(err)
      }
    }

    initExport()

    const cleanupRefs = videoRefs.current

    return () => {
      aborted = true
      isRunning.current = false
      Object.values(cleanupRefs).forEach((el) => {
        if ('pause' in el) el.pause()
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
