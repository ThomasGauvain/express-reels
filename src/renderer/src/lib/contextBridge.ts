import { useProjectStore } from '../store/projectStore'

export async function fileToBase64(filePath: string): Promise<{ mimeType: string; data: string }> {
  try {
    const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
    const response = await fetch(fileUrl)
    const blob = await response.blob()

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        const match = result.match(/^data:(.*);base64,(.*)$/)
        if (match) {
          resolve({ mimeType: match[1], data: match[2] })
        } else {
          reject(new Error('Failed to parse base64 data string'))
        }
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('Context Bridge File Read Error:', error)
    throw error
  }
}

/**
 * Generates a text summary of the current timeline state for the AI
 */
export function getTimelineContextSummary(): string {
  const state = useProjectStore.getState()

  let summary = `Current Playhead Position: ${state.playhead.toFixed(2)}s\n`
  summary += `Total Clips on Timeline: ${state.clips.length}\n\n`

  if (state.clips.length > 0) {
    summary += `Timeline Layout:\n`
    state.clips.forEach((clip) => {
      const media = state.mediaLibrary.find((m) => m.id === clip.mediaId)
      summary += `- Track ${clip.trackId.toUpperCase()}: "${media?.name || 'Unknown'}" (Start: ${clip.startTime.toFixed(2)}s, Duration: ${clip.duration.toFixed(2)}s)\n`
      if (clip.kenBurnsEffect) {
        summary += `  - Has Ken Burns effect with ${clip.kenBurnsEffect.keyframes.length} keyframes.\n`
      }
      if (clip.effects && clip.effects.length > 0) {
        summary += `  - Has ${clip.effects.length} visual effects.\n`
      }
    })
  } else {
    summary += 'The timeline is currently empty.\n'
  }

  return summary
}

/**
 * Returns a list of base64 objects for all media currently visible at the playhead
 */
export async function getVisibleMediaAtPlayhead(): Promise<{ mimeType: string; data: string }[]> {
  const state = useProjectStore.getState()
  const time = state.playhead

  // Find all video/image clips intersecting the playhead
  const visibleClips = state.clips.filter(
    (c) => c.trackId.startsWith('v') && time >= c.startTime && time < c.startTime + c.duration
  )

  const mediaData: { mimeType: string; data: string }[] = []

  for (const clip of visibleClips) {
    const media = state.mediaLibrary.find((m) => m.id === clip.mediaId)
    if (media && media.path) {
      try {
        const b64 = await fileToBase64(media.path)
        mediaData.push(b64)
      } catch (err) {
        console.warn(`Could not read media for clip ${clip.id}`, err)
      }
    }
  }

  return mediaData
}
