import { create } from 'zustand'
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware'

const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const data = await window.api.readSettings(name)
    if (data) return data
    // Fallback to localStorage for smooth migration
    return localStorage.getItem(name)
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await window.api.writeSettings(name, value)
  },
  removeItem: async (name: string): Promise<void> => {
    await window.api.writeSettings(name, '')
  }
}
import { KenBurnsEffect, KenBurnsKeyframe } from '../lib/kenBurns'

export interface CreatorProfile {
  name: string
  handles: {
    instagram: string
    facebook: string
    tiktok: string
    youtube: string
    twitter: string
    linkedin: string
  }
}

export type MediaType = 'image' | 'video' | 'audio' | 'composition' | 'effect'

export interface MediaItem {
  id: string
  path: string // Local file system path or empty for compositions
  name: string
  type: MediaType
  masterType?: 'video' | 'audio' | 'effect'
  thumbnail?: string // Data URL or path
  duration?: number // For video/audio
  subClips?: Clip[] // For compositions
  subTracks?: Track[] // For compositions
  effect?: VisualEffect
  attribution?: string // For CC-BY license requirements
}

export interface Track {
  id: string
  name: string
  type: 'video' | 'audio' | 'effect'
}

export interface VisualEffect {
  id: string
  name: string
  type: 'filter' | 'transition'
  cssFilter?: string
  glTransitionId?: string
}

export interface AudioKeyframe {
  id: string
  time: number // relative to clip start
  volume: number // 0 to 2
}

export interface AudioConfig {
  volume: number // 0 to 2
  bass: number // -12 to 12 dB
  mid: number // -12 to 12 dB
  treble: number // -12 to 12 dB
  pan: number // -1 to 1
  compression: boolean
  reverb: boolean
  playbackRate?: number
  keyframes?: AudioKeyframe[]
}

export interface VideoProperties {
  opacity: number // 0 to 1
  grayscale: number // 0 to 100
  sharpness: number // 0 to 100
}

export interface Clip {
  id: string
  mediaId: string // empty for effect clips
  trackId: string
  startTime: number
  duration: number
  sourceOffset: number
  kenBurnsEffect?: KenBurnsEffect
  effects?: VisualEffect[]
  effect?: VisualEffect // for standalone effect clips on an effect track
  name?: string
  fadeIn?: number
  fadeOut?: number
  audioConfig?: AudioConfig
  videoProperties?: VideoProperties
  subClips?: Clip[] // For Compound Clips
  subTracks?: Track[] // For Compound Clips
  isCollapsed?: boolean // True if this is a Compound Clip
}

export interface DeletedSection {
  id: string
  originalClip: Clip
  deletedAt: number
}

interface ProjectState {
  mediaLibrary: MediaItem[]
  deletedSections: DeletedSection[]
  selectedMediaId: string | null

  // Timeline State
  tracks: Track[]
  clips: Clip[]
  playhead: number
  isPlaying: boolean
  activeTool: 'pointer' | 'razor' | 'crop' | 'range-copy' | 'range-cut'
  selectedClipId: string | null
  activeKeyframeId: string | null
  rangeMarkers: { start: number | null; end: number | null }
  rangeSelectedTrackIds: string[]
  rangeMasterTrackId: string | null
  targetDuration: number | null
  autoAdjustTargetDuration: boolean
  isKenBurnsLocked: boolean

  creatorProfile: CreatorProfile

  // Auth & Settings State
  currentUser: { id: string; name: string; email: string; password?: string } | null
  aiKeys: {
    gemini?: string
    geminiTier?: 'free' | 'paid'
    claude?: string
    openai?: string
    pixabay?: string
    freesound?: string
    jamendo?: string
    giphy?: string
  }
  audioCategories: { sfx: string[]; music: string[] }
  vfxCategories: string[]
  exportSettings: {
    format: 'webm' | 'mp4' | 'mov' | 'mkv' | 'avi'
    codec: 'h264' | 'h265' | 'vp9' | 'mpeg4' | 'prores'
    quality: 'low' | 'medium' | 'high'
    hwAccel: boolean
    aspectRatio: '16:9' | '9:16' | '4:5' | '1:1'
    resolution: 720 | 1080 | 1440 | 2160
    fps: 24 | 30 | 60
  }

