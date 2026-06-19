import React, { useState, useEffect, useRef, type ReactElement } from 'react'
import './VFXBrowserModal.css'
import {
  X,
  Search,
  Wand2,
  ArrowRight,
  Plus,
  Trash2,
  Video,
  Image as ImageIcon,
  Loader2
} from 'lucide-react'
import { useProjectStore, VisualEffect } from '../store/projectStore'
import { useShallow } from 'zustand/react/shallow'
import { MOCK_EFFECTS } from '../lib/mockAssets'

const DEFAULT_THUMB = `https://picsum.photos/seed/vfx/200/200`

function EffectThumbnail({
  src,
  alt,
  cssFilter,
  className,
  onError
}: {
  src: string
  alt: string
  cssFilter?: string
  className: string
  onError: (e: React.SyntheticEvent<HTMLImageElement>) => void
}): ReactElement {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.style.filter = cssFilter || 'none'
  }, [cssFilter])
  return <img ref={ref} src={src} alt={alt} className={className} onError={onError} />
}

function PreviewBox({
  cssFilter,
  className
}: {
  cssFilter?: string
  className: string
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.style.filter = cssFilter || 'none'
  }, [cssFilter])
  return <div ref={ref} className={className} />
}
type BrowserTab = 'effects' | 'overlays' | 'stickers'
type BrowserResult = {
  id: string
  name: string
  type: 'filter' | 'transition' | 'overlay' | 'sticker'
  url?: string
  thumbnail?: string
  duration?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: any
}
export function VFXBrowserModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [activeTab, setActiveTab] = useState<BrowserTab>('effects')
  const [search, setSearch] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [orientationFilter, setOrientationFilter] = useState('all')
  const [selectedEffect, setSelectedEffect] = useState<BrowserResult | null>(null)
  const [cloudTransitions, setCloudTransitions] = useState<BrowserResult[]>([])
  const [isLoadingTransitions, setIsLoadingTransitions] = useState(true)
  const [cloudResults, setCloudResults] = useState<BrowserResult[]>([])
  const [isSearchingCloud, setIsSearchingCloud] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const { addMedia, vfxCategories, addVfxCategory, removeVfxCategory, aiKeys } = useProjectStore(
    useShallow((s) => ({
      addMedia: s.addMedia,
      vfxCategories: s.vfxCategories,
      addVfxCategory: s.addVfxCategory,
      removeVfxCategory: s.removeVfxCategory,
      aiKeys: s.aiKeys
    }))
  )
  useEffect(() => {
    fetch('https://unpkg.com/gl-transitions@1/gl-transitions.json')
      .then((res) => res.json())
      .then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: BrowserResult[] = data.map((t: any) => ({
          id: `gl-${t.name}`,
          name: t.name,
          type: 'transition',
          thumbnail: DEFAULT_THUMB,
          raw: {
            glTransitionId: t.name
          }
        }))
        setCloudTransitions(mapped)
      })
      .catch((err) => console.error('Failed to load gl-transitions', err))
      .finally(() => setIsLoadingTransitions(false))
  }, [])
  const safeCategories = vfxCategories || ['filter', 'transition', 'blur', 'color']
  const handleCloudSearch = async (query: string): Promise<void> => {
    if (!query.trim()) return
    setIsSearchingCloud(true)
    setCloudError(null)
    setCloudResults([])
    setSelectedEffect(null)
    try {
      if (activeTab === 'overlays') {
        if (!aiKeys?.pixabay) throw new Error('Please add a Pixabay API Key in Settings.')
        const safeQuery = query.length > 100 ? query.substring(0, 100) : query
        const res = await fetch(
          `https://pixabay.com/api/videos/?key=${aiKeys.pixabay}&q=${encodeURIComponent(safeQuery)}&per_page=100`
        )
        if (!res.ok) throw new Error('Pixabay API error')
        const data = await res.json()
        let hits = data.hits || []
        if (orientationFilter !== 'all') {
          hits = hits.filter((hit: { videos?: { tiny?: { width: number; height: number } } }) => {
            const w = hit.videos?.tiny?.width || 1
            const h = hit.videos?.tiny?.height || 1
            const ratio = w / h
            if (orientationFilter === 'landscape') return ratio > 1.1
            if (orientationFilter === 'portrait') return ratio < 0.9
            if (orientationFilter === 'square') return ratio >= 0.9 && ratio <= 1.1
            return true
          })
        }
        setCloudResults(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hits.slice(0, 30).map((hit: any) => {
            const firstTag = hit.tags ? hit.tags.split(',')[0].trim() : 'Stock'
            // Use hit.picture_id properly, fallback to Vimeo CDN standard size
            const thumbUrl = hit.picture_id
              ? `https://i.vimeocdn.com/video/${hit.picture_id}_295x166.jpg`
              : ''
            return {
              id: hit.id.toString(),
              name: `${firstTag.charAt(0).toUpperCase() + firstTag.slice(1)} Overlay`,
              type: 'overlay',
              url: hit.videos.tiny.url,
              thumbnail: hit.thumbnail || thumbUrl,
              duration: hit.duration,
              raw: hit
            }
          })
        )
      } else if (activeTab === 'stickers') {
        if (!aiKeys?.giphy) throw new Error('Please add a Giphy API Key in Settings.')
        const res = await fetch(
          `https://api.giphy.com/v1/stickers/search?api_key=${aiKeys.giphy}&q=${encodeURIComponent(query)}&limit=100`
        )
        if (!res.ok) throw new Error('Giphy API error')
        const data = await res.json()
        let items = data.data || []
        if (orientationFilter !== 'all') {
          items = items.filter(
            (item: { images?: { original?: { width: string; height: string } } }) => {
              const w = parseInt(item.images?.original?.width || '1', 10)
              const h = parseInt(item.images?.original?.height || '1', 10)
              const ratio = w / h
              if (orientationFilter === 'landscape') return ratio > 1.1
              if (orientationFilter === 'portrait') return ratio < 0.9
              if (orientationFilter === 'square') return ratio >= 0.9 && ratio <= 1.1
              return true
            }
          )
        }
        setCloudResults(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items.slice(0, 30).map((item: any) => ({
            id: item.id,
            name: item.title || 'Sticker',
            type: 'sticker',
            url: item.images.fixed_height.url || item.images.original.url,
            thumbnail: item.images.fixed_height_small.url || item.images.fixed_height.url,
            duration: 5,
            raw: item
          }))
        )
      }
    } catch (err: unknown) {
      setCloudError((err as Error).message)
    } finally {
      setIsSearchingCloud(false)
    }
  }
  const handleSearchSubmit = (e?: React.FormEvent): void => {
    if (e) e.preventDefault()
    if (activeTab !== 'effects') {
      handleCloudSearch(search)
    }
  }

  // Automatically search when changing tabs or typing (with debounce)
  useEffect(() => {
    if (activeTab === 'effects') return
    const timeoutId = setTimeout(() => {
      handleCloudSearch(search || 'trending') // Fallback to 'trending' if search is empty
    }, 500)
    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, orientationFilter])

  // Effect filtering
  const allEffects: BrowserResult[] = [
    ...MOCK_EFFECTS.map((fx) => ({
      ...fx,
      thumbnail: DEFAULT_THUMB,
      raw: fx
    })),
    ...cloudTransitions
  ]
  const filteredEffects = allEffects.filter(
    (fx) =>
      fx.name.toLowerCase().includes(search.toLowerCase()) || fx.type.includes(search.toLowerCase())
  )
  const displayedList = activeTab === 'effects' ? filteredEffects : cloudResults

  const handleAdd = (): void => {
    if (!selectedEffect) return
    if (activeTab === 'effects') {
      const fx: VisualEffect = {
        id: crypto.randomUUID(),
        name: selectedEffect.name,
        type: selectedEffect.type as 'filter' | 'transition',
        ...selectedEffect.raw
      }
      const mediaId = crypto.randomUUID()
      addMedia([
        {
          id: mediaId,
          name: selectedEffect.name,
          type: 'effect',
          path: '',
          thumbnail: selectedEffect.thumbnail,
          duration: 5,
          effect: fx
        }
      ])
    } else {
      const mediaId = crypto.randomUUID()
      addMedia([
        {
          id: mediaId,
          name: selectedEffect.name,
          type: selectedEffect.type === 'overlay' ? 'video' : 'image',
          path: selectedEffect.url || '',
          thumbnail: selectedEffect.thumbnail,
          duration: selectedEffect.duration || 5
        }
      ])
    }
  }
  return (
    <div className="vfxbrowsermodal-style-1">
      <div className="vfxbrowsermodal-style-2">
        {/* Header */}
        <div className="vfxbrowsermodal-style-3">
          <div className="vfxbrowsermodal-style-4">
            <h2 className="vfxbrowsermodal-style-5">Visual FX Browser</h2>
            <div className="vfxbrowsermodal-style-6">
              <button
                onClick={() => {
                  setActiveTab('effects')
                  setSelectedEffect(null)
                  setSearch('')
                }}
                className={`vfxbrowsermodal-style-7 tab-btn ${activeTab === 'effects' ? 'active' : ''}`}
              >
                <Wand2 size={14} /> Filters & FX
              </button>
              <button
                onClick={() => {
                  setActiveTab('overlays')
                  setSelectedEffect(null)
                  setSearch('')
                }}
                className={`vfxbrowsermodal-style-8 tab-btn ${activeTab === 'overlays' ? 'active' : ''}`}
              >
                <Video size={14} /> Pixabay Overlays
              </button>
              <button
                onClick={() => {
                  setActiveTab('stickers')
                  setSelectedEffect(null)
                  setSearch('')
                }}
                className={`vfxbrowsermodal-style-9 tab-btn ${activeTab === 'stickers' ? 'active' : ''}`}
              >
                <ImageIcon size={14} /> Giphy Stickers
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="vfxbrowsermodal-style-10"
            title="Close"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="vfxbrowsermodal-style-11">
          {/* Column 1: Saved Categories (250px) */}
          <div className="vfxbrowsermodal-style-12">
            <div className="vfxbrowsermodal-style-13">
              <div className="vfxbrowsermodal-style-14">SAVED CATEGORIES</div>
              <div className="vfxbrowsermodal-style-15">
                <input
                  type="text"
                  placeholder="New category..."
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategory.trim()) {
                      addVfxCategory(newCategory.trim())
                      setNewCategory('')
                    }
                  }}
                  className="vfxbrowsermodal-style-16"
                />
                <button
                  onClick={() => {
                    if (newCategory.trim()) {
                      addVfxCategory(newCategory.trim())
                      setNewCategory('')
                    }
                  }}
                  className="vfxbrowsermodal-style-17"
                  title="Add Category"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="vfxbrowsermodal-style-18">
              {safeCategories.map((cat) => (
                <div key={cat} className="vfxbrowsermodal-style-19">
                  <button
                    onClick={() => {
                      setSearch(cat)
                      if (activeTab !== 'effects') handleCloudSearch(cat)
                    }}
                    className={`vfxbrowsermodal-style-20 cat-btn ${search.toLowerCase() === cat.toLowerCase() ? 'active' : ''}`}
                  >
                    {cat}
                  </button>
                  <button
                    onClick={() => removeVfxCategory(cat)}
                    className="vfxbrowsermodal-style-21"
                    title="Remove Category"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Search & Results List (300px) */}
          <div className="vfxbrowsermodal-style-22">
            <div className="vfxbrowsermodal-style-23">
              <form onSubmit={handleSearchSubmit} className="vfxbrowsermodal-style-24">
                <Search size={14} className="vfxbrowsermodal-style-25" />
                <input
                  type="text"
                  placeholder={activeTab === 'effects' ? 'Search filters...' : 'Search cloud...'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="vfxbrowsermodal-style-26"
                />
                {activeTab !== 'effects' && (
                  <select
                    title="Orientation"
                    aria-label="Orientation Filter"
                    value={orientationFilter}
                    onChange={(e) => setOrientationFilter(e.target.value)}
                    className="vfxbrowsermodal-filter-select"
                  >
                    <option value="all">Any</option>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                    <option value="square">Square</option>
                  </select>
                )}
                {activeTab !== 'effects' && (
                  <button type="submit" className="vfxbrowsermodal-filter-btn">
                    Search
                  </button>
                )}
              </form>
            </div>
            <div className="vfxbrowsermodal-style-28">
              {activeTab === 'effects' && isLoadingTransitions && (
                <div className="vfxbrowsermodal-style-29">Loading Cloud Transitions...</div>
              )}
              {activeTab !== 'effects' && isSearchingCloud && (
                <div className="vfxbrowsermodal-style-30">
                  <Loader2 size={24} className="spin vfxbrowsermodal-style-31" />
                  <div>Searching...</div>
                </div>
              )}
              {cloudError && <div className="vfxbrowsermodal-style-32">{cloudError}</div>}

              {!isSearchingCloud &&
                displayedList.map((fx) => (
                  <div
                    key={fx.id}
                    onClick={() => setSelectedEffect(fx)}
                    className={`vfxbrowsermodal-style-33 list-item ${selectedEffect?.id === fx.id ? 'active' : ''}`}
                  >
                    {fx.type === 'overlay' ? (
                      fx.url ? (
                        <video
                          src={`${fx.url}#t=0.1`}
                          preload="metadata"
                          muted
                          playsInline
                          className="vfxbrowsermodal-style-34"
                        />
                      ) : (
                        <div className="vfxbrowsermodal-style-34 flex items-center justify-center bg-gray-900 text-gray-500">
                          No Preview
                        </div>
                      )
                    ) : fx.thumbnail ? (
                      <EffectThumbnail
                        src={fx.thumbnail}
                        alt="Effect thumbnail"
                        cssFilter={(fx.raw as VisualEffect)?.cssFilter}
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                          ;(e.target as HTMLImageElement).parentElement!.style.backgroundColor =
                            'var(--color-bg-darkest)'
                        }}
                        className="vfxbrowsermodal-style-35"
                      />
                    ) : (
                      <div className="vfxbrowsermodal-style-36">
                        {fx.type === 'transition' ? (
                          <ArrowRight size={16} color="var(--color-text-secondary)" />
                        ) : (
                          <Wand2 size={16} color="var(--color-text-secondary)" />
                        )}
                      </div>
                    )}
                    <div className="vfxbrowsermodal-style-37">
                      <div className="vfxbrowsermodal-style-38">{fx.name}</div>
                      <div className="vfxbrowsermodal-style-39">{fx.type}</div>
                    </div>
                  </div>
                ))}
              {!isSearchingCloud && displayedList.length === 0 && search && (
                <div className="vfxbrowsermodal-style-40">No results found.</div>
              )}
            </div>
          </div>

          {/* Column 3: Preview Panel (Flex 1) */}
          <div className="vfxbrowsermodal-style-41">
            {selectedEffect ? (
              <div className="vfxbrowsermodal-style-42">
                <h3 className="vfxbrowsermodal-style-43">{selectedEffect.name}</h3>
                <p className="vfxbrowsermodal-style-44">{selectedEffect.type}</p>

                {/* Preview Window */}
                <div className="vfxbrowsermodal-style-45">
                  {activeTab === 'effects' ? (
                    <>
                      {selectedEffect.type === 'transition' && (
                        <div className="vfxbrowsermodal-style-46" />
                      )}
                      <PreviewBox
                        cssFilter={(selectedEffect.raw as VisualEffect)?.cssFilter}
                        className={`vfxbrowsermodal-style-47 preview-box ${
                          selectedEffect.type === 'transition'
                            ? `tx-${(selectedEffect.raw as VisualEffect)?.glTransitionId || 'fade'}`
                            : ''
                        }`}
                      />
                    </>
                  ) : (
                    <>
                      {/* Show a background image so user can see how overlays look */}
                      <div className="vfxbrowsermodal-style-48" />

                      {selectedEffect.type === 'overlay' ? (
                        <video
                          src={selectedEffect.url}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="vfxbrowsermodal-style-49"
                        />
                      ) : (
                        <img
                          src={selectedEffect.url}
                          alt="Overlay preview"
                          className="vfxbrowsermodal-style-50"
                        />
                      )}
                    </>
                  )}
                </div>

                <div className="vfxbrowsermodal-style-51">
                  <button onClick={onClose} className="vfxbrowsermodal-style-52">
                    Cancel
                  </button>
                  <button onClick={handleAdd} className="vfxbrowsermodal-style-53">
                    <Plus size={16} /> Add to Library
                  </button>
                </div>
              </div>
            ) : (
              <div className="vfxbrowsermodal-style-54">Select an item to preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
