import React, { useState } from 'react'
import './EffectsPalette.css'
import { useProjectStore } from '../store/projectStore'
import { useShallow } from 'zustand/react/shallow'
import { calculateKenBurnsTransform } from '../lib/kenBurns'
import { Plus, Trash2, Wand2, ArrowRight, BrainCircuit, Loader2 } from 'lucide-react'
import { VFXBrowserModal } from './VFXBrowserModal'
import { analyzeSubjectForKenBurns } from '../lib/gemini'
import { fileToBase64 } from '../lib/contextBridge'
export function EffectsPalette(): React.ReactElement | null {
  const {
    selectedClipId,
    activeKeyframeId,
    setActiveKeyframeId,
    clips,
    mediaLibrary,
    addKenBurnsKeyframe,
    removeKenBurnsKeyframe,
    updateKenBurnsKeyframe,
    updateKenBurnsEffect,
    removeVisualEffect,
    aiKeys
  } = useProjectStore(
    useShallow((s) => ({
      selectedClipId: s.selectedClipId,
      activeKeyframeId: s.activeKeyframeId,
      setActiveKeyframeId: s.setActiveKeyframeId,
      clips: s.clips,
      mediaLibrary: s.mediaLibrary,
      addKenBurnsKeyframe: s.addKenBurnsKeyframe,
      removeKenBurnsKeyframe: s.removeKenBurnsKeyframe,
      updateKenBurnsKeyframe: s.updateKenBurnsKeyframe,
      updateKenBurnsEffect: s.updateKenBurnsEffect,
      removeVisualEffect: s.removeVisualEffect,
      aiKeys: s.aiKeys
    }))
  )
  const [showVFXBrowser, setShowVFXBrowser] = useState(false)
  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false)
  const selectedClip = clips.find((c) => c.id === selectedClipId)
  const selectedMedia = selectedClip
    ? mediaLibrary.find((m) => m.id === selectedClip.mediaId)
    : null
  const selectedTrack = selectedClip
    ? useProjectStore.getState().tracks.find((t) => t.id === selectedClip.trackId)
    : null
  const effect = selectedClip?.kenBurnsEffect
  if (!selectedClip) {
    return (
      <div className="panel panel-b-effects effectspalette-style-1">
        <div className="effectspalette-style-2">
          <div>
            <div className="effectspalette-style-3">EFFECTS PALETTE</div>
            <div className="effectspalette-style-4">Global Effects</div>
          </div>
          <button onClick={() => setShowVFXBrowser(true)} className="effectspalette-style-5">
            <Plus size={12} /> Add Effect
          </button>
        </div>
        <div className="effectspalette-style-6">
          <div className="effectspalette-style-7">
            <div className="effectspalette-style-8">
              Select a clip to edit its specific properties,
            </div>
            <div className="effectspalette-style-9">
              or click Add Effect to drop a global overlay/filter.
            </div>
          </div>
        </div>
        {showVFXBrowser && <VFXBrowserModal onClose={() => setShowVFXBrowser(false)} />}
      </div>
    )
  }

  // Effect clips don't have media
  const isEffectClip = selectedClip.mediaId === ''
  const displayMedia = isEffectClip ? null : mediaLibrary.find((m) => m.id === selectedClip.mediaId)
  const keyframes = effect?.keyframes || []
  const handleAddKeyframe = (): void => {
    const playhead = useProjectStore.getState().playhead
    const time = Math.max(0, Math.min(selectedClip.duration, playhead - selectedClip.startTime))
    let newX = 0,
      newY = 0,
      newZoom = 1
    if (effect && keyframes.length > 0) {
      const currentTransform = calculateKenBurnsTransform(effect, time)
      newX = currentTransform.x
      newY = currentTransform.y
      newZoom = currentTransform.zoom
    }
    const newId = crypto.randomUUID()
    addKenBurnsKeyframe(selectedClip.id, {
      id: newId,
      time,
      x: newX,
      y: newY,
      zoom: newZoom
    })
    setActiveKeyframeId(newId)
  }
  const handleAutoMode = async (): Promise<void> => {
    if (!aiKeys?.gemini) {
      alert('Please add your Gemini API key in Settings to use Auto Mode!')
      return
    }
    setIsAutoAnalyzing(true)
    try {
      if (!selectedMedia || !selectedMedia.path) throw new Error('No media path')
      const b64 = await fileToBase64(selectedMedia.path)
      const subjects = await analyzeSubjectForKenBurns(b64)
      if (subjects && subjects.length >= 2) {
        const sub1 = subjects[0]
        const sub2 = subjects[1]

        // Convert from 0-100% to our -50 to 50 panning system
        const t1X = sub1.x - 50
        const t1Y = sub1.y - 50
        const t2X = sub2.x - 50
        const t2Y = sub2.y - 50

        // Remove existing keyframes
        for (const kf of keyframes) {
          removeKenBurnsKeyframe(selectedClip.id, kf.id)
        }
        const dur = selectedClip.duration

        // Keyframe 1: Start slightly zoomed in on Subject 1
        addKenBurnsKeyframe(selectedClip.id, {
          id: crypto.randomUUID(),
          time: 0,
          x: t1X * 0.8,
          y: t1Y * 0.8,
          zoom: 1.5
        })

        // Keyframe 2: Zoom in tighter on Subject 1
        addKenBurnsKeyframe(selectedClip.id, {
          id: crypto.randomUUID(),
          time: dur * 0.25,
          x: t1X,
          y: t1Y,
          zoom: 2.5
        })

        // Keyframe 3: Pan to Subject 2 and zoom out slightly
        addKenBurnsKeyframe(selectedClip.id, {
          id: crypto.randomUUID(),
          time: dur * 0.5,
          x: t2X,
          y: t2Y,
          zoom: 1.8
        })

        // Keyframe 4: Zoom out to a wider central view
        addKenBurnsKeyframe(selectedClip.id, {
          id: crypto.randomUUID(),
          time: dur * 0.75,
          x: (t1X + t2X) / 4,
          // Midpoint-ish, but closer to center
          y: (t1Y + t2Y) / 4,
          zoom: 1.2
        })

        // Keyframe 5: Fully zoomed out at the end
        const endId = crypto.randomUUID()
        addKenBurnsKeyframe(selectedClip.id, {
          id: endId,
          time: dur,
          x: 0,
          y: 0,
          zoom: 1.0
        })
        setActiveKeyframeId(endId)
      } else {
        alert('Gemini could not identify clear subjects.')
      }
    } catch (err) {
      console.error(err)
      alert('Auto Mode failed. Check console for details.')
    } finally {
      setIsAutoAnalyzing(false)
    }
  }
  return (
    <div className="panel panel-b-effects effectspalette-style-10">
      <div className="effectspalette-style-11">
        <div>
          <div className="effectspalette-style-12">EFFECTS PALETTE</div>
          <div className="effectspalette-style-13">
            {selectedClip.name || displayMedia?.name || 'Selected Clip'}
          </div>
        </div>
        <div className="effectspalette-style-14">
          {displayMedia && (
            <button onClick={() => setShowVFXBrowser(true)} className="effectspalette-style-16">
              <Wand2 size={12} /> Add Effect
            </button>
          )}
        </div>
      </div>

      <div className="effectspalette-style-17">
        {isEffectClip ? (
          <div className="effectspalette-style-18">
            Adjust this effect&apos;s length by dragging its edges in the timeline.
            {/* Future: expose effect-specific parameters here (e.g. blur radius) */}
          </div>
        ) : selectedTrack?.type === 'audio' ? (
          <AudioPropertiesPanel
            clipId={selectedClip.id}
            audioConfig={selectedClip.audioConfig}
            updateClip={useProjectStore.getState().updateClip}
          />
        ) : (
          <>
            {/* Render Generic VFX Effects */}
            {selectedClip.effects && selectedClip.effects.length > 0 && (
              <div className="effectspalette-style-19">
                {selectedClip.effects.map((fx) => (
                  <div key={fx.id} className="effectspalette-style-20">
                    <div className="effectspalette-style-21">
                      {fx.type === 'transition' ? (
                        <ArrowRight size={14} color="var(--color-accent)" />
                      ) : (
                        <Wand2 size={14} color="var(--color-text-secondary)" />
                      )}
                      <div>
                        <div className="effectspalette-style-22">{fx.name}</div>
                        <div className="effectspalette-style-23">{fx.type}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeVisualEffect(fx.id, selectedClip.id)}
                      className="effectspalette-style-24"
                      title="Delete Effect"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Ken Burns Section */}

            {/* Constrain Toggle for Ken Burns */}
            <div className="effectspalette-style-25">
              <div className="effectspalette-style-26">Ken Burns (Auto Pan/Zoom)</div>
              <div
                className="mode-toggle effectspalette-style-27"
                onClick={() =>
                  updateKenBurnsEffect(selectedClip.id, {
                    constrainToFrame: !effect?.constrainToFrame
                  })
                }
              >
                <div className={`toggle-track ${effect?.constrainToFrame !== false ? 'auto' : ''}`}>
                  <div className="toggle-thumb" />
                </div>
              </div>
            </div>

            <div className="effectspalette-style-28">
              <div className="effectspalette-style-29">Keyframes</div>
              <div className="effectspalette-style-30">
                <button
                  onClick={handleAutoMode}
                  disabled={isAutoAnalyzing || !aiKeys?.gemini}
                  title={
                    aiKeys?.gemini ? 'Auto-track subject with AI' : 'Add Gemini API Key in Settings'
                  }
                  className={`effectspalette-style-31 ${isAutoAnalyzing ? 'wait' : 'pointer'}`}
                >
                  {isAutoAnalyzing ? (
                    <Loader2 size={12} className="spin" />
                  ) : (
                    <BrainCircuit size={12} />
                  )}
                  {isAutoAnalyzing ? 'Scanning...' : 'Auto Mode'}
                </button>
                <button onClick={handleAddKeyframe} className="effectspalette-style-32">
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>

            {keyframes.length === 0 ? (
              <div className="effectspalette-style-33">
                No keyframes yet.
                <br />
                Add one to start panning and zooming.
              </div>
            ) : !activeKeyframeId || !keyframes.find((k) => k.id === activeKeyframeId) ? (
              <div className="effectspalette-style-34">
                Select a keyframe on the timeline
                <br />
                to edit its properties.
              </div>
            ) : (
              <div className="effectspalette-style-35">
                {(() => {
                  const kf = keyframes.find((k) => k.id === activeKeyframeId)!
                  const maxPan = effect?.constrainToFrame !== false ? 50 : 200
                  const index = [...keyframes]
                    .sort((a, b) => a.time - b.time)
                    .findIndex((k) => k.id === activeKeyframeId)
                  return (
                    <div className="effectspalette-style-36">
                      <div className="effectspalette-style-37">
                        <div className="effectspalette-style-38">
                          {index === 0 ? 'Start Keyframe' : `Keyframe ${index + 1}`}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeKenBurnsKeyframe(selectedClip.id, kf.id)
                            setActiveKeyframeId(null)
                          }}
                          title="Remove"
                          className="effectspalette-style-39"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="effectspalette-style-40">
                        {/* Time */}
                        <div className="effectspalette-style-41">
                          <label className="effectspalette-style-42">Time (s)</label>
                          <input
                            type="number"
                            title="Time"
                            min="0"
                            step="0.1"
                            value={kf.time}
                            onChange={(e) =>
                              updateKenBurnsKeyframe(selectedClip.id, kf.id, {
                                time: parseFloat(e.target.value) || 0
                              })
                            }
                            className="effectspalette-style-43"
                          />
                        </div>

                        {/* Zoom */}
                        <div className="effectspalette-style-44">
                          <label className="effectspalette-style-45">Zoom</label>
                          <input
                            type="range"
                            title="Zoom"
                            min={effect?.constrainToFrame !== false ? '1' : '0.1'}
                            max="5"
                            step="0.05"
                            value={kf.zoom}
                            onChange={(e) => {
                              const newZoom = parseFloat(e.target.value)
                              updateKenBurnsKeyframe(selectedClip.id, kf.id, {
                                zoom: newZoom
                              })
                            }}
                            className="effectspalette-style-46"
                          />
                          <span className="effectspalette-style-47">{kf.zoom.toFixed(2)}x</span>
                        </div>

                        {/* Pan X */}
                        <div className="effectspalette-style-48">
                          <label className="effectspalette-style-49">Pan X</label>
                          <input
                            type="range"
                            title="Pan X"
                            min={-maxPan}
                            max={maxPan}
                            step="0.5"
                            value={kf.x}
                            onChange={(e) =>
                              updateKenBurnsKeyframe(selectedClip.id, kf.id, {
                                x: parseFloat(e.target.value)
                              })
                            }
                            className="effectspalette-style-50"
                          />
                          <span className="effectspalette-style-51">{kf.x.toFixed(1)}%</span>
                        </div>

                        {/* Pan Y */}
                        <div className="effectspalette-style-52">
                          <label className="effectspalette-style-53">Pan Y</label>
                          <input
                            type="range"
                            title="Pan Y"
                            min={-maxPan}
                            max={maxPan}
                            step="0.5"
                            value={kf.y}
                            onChange={(e) =>
                              updateKenBurnsKeyframe(selectedClip.id, kf.id, {
                                y: parseFloat(e.target.value)
                              })
                            }
                            className="effectspalette-style-54"
                          />
                          <span className="effectspalette-style-55">{kf.y.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Video Properties Panel */}
            <VideoPropertiesPanel
              clipId={selectedClip.id}
              videoProperties={selectedClip.videoProperties}
              updateClip={useProjectStore.getState().updateClip}
            />
          </>
        )}
      </div>

      {showVFXBrowser && <VFXBrowserModal onClose={() => setShowVFXBrowser(false)} />}
    </div>
  )
}
const AudioPropertiesPanel = ({
  clipId,
  audioConfig,
  updateClip
}: {
  clipId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audioConfig: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateClip: any
}): React.ReactElement => {
  const config = audioConfig || {
    volume: 1,
    bass: 0,
    mid: 0,
    treble: 0,
    pan: 0,
    compression: false,
    reverb: false,
    noiseFilter: false
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (key: string, value: any): void => {
    updateClip(clipId, {
      audioConfig: {
        ...config,
        [key]: value
      }
    })
  }
  return (
    <div className="effectspalette-style-56">
      <div className="effectspalette-style-57">
        <div className="effectspalette-style-58">
          <span>Volume</span>
          <span>{Math.round(config.volume * 100)}%</span>
        </div>
        <input
          type="range"
          title="Adjust parameter"
          min="0"
          max="2"
          step="0.05"
          value={config.volume}
          onChange={(e) => update('volume', parseFloat(e.target.value))}
          className="effectspalette-style-59"
        />
      </div>

      <div className="effectspalette-style-60">
        <div className="effectspalette-style-61">
          <span>Stereo Panning</span>
          <span>
            {config.pan === 0
              ? 'Center'
              : config.pan < 0
                ? `L ${Math.round(-config.pan * 100)}`
                : `R ${Math.round(config.pan * 100)}`}
          </span>
        </div>
        <input
          type="range"
          title="Adjust parameter"
          min="-1"
          max="1"
          step="0.05"
          value={config.pan}
          onChange={(e) => update('pan', parseFloat(e.target.value))}
          className="effectspalette-style-62"
        />
      </div>

      <div className="effectspalette-style-63">3-Band Equalizer</div>

      <div className="effectspalette-style-64">
        <div className="effectspalette-style-65">
          <span>High (Treble)</span>
          <span>
            {config.treble > 0 ? '+' : ''}
            {config.treble} dB
          </span>
        </div>
        <input
          type="range"
          title="Adjust parameter"
          min="-12"
          max="12"
          step="1"
          value={config.treble}
          onChange={(e) => update('treble', parseInt(e.target.value))}
          className="effectspalette-style-66"
        />
      </div>

      <div className="effectspalette-style-67">
        <div className="effectspalette-style-68">
          <span>Midrange</span>
          <span>
            {config.mid > 0 ? '+' : ''}
            {config.mid} dB
          </span>
        </div>
        <input
          type="range"
          title="Adjust parameter"
          min="-12"
          max="12"
          step="1"
          value={config.mid}
          onChange={(e) => update('mid', parseInt(e.target.value))}
          className="effectspalette-style-69"
        />
      </div>

      <div className="effectspalette-style-70">
        <div className="effectspalette-style-71">
          <span>Low (Bass)</span>
          <span>
            {config.bass > 0 ? '+' : ''}
            {config.bass} dB
          </span>
        </div>
        <input
          type="range"
          title="Adjust parameter"
          min="-12"
          max="12"
          step="1"
          value={config.bass}
          onChange={(e) => update('bass', parseInt(e.target.value))}
          className="effectspalette-style-72"
        />
      </div>

      <div className="effectspalette-style-73">Processing</div>

      <div className="effectspalette-style-74">
        <div className="effectspalette-style-75">Dynamic Compression</div>
        <div
          className="mode-toggle effectspalette-style-76"
          onClick={() => update('compression', !config.compression)}
        >
          <div className={`toggle-track ${config.compression ? 'auto' : ''}`}>
            <div className="toggle-thumb" />
          </div>
        </div>
      </div>

      <div className="effectspalette-style-77">
        <div className="effectspalette-style-78">Noise Filter</div>
        <div
          className="mode-toggle effectspalette-style-79"
          onClick={() => update('noiseFilter', !config.noiseFilter)}
        >
          <div className={`toggle-track ${config.noiseFilter ? 'auto' : ''}`}>
            <div className="toggle-thumb" />
          </div>
        </div>
      </div>

      <div className="effectspalette-style-77">
        <div className="effectspalette-style-78">Reverb (Hall Echo)</div>
        <div
          className="mode-toggle effectspalette-style-79"
          onClick={() => update('reverb', !config.reverb)}
        >
          <div className={`toggle-track ${config.reverb ? 'auto' : ''}`}>
            <div className="toggle-thumb" />
          </div>
        </div>
      </div>
    </div>
  )
}

const VideoPropertiesPanel = ({
  clipId,
  videoProperties,
  updateClip
}: {
  clipId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoProperties: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateClip: any
}): React.ReactElement => {
  const config = videoProperties || {
    opacity: 1,
    grayscale: 0,
    sharpness: 0
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (key: string, value: any): void => {
    updateClip(clipId, {
      videoProperties: {
        ...config,
        [key]: value
      }
    })
  }

  return (
    <div className="effectspalette-style-56 effectspalette-style-80">
      <div className="effectspalette-style-29 effectspalette-style-81">Video Properties</div>

      <div className="effectspalette-style-57">
        <div className="effectspalette-style-58">
          <span>Opacity</span>
          <span>{Math.round(config.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          title="Adjust Opacity"
          min="0"
          max="1"
          step="0.01"
          value={config.opacity}
          onChange={(e) => update('opacity', parseFloat(e.target.value))}
          className="effectspalette-style-59"
        />
      </div>

      <div className="effectspalette-style-57">
        <div className="effectspalette-style-58">
          <span>Black & White</span>
          <span>{Math.round(config.grayscale)}%</span>
        </div>
        <input
          type="range"
          title="Adjust Grayscale"
          min="0"
          max="100"
          step="1"
          value={config.grayscale}
          onChange={(e) => update('grayscale', parseFloat(e.target.value))}
          className="effectspalette-style-59"
        />
      </div>
    </div>
  )
}