  // Actions
  addMedia: (items: MediaItem[]) => void
  removeMedia: (id: string) => void
  setSelectedMediaId: (id: string | null) => void

  // Project Actions
  newProject: () => void
  updateCreatorProfile: (profile: Partial<CreatorProfile>) => void
  loadProject: (stateData: Partial<ProjectState>) => void

  // Auth & Settings Actions
  login: (email: string, name: string, password?: string) => void
  logout: () => void
  setAiKeys: (keys: {
    gemini?: string
    geminiTier?: 'free' | 'paid'
    claude?: string
    openai?: string
    pixabay?: string
    freesound?: string
    jamendo?: string
    giphy?: string
  }) => void
  addAudioCategory: (tab: 'sfx' | 'music', category: string) => void
  removeAudioCategory: (tab: 'sfx' | 'music', category: string) => void
  addVfxCategory: (category: string) => void
  removeVfxCategory: (category: string) => void

  // Timeline Actions
  addTrack: (track: Track, insertIndex?: number) => void
  removeTrack: (id: string) => void
  setPlayhead: (time: number | ((prev: number) => number)) => void
  setIsPlaying: (playing: boolean) => void
  setActiveTool: (tool: 'pointer' | 'razor' | 'crop' | 'range-copy' | 'range-cut') => void
  setRangeMarkers: (start: number | null, end: number | null) => void
  setRangeSelectedTracks: (trackIds: string[] | ((prev: string[]) => string[])) => void
  setRangeMasterTrackId: (id: string | null) => void
  executeRangeAction: (action: 'copy' | 'cut') => void
  collapseToCompoundClip: () => void
  expandCompoundClip: (clipId: string) => void
  retractToCompoundClip: () => void
  setSelectedClipId: (id: string | null) => void
  setActiveKeyframeId: (id: string | null) => void
  setTargetDuration: (duration: number | null) => void
  setAutoAdjustTargetDuration: (auto: boolean) => void
  setKenBurnsLocked: (locked: boolean) => void
  addClip: (clip: Clip) => void
  updateClip: (id: string, updates: Partial<Clip>) => void
  removeClip: (id: string) => void
  splitClip: (clipId: string, time: number) => void
  deleteSection: (startTime: number, endTime: number) => void
  removeDeletedSection: (id: string) => void
  clearDeletedSections: () => void

  // Ken Burns Actions (Now scoped to Clip)
  setKenBurnsEffect: (clipId: string, effect: KenBurnsEffect) => void
  updateKenBurnsEffect: (clipId: string, updates: Partial<KenBurnsEffect>) => void
  updateKenBurnsKeyframe: (
    clipId: string,
    keyframeId: string,
    updates: Partial<KenBurnsKeyframe>
  ) => void
  addKenBurnsKeyframe: (clipId: string, keyframe: KenBurnsKeyframe) => void
  removeKenBurnsKeyframe: (clipId: string, keyframeId: string) => void

  // Audio Keyframe Actions
  addAudioKeyframe: (clipId: string, keyframe: AudioKeyframe) => void
  updateAudioKeyframe: (clipId: string, keyframeId: string, updates: Partial<AudioKeyframe>) => void
  removeAudioKeyframe: (clipId: string, keyframeId: string) => void

  setExportSettings: (
    settings: Partial<{
      format: 'webm' | 'mp4' | 'mov' | 'mkv' | 'avi'
      codec: 'h264' | 'h265' | 'vp9' | 'mpeg4' | 'prores'
      quality: 'low' | 'medium' | 'high'
      hwAccel: boolean
      aspectRatio: '16:9' | '9:16' | '4:5' | '1:1'
      resolution: 720 | 1080 | 1440 | 2160
      fps: 24 | 30 | 60
    }>
  ) => void

  // VFX Actions
  addVisualEffect: (effect: VisualEffect, clipId?: string) => void
  removeVisualEffect: (effectId: string, clipId?: string) => void

  // History
  past: { clips: Clip[]; mediaLibrary: MediaItem[]; deletedSections: DeletedSection[] }[]
  future: { clips: Clip[]; mediaLibrary: MediaItem[]; deletedSections: DeletedSection[] }[]
  saveHistory: () => void
  undo: () => void
  redo: () => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      mediaLibrary: [],
      deletedSections: [],
      selectedMediaId: null,

