/* eslint-disable */
import './AudioBrowserModal.css'
import React, { useState, useRef, useEffect } from 'react'
import { X, Search, Play, Pause, Plus, AlertCircle, Music, Zap, Check } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
interface FreesoundHit {
  id: number
  name: string
  tags: string[]
  duration: number
  username: string
  license: string
  previews: {
    'preview-hq-mp3': string
  }
}
interface JamendoHit {
  id: string
  name: string
  duration: number
  artist_name: string
  image: string
  audio: string
  audiodownload: string
  license_ccurl?: string
}
export function AudioBrowserModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'sfx' | 'music'>('sfx')
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState<string | number | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [sfxResults, setSfxResults] = useState<FreesoundHit[]>([])
  const [musicResults, setMusicResults] = useState<JamendoHit[]>([])
  const hasAutoSearchedSfx = useRef(false)
  const hasAutoSearchedMusic = useRef(false)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadedItems, setDownloadedItems] = useState<Set<string | number>>(new Set())
  const { addMedia, aiKeys, audioCategories, addAudioCategory, removeAudioCategory } =
    useProjectStore()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const freesoundKey = aiKeys.freesound
  const jamendoKey = aiKeys.jamendo
  useEffect(() => {
    // Cleanup audio on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])
  const handleSearch = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault()
    if (activeTab === 'sfx') {
      if (!freesoundKey) {
        setError('Please add your Freesound API key in Settings first.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const cleanToken = encodeURIComponent(freesoundKey.trim())
        const res = await fetch(
          `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(search)}&token=${cleanToken}&fields=id,name,tags,previews,duration,username,license`
        )
        if (!res.ok) {
          const errorText = await res.text()
          throw new Error(`API returned ${res.status}: ${errorText}`)
        }
        const data = await res.json()
        setSfxResults(data.results || [])
      } catch (err: any) {
        setError(`Freesound Error: ${err.message || 'Network failure'}`)
      } finally {
        setLoading(false)
      }
    } else {
      // Jamendo Music
      if (!jamendoKey) {
        setError('Please add your Jamendo Client ID in Settings first.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoKey}&format=json&limit=20&search=${encodeURIComponent(search)}`
        )
        if (!res.ok) {
          const errorText = await res.text()
          throw new Error(`API returned ${res.status}: ${errorText}`)
        }
        const data = await res.json()
        setMusicResults(data.results || [])
      } catch (err: any) {
        setError(`Jamendo Error: ${err.message || 'Network failure'}`)
      } finally {
        setLoading(false)
      }
    }
  }

  // Auto-search on tab switch if they have a key and haven't searched yet
  useEffect(() => {
    if (activeTab === 'sfx' && freesoundKey && !hasAutoSearchedSfx.current && search) {
      hasAutoSearchedSfx.current = true
      setTimeout(() => {
        handleSearch()
      }, 0)
    } else if (activeTab === 'music' && jamendoKey && !hasAutoSearchedMusic.current && search) {
      hasAutoSearchedMusic.current = true
      setTimeout(() => {
        handleSearch()
      }, 0)
    }
  }, [activeTab, freesoundKey, jamendoKey, search])
  const playUrl = (id: string | number, url: string): void => {
    // If clicking the same track that is already playing or buffering
    if (playingId === id) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src') // Force stop loading
        audioRef.current.load()
      }
      setPlayingId(null)
      setCurrentTime(0)
      return
    }

    // Stop currently playing track
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }

    // Synchronously set state and ref to prevent race conditions
    const newAudio = new Audio(url)
    audioRef.current = newAudio
    setPlayingId(id)
    setCurrentTime(0)
    newAudio.addEventListener('timeupdate', () => {
      if (audioRef.current === newAudio) {
        setCurrentTime(newAudio.currentTime)
      }
    })
    newAudio
      .play()
      .then(() => {
        newAudio.onended = () => {
          if (audioRef.current === newAudio) {
            setPlayingId(null)
            setCurrentTime(0)
          }
        }
      })
      .catch(() => {
        // Only show error and clear state if this is still the active audio
        if (audioRef.current === newAudio) {
          setError('Playback failed. Stream might be blocked or unavailable.')
          setPlayingId(null)
          setCurrentTime(0)
        }
      })
  }
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }
  const handleAddSfx = (audio: FreesoundHit): void => {
    if (!audio.previews || !audio.previews['preview-hq-mp3']) return

    let attribution: string | undefined = undefined
    if (audio.license && !audio.license.toLowerCase().includes('zero')) {
      attribution = `Sound by ${audio.username || 'Creator'} on Freesound.org (${audio.license})`
    }

    addMedia([
      {
        id: `freesound-${audio.id}`,
        path: audio.previews['preview-hq-mp3'],
        name: audio.name || 'Audio Track',
        type: 'audio',
        duration: Math.round(audio.duration),
        attribution
      }
    ])
    
    setDownloadedItems(prev => new Set(prev).add(audio.id))
  }
  const handleAddMusic = (track: JamendoHit): void => {
    if (!track.audio) return

    let attribution: string | undefined = undefined
    if (track.license_ccurl && !track.license_ccurl.includes('publicdomain')) {
      attribution = `Music by ${track.artist_name || 'Artist'} from Jamendo (CC BY)`
    } else if (!track.license_ccurl) {
      attribution = `Music by ${track.artist_name || 'Artist'} from Jamendo`
    }

    addMedia([
      {
        id: `jamendo-${track.id}`,
        path: track.audio,
        name: track.name || 'Music Track',
        type: 'audio',
        duration: track.duration,
        thumbnail: track.image,
        attribution
      }
    ])
    
    setDownloadedItems(prev => new Set(prev).add(track.id))
  }
  const handleCategoryClick = (category: string): void => {
    setSearch(category)
    // We defer the search slightly to ensure state is updated
    setTimeout(() => {
      // Create a synthetic event or just call search directly if we modify handleSearch to not strictly require an event
      // We'll simulate form submission by passing undefined
      const fakeEvent = {
        preventDefault: () => {}
      } as React.FormEvent
      handleSearch(fakeEvent)
    }, 50)
  }
  const handleAddCategorySubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (newCategory.trim()) {
      addAudioCategory(activeTab, newCategory.trim())
      setNewCategory('')
      setIsAddingCategory(false)
    }
  }
  return (
    <div className="abm-style-1">
      <div className="abm-style-2">
        {/* Header */}
        <div className="abm-style-3">
          <h2 className="abm-style-4"> Audio Library</h2>
          <button
            onClick={onClose}
            title="Close Modal"
            aria-label="Close Modal"
            className="abm-style-5"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="abm-style-6">
          <button
            onClick={() => setActiveTab('sfx')}
            className={`abm-style-7 ${activeTab === 'sfx' ? 'abm-tab-active' : 'abm-tab-inactive'}`}
          >
            <Zap size={16} /> Sound FX (Freesound)
          </button>
          <button
            onClick={() => setActiveTab('music')}
            className={`abm-style-8 ${activeTab === 'music' ? 'abm-tab-active' : 'abm-tab-inactive'}`}
          >
            <Music size={16} /> Music (Jamendo)
          </button>
        </div>

        {/* Split Pane Content */}
        <div className="abm-style-9">
          {' '}
          {/* Left Sidebar (Categories) */}
          <div className="abm-style-10">
            <div className="abm-style-11">
              Saved {activeTab === 'sfx' ? 'FX Categories' : 'Music Genres'}
            </div>

            <div className="abm-style-12">
              {(audioCategories[activeTab] || []).map((category) => (
                <div key={category} className="abm-style-13">
                  <button onClick={() => handleCategoryClick(category)} className="abm-style-14">
                    {category}
                  </button>
                  <button
                    onClick={() => removeAudioCategory(activeTab, category)}
                    title="Remove Category"
                    aria-label="Remove Category"
                    className="abm-style-15"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              {isAddingCategory ? (
                <form onSubmit={handleAddCategorySubmit} className="abm-style-16">
                  {' '}
                  <input
                    autoFocus
                    type="text"
                    placeholder="E.g., Jazz, Cinematic"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onBlur={() => setIsAddingCategory(false)}
                    className={`abm-style-17 ${activeTab === 'sfx' ? 'abm-tab-active' : 'abm-tab-inactive'}`}
                  />
                </form>
              ) : (
                <button
                  onClick={() => setIsAddingCategory(true)}
                  className={`abm-style-18 ${activeTab === 'music' ? 'abm-tab-active' : 'abm-tab-inactive'}`}
                >
                  <Plus size={14} /> Add Category
                </button>
              )}
            </div>
          </div>
          {/* Right Main Area */}
          <div className="abm-style-19">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="abm-style-20">
              <div className="abm-style-21">
                {' '}
                <div className="abm-style-22">
                  {' '}
                  <Search
                    size={14}
                    className={`abm-style-23 ${search.length > 0 ? 'abm-cat-active' : 'abm-cat-inactive'}`}
                  />
                  <input
                    type="text"
                    placeholder={
                      activeTab === 'sfx'
                        ? "Search sound effects (e.g., 'whoosh', 'impact')..."
                        : "Search indie music (e.g., 'cinematic', 'industrial')..."
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="abm-style-24"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`abm-style-25 ${search.length > 0 ? 'abm-cat-btn-active' : 'abm-cat-btn-inactive'}`}
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>
            </form>

            {/* Results Area */}
            <div className="abm-style-26">
              {/* Missing Keys Warnings */}
              {activeTab === 'sfx' && !freesoundKey && (
                <div className="abm-style-27">
                  <AlertCircle size={32} color="var(--color-text-muted)" />
                  <div className="abm-style-28"> Freesound API Key Required</div>
                  <div className="abm-style-29">
                    Please add your free Freesound API key in the App Settings to browse and
                    download real sound effects.
                  </div>
                </div>
              )}
              {activeTab === 'music' && !jamendoKey && (
                <div className="abm-style-30">
                  <AlertCircle size={32} color="var(--color-text-muted)" />
                  <div className="abm-style-31"> Jamendo Client ID Required</div>
                  <div className={`abm-style-32 ${loading ? 'abm-loading' : 'abm-not-loading'}`}>
                    Please add your free Jamendo Client ID in the App Settings to browse and
                    download real music tracks.
                  </div>
                </div>
              )}

              {error && <div className="abm-style-33">{error}</div>}

              {/* Empty States */}
              {!error &&
                !loading &&
                ((activeTab === 'sfx' && freesoundKey && sfxResults.length === 0 && search) ||
                  (activeTab === 'music' && jamendoKey && musicResults.length === 0 && search)) && (
                  <div className="abm-style-34">No audio found. Try a different search!</div>
                )}

              {/* Sound FX Results */}
              {activeTab === 'sfx' &&
                freesoundKey &&
                !error &&
                sfxResults.map((audio) => (
                  <div key={audio.id} className="abm-style-35">
                    <div className="abm-style-36">
                      <button
                        title="Play Preview"
                        aria-label="Play Preview"
                        onClick={() =>
                          audio.previews && audio.previews['preview-hq-mp3']
                            ? playUrl(audio.id, audio.previews['preview-hq-mp3'])
                            : null
                        }
                        className="abm-style-37"
                      >
                        {playingId === audio.id ? (
                          <Pause
                            size={14}
                            fill="var(--color-bg-darkest)"
                            color="var(--color-bg-darkest)"
                          />
                        ) : (
                          <Play
                            size={14}
                            fill="var(--color-bg-darkest)"
                            color="var(--color-bg-darkest)"
                            className="abm-style-38"
                          />
                        )}
                      </button>
                      <div className="abm-style-39">
                        {' '}
                        <div
                          className={`abm-style-40 ${!audio.previews || !audio.previews['preview-hq-mp3'] ? 'abm-disabled' : 'abm-enabled'}`}
                        >
                          <div className="abm-style-41">{audio.name || 'Audio Track'}</div>
                          {playingId === audio.id && (
                            <div className="abm-style-42">
                              {' '}
                              {Math.floor(currentTime / 60)}:
                              {(Math.floor(currentTime) % 60).toString().padStart(2, '0')} /{' '}
                              {Math.floor(audio.duration / 60)}:
                              {(Math.round(audio.duration) % 60).toString().padStart(2, '0')}
                            </div>
                          )}
                        </div>
                        {playingId === audio.id ? (
                          <div
                            className={`abm-style-43 ${!audio.previews || !audio.previews['preview-hq-mp3'] ? 'abm-disabled' : 'abm-enabled'}`}
                          >
                            {' '}
                            <input
                              type="range"
                              title="Seek Preview"
                              aria-label="Seek Preview"
                              min="0"
                              max={audio.duration}
                              step="0.1"
                              value={currentTime}
                              onChange={handleSeek}
                              className="abm-style-44"
                            />
                          </div>
                        ) : (
                          <div className="abm-style-45">
                            <span>{Math.round(audio.duration)}s</span>
                            {audio.tags && audio.tags.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="abm-style-46">
                                  {' '}
                                  {audio.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="abm-style-47">
                                      {tag}
                                    </span>
                                  ))}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      title="Add to Timeline"
                      aria-label="Add to Timeline"
                      onClick={() => handleAddSfx(audio)}
                      disabled={!audio.previews || !audio.previews['preview-hq-mp3'] || downloadedItems.has(audio.id)}
                      className={`abm-style-48 ${!audio.previews || !audio.previews['preview-hq-mp3'] ? 'abm-disabled' : 'abm-enabled'}`}
                    >
                      {downloadedItems.has(audio.id) ? (
                        <>
                          <Check size={14} /> Downloaded
                        </>
                      ) : (
                        <>
                          <Plus size={14} /> Add
                        </>
                      )}
                    </button>
                  </div>
                ))}

              {/* Music Results */}
              {activeTab === 'music' &&
                jamendoKey &&
                !error &&
                musicResults.map((track) => (
                  <div key={track.id} className="abm-style-49">
                    <div className="abm-style-50">
                      {/* Album Art overlay with Play Button */}
                      <div
                        className={`abm-style-51 ${!track.audio ? 'abm-disabled' : 'abm-enabled'}`}
                      >
                        <div className="abm-style-52" />
                        <button
                          title="Play Preview"
                          aria-label="Play Preview"
                          onClick={() => (track.audio ? playUrl(track.id, track.audio) : null)}
                          className="abm-style-53"
                        >
                          {playingId === track.id ? (
                            <Pause size={20} fill="white" color="white" />
                          ) : (
                            <Play size={20} fill="white" color="white" />
                          )}
                        </button>
                      </div>

                      <div className="abm-style-54">
                        {' '}
                        <div className="abm-style-55">
                          <div className="abm-style-56">{track.name || 'Music Track'}</div>
                          {playingId === track.id && (
                            <div className="abm-style-57">
                              {' '}
                              {Math.floor(currentTime / 60)}:
                              {(Math.floor(currentTime) % 60).toString().padStart(2, '0')} /{' '}
                              {Math.floor(track.duration / 60)}:
                              {(Math.round(track.duration) % 60).toString().padStart(2, '0')}
                            </div>
                          )}
                        </div>
                        {playingId === track.id ? (
                          <div className="abm-style-58">
                            {' '}
                            <input
                              type="range"
                              title="Seek Preview"
                              aria-label="Seek Preview"
                              min="0"
                              max={track.duration}
                              step="0.1"
                              value={currentTime}
                              onChange={handleSeek}
                              className="abm-style-59"
                            />
                          </div>
                        ) : (
                          <div className="abm-style-60">
                            <span>{track.artist_name}</span>
                            <span>•</span>
                            <span>
                              {Math.floor(track.duration / 60)}:
                              {(track.duration % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      title="Add to Timeline"
                      aria-label="Add to Timeline"
                      onClick={() => handleAddMusic(track)}
                      disabled={!track.audio || downloadedItems.has(track.id)}
                      className="abm-style-61"
                    >
                      {downloadedItems.has(track.id) ? (
                        <>
                          <Check size={14} /> Downloaded
                        </>
                      ) : (
                        <>
                          <Plus size={14} /> Add
                        </>
                      )}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
