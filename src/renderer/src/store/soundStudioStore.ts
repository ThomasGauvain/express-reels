import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle'

export interface ClipEffects {
  eq: { bass: number; mid: number; treble: number }
  compression: { threshold: number; ratio: number }
  gate: { threshold: number }
  reverb: { mix: number; decay: number }
}

export interface VolumeKeyframe {
  id: string
  beat: number
  volume: number // 0 – 2
}

export interface PanKeyframe {
  id: string
  beat: number
  pan: number // -1 (L) to +1 (R)
}

export interface NoteClip {
  id: string
  trackId: string
  startBeat: number
  durationBeats: number
  pitch?: string // e.g. 'C4', 'D#3' — for melodic instruments
  velocity: number // 0–127
  effects: ClipEffects
  volumeKeyframes: VolumeKeyframe[]
  panKeyframes: PanKeyframe[]
  fadeIn: number // beats
  fadeOut: number // beats
}

export type InstrumentCategory = 'percussion' | 'strings' | 'wind' | 'synth' | 'midi'

export interface Instrument {
  id: string
  name: string
  category: InstrumentCategory
  sampleMap?: Record<string, string> // note → sample path (for drum kit)
  synthPreset?: SynthPreset
}

export interface SynthPreset {
  oscillatorType: OscillatorType
  attack: number
  decay: number
  sustain: number
  release: number
  filterCutoff: number
  filterResonance: number
  lfoRate: number
  lfoDepth: number
  distortion: number
}