      tracks: [
        { id: 'e1', name: 'Effects', type: 'effect' },
        { id: 'v2', name: 'Overlays', type: 'video' },
        { id: 'v1', name: 'Main Video', type: 'video' },
        { id: 'a1', name: 'Audio', type: 'audio' }
      ],
      clips: [],
      playhead: 0,
      isPlaying: false,
      activeTool: 'pointer',
      selectedClipId: null,
      activeKeyframeId: null,
      rangeMarkers: { start: null, end: null },
      rangeSelectedTrackIds: [],
      rangeMasterTrackId: null,
      targetDuration: null,
      autoAdjustTargetDuration: false,
      isKenBurnsLocked: false,

      creatorProfile: {
        name: '',
        handles: {
          instagram: '',
          facebook: '',
          tiktok: '',
          youtube: '',
          twitter: '',
          linkedin: ''
        }
      },

      currentUser: null,
      aiKeys: { geminiTier: 'free' },
      audioCategories: {
        sfx: ['Whoosh', 'Impact', 'Nature', 'Sci-Fi', 'Footsteps', 'Transition'],
        music: ['Cinematic', 'Industrial', 'Metalstep', 'Tavern', 'Ambient', 'Synthwave']
      },
      vfxCategories: ['filter', 'transition', 'blur', 'color', 'glitch', 'cinema'],
      exportSettings: {
        format: 'mp4',
        codec: 'h264',
        quality: 'medium',
        hwAccel: true,
        aspectRatio: '9:16',
        resolution: 1080,
        fps: 30
      },

      setExportSettings: (settings) =>
        set((state) => ({ exportSettings: { ...state.exportSettings, ...settings } })),

      past: [],
      future: [],

      updateCreatorProfile: (profile: Partial<CreatorProfile>): void => {
        set((state) => ({
          creatorProfile: { ...state.creatorProfile, ...profile }
        }))
      },

      saveHistory: (): void => {
        set((state) => {
          if (state.clips.length === 0 && state.past.length === 0) return state
          try {
            const currentSnapshot = {
              clips: JSON.parse(JSON.stringify(state.clips)),
              mediaLibrary: JSON.parse(JSON.stringify(state.mediaLibrary)),
              deletedSections: JSON.parse(JSON.stringify(state.deletedSections || []))
            }
            return {
              past: [...state.past, currentSnapshot].slice(-50),
              future: []
            }
          } catch (error) {
            console.error('History save failed:', error)
            return state
          }
        })
      },

      undo: () =>
        set((state) => {
          if (state.past.length === 0) return state

          const newPast = [...state.past]
          const previousState = newPast.pop()!

          try {
            const currentSnapshot = {
              clips: JSON.parse(JSON.stringify(state.clips)),
              mediaLibrary: JSON.parse(JSON.stringify(state.mediaLibrary)),
              deletedSections: JSON.parse(JSON.stringify(state.deletedSections || []))
            }

            return {
              ...previousState,
              past: newPast,
              future: [currentSnapshot, ...state.future]
            }
          } catch (error) {
            console.error('History undo failed:', error)
            return { ...previousState, past: newPast }
          }
        }),

      redo: () =>
        set((state) => {
          if (state.future.length === 0) return state

          const newFuture = [...state.future]
          const nextState = newFuture.shift()!

          try {
            const currentSnapshot = {
              clips: JSON.parse(JSON.stringify(state.clips)),
              mediaLibrary: JSON.parse(JSON.stringify(state.mediaLibrary)),
              deletedSections: JSON.parse(JSON.stringify(state.deletedSections || []))
            }

            return {
              ...nextState,
              past: [...state.past, currentSnapshot],
              future: newFuture
            }
          } catch (error) {
            console.error('History redo failed:', error)
            return { ...nextState, future: newFuture }
          }
        }),

      addMedia: (items) => {
        get().saveHistory()
        set((state) => ({ mediaLibrary: [...state.mediaLibrary, ...items] }))
      },

