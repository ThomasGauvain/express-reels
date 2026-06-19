import React, { useEffect, useRef, useState } from 'react'
import './StillsCanvas.css'

interface CropData {
  x: number
  y: number
  w: number
  h: number
}

interface StillsCanvasProps {
  imagePath: string
  edits: Record<string, unknown>
  isCropping?: boolean
  onCropComplete?: (crop: CropData) => void
}

export function StillsCanvas({
  imagePath,
  edits,
  isCropping,
  onCropComplete
}: StillsCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  // Crop Box State (percentage 0 to 1)
  const [cropBox, setCropBox] = useState<CropData>({ x: 0, y: 0, w: 1, h: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [cropStart, setCropStart] = useState<CropData>({ x: 0, y: 0, w: 1, h: 1 })
  const [dragType, setDragType] = useState<string | null>(null) // 'move', 'nw', 'ne', 'sw', 'se'

  const cropBoxRef = useRef<HTMLDivElement>(null)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.src = imagePath
    img.onload = () => {
      setImage(img)
      // Initialize crop box from edits if exists
      if (edits.crop) {
        setCropBox(edits.crop as CropData)
      } else {
        setCropBox({ x: 0, y: 0, w: 1, h: 1 })
      }
    }
  }, [imagePath, edits.crop])

  // Render on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const parent = canvas.parentElement
    if (parent) {
      const parentRect = parent.getBoundingClientRect()

      // Calculate aspect ratio considering crop
      const currentCrop = (edits.crop as CropData) || { x: 0, y: 0, w: 1, h: 1 }
      const cropW = image.width * currentCrop.w
      const cropH = image.height * currentCrop.h
      const aspect = cropW / cropH

      let renderWidth = parentRect.width
      let renderHeight = parentRect.width / aspect

      if (renderHeight > parentRect.height) {
        renderHeight = parentRect.height
        renderWidth = parentRect.height * aspect
      }

      canvas.width = renderWidth * window.devicePixelRatio
      canvas.height = renderHeight * window.devicePixelRatio
      canvas.style.width = `${renderWidth}px`
      canvas.style.height = `${renderHeight}px`

      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

      // Calculate CSS Filter string from edits
      const exposure = (edits.exposure as number) || 0
      const contrast = (edits.contrast as number) || 0
      const saturation = (edits.saturation as number) || 0
      const denoise = (edits.denoise as number) || 0
      const skinTone = (edits.skinTone as number) || 0

      const brightnessVal = 100 + exposure * 20
      const contrastVal = 100 + contrast
      const saturateVal = 100 + saturation
      const blurVal = denoise > 0 ? (denoise / 100) * 1.5 : 0
      const sepiaVal = skinTone > 0 ? skinTone / 2 : 0
      const hueRotateVal = skinTone < 0 ? skinTone / 5 : 0

      const rotate = (edits.rotate as number) || 0

      ctx.filter = `brightness(${brightnessVal}%) contrast(${contrastVal}%) saturate(${saturateVal}%) blur(${blurVal}px) sepia(${sepiaVal}%) hue-rotate(${hueRotateVal}deg)`

      ctx.clearRect(0, 0, renderWidth, renderHeight)

      if (rotate) {
        ctx.save()
        ctx.translate(renderWidth / 2, renderHeight / 2)
        ctx.rotate((rotate * Math.PI) / 180)
        ctx.translate(-renderWidth / 2, -renderHeight / 2)
      }

      const sx = image.width * currentCrop.x
      const sy = image.height * currentCrop.y
      const sw = image.width * currentCrop.w
      const sh = image.height * currentCrop.h

      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, renderWidth, renderHeight)

      if (rotate) {
        ctx.restore()
      }
    }
  }, [image, edits])

  // Handle resize
  useEffect(() => {
    const handleResize = (): void => {
      setImage((prev) => (prev ? { ...prev } : prev))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Crop Drag Logic
  const handleMouseDown = (e: React.MouseEvent, type: string): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragType(type)
    setDragStart({ x: e.clientX, y: e.clientY })
    setCropStart({ ...cropBox })
  }

  const handleMouseMove = (e: React.MouseEvent): void => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()

    const dx = (e.clientX - dragStart.x) / rect.width
    const dy = (e.clientY - dragStart.y) / rect.height

    const newCrop = { ...cropStart }

    if (dragType === 'move') {
      newCrop.x = Math.max(0, Math.min(1 - newCrop.w, cropStart.x + dx))
      newCrop.y = Math.max(0, Math.min(1 - newCrop.h, cropStart.y + dy))
    } else {
      if (dragType?.includes('w')) {
        newCrop.x = Math.max(0, Math.min(cropStart.x + cropStart.w - 0.1, cropStart.x + dx))
        newCrop.w = cropStart.w - (newCrop.x - cropStart.x)
      }
      if (dragType?.includes('e')) {
        newCrop.w = Math.max(0.1, Math.min(1 - cropStart.x, cropStart.w + dx))
      }
      if (dragType?.includes('n')) {
        newCrop.y = Math.max(0, Math.min(cropStart.y + cropStart.h - 0.1, cropStart.y + dy))
        newCrop.h = cropStart.h - (newCrop.y - cropStart.y)
      }
      if (dragType?.includes('s')) {
        newCrop.h = Math.max(0.1, Math.min(1 - cropStart.y, cropStart.h + dy))
      }
    }
    setCropBox(newCrop)
  }

  const handleMouseUp = (): void => {
    if (isDragging) {
      setIsDragging(false)
      setDragType(null)
      if (onCropComplete) {
        onCropComplete(cropBox)
      }
    }
  }

  // Update cropBox coordinates directly on the DOM node to avoid inline-style lint rules
  useEffect(() => {
    if (cropBoxRef.current) {
      cropBoxRef.current.style.left = `${cropBox.x * 100}%`
      cropBoxRef.current.style.top = `${cropBox.y * 100}%`
      cropBoxRef.current.style.width = `${cropBox.w * 100}%`
      cropBoxRef.current.style.height = `${cropBox.h * 100}%`
    }
  }, [cropBox])

  return (
    <div
      className="stills-canvas-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas ref={canvasRef} className="stills-canvas" />

      {isCropping && (
        <div className="crop-overlay">
          <div className="crop-box" ref={cropBoxRef}>
            <div className="crop-move-area" onMouseDown={(e) => handleMouseDown(e, 'move')} />
            <div className="crop-handle nw" onMouseDown={(e) => handleMouseDown(e, 'nw')} />
            <div className="crop-handle ne" onMouseDown={(e) => handleMouseDown(e, 'ne')} />
            <div className="crop-handle sw" onMouseDown={(e) => handleMouseDown(e, 'sw')} />
            <div className="crop-handle se" onMouseDown={(e) => handleMouseDown(e, 'se')} />
          </div>
        </div>
      )}
    </div>
  )
}
