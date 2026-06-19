import { create } from 'zustand'

export interface PlaybackState {
  playhead: number
  isPlaying: boolean
  setPlayhead: (time: number | ((prev: number) => number)) => void
  setIsPlaying: (playing: boolean) => void
  togglePlayback: () => void
}

export const usePlaybackStore = create<PlaybackState>()((set) => ({
  playhead: 0,
  isPlaying: false,
  setPlayhead: (time) =>
    set((state) => ({
      playhead: typeof time === 'function' ? time(state.playhead) : time
    })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying }))
}))