      removeMedia: (id) => {
        get().saveHistory()
        set((state) => ({
          mediaLibrary: state.mediaLibrary.filter((item) => item.id !== id),
          selectedMediaId: state.selectedMediaId === id ? null : state.selectedMediaId,
          clips: state.clips.filter((c) => c.mediaId !== id),
          selectedClipId:
            state.clips.find((c) => c.id === state.selectedClipId)?.mediaId === id
              ? null
              : state.selectedClipId
        }))
      },

      newProject: () =>
        set({
          clips: [],
          mediaLibrary: [],
          deletedSections: [],
          playhead: 0,
          isPlaying: false,
          selectedClipId: null,
          selectedMediaId: null,
          activeKeyframeId: null,
          targetDuration: null,
          past: [],
          future: []
        }),

      loadProject: (stateData) =>
        set((state) => ({
          tracks: stateData.tracks || state.tracks,
          clips: stateData.clips || [],
          mediaLibrary: stateData.mediaLibrary || [],
          deletedSections: stateData.deletedSections || [],
          targetDuration: stateData.targetDuration || null,
          autoAdjustTargetDuration: stateData.autoAdjustTargetDuration ?? true,
          playhead: 0,
          isPlaying: false,
          selectedClipId: null,
          selectedMediaId: null,
          activeKeyframeId: null,
          past: [],
          future: []
        })),

      login: (email, name, password) =>
        set({
          currentUser: { id: crypto.randomUUID(), name, email, password }
        }),

      logout: () => set({ currentUser: null }),

      setAiKeys: (keys) =>
        set((state) => ({
          aiKeys: { ...state.aiKeys, ...keys }
        })),

      // Timeline Actions
      addTrack: (track, insertIndex) =>
        set((state) => {
          const newTracks = [...state.tracks]
          if (typeof insertIndex === 'number') {
            newTracks.splice(insertIndex, 0, track)
          } else {
            newTracks.push(track)
          }
          return { tracks: newTracks }
        }),

      removeTrack: (id) =>
        set((state) => ({
          tracks: state.tracks.filter((t) => t.id !== id),
          clips: state.clips.filter((c) => c.trackId !== id) // Cascade delete clips
        })),

      setPlayhead: (time) =>
        set((state) => ({
          playhead: typeof time === 'function' ? time(state.playhead) : time
        })),

      setIsPlaying: (playing) => set({ isPlaying: playing }),

      setActiveTool: (tool) =>
        set(() => {
          if (tool !== 'range-copy' && tool !== 'range-cut') {
            return {
              activeTool: tool,
              rangeMarkers: { start: null, end: null },
              rangeSelectedTrackIds: [],
              rangeMasterTrackId: null
            }
          }
          return { activeTool: tool }
        }),

      setRangeMarkers: (start, end) => set({ rangeMarkers: { start, end } }),

      setRangeMasterTrackId: (id) => set({ rangeMasterTrackId: id }),

      setRangeSelectedTracks: (trackIds) =>
        set((state) => ({
          rangeSelectedTrackIds:
            typeof trackIds === 'function' ? trackIds(state.rangeSelectedTrackIds) : trackIds
        })),