export interface SoundTrack {
  id: string
  name: string
  instrumentId: string
  muted: boolean
  solo: boolean
  volume: number // 0–2
  pan: number // -1 to +1
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AiCompositionNote {
  startBeat: number
  durationBeats: number
  velocity: number
  pitch?: string
}

export interface AiCompositionTrack {
  instrumentId: string
  name: string
  notes: AiCompositionNote[]
  effects: ClipEffects
}

export interface AiComposition {
  bpm?: number
  beatsPerMeasure?: number
  totalMeasures?: number
  tracks: AiCompositionTrack[]
  message?: string
}

// ─── Default Values ────────────────────────────────────────────────────────────

const defaultEffects = (): ClipEffects => ({
  eq: { bass: 0, mid: 0, treble: 0 },
  compression: { threshold: -24, ratio: 2 },
  gate: { threshold: -60 },
  reverb: { mix: 0, decay: 1.5 }
})

// ─── Built-in Instruments ──────────────────────────────────────────────────────

export const BUILT_IN_INSTRUMENTS: Instrument[] = [
  // Percussion
  { id: 'drum-kit', name: 'Drum Kit', category: 'percussion' },
  { id: 'drum-kick', name: 'Kick Drum', category: 'percussion' },
  { id: 'drum-snare', name: 'Snare', category: 'percussion' },
  { id: 'drum-hihat-closed', name: 'Hi-Hat (Closed)', category: 'percussion' },
  { id: 'drum-hihat-open', name: 'Hi-Hat (Open)', category: 'percussion' },
  { id: 'drum-crash', name: 'Crash Cymbal', category: 'percussion' },
  { id: 'drum-ride', name: 'Ride Cymbal', category: 'percussion' },
  { id: 'drum-tom-high', name: 'Tom (High)', category: 'percussion' },
  { id: 'drum-tom-mid', name: 'Tom (Mid)', category: 'percussion' },
  { id: 'drum-tom-floor', name: 'Tom (Floor)', category: 'percussion' },
  { id: 'drum-cowbell', name: 'Cowbell', category: 'percussion' },
  // Synth
  {
    id: 'synth-lead',
    name: 'Lead Synth',
    category: 'synth',
    synthPreset: {
      oscillatorType: 'sawtooth',
      attack: 0.01,
      decay: 0.1,
      sustain: 0.8,
      release: 0.3,
      filterCutoff: 2000,
      filterResonance: 5,
      lfoRate: 2,
      lfoDepth: 0,
      distortion: 0
    }
  },
  {
    id: 'synth-bass',
    name: 'Bass Synth',
    category: 'synth',
    synthPreset: {
      oscillatorType: 'square',
      attack: 0.005,
      decay: 0.2,
      sustain: 0.6,
      release: 0.1,
      filterCutoff: 600,
      filterResonance: 8,
      lfoRate: 0,
      lfoDepth: 0,
      distortion: 0.2
    }
  },
  {
    id: 'synth-pad',
    name: 'Pad Synth',
    category: 'synth',
    synthPreset: {
      oscillatorType: 'sine',
      attack: 0.5,
      decay: 0.3,
      sustain: 0.9,
      release: 1.5,
      filterCutoff: 4000,
      filterResonance: 2,
      lfoRate: 0.5,
      lfoDepth: 200,
      distortion: 0
    }
  },
  {
    id: 'synth-industrial',
    name: 'Industrial',
    category: 'synth',
    synthPreset: {
      oscillatorType: 'square',
      attack: 0.001,
      decay: 0.05,
      sustain: 0.3,
      release: 0.05,
      filterCutoff: 800,
      filterResonance: 15,
      lfoRate: 8,
      lfoDepth: 400,
      distortion: 0.9
    }
  },
  // Strings
  { id: 'strings-violin', name: 'Violin', category: 'strings' },
  { id: 'strings-cello', name: 'Cello', category: 'strings' },
  { id: 'strings-guitar-acoustic', name: 'Acoustic Guitar', category: 'strings' },
  { id: 'strings-guitar-electric', name: 'Electric Guitar', category: 'strings' },
  { id: 'strings-bass-guitar', name: 'Bass Guitar', category: 'strings' },
  // Wind
  { id: 'wind-flute', name: 'Flute', category: 'wind' },
  { id: 'wind-saxophone', name: 'Saxophone', category: 'wind' },
  { id: 'wind-trumpet', name: 'Trumpet', category: 'wind' },
  { id: 'wind-trombone', name: 'Trombone', category: 'wind' },
  // MIDI
  { id: 'midi-piano', name: 'Piano (MIDI)', category: 'midi' },
  { id: 'midi-organ', name: 'Organ (MIDI)', category: 'midi' },
  { id: 'midi-vibraphone', name: 'Vibraphone (MIDI)', category: 'midi' }
]

// ─── History ────────────────────────────────────────────────────────────────────

interface HistorySnapshot {
  tracks: SoundTrack[]
  clips: NoteClip[]
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export interface SoundStudioState {
  // Session
  bpm: number
  beatsPerMeasure: number
  subdivision: '1/4' | '1/8' | '1/16' | '1/32'
  totalMeasures: number

  // Tracks & Clips
  tracks: SoundTrack[]
  clips: NoteClip[]

  // Playback
  isPlaying: boolean
  currentBeat: number

  // Selection
  selectedTrackId: string | null
  selectedClipId: string | null
  selectedInstrumentId: string | null

  // AI Chat
  chatHistory: ChatMessage[]
  isAiLoading: boolean

  // Undo/Redo
  past: HistorySnapshot[]
  future: HistorySnapshot[]

  // Actions — Session
  setBpm: (bpm: number) => void
  setBeatsPerMeasure: (n: number) => void
  setSubdivision: (s: SoundStudioState['subdivision']) => void
  setTotalMeasures: (n: number) => void

  // Actions — Tracks
  addTrack: (instrument: Instrument) => void
  removeTrack: (id: string) => void
  updateTrack: (id: string, updates: Partial<SoundTrack>) => void
  setSelectedTrackId: (id: string | null) => void

  // Actions — Clips
  addClip: (
    clip: Omit<
      NoteClip,
      'id' | 'effects' | 'volumeKeyframes' | 'panKeyframes' | 'fadeIn' | 'fadeOut'
    >
  ) => void
  removeClip: (id: string) => void
  updateClip: (id: string, updates: Partial<NoteClip>) => void
  setSelectedClipId: (id: string | null) => void

  // Actions — Instrument
  setSelectedInstrumentId: (id: string | null) => void

  // Actions — Playback
  setIsPlaying: (playing: boolean) => void
  setCurrentBeat: (beat: number) => void

  // Actions — AI
  appendChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setIsAiLoading: (loading: boolean) => void
  applyAiComposition: (composition: AiComposition) => void

  // Actions — History
  saveHistory: () => void
  undo: () => void
  redo: () => void

  // Actions — Persistence
  clearAll: () => void
}

export const useSoundStudioStore = create<SoundStudioState>((set, get) => ({
  bpm: 120,
  beatsPerMeasure: 4,
  subdivision: '1/16',
  totalMeasures: 8,

  tracks: [],
  clips: [],

  isPlaying: false,
  currentBeat: 0,

  selectedTrackId: null,
  selectedClipId: null,
  selectedInstrumentId: null,

  chatHistory: [],
  isAiLoading: false,

  past: [],
  future: [],

  // ─── Session ──────────────────────────────────────────────────────────────────
  setBpm: (bpm) => set({ bpm }),
  setBeatsPerMeasure: (n) => set({ beatsPerMeasure: n }),
  setSubdivision: (s) => set({ subdivision: s }),
  setTotalMeasures: (n) => set({ totalMeasures: n }),

  // ─── Tracks ───────────────────────────────────────────────────────────────────
  addTrack: (instrument) => {
    get().saveHistory()
    const track: SoundTrack = {
      id: crypto.randomUUID(),
      name: instrument.name,
      instrumentId: instrument.id,
      muted: false,
      solo: false,
      volume: 1,
      pan: 0
    }
    set((s) => ({ tracks: [...s.tracks, track], selectedTrackId: track.id }))
  },

  removeTrack: (id) => {
    get().saveHistory()
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== id),
      clips: s.clips.filter((c) => c.trackId !== id),
      selectedTrackId: s.selectedTrackId === id ? null : s.selectedTrackId
    }))
  },

