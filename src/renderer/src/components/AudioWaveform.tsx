import { useEffect, useState, useMemo, type ReactElement } from 'react'

// Global cache to prevent re-decoding the same audio file multiple times
const waveformCache = new Map<string, number[]>()
// Keep audio context outside so it's only created once
let audioCtx: AudioContext | null = null

export const AudioWaveform = ({
  src,
  pixelsPerSecond,
  height = 40,
  color = 'rgba(255, 255, 255, 0.4)'
}: {
  src: string
  pixelsPerSecond: number
  height?: number
  color?: string
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
        const response = await fetch(src)
        const arrayBuffer = await response.arrayBuffer()

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
        console.error('Failed to load waveform for', src, err)
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

    // Each peak represents 1/20th of a second
    const totalPeaks = peaks.length
    const peakWidth = pixelsPerSecond / 20

    // Normalize peaks slightly to make them look better (boost quiet parts, cap loud parts)
    const maxPeak = Math.max(...peaks, 0.1)

    for (let i = 0; i < totalPeaks; i++) {
      const x = i * peakWidth
      // Normalize relative to the loudest part of this specific track, scaled to height
      const p = peaks[i] / maxPeak
      const h = Math.max(1, p * height * 0.9) // 90% height max so it doesn't touch edges
      const y = (height - h) / 2
      points.push(`M ${x},${y} L ${x},${y + h}`)
    }

    return points.join(' ')
  }, [peaks, pixelsPerSecond, height])

  if (peaks.length === 0) {
    return <div className="waveform-loading">Loading Waveform...</div>
  }

  const svgWidth = peaks.length * (pixelsPerSecond / 20)

  return (
    <svg width={svgWidth} height={height} className="waveform-svg">
      <path
        d={svgPath}
        stroke={color}
        strokeWidth={Math.max(1, (pixelsPerSecond / 20) * 0.6)}
        strokeLinecap="round"
      />
    </svg>
  )
}