      executeRangeAction: (action) => {
        set((state) => {
          const {
            rangeMarkers,
            rangeSelectedTrackIds,
            rangeMasterTrackId,
            clips,
            tracks,
            addMedia
          } = state

          if (
            rangeMarkers.start === null ||
            rangeMarkers.end === null ||
            rangeSelectedTrackIds.length === 0
          )
            return state

          const start = Math.min(rangeMarkers.start, rangeMarkers.end)
          const end = Math.max(rangeMarkers.start, rangeMarkers.end)

          const affectedClips = clips.filter(
            (c) =>
              rangeSelectedTrackIds.includes(c.trackId) &&
              c.startTime < end &&
              c.startTime + c.duration > start
          )

          const subClipsToBundle: Clip[] = []
          const newClips = [...clips]

          affectedClips.forEach((clip) => {
            const sliceStart = Math.max(clip.startTime, start)
            const sliceEnd = Math.min(clip.startTime + clip.duration, end)
            const sliceDuration = sliceEnd - sliceStart
            if (sliceDuration <= 0) return

            const internalStartTime = sliceStart - start
            const newSourceOffset = clip.sourceOffset + (sliceStart - clip.startTime)
            subClipsToBundle.push({
              ...clip,
              id: crypto.randomUUID(),
              startTime: internalStartTime,
              duration: sliceDuration,
              sourceOffset: newSourceOffset
            })

            if (action === 'cut') {
              const leftDuration = start - clip.startTime
              const rightDuration = clip.startTime + clip.duration - end

              const clipIndex = newClips.findIndex((c) => c.id === clip.id)
              if (clipIndex !== -1) {
                if (leftDuration > 0 && rightDuration > 0) {
                  newClips[clipIndex] = { ...newClips[clipIndex], duration: leftDuration }
                  newClips.push({
                    ...clip,
                    id: crypto.randomUUID(),
                    startTime: end,
                    duration: rightDuration,
                    sourceOffset: clip.sourceOffset + (end - clip.startTime)
                  })
                } else if (leftDuration > 0) {
                  newClips[clipIndex] = { ...newClips[clipIndex], duration: leftDuration }
                } else if (rightDuration > 0) {
                  newClips[clipIndex] = {
                    ...newClips[clipIndex],
                    startTime: end,
                    duration: rightDuration,
                    sourceOffset: clip.sourceOffset + (end - clip.startTime)
                  }
                } else {
                  newClips.splice(clipIndex, 1)
                }
              }
            }
          })

          if (subClipsToBundle.length === 0) return state

          let masterType: 'video' | 'audio' | 'effect' = 'video'
          if (rangeMasterTrackId) {
            const masterTrack = tracks.find((t) => t.id === rangeMasterTrackId)
            if (masterTrack) masterType = masterTrack.type
          }

          addMedia([
            {
              id: crypto.randomUUID(),
              path: 'composition',
              name: `Composition`,
              type: 'composition',
              masterType,
              duration: end - start,
              subClips: subClipsToBundle,
              subTracks: tracks.filter((t) => rangeSelectedTrackIds.includes(t.id))
            }
          ])

          return {
            clips: newClips,
            activeTool: 'pointer',
            rangeMarkers: { start: null, end: null },
            rangeSelectedTrackIds: [],
            rangeMasterTrackId: null
          }
        })
      },

      collapseToCompoundClip: () => {
        // Implemented later
      },

      expandCompoundClip: () => {
        // Implemented later
      },

      retractToCompoundClip: () => {
        // Implemented later
      },

      setSelectedMediaId: (id) =>
        set((state) => ({
          selectedMediaId: id,
          selectedClipId: id ? null : state.selectedClipId
        })),

      setSelectedClipId: (id) =>
        set((state) => ({
          selectedClipId: id,
          selectedMediaId: id ? null : state.selectedMediaId,
          activeKeyframeId: id !== state.selectedClipId ? null : state.activeKeyframeId
        })),

      setActiveKeyframeId: (id) => set({ activeKeyframeId: id }),

      setTargetDuration: (duration) => set({ targetDuration: duration }),
      setAutoAdjustTargetDuration: (auto) => set({ autoAdjustTargetDuration: auto }),
      setKenBurnsLocked: (locked) => set({ isKenBurnsLocked: locked }),

      addClip: (clip) => {
        get().saveHistory()
        set((state) => {
          const newClips = [...state.clips, clip]
          return {
            clips: newClips,
            targetDuration: state.autoAdjustTargetDuration
              ? Math.max(0, ...newClips.map((c) => c.startTime + c.duration))
              : state.targetDuration
          }
        })
      },

      updateClip: (id, updates) =>
        set((state) => {
          const newClips = state.clips.map((c) => (c.id === id ? { ...c, ...updates } : c))
          return {
            clips: newClips,
            targetDuration: state.autoAdjustTargetDuration
              ? Math.max(0, ...newClips.map((c) => c.startTime + c.duration))
              : state.targetDuration
          }
        }),

      removeClip: (id) => {
        get().saveHistory()
        set((state) => {
          const clipToDelete = state.clips.find((c) => c.id === id)
          if (!clipToDelete) return state

          const newClips = state.clips.filter((c) => c.id !== id)
          return {
            clips: newClips,
            selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
            targetDuration: state.autoAdjustTargetDuration
              ? newClips.length > 0
                ? Math.max(0, ...newClips.map((c) => c.startTime + c.duration))
                : null
              : state.targetDuration,
            deletedSections: [
              ...(state.deletedSections || []),
              {
                id: crypto.randomUUID(),
                originalClip: clipToDelete,
                deletedAt: Date.now()
              }
            ]
          }
        })
      },