  updateTrack: (id, updates) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

  setSelectedTrackId: (id) => set({ selectedTrackId: id }),

  // ─── Clips ────────────────────────────────────────────────────────────────────
  addClip: (partial) => {
    get().saveHistory()
    const clip: NoteClip = {
      ...partial,
      id: crypto.randomUUID(),
      effects: defaultEffects(),
      volumeKeyframes: [],
      panKeyframes: [],
      fadeIn: 0,
      fadeOut: 0
    }
    set((s) => ({ clips: [...s.clips, clip], selectedClipId: clip.id }))
  },

  removeClip: (id) => {
    get().saveHistory()
    set((s) => ({
      clips: s.clips.filter((c) => c.id !== id),
      selectedClipId: s.selectedClipId === id ? null : s.selectedClipId
    }))
  },

  updateClip: (id, updates) =>
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...updates } : c)) })),

  setSelectedClipId: (id) => set({ selectedClipId: id }),

  // ─── Instrument ───────────────────────────────────────────────────────────────
  setSelectedInstrumentId: (id) => set({ selectedInstrumentId: id }),

  // ─── Playback ─────────────────────────────────────────────────────────────────
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentBeat: (beat) => set({ currentBeat: beat }),

  // ─── AI ───────────────────────────────────────────────────────────────────────
  appendChatMessage: (msg) =>
    set((s) => ({
      chatHistory: [...s.chatHistory, { ...msg, id: crypto.randomUUID(), timestamp: Date.now() }]
    })),

  setIsAiLoading: (loading) => set({ isAiLoading: loading }),

  applyAiComposition: (composition) => {
    get().saveHistory()
    const state = get()

    if (composition.bpm) set({ bpm: composition.bpm })
    if (composition.beatsPerMeasure) set({ beatsPerMeasure: composition.beatsPerMeasure })
    if (composition.totalMeasures) set({ totalMeasures: composition.totalMeasures })

    const newTracks: SoundTrack[] = []
    const newClips: NoteClip[] = []

    composition.tracks.forEach((aiTrack) => {
      const instrument = BUILT_IN_INSTRUMENTS.find((i) => i.id === aiTrack.instrumentId)
      if (!instrument) return

      // Reuse existing track with same instrument, or create new one
      let track = state.tracks.find((t) => t.instrumentId === aiTrack.instrumentId)
      if (!track) {
        track = {
          id: crypto.randomUUID(),
          name: aiTrack.name || instrument.name,
          instrumentId: aiTrack.instrumentId,
          muted: false,
          solo: false,
          volume: 1,
          pan: 0
        }
        newTracks.push(track)
      }

      const trackId = track.id
      aiTrack.notes.forEach((note) => {
        newClips.push({
          id: crypto.randomUUID(),
          trackId,
          startBeat: note.startBeat,
          durationBeats: note.durationBeats,
          pitch: note.pitch,
          velocity: note.velocity,
          effects: aiTrack.effects || defaultEffects(),
          volumeKeyframes: [],
          panKeyframes: [],
          fadeIn: 0,
          fadeOut: 0
        })
      })
    })

    set((s) => ({
      tracks: [...s.tracks, ...newTracks],
      clips: [...s.clips, ...newClips]
    }))
  },

  // ─── History ──────────────────────────────────────────────────────────────────
  saveHistory: () =>
    set((s) => ({
      past: [...s.past.slice(-49), { tracks: s.tracks, clips: s.clips }],
      future: []
    })),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s
      const prev = s.past[s.past.length - 1]
      return {
        past: s.past.slice(0, -1),
        future: [{ tracks: s.tracks, clips: s.clips }, ...s.future],
        tracks: prev.tracks,
        clips: prev.clips
      }
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s
      const next = s.future[0]
      return {
        past: [...s.past, { tracks: s.tracks, clips: s.clips }],
        future: s.future.slice(1),
        tracks: next.tracks,
        clips: next.clips
      }
    }),

  clearAll: () =>
    set({
      tracks: [],
      clips: [],
      selectedTrackId: null,
      selectedClipId: null,
      currentBeat: 0,
      isPlaying: false
    })
}))
