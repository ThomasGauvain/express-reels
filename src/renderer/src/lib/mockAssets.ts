import { VisualEffect } from '../store/projectStore'

export const MOCK_EFFECTS: VisualEffect[] = [
  // Filters - Color Grading
  { id: 'fx-gray', name: 'Grayscale', type: 'filter', cssFilter: 'grayscale(100%)' },
  { id: 'fx-sepia', name: 'Vintage Sepia', type: 'filter', cssFilter: 'sepia(100%)' },
  { id: 'fx-contrast', name: 'High Contrast', type: 'filter', cssFilter: 'contrast(150%)' },
  { id: 'fx-saturate', name: 'Vibrant Colors', type: 'filter', cssFilter: 'saturate(200%)' },
  { id: 'fx-desaturate', name: 'Muted Colors', type: 'filter', cssFilter: 'saturate(50%)' },
  { id: 'fx-brightness', name: 'Brighten', type: 'filter', cssFilter: 'brightness(130%)' },
  { id: 'fx-darken', name: 'Darken', type: 'filter', cssFilter: 'brightness(70%)' },
  { id: 'fx-invert', name: 'Negative', type: 'filter', cssFilter: 'invert(100%)' },
  { id: 'fx-hue-90', name: 'Alien Hue', type: 'filter', cssFilter: 'hue-rotate(90deg)' },
  { id: 'fx-hue-180', name: 'Neon Hue', type: 'filter', cssFilter: 'hue-rotate(180deg)' },
  { id: 'fx-opacity', name: 'Ghost', type: 'filter', cssFilter: 'opacity(50%)' },

  // Filters - Distortions
  { id: 'fx-blur', name: 'Soft Blur', type: 'filter', cssFilter: 'blur(4px)' },
  { id: 'fx-heavy-blur', name: 'Heavy Blur', type: 'filter', cssFilter: 'blur(12px)' },
  {
    id: 'fx-shadow',
    name: 'Drop Shadow',
    type: 'filter',
    cssFilter: 'drop-shadow(10px 10px 10px rgba(0,0,0,0.8))'
  },
  {
    id: 'fx-glow',
    name: 'Neon Glow',
    type: 'filter',
    cssFilter: 'drop-shadow(0 0 10px #0ff) drop-shadow(0 0 20px #0ff)'
  },

  // Transitions
  { id: 'tx-fade', name: 'Crossfade', type: 'transition', glTransitionId: 'fade' },
  { id: 'tx-glitch', name: 'Cyber Glitch', type: 'transition', glTransitionId: 'glitch' },
  { id: 'tx-wipe', name: 'Directional Wipe', type: 'transition', glTransitionId: 'wipe' },
  { id: 'tx-zoom', name: 'Zoom In', type: 'transition', glTransitionId: 'zoom' },
  { id: 'tx-slide-left', name: 'Slide Left', type: 'transition', glTransitionId: 'slide-left' },
  { id: 'tx-slide-right', name: 'Slide Right', type: 'transition', glTransitionId: 'slide-right' },
  { id: 'tx-pixelate', name: 'Pixelate Dissolve', type: 'transition', glTransitionId: 'pixelate' },
  { id: 'tx-burn', name: 'Film Burn', type: 'transition', glTransitionId: 'burn' },
  { id: 'tx-iris', name: 'Iris Circle', type: 'transition', glTransitionId: 'iris' },
  { id: 'tx-cube', name: '3D Cube Spin', type: 'transition', glTransitionId: 'cube' }
]

export const MOCK_AUDIO = [
  { id: 'aud-1', name: 'Cinematic Whoosh', duration: 2, tags: ['sfx', 'transition'] },
  { id: 'aud-2', name: 'Lo-Fi Chill Beat', duration: 120, tags: ['music', 'background'] },
  { id: 'aud-3', name: 'Crowd Cheer', duration: 5, tags: ['sfx', 'ambient'] },
  { id: 'aud-4', name: 'Digital Glitch', duration: 1, tags: ['sfx', 'tech'] },
  { id: 'aud-5', name: 'Corporate Upbeat', duration: 180, tags: ['music', 'presentation'] }
]