      splitClip: (clipId, splitTime) => {
        get().saveHistory()
        set((state) => {
          const clip = state.clips.find((c) => c.id === clipId)
          if (!clip || splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration)
            return state

          const newDuration1 = splitTime - clip.startTime
          const newDuration2 = clip.duration - newDuration1

          // Extract base name and slice counter if it exists
          const baseMedia = state.mediaLibrary.find((m) => m.id === clip.mediaId)
          const baseName = clip.name || baseMedia?.name || 'Clip'

          // Simple naming logic: if it doesn't have a slice number, it's slice 1 and 2.
          // If it's already "Clip-2", the next is "Clip-3".
          const match = baseName.match(/^(.*?)(?:-(\d+))?$/)
          const prefix = match ? match[1] : baseName
          const currentCounter = match && match[2] ? parseInt(match[2]) : 1

          const track = state.tracks.find((t) => t.id === clip.trackId)
          const isAudio = track?.type === 'audio'

          const clip1: Clip = {
            ...clip,
            duration: newDuration1,
            name: `${prefix}-${currentCounter}`,
            fadeOut: isAudio ? 0.1 : clip.fadeOut
          }

          const clip2: Clip = {
            ...clip,
            id: crypto.randomUUID(),
            startTime: splitTime,
            duration: newDuration2,
            sourceOffset: clip.sourceOffset + newDuration1,
            name: `${prefix}-${currentCounter + 1}`,
            fadeIn: isAudio ? 0.1 : clip.fadeIn,
            fadeOut: clip.fadeOut, // preserve original right-edge fadeOut
            // If we want to split keyframes too, we'd need complex math here.
            // For now, we clone the effect to both clips.
            kenBurnsEffect: clip.kenBurnsEffect
              ? JSON.parse(JSON.stringify(clip.kenBurnsEffect))
              : undefined
          }

          return {
            clips: state.clips.map((c) => (c.id === clipId ? clip1 : c)).concat(clip2)
          }
        })
      },

      deleteSection: (startTime, endTime) => {
        get().saveHistory()
        set((state) => {
          // This is the implementation for Option B / Red Box Ripple Delete.
          // It will find any clips overlapping this range, split/truncate them, extract the deleted parts into deletedSections, and shift everything leftward.

          const newDeletedSections = [...state.deletedSections]
          const newClips: Clip[] = []

          const deleteDuration = endTime - startTime

          state.clips.forEach((clip) => {
            const clipEnd = clip.startTime + clip.duration

            // Case 1: Clip is completely before the deletion range
            if (clipEnd <= startTime) {
              newClips.push(clip)
            }
            // Case 2: Clip is completely after the deletion range (shift left)
            else if (clip.startTime >= endTime) {
              newClips.push({ ...clip, startTime: clip.startTime - deleteDuration })
            }
            // Case 3: Clip is completely swallowed by the deletion range
            else if (clip.startTime >= startTime && clipEnd <= endTime) {
              newDeletedSections.push({
                id: crypto.randomUUID(),
                originalClip: { ...clip },
                deletedAt: Date.now()
              })
            }
            // Case 4: Clip overlaps the start of the deletion range (truncate right)
            else if (clip.startTime < startTime && clipEnd <= endTime) {
              const truncatedDuration = startTime - clip.startTime

              // Save deleted portion
              newDeletedSections.push({
                id: crypto.randomUUID(),
                originalClip: {
                  ...clip,
                  startTime: startTime,
                  duration: clip.duration - truncatedDuration,
                  sourceOffset: clip.sourceOffset + truncatedDuration
                },
                deletedAt: Date.now()
              })

              newClips.push({ ...clip, duration: truncatedDuration })
            }
            // Case 5: Clip overlaps the end of the deletion range (truncate left and shift)
            else if (clip.startTime >= startTime && clipEnd > endTime) {
              const truncatedDuration = clipEnd - endTime
              const deletedDuration = clip.duration - truncatedDuration

              newDeletedSections.push({
                id: crypto.randomUUID(),
                originalClip: {
                  ...clip,
                  duration: deletedDuration
                },
                deletedAt: Date.now()
              })

              newClips.push({
                ...clip,
                startTime: startTime, // Shifted left to the start of the deleted range
                duration: truncatedDuration,
                sourceOffset: clip.sourceOffset + deletedDuration
              })
            }
            // Case 6: Clip fully spans across the deletion range (split into two)
            else if (clip.startTime < startTime && clipEnd > endTime) {
              const leftDuration = startTime - clip.startTime
              const rightDuration = clipEnd - endTime

              newDeletedSections.push({
                id: crypto.randomUUID(),
                originalClip: {
                  ...clip,
                  startTime: startTime,
                  duration: deleteDuration,
                  sourceOffset: clip.sourceOffset + leftDuration
                },
                deletedAt: Date.now()
              })

              newClips.push({ ...clip, duration: leftDuration })
              newClips.push({
                ...clip,
                id: crypto.randomUUID(),
                startTime: startTime,
                duration: rightDuration,
                sourceOffset: clip.sourceOffset + leftDuration + deleteDuration
              })
            }
          })

          return {
            clips: newClips,
            deletedSections: newDeletedSections,
            targetDuration: state.autoAdjustTargetDuration
              ? newClips.length > 0
                ? Math.max(0, ...newClips.map((c) => c.startTime + c.duration))
                : null
              : state.targetDuration
          }
        })
      },

