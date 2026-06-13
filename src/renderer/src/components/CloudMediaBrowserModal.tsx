/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react'
import './CloudMediaBrowserModal.css'
import { X, Search, Video, Image as ImageIcon, Loader2, Download } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
export function CloudMediaBrowserModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'video' | 'stickers'>('video')
  const [search, setSearch] = useState('nature')
  const [orientation, setOrientation] = useState('all')

  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { aiKeys, addMedia } = useProjectStore()
  const handleSearch = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault()
    if (!search.trim()) return
    setLoading(true)
    setError(null)
    setResults([])
    try {
      if (activeTab === 'video') {
        if (!aiKeys?.pixabay) {
          setError('Please add a Pixabay API Key in Settings first.')
          setLoading(false)
          return
        }
        const res = await fetch(
          `https://pixabay.com/api/videos/?key=${aiKeys.pixabay}&q=${encodeURIComponent(search)}&per_page=100`
        )
        if (!res.ok) throw new Error('Pixabay API error: ' + res.statusText)
        const data = await res.json()
        let hits = data.hits || []
        if (orientation !== 'all') {
          hits = hits.filter((hit: any) => {
            const w = hit.videos?.tiny?.width || 1
            const h = hit.videos?.tiny?.height || 1
            const ratio = w / h
            if (orientation === 'landscape') return ratio > 1.1
            if (orientation === 'portrait') return ratio < 0.9
            if (orientation === 'square') return ratio >= 0.9 && ratio <= 1.1
            return true
          })
        }
        setResults(hits.slice(0, 30))
      } else {
        if (!aiKeys?.giphy) {
          setError('Please add a Giphy API Key in Settings first.')
          setLoading(false)
          return
        }
        const res = await fetch(
          `https://api.giphy.com/v1/stickers/search?api_key=${aiKeys.giphy}&q=${encodeURIComponent(search)}&limit=100`
        )
        if (!res.ok) throw new Error('Giphy API error: ' + res.statusText)
        const data = await res.json()
        let hits = data.data || []
        if (orientation !== 'all') {
          hits = hits.filter((hit: any) => {
            const w = parseInt(hit.images?.original?.width || '1', 10)
            const h = parseInt(hit.images?.original?.height || '1', 10)
            const ratio = w / h
            if (orientation === 'landscape') return ratio > 1.1
            if (orientation === 'portrait') return ratio < 0.9
            if (orientation === 'square') return ratio >= 0.9 && ratio <= 1.1
            return true
          })
        }
        setResults(hits.slice(0, 30))
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddMedia = (item: any): void => {
    let url = ''
    let name = ''
    let type: 'video' | 'image' = 'video'
    let duration = 5
    if (activeTab === 'video') {
      url = item.videos.tiny.url
      name = item.tags.split(',')[0] + ' Video'
      type = 'video'
      duration = item.duration
    } else {
      url = item.images.original.url
      name = item.title || 'Sticker'
      type = 'image'
    }
    addMedia([
      {
        id: crypto.randomUUID(),
        name,
        type,
        path: url,
        duration
      }
    ])
    onClose()
  }
  return (
    <div className="cloudmediabrowsermodal-style-1">
      <div className="cloudmediabrowsermodal-style-2">
        {/* Header */}
        <div className="cloudmediabrowsermodal-style-3">
          <div className="cloudmediabrowsermodal-style-4">
            <h2 className="cloudmediabrowsermodal-style-5">Cloud Media Library</h2>
            <div className="cloudmediabrowsermodal-style-6">
              <button
                onClick={() => {
                  setActiveTab('video')
                  setResults([])
                  setError(null)
                }}
                className={`cloudmediabrowsermodal-style-7 tab-btn ${activeTab === 'video' ? 'active' : ''}`}
              >
                <Video size={14} /> Pixabay Video
              </button>
              <button
                onClick={() => {
                  setActiveTab('stickers')
                  setResults([])
                  setError(null)
                }}
                className={`cloudmediabrowsermodal-style-8 tab-btn ${activeTab === 'stickers' ? 'active' : ''}`}
              >
                <ImageIcon size={14} /> Giphy Stickers
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cloudmediabrowsermodal-style-9"
            title="Close"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="cloudmediabrowsermodal-style-10">
          <form onSubmit={handleSearch} className="cloudmediabrowsermodal-style-11">
            <Search size={18} className="cloudmediabrowsermodal-style-12" />
            <input
              type="text"
              placeholder={
                activeTab === 'video'
                  ? 'Search for stock video clips...'
                  : 'Search for animated stickers...'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="cloudmediabrowsermodal-style-13"
            />
            <select
              title="Orientation"
              aria-label="Orientation Filter"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
              className="cloudmediabrowsermodal-filter-select"
            >
              <option value="all">Any Orientation</option>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
              <option value="square">Square</option>
            </select>
            <button type="submit" disabled={loading} className="cloudmediabrowsermodal-style-14">
              Search
            </button>
          </form>
        </div>

        {/* Content Area */}
        <div className="cloudmediabrowsermodal-style-15">
          {error && <div className="cloudmediabrowsermodal-style-16">{error}</div>}

          {loading ? (
            <div className="cloudmediabrowsermodal-style-17">
              <Loader2 size={32} className="spin cloudmediabrowsermodal-style-18" />
              <p>Searching the cloud...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="cloudmediabrowsermodal-style-19">
              {results.map((item: any) => (
                <div key={item.id} className="cloudmediabrowsermodal-style-20">
                  <div className="cloudmediabrowsermodal-style-21">
                    {activeTab === 'video' ? (
                      <video
                        src={item.videos.tiny.url}
                        onMouseOver={(e) => e.currentTarget.play()}
                        onMouseOut={(e) => {
                          e.currentTarget.pause()
                          e.currentTarget.currentTime = 0
                        }}
                        loop
                        muted
                        playsInline
                        className="cloudmediabrowsermodal-style-22"
                      />
                    ) : (
                      <img
                        src={item.images.fixed_height.url}
                        className="cloudmediabrowsermodal-style-23"
                        alt="Giphy sticker"
                        title="Giphy sticker"
                      />
                    )}
                  </div>
                  <div className="cloudmediabrowsermodal-style-24">
                    <div className="cloudmediabrowsermodal-style-25">
                      <div className="cloudmediabrowsermodal-style-26">
                        {activeTab === 'video' ? item.tags : item.title || 'Sticker'}
                      </div>
                      <div className="cloudmediabrowsermodal-style-27">
                        {activeTab === 'video'
                          ? `${item.duration}s • ${(item.videos.tiny.size / 1024 / 1024).toFixed(1)}MB`
                          : 'GIF Sticker'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddMedia(item)}
                      className="cloudmediabrowsermodal-style-28"
                    >
                      <Download size={14} /> Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cloudmediabrowsermodal-style-29">
              Enter a search term to find media.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
