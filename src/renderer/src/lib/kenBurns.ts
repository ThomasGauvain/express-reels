export type EasingCurve = 'linear' | 'ease-in-out' | 'ease-out' | 'ease-in'

export interface KenBurnsKeyframe {
  id: string
  time: number // Time in seconds
  x: number // X Pan (percentage or pixels, let's say percentage from center where 0,0 is center)
  y: number // Y Pan (percentage)
  zoom: number // Zoom level (1.0 = 100%)
}

export interface KenBurnsEffect {
  id: string
  mediaId: string
  easing: EasingCurve
  constrainToFrame: boolean
  keyframes: KenBurnsKeyframe[]
}

// Cubic bezier easing functions
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

function easeIn(t: number): number {
  return t * t
}

function easeOut(t: number): number {
  return t * (2 - t)
}

function linear(t: number): number {
  return t
}

export function interpolateValue(
  start: number,
  end: number,
  progress: number,
  easing: EasingCurve
): number {
  let easedProgress = progress
  switch (easing) {
    case 'ease-in-out':
      easedProgress = easeInOut(progress)
      break
    case 'ease-in':
      easedProgress = easeIn(progress)
      break
    case 'ease-out':
      easedProgress = easeOut(progress)
      break
    case 'linear':
    default:
      easedProgress = linear(progress)
      break
  }
  return start + (end - start) * easedProgress
}

/**
 * Calculates the current X, Y, and Zoom for a given time
 */
export function calculateKenBurnsTransform(
  effect: KenBurnsEffect,
  currentTime: number
): Omit<KenBurnsKeyframe, 'id' | 'time'> {
  const { keyframes, easing } = effect

  // If no keyframes, return default state
  if (!keyframes || keyframes.length === 0) {
    return { x: 0, y: 0, zoom: 1 }
  }

  // If only one keyframe, return its state
  if (keyframes.length === 1) {
    return { x: keyframes[0].x, y: keyframes[0].y, zoom: keyframes[0].zoom }
  }

  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)

  let result = { x: 0, y: 0, zoom: 1 }
  const lastKeyframe = sorted[sorted.length - 1]

  if (currentTime <= sorted[0].time) {
    result = { x: sorted[0].x, y: sorted[0].y, zoom: sorted[0].zoom }
  } else if (currentTime >= lastKeyframe.time) {
    result = { x: lastKeyframe.x, y: lastKeyframe.y, zoom: lastKeyframe.zoom }
  } else {
    for (let i = 0; i < sorted.length - 1; i++) {
      const k1 = sorted[i]
      const k2 = sorted[i + 1]

      if (currentTime >= k1.time && currentTime < k2.time) {
        const duration = k2.time - k1.time
        const progress = (currentTime - k1.time) / duration

        result = {
          x: interpolateValue(k1.x, k2.x, progress, easing),
          y: interpolateValue(k1.y, k2.y, progress, easing),
          zoom: interpolateValue(k1.zoom, k2.zoom, progress, easing)
        }
        break
      }
    }
  }

  if (effect.constrainToFrame !== false) {
    result.zoom = Math.max(1, result.zoom)
    const maxPan = ((result.zoom - 1) / (2 * result.zoom)) * 100
    result.x = Math.max(-maxPan, Math.min(maxPan, result.x))
    result.y = Math.max(-maxPan, Math.min(maxPan, result.y))
  }

  return result
}