      removeDeletedSection: (id) => {
        get().saveHistory()
        set((state) => ({
          deletedSections: state.deletedSections.filter((s) => s.id !== id)
        }))
      },

      clearDeletedSections: () => {
        get().saveHistory()
        set({ deletedSections: [] })
      },

      setKenBurnsEffect: (clipId, effect) =>
        set((state) => {
          return {
            clips: state.clips.map((c) => (c.id === clipId ? { ...c, kenBurnsEffect: effect } : c))
          }
        }),

      updateKenBurnsEffect: (clipId, updates) =>
        set((state) => {
          return {
            clips: state.clips.map((c) => {
              if (c.id === clipId && c.kenBurnsEffect) {
                return { ...c, kenBurnsEffect: { ...c.kenBurnsEffect, ...updates } }
              }
              return c
            })
          }
        }),

      updateKenBurnsKeyframe: (clipId, keyframeId, updates) =>
        set((state) => {
          return {
            clips: state.clips.map((c) => {
              if (c.id === clipId && c.kenBurnsEffect) {
                return {
                  ...c,
                  kenBurnsEffect: {
                    ...c.kenBurnsEffect,
                    keyframes: c.kenBurnsEffect.keyframes.map((kf) =>
                      kf.id === keyframeId ? { ...kf, ...updates } : kf
                    )
                  }
                }
              }
              return c
            })
          }
        }),

      addKenBurnsKeyframe: (clipId, keyframe) =>
        set((state) => {
          return {
            clips: state.clips.map((c) => {
              if (c.id === clipId) {
                const effect = c.kenBurnsEffect || {
                  id: `kb-${Date.now()}`,
                  mediaId: c.mediaId,
                  easing: 'ease-in-out',
                  constrainToFrame: true,
                  keyframes: []
                }
                return {
                  ...c,
                  kenBurnsEffect: {
                    ...effect,
                    keyframes: [...effect.keyframes, keyframe]
                  }
                }
              }
              return c
            })
          }
        }),

      removeKenBurnsKeyframe: (clipId, keyframeId) =>
        set((state) => {
          return {
            clips: state.clips.map((c) => {
              if (c.id === clipId && c.kenBurnsEffect) {
                return {
                  ...c,
                  kenBurnsEffect: {
                    ...c.kenBurnsEffect,
                    keyframes: c.kenBurnsEffect.keyframes.filter((kf) => kf.id !== keyframeId)
                  }
                }
              }
              return c
            })
          }
        }),

