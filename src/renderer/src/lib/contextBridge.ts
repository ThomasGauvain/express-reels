import { usePlaybackStore } from '../store/playbackStore'
import { useProjectStore } from '../store/projectStore'

export async function fileToBase64(filePath: string): Promise<{ mimeType: string; data: string }> {
  try {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    let mimeType = 'application/octet-stream'
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
    } else if (['mp4', 'mov', 'webm'].includes(ext)) {
      mimeType = `video/${ext === 'mov' ? 'quicktime' : ext}`
    } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
      mimeType = `audio/${ext}`
    }

    if (
      filePath.startsWith('http://') ||
      filePath.startsWith('https://') ||
      filePath.startsWith('blob:')
    ) {
      const response = await fetch(filePath)
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
    }

    const base64Data = await window.electron.ipcRenderer.invoke('system:read-file-base64', filePath)
    if (!base64Data) {
      throw new Error('File not found or cannot be read')
    }

    return { mimeType, data: base64Data }
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
  const playbackState = usePlaybackStore.getState()

  let summary = `Current Playhead Position: ${playbackState.playhead.toFixed(2)}s\n`
  summary += `Total Clips on Timeline: ${state.clips.length}\n\n`

  const requiredAttributions = new Set<string>()

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
      if (media && media.attribution) {
        requiredAttributions.add(media.attribution)
      }
    })
  } else {
    summary += 'The timeline is currently empty.\n'
  }

  if (requiredAttributions.size > 0) {
    summary += `\nRequired Attributions:\n`
    requiredAttributions.forEach((attr) => {
      summary += `- ${attr}\n`
    })
  }

  if (state.creatorProfile && state.creatorProfile.name) {
    summary += `\nCreator Information (Include in Caption):\n`
    summary += `- Name: ${state.creatorProfile.name}\n`
    const { handles } = state.creatorProfile
    const activeHandles = Object.entries(handles).filter((entry) => entry[1].trim() !== '')
    if (activeHandles.length > 0) {
      summary += `- Handles:\n`
      activeHandles.forEach(([platform, handle]) => {
        summary += `  - ${platform}: ${handle}\n`
      })
    }
  }

  if (state.mediaLibrary.length > 0) {
    summary += `\nMedia Library (Available Files):\n`
    state.mediaLibrary.forEach((media) => {
      summary += `- [${media.type.toUpperCase()}] "${media.name}"\n`
    })
  } else {
    summary += `\nMedia Library is currently empty.\n`
  }

  return summary
}

/**
 * Returns a list of base64 objects for all media currently visible at the playhead
 */
export async function getVisibleMediaAtPlayhead(): Promise<{ mimeType: string; data: string }[]> {
  const state = useProjectStore.getState()
  const playbackState = usePlaybackStore.getState()
  const time = playbackState.playhead

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
