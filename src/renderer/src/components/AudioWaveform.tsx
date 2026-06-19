import { useEffect, useState, useMemo, type ReactElement } from 'react'

// Global cache to prevent re-decoding the same audio file multiple times
const waveformCache = new Map<string, number[]>()
// Keep audio context outside so it's only created once
let audioCtx: AudioContext | null = null

export const AudioWaveform = ({
  src,
  pixelsPerSecond,
  height = 40,
  color = 'rgba(255, 255, 255, 0.4)',
  clipDuration,
  playbackRate = 1
}: {
  src: string
  pixelsPerSecond: number
  height?: number
  color?: string
  clipDuration?: number
  playbackRate?: number
}): ReactElement => {
  const [peaks, setPeaks] = useState<number[]>([])

  useEffect(() => {
    let isCancelled = false

    const loadWaveform = async (): Promise<void> => {
      if (!src) return

      if (waveformCache.has(src)) {
        setPeaks(waveformCache.get(src)!)
        return
      }

      if (!audioCtx) {
        const win = window as Window & { webkitAudioContext?: typeof AudioContext }
        audioCtx = new (window.AudioContext || win.webkitAudioContext!)()
      }
      const ctx = audioCtx

      try {
        let arrayBuffer: ArrayBuffer
        if (src.startsWith('file://')) {
          const filePath = decodeURIComponent(src.replace('file:///', '').replace('file://', ''))
          // @ts-ignore: electron API is injected via preload script
          const buffer = await window.electron.ipcRenderer.invoke(
            'system:read-file-buffer',
            filePath
          )
          if (!buffer) throw new Error('Failed to read waveform source: ' + filePath)
          const freshBuffer = new ArrayBuffer(buffer.length)
          new Uint8Array(freshBuffer).set(buffer)
          arrayBuffer = freshBuffer
        } else {
          const response = await fetch(src, { cache: 'no-store' })
          arrayBuffer = await response.arrayBuffer()
        }

        // AudioContext decoding
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        if (isCancelled) return

        const channelData = audioBuffer.getChannelData(0)
        const sampleRate = audioBuffer.sampleRate
        const step = Math.ceil(sampleRate / 20) // 20 peaks per second of audio for higher fidelity

        const newPeaks: number[] = []
        for (let i = 0; i < channelData.length; i += step) {
          let max = 0
          for (let j = 0; j < step && i + j < channelData.length; j++) {
            const val = Math.abs(channelData[i + j])
            if (val > max) max = val
          }
          newPeaks.push(max)
        }

        waveformCache.set(src, newPeaks)
        setPeaks(newPeaks)
      } catch (err) {
        console.warn('Failed to load waveform for', src, err)
      }
    }

    loadWaveform()

    return () => {
      isCancelled = true
    }
  }, [src])

  const svgPath = useMemo(() => {
    if (peaks.length === 0) return ''

    const points: string[] = []
    const peakWidth = pixelsPerSecond / 20 / playbackRate
    const maxPeak = Math.max(...peaks, 0.1)

    const mediaDuration = peaks.length / 20
    const targetDuration = clipDuration !== undefined ? clipDuration : mediaDuration / playbackRate
    const totalRequiredPeaks = Math.ceil(targetDuration * 20 * playbackRate)

    for (let i = 0; i < totalRequiredPeaks; i++) {
      const x = i * peakWidth
      const p = peaks[i % peaks.length] / maxPeak
      const h = Math.max(1, p * height * 0.9) // 90% height max so it doesn't touch edges
      const y = (height - h) / 2
      points.push(`M ${x},${y} L ${x},${y + h}`)
    }

    return points.join(' ')
  }, [peaks, pixelsPerSecond, height, clipDuration, playbackRate])

  if (peaks.length === 0) {
    return <div className="waveform-loading">Loading Waveform...</div>
  }

  const mediaDuration = peaks.length / 20
  const targetDuration = clipDuration !== undefined ? clipDuration : mediaDuration / playbackRate
  const svgWidth = targetDuration * pixelsPerSecond

  return (
    <svg width={svgWidth} height={height} className="waveform-svg">
      <path
        d={svgPath}
        stroke={color}
        strokeWidth={Math.max(1, (pixelsPerSecond / 20 / playbackRate) * 0.6)}
        strokeLinecap="round"
      />
    </svg>
  )
}