      addAudioKeyframe: (clipId, keyframe) =>
        set((state) => {
          return {
            clips: state.clips.map((c) => {
              if (c.id === clipId) {
                const config = c.audioConfig || {
                  volume: 1,
                  bass: 0,
                  mid: 0,
                  treble: 0,
                  pan: 0,
                  compression: false,
                  reverb: false,
                  keyframes: []
                }
                const keyframes = config.keyframes || []
                return {
                  ...c,
                  audioConfig: {
                    ...config,
                    keyframes: [...keyframes, keyframe]
                  }
                }
              }
              return c
            })
          }
        }),

      updateAudioKeyframe: (clipId, keyframeId, updates) =>
        set((state) => {
          return {
            clips: state.clips.map((c) => {
              if (c.id === clipId && c.audioConfig && c.audioConfig.keyframes) {
                return {
                  ...c,
                  audioConfig: {
                    ...c.audioConfig,
                    keyframes: c.audioConfig.keyframes.map((kf) =>
                      kf.id === keyframeId ? { ...kf, ...updates } : kf
                    )
                  }
                }
              }
              return c
            })
          }
        }),

      removeAudioKeyframe: (clipId, keyframeId) =>
        set((state) => {
          return {
            clips: state.clips.map((c) => {
              if (c.id === clipId && c.audioConfig && c.audioConfig.keyframes) {
                return {
                  ...c,
                  audioConfig: {
                    ...c.audioConfig,
                    keyframes: c.audioConfig.keyframes.filter((kf) => kf.id !== keyframeId)
                  }
                }
              }
              return c
            })
          }
        }),

      addVisualEffect: (effect, clipId) => {
        get().saveHistory()
        set((state) => {
          if (clipId) {
            // Apply effect to specific clip
            return {
              clips: state.clips.map((c) =>
                c.id === clipId ? { ...c, effects: [...(c.effects || []), effect] } : c
              )
            }
          } else {
            // Drop effect as a standalone clip on the Effects track
            let effectTrack = state.tracks.find((t) => t.type === 'effect')
            let newTracks = state.tracks

            if (!effectTrack) {
              effectTrack = { id: crypto.randomUUID(), name: 'Effects', type: 'effect' }
              newTracks = [...state.tracks, effectTrack]
            }

            return {
              tracks: newTracks,
              clips: [
                ...state.clips,
                {
                  id: crypto.randomUUID(),
                  mediaId: '',
                  trackId: effectTrack.id,
                  startTime: state.playhead,
                  duration: 5, // default 5 seconds
                  sourceOffset: 0,
                  effect: effect,
                  name: effect.name
                }
              ]
            }
          }
        })
      },

      removeVisualEffect: (effectId, clipId) => {
        get().saveHistory()
        set((state) => {
          if (clipId) {
            return {
              clips: state.clips.map((c) =>
                c.id === clipId
                  ? { ...c, effects: (c.effects || []).filter((e) => e.id !== effectId) }
                  : c
              )
            }
          } else {
            // Remove standalone effect clip
            return {
              clips: state.clips.filter((c) => c.id !== effectId)
            }
          }
        })
      },

      addAudioCategory: (type, category) =>
        set((state) => ({
          audioCategories: {
            ...state.audioCategories,
            [type]: [...(state.audioCategories[type] || []), category]
          }
        })),

      removeAudioCategory: (type, category) =>
        set((state) => ({
          audioCategories: {
            ...state.audioCategories,
            [type]: (state.audioCategories[type] || []).filter((c) => c !== category)
          }
        })),

      addVfxCategory: (category) =>
        set((state) => ({
          vfxCategories: [...(state.vfxCategories || []), category]
        })),

      removeVfxCategory: (category) =>
        set((state) => ({
          vfxCategories: (state.vfxCategories || []).filter((c) => c !== category)
        }))
    }),
    {
      name: 'express-reels-settings',
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        currentUser: state.currentUser,
        aiKeys: state.aiKeys,
        audioCategories: state.audioCategories || {
          sfx: ['Whoosh', 'Impact', 'Nature', 'Sci-Fi', 'Footsteps', 'Transition'],
          music: ['Cinematic', 'Industrial', 'Metalstep', 'Tavern', 'Ambient', 'Synthwave']
        },
        vfxCategories: state.vfxCategories || [
          'filter',
          'transition',
          'blur',
          'color',
          'glitch',
          'cinema'
        ]
      })
    }
  )
)
