/**
 * Extracts a lightweight thumbnail from a media file using HTML5 Canvas.
 * Returns a base64 encoded JPEG Data URI.
 */

const MAX_DIMENSION = 250
const JPEG_QUALITY = 0.8

export function generateThumbnail(fileUrl: string, type: 'video' | 'image'): Promise<string> {
  if (type === 'video') {
    return generateVideoThumbnail(fileUrl)
  } else {
    return generateImageThumbnail(fileUrl)
  }
}

function calculateDimensions(
  originalWidth: number,
  originalHeight: number
): { width: number; height: number } {
  let width = originalWidth
  let height = originalHeight

  if (width > height) {
    if (width > MAX_DIMENSION) {
      height *= MAX_DIMENSION / width
      width = MAX_DIMENSION
    }
  } else {
    if (height > MAX_DIMENSION) {
      width *= MAX_DIMENSION / height
      height = MAX_DIMENSION
    }
  }

  return { width, height }
}

function generateImageThumbnail(fileUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const { width, height } = calculateDimensions(img.width, img.height)

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Failed to get 2d context'))

      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    }

    img.onerror = () => reject(new Error('Failed to load image for thumbnail generation'))
    img.src = fileUrl
  })
}

function generateVideoThumbnail(fileUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.src = fileUrl

    video.onloadeddata = () => {
      // Seek to 1 second, or halfway if the video is shorter
      video.currentTime = Math.min(1.0, video.duration / 2)
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      const { width, height } = calculateDimensions(video.videoWidth, video.videoHeight)

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Failed to get 2d context'))

      ctx.drawImage(video, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    }

    video.onerror = () => reject(new Error('Failed to load video for thumbnail generation'))
  })
}
