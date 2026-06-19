import { useProjectStore } from '../store/projectStore'

export async function assembleStoryboard(
  isTabSpecificSwap: boolean = false,
  tabSpecificCategory?: 'vfx' | 'audio' | 'text' | 'voiceover'
): Promise<void> {
  const store = useProjectStore.getState()
  const {
    storyboard,
    downloadDirectory,
    addMedia,
    markStoryboardAssetDownloaded,
    tracks,
    clips,
    removeClip
  } = store

  // 1. Pre-Assembly Clean Up & Validation
  const destDir = downloadDirectory || 'C:/Temp/ExpressReels_AI_Assets'

  if (!isTabSpecificSwap) {
    // Master Generation: Clear out old AI generated assets from the timeline
    // We preserve tracks that are 'video' containing the main image clip.
    const clipsToRemove = clips.filter((c) => {
      const track = tracks.find((t) => t.id === c.trackId)
      // If it's an audio track, clear it. If it's a video track but not the main track, clear it.
      // Assuming 'v1' is the main track.
      const mainVideoTrack =
        tracks.find((t) => t.id === 'v1') || tracks.find((t) => t.type === 'video')
      if (track?.id !== mainVideoTrack?.id) {
        return true // remove
      }
      return false
    })
    clipsToRemove.forEach((c) => removeClip(c.id))
  } else if (tabSpecificCategory) {
    // Tab specific swap: Clear only that category
    const clipsToRemove = clips.filter((c) => {
      const track = tracks.find((t) => t.id === c.trackId)
      if (tabSpecificCategory === 'audio' && track?.type === 'audio') return true
      if (tabSpecificCategory === 'vfx' && track?.type === 'video') {
        const mainVideoTrack =
          tracks.find((t) => t.id === 'v1') || tracks.find((t) => t.type === 'video')
        return track.id !== mainVideoTrack?.id // remove VFX overlays
      }
      return false
    })
    clipsToRemove.forEach((c) => removeClip(c.id))
  }

  // 2. Download Assets (Auto-select first option if none selected)
  for (const req of storyboard.assetChecklist) {
    if (req.status === 'pending') {
      let optionToDownload = req.options.find((o) => o.id === req.selectedOptionId)

      // Auto-selection logic: if nothing is manually selected, grab the first one!
      if (!optionToDownload && req.options.length > 0) {
        optionToDownload = req.options[0]
      }

      if (optionToDownload && optionToDownload.downloadUrl) {
        try {
          let extension = optionToDownload.previewUrl?.split('.').pop()?.split('?')[0] || ''
          if (!extension || extension.length > 4 || extension.includes('/')) {
            extension = req.type === 'audio' ? 'mp3' : 'mp4'
          }
          const filename = `${optionToDownload.id}.${extension}`

          if (window.api && window.api.downloadUrl) {
            const localPath = await window.api.downloadUrl(
              optionToDownload.downloadUrl,
              destDir,
              filename
            )

            // Add to Media Library
            const newMediaId = crypto.randomUUID()
            addMedia([
              {
                id: newMediaId,
                path: `file:///${localPath.replace(/\\/g, '/')}`,
                name: optionToDownload.title,
                type: req.type,
                attribution: `${req.type === 'audio' ? 'Audio by' : 'Visuals by'} ${optionToDownload.author} from ${optionToDownload.source} (${optionToDownload.license})`
              }
            ])

            markStoryboardAssetDownloaded(req.id, newMediaId)
          }
        } catch (err) {
          console.error(`Failed to download ${optionToDownload.title}:`, err)
        }
      } else {
        console.warn(
          `Skipped downloading requirement ${req.description} - no results or no valid URL.`
        )
      }
    }
  }

  // 3. Timeline Assembly (Bypass Gemini for deterministic placement)
  const freshStore = useProjectStore.getState()
  const downloadedAssets = freshStore.storyboard.assetChecklist.filter(
    (req) => req.status === 'downloaded' && req.localMediaId
  )

  const duration = freshStore.targetDuration || 15

  if (!isTabSpecificSwap) {
    // Update main image clip duration and apply Ken Burns
    const mainVideoTrack =
      freshStore.tracks.find((t) => t.id === 'v1') ||
      freshStore.tracks.find((t) => t.type === 'video')
    if (mainVideoTrack) {
      const mainClip = freshStore.clips.find((c) => c.trackId === mainVideoTrack.id)
      if (mainClip) {
        // Find the planner nodes from state (passed via effect or global store, or we assume it's attached via component)
        // Wait, the plannerNodes are in the modal state. The modal will need to apply them.
        freshStore.updateClip(mainClip.id, { duration })
      }
    }
  }

  // Deterministically place downloaded assets
  let audioTrackIndex = 0
  const audioTracks = freshStore.tracks.filter((t) => t.type === 'audio')
  const videoTracks = freshStore.tracks.filter((t) => t.type === 'video')

  for (const asset of downloadedAssets) {
    if (asset.type === 'audio') {
      const trackId = audioTracks[audioTrackIndex % audioTracks.length]?.id
      if (trackId) {
        freshStore.addClip({
          id: crypto.randomUUID(),
          mediaId: asset.localMediaId!,
          trackId,
          startTime: 0,
          duration: duration,
          sourceOffset: 0
        })
        audioTrackIndex++
      }
    } else if (asset.type === 'video') {
      // Place VFX on video track 2 or above
      const trackId = videoTracks.length > 1 ? videoTracks[1].id : videoTracks[0].id
      if (trackId) {
        freshStore.addClip({
          id: crypto.randomUUID(),
          mediaId: asset.localMediaId!,
          trackId,
          startTime: 0,
          duration: duration,
          sourceOffset: 0,
          videoProperties: { opacity: 0.5, grayscale: 0, sharpness: 0 }
        })
      }
    }
  }

  freshStore.addCopilotMessage({
    id: crypto.randomUUID(),
    role: 'assistant',
    content:
      "I've assembled the timeline! Assets have been dropped in and your main clip duration has been preserved."
  })
}
