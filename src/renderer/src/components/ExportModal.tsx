/* eslint-disable @typescript-eslint/no-explicit-any */
import './ExportModal.css'
import { useState, useRef, useEffect } from 'react'
import {
  X,
  Video,
  Smartphone,
  Monitor,
  Image,
  Loader2,
  CheckCircle,
  Copy,
  Send,
  RefreshCcw
} from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { ExportEngine } from './ExportEngine'
import { startSocialMediaPost, continueSocialMediaPost, SocialPostState } from '../lib/gemini'

export function ExportModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const { exportSettings, setExportSettings } = useProjectStore()
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressBarRef = useRef<HTMLDivElement>(null)

  // AI Copilot State
  const [generatePost, setGeneratePost] = useState(false)
  const [platform, setPlatform] = useState('TikTok')
  const [tone, setTone] = useState('Auto')
  const [videoTopic, setVideoTopic] = useState('')
  const [exportComplete, setExportComplete] = useState(false)
  const [aiState, setAiState] = useState<SocialPostState | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [editedPost, setEditedPost] = useState('')
  const [exportedFilePath, setExportedFilePath] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')

  // Dragging state
  const modalRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const currentPos = useRef({ x: 0, y: 0 })

  useEffect((): void => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progress}%`
    }
  }, [progress])

  const handleExport = async (): Promise<void> => {
    try {
      await window.electron.ipcRenderer.invoke('save-video-start')
      setIsExporting(true)
      setProgress(0)
      setExportComplete(false)
      setAiState(null)
      setEditedPost('')

      if (generatePost) {
        setIsGenerating(true)
        startSocialMediaPost(platform, tone, videoTopic)
          .then((state) => {
            setAiState(state)
            setEditedPost(state.currentPost)
            setIsGenerating(false)
          })
          .catch((err) => {
            console.error(err)
            setEditedPost('Failed to generate post. Check console or API key.')
            setIsGenerating(false)
          })
      }
    } catch (err) {
      console.error('Failed to initialize export stream:', err)
      setIsExporting(false)
    }
  }

  const handleExportChunk = async (chunk: Uint8Array): Promise<void> => {
    await window.electron.ipcRenderer.invoke('save-video-chunk', chunk)
  }

  const handleExportComplete = async (): Promise<void> => {
    try {
      const format = currentSettings.format
      const filePath = await window.electron.ipcRenderer.invoke(
        'save-video-finish',
        format,
        currentSettings.codec,
        currentSettings.quality,
        currentSettings.hwAccel
      )

      if (filePath) {
        setExportedFilePath(filePath)
        setExportComplete(true)
      } else {
        setIsExporting(false) // User canceled the save dialog
      }
    } catch (err) {
      console.error('Failed to save exported video:', err)
    }
  }

  const handleExportError = (err: Error): void => {
    console.error('Export failed', err)
    setIsExporting(false)
  }

  const handleSendChat = async (): Promise<void> => {
    if (!chatInput.trim() || !aiState) return
    const msg = chatInput
    setChatInput('')
    setIsGenerating(true)

    try {
      const newState = await continueSocialMediaPost(aiState.history, msg)
      setAiState(newState)
      setEditedPost(newState.currentPost)
    } catch (err) {
      console.error('Failed to continue chat:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerate = async (): Promise<void> => {
    setIsGenerating(true)
    setEditedPost('')
    try {
      const newState = await startSocialMediaPost(platform, tone, videoTopic)
      setAiState(newState)
      setEditedPost(newState.currentPost)
    } catch (err) {
      console.error('Failed to regenerate:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const aspectRatios = [
    { id: '16:9', name: 'YouTube / X / Standard', icon: <Monitor size={24} /> },
    { id: '9:16', name: 'TikTok / Facebook Reels / IG', icon: <Smartphone size={24} /> },
    { id: '4:5', name: 'Instagram / FB Post', icon: <Image size={24} /> },
    { id: '1:1', name: 'Square / X', icon: <Video size={24} /> }
  ]

  const getDims = (arId: string, res: number): string => {
    switch (arId) {
      case '16:9':
        return `${Math.round((res * 16) / 9)} x ${res}`
      case '9:16':
        return `${res} x ${Math.round((res * 16) / 9)}`
      case '4:5':
        return `${res} x ${Math.round((res * 5) / 4)}`
      case '1:1':
        return `${res} x ${res}`
      default:
        return `${res} x ${res}`
    }
  }

  const currentSettings = exportSettings || {
    format: 'mp4',
    codec: 'h264',
    quality: 'medium',
    hwAccel: true,
    aspectRatio: '9:16',
    resolution: 1080,
    fps: 30
  }

  return (
    <div
      className="modal-overlay exportmodal-style-1"
      onClick={!isExporting || exportComplete ? onClose : undefined}
    >
      {isExporting && !exportComplete && (
        <ExportEngine
          onProgress={setProgress}
          onChunk={handleExportChunk}
          onComplete={handleExportComplete}
          onError={handleExportError}
        />
      )}
      <div
        ref={modalRef}
        className={`modal-content exportmodal-style-2 ${isExporting && generatePost ? 'split-screen' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header"
          onPointerDown={(e) => {
            isDragging.current = true
            dragStartPos.current = {
              x: e.clientX - currentPos.current.x,
              y: e.clientY - currentPos.current.y
            }
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (isDragging.current && modalRef.current) {
              currentPos.current = {
                x: e.clientX - dragStartPos.current.x,
                y: e.clientY - dragStartPos.current.y
              }
              modalRef.current.style.transform = `translate(${currentPos.current.x}px, ${currentPos.current.y}px)`
            }
          }}
          onPointerUp={(e) => {
            isDragging.current = false
            ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
          }}
        >
          <h2>{isExporting && generatePost ? 'Exporting & Drafting Post...' : 'Export Video'}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            disabled={isExporting && !exportComplete}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {isExporting && generatePost ? (
          // Split Screen Layout
          <div className="export-modal-body-container">
            {/* Left Pane - Progress */}
            <div className="export-modal-left-pane">
              <div className="exportmodal-style-4">
                {exportComplete ? (
                  <div className="export-complete-container">
                    <CheckCircle size={48} color="var(--color-success, #10b981)" />
                    <div className="export-complete-title">Export Complete!</div>
                    <button
                      className="settings-input export-complete-btn"
                      onClick={() =>
                        window.electron.ipcRenderer.invoke('show-item-in-folder', exportedFilePath)
                      }
                    >
                      Open Output Folder
                    </button>
                    <div className="exportmodal-style-7">
                      You can safely close this window, or stick around to refine your post on the
                      right.
                    </div>
                  </div>
                ) : (
                  <>
                    <Loader2 size={48} className="spin" color="var(--color-accent)" />
                    <div className="exportmodal-style-5">
                      <div className="exportmodal-style-6">Rendering Video...</div>
                      <div className="exportmodal-style-7">
                        Please do not close the application.
                      </div>
                    </div>
                    <div className="exportmodal-style-8 export-progress-bar-container-wide">
                      <div ref={progressBarRef} className="progress-bar-fill" />
                    </div>
                    <div className="exportmodal-style-9">{progress}%</div>
                  </>
                )}
              </div>
            </div>

            {/* Right Pane - AI Copilot */}
            <div className="export-modal-right-pane">
              <div className="ai-copilot-header">
                <div className="ai-copilot-header-title">
                  {isGenerating ? <Loader2 size={16} className="spin" /> : '✨'}
                  AI Copilot ({platform})
                </div>
                <div className="ai-copilot-controls">
                  <button
                    className="icon-btn"
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                    title="Regenerate Draft"
                  >
                    <RefreshCcw size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => navigator.clipboard.writeText(editedPost)}
                    disabled={!editedPost}
                    title="Copy to Clipboard"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div className="ai-copilot-post-area">
                <div className="ai-copilot-post-label">Generated Post</div>
                <textarea
                  className="ai-copilot-textarea"
                  value={editedPost}
                  onChange={(e) => setEditedPost(e.target.value)}
                  disabled={isGenerating}
                  placeholder={
                    isGenerating ? 'Drafting your masterpiece...' : 'Start typing to edit...'
                  }
                />
              </div>

              <div className="ai-copilot-chat-area">
                <div className="ai-copilot-chat-messages">
                  <div className="chat-bubble ai">
                    Hi! I&apos;m reading your timeline and drafting your post now. Let me know if
                    you want to change the tone or adjust the hashtags!
                  </div>
                  {aiState?.history.map((msg, idx) => {
                    if (msg.role === 'user' && idx > 0) {
                      // Skip the huge initial prompt
                      return (
                        <div key={idx} className="chat-bubble user">
                          {msg.parts?.[0]?.text}
                        </div>
                      )
                    } else if (msg.role === 'model' && idx > 1) {
                      // Skip first model draft as it's in the textarea
                      return (
                        <div key={idx} className="chat-bubble ai">
                          I&apos;ve updated the post above!
                        </div>
                      )
                    }
                    return null
                  })}
                  {isGenerating && aiState && (
                    <div className="chat-bubble ai">
                      <Loader2 size={12} className="spin" /> Thinking...
                    </div>
                  )}
                </div>

                <div className="ai-copilot-chat-input-container">
                  <input
                    type="text"
                    className="ai-copilot-chat-input"
                    placeholder="Tell AI to make it funnier, shorter, add emojis..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    disabled={isGenerating}
                  />
                  <button
                    className="ai-copilot-send-btn"
                    onClick={handleSendChat}
                    disabled={isGenerating || !chatInput.trim()}
                    aria-label="Send Message"
                    title="Send"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Standard Export Layout
          <div className="modal-body exportmodal-style-3">
            {isExporting ? (
              <div className="exportmodal-style-4">
                {exportComplete ? (
                  <div className="export-complete-container">
                    <CheckCircle size={48} color="var(--color-success, #10b981)" />
                    <div className="export-complete-title">Export Complete!</div>
                    <button
                      className="settings-input export-complete-btn"
                      onClick={() =>
                        window.electron.ipcRenderer.invoke('show-item-in-folder', exportedFilePath)
                      }
                    >
                      Open Output Folder
                    </button>
                  </div>
                ) : (
                  <>
                    <Loader2 size={48} className="spin" color="var(--color-accent)" />
                    <div className="exportmodal-style-5">
                      <div className="exportmodal-style-6">Rendering Video...</div>
                      <div className="exportmodal-style-7">
                        Please do not close the application.
                      </div>
                    </div>
                    <div className="exportmodal-style-8">
                      <div ref={progressBarRef} className="progress-bar-fill" />
                    </div>
                    <div className="exportmodal-style-9">{progress}%</div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="export-settings-split">
                  <div className="export-settings-col">
                    {/* AI Assistant Section */}
                    <div className="exportmodal-style-20 ai-copilot-toggle-container">
                      <div className="exportmodal-style-22 ai-copilot-toggle-row">
                        <input
                          type="checkbox"
                          id="generatePost"
                          checked={generatePost}
                          onChange={(e) => setGeneratePost(e.target.checked)}
                          className="exportmodal-style-23"
                        />
                        <label
                          htmlFor="generatePost"
                          className="exportmodal-style-14 exportmodal-style-24 ai-copilot-toggle-label"
                        >
                          ✨ Generate Social Media Post (AI Copilot)
                        </label>
                      </div>

                      {generatePost && (
                        <div className="ai-copilot-settings-container">
                          <div className="ai-copilot-settings-row">
                            <div className="ai-copilot-settings-col">
                              <div className="exportmodal-style-14 ai-copilot-settings-label">
                                Target Platform
                              </div>
                              <select
                                aria-label="Target Platform"
                                className="settings-input exportmodal-style-15"
                                value={platform}
                                onChange={(e) => setPlatform(e.target.value)}
                              >
                                <option value="TikTok">TikTok</option>
                                <option value="Instagram Reels">Instagram Reels</option>
                                <option value="Facebook">Facebook</option>
                                <option value="YouTube Shorts">YouTube Shorts</option>
                                <option value="LinkedIn">LinkedIn</option>
                                <option value="X (Twitter)">X (Twitter)</option>
                              </select>
                            </div>
                            <div className="ai-copilot-settings-col">
                              <div className="exportmodal-style-14 ai-copilot-settings-label">
                                Tone of Voice
                              </div>
                              <select
                                aria-label="Tone of Voice"
                                className="settings-input exportmodal-style-15"
                                value={tone}
                                onChange={(e) => setTone(e.target.value)}
                              >
                                <option value="Auto">Auto (Let AI Decide)</option>
                                <option value="Engaging & Fun">Engaging & Fun</option>
                                <option value="Professional & Formal">Professional & Formal</option>
                                <option value="Dramatic & Cinematic">Dramatic & Cinematic</option>
                                <option value="Educational & Informative">
                                  Educational & Informative
                                </option>
                                <option value="Trendy & Gen-Z">Trendy & Gen-Z</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <div className="exportmodal-style-14 ai-copilot-settings-label">
                              Video Topic (Optional)
                            </div>
                            <input
                              type="text"
                              placeholder="What is this video about? (Leave blank to auto-extract from timeline)"
                              className="settings-input exportmodal-style-15"
                              value={videoTopic}
                              onChange={(e) => setVideoTopic(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="exportmodal-style-10">Aspect Ratio</div>
                      <div className="exportmodal-style-11">
                        {aspectRatios.map((ar) => (
                          <div
                            key={ar.id}
                            onClick={() => setExportSettings({ aspectRatio: ar.id as any })}
                            className={`aspect-ratio-box ${currentSettings.aspectRatio === ar.id ? 'active' : ''}`}
                          >
                            <div className="aspect-ratio-icon">{ar.icon}</div>
                            <div className="exportmodal-style-12">
                              <div className="aspect-ratio-name">{ar.name}</div>
                              <div className="exportmodal-style-13">
                                {getDims(ar.id, currentSettings.resolution)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="export-settings-col">
                    <div className="exportmodal-style-18 export-resolution-container">
                      <div className="exportmodal-style-19">
                        <div className="exportmodal-style-14">Resolution</div>
                        <select
                          aria-label="Resolution"
                          className="settings-input exportmodal-style-15"
                          value={currentSettings.resolution}
                          onChange={(e) =>
                            setExportSettings({ resolution: parseInt(e.target.value, 10) as any })
                          }
                        >
                          <option value={720}>720p (HD)</option>
                          <option value={1080}>1080p (FHD)</option>
                          <option value={1440}>1440p (2K)</option>
                          <option value={2160}>2160p (4K)</option>
                        </select>
                      </div>
                      <div className="exportmodal-style-19">
                        <div className="exportmodal-style-14">Framerate (FPS)</div>
                        <select
                          aria-label="Framerate"
                          className="settings-input exportmodal-style-15"
                          value={currentSettings.fps}
                          onChange={(e) =>
                            setExportSettings({ fps: parseInt(e.target.value, 10) as any })
                          }
                        >
                          <option value={24}>24 fps (Cinematic)</option>
                          <option value={30}>30 fps (Standard)</option>
                          <option value={60}>60 fps (Smooth)</option>
                        </select>
                      </div>
                    </div>

                    <div className="exportmodal-style-20">
                      <div className="exportmodal-style-14">Format (Container)</div>
                      <select
                        aria-label="Format"
                        className="settings-input exportmodal-style-15"
                        value={currentSettings.format}
                        onChange={(e) => {
                          const newFormat = e.target.value as any
                          let newCodec = currentSettings.codec
                          if (newFormat === 'webm') newCodec = 'vp9'
                          else if (newFormat === 'avi') newCodec = 'mpeg4'
                          else if (newFormat === 'mp4' && !['h264', 'h265'].includes(newCodec))
                            newCodec = 'h264'
                          else if (newFormat === 'mkv' && !['h264', 'h265'].includes(newCodec))
                            newCodec = 'h264'
                          else if (
                            newFormat === 'mov' &&
                            !['h264', 'h265', 'prores'].includes(newCodec)
                          )
                            newCodec = 'h264'
                          setExportSettings({ format: newFormat, codec: newCodec })
                        }}
                      >
                        <option value="mp4">MP4 (Social Media Standard)</option>
                        <option value="mov">MOV (Apple / Pro Editing)</option>
                        <option value="mkv">MKV (Robust Archive)</option>
                        <option value="webm">WebM (Fast Render / Web)</option>
                        <option value="avi">AVI (Legacy)</option>
                      </select>

                      <div className="exportmodal-style-14 exportmodal-style-21">Codec</div>
                      <select
                        aria-label="Codec"
                        className="settings-input exportmodal-style-15"
                        value={currentSettings.codec}
                        onChange={(e) => setExportSettings({ codec: e.target.value as any })}
                      >
                        {['mp4', 'mov', 'mkv'].includes(currentSettings.format) && (
                          <>
                            <option value="h264">H.264 (Maximum Compatibility)</option>
                            <option value="h265">H.265 / HEVC (High Quality, Small Size)</option>
                          </>
                        )}
                        {currentSettings.format === 'mov' && (
                          <option value="prores">Apple ProRes (Lossless, Huge File)</option>
                        )}
                        {currentSettings.format === 'webm' && <option value="vp9">VP9</option>}
                        {currentSettings.format === 'avi' && <option value="mpeg4">MPEG-4</option>}
                      </select>

                      <div className="exportmodal-style-14 exportmodal-style-21">Quality</div>
                      <select
                        aria-label="Quality"
                        className="settings-input exportmodal-style-15"
                        value={currentSettings.quality}
                        onChange={(e) => setExportSettings({ quality: e.target.value as any })}
                      >
                        <option value="high">High Quality (Larger File)</option>
                        <option value="medium">Medium Quality (Balanced)</option>
                        <option value="low">Low Quality (Smaller File)</option>
                      </select>

                      <div className="exportmodal-style-22">
                        <input
                          type="checkbox"
                          id="hwAccel"
                          checked={currentSettings.hwAccel}
                          onChange={(e) => setExportSettings({ hwAccel: e.target.checked })}
                          className="exportmodal-style-23"
                        />
                        <label
                          htmlFor="hwAccel"
                          className="exportmodal-style-14 exportmodal-style-24"
                        >
                          Enable Hardware Acceleration (if available)
                        </label>
                      </div>

                      {currentSettings.format !== 'webm' && (
                        <div className="exportmodal-style-16 exportmodal-style-21">
                          Note: This format requires FFmpeg conversion after rendering. It may take
                          slightly longer.
                        </div>
                      )}
                      {currentSettings.codec === 'h265' && (
                        <div className="exportmodal-style-16 exportmodal-style-25">
                          Warning: H.265 (HEVC) may not play correctly on older devices or certain
                          web browsers.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button onClick={handleExport} className="exportmodal-style-17 export-start-btn">
                  Start Export
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
