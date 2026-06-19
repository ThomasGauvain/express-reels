import React, { useEffect, useRef } from 'react'
import './StillsHistogram.css'

interface StillsHistogramProps {
  imagePath: string
  edits: Record<string, number>
}

export function StillsHistogram({ imagePath, edits }: StillsHistogramProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.src = imagePath
    img.onload = () => {
      // Draw image to a tiny offscreen canvas to get pixel data fast
      const offscreen = document.createElement('canvas')
      // Scale down significantly for performance of histogram calculation
      const scale = 100 / Math.max(img.width, img.height)
      const w = Math.floor(img.width * scale)
      const h = Math.floor(img.height * scale)
      offscreen.width = w
      offscreen.height = h
      const offCtx = offscreen.getContext('2d')
      if (!offCtx) return

      // Apply same filter as main canvas
      const exposure = edits.exposure || 0
      const contrast = edits.contrast || 0
      const saturation = edits.saturation || 0

      const brightnessVal = 100 + exposure * 20
      const contrastVal = 100 + contrast
      const saturateVal = 100 + saturation

      offCtx.filter = `brightness(${brightnessVal}%) contrast(${contrastVal}%) saturate(${saturateVal}%)`
      offCtx.drawImage(img, 0, 0, w, h)

      const imageData = offCtx.getImageData(0, 0, w, h)
      const data = imageData.data

      // Compute buckets
      const rBuckets = new Array(256).fill(0)
      const gBuckets = new Array(256).fill(0)
      const bBuckets = new Array(256).fill(0)

      let maxCount = 0

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        rBuckets[r]++
        gBuckets[g]++
        bBuckets[b]++

        maxCount = Math.max(maxCount, rBuckets[r], gBuckets[g], bBuckets[b])
      }

      // Render histogram
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, width, height)

      ctx.globalCompositeOperation = 'screen'

      const drawGraph = (buckets: number[], color: string): void => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(0, height)
        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * width
          const y = height - (buckets[i] / maxCount) * height * 0.9 // scale to 90% height
          ctx.lineTo(x, y)
        }
        ctx.lineTo(width, height)
        ctx.closePath()
        ctx.fill()
      }

      drawGraph(rBuckets, 'rgba(255, 0, 0, 0.6)')
      drawGraph(gBuckets, 'rgba(0, 255, 0, 0.6)')
      drawGraph(bBuckets, 'rgba(0, 0, 255, 0.6)')

      ctx.globalCompositeOperation = 'source-over'
    }
  }, [imagePath, edits])

  return (
    <div className="stills-histogram-container">
      <canvas ref={canvasRef} width={256} height={100} className="stills-histogram-canvas" />
    </div>
  )
}
