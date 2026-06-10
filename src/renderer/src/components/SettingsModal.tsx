import React, { useState } from 'react'
import './SettingsModal.css'
import { useProjectStore } from '../store/projectStore'
import { X, User, Key, Save } from 'lucide-react'
export function SettingsModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const { currentUser, aiKeys, setAiKeys, login } = useProjectStore()
  const [activeTab, setActiveTab] = useState<'profile' | 'keys'>('profile')

  // Profile State
  const [name, setName] = useState(currentUser?.name || '')
  const [email, setEmail] = useState(currentUser?.email || '')
  const [password, setPassword] = useState(currentUser?.password || '')

  // API Key State
  const [geminiKey, setGeminiKey] = useState(aiKeys?.gemini || '')
  const [geminiTier, setGeminiTier] = useState<'free' | 'paid'>(aiKeys?.geminiTier || 'free')
  const [claudeKey, setClaudeKey] = useState(aiKeys?.claude || '')
  const [openaiKey, setOpenaiKey] = useState(aiKeys?.openai || '')
  const [pixabayKey, setPixabayKey] = useState(aiKeys?.pixabay || '')
  const [giphyKey, setGiphyKey] = useState(aiKeys?.giphy || '')
  const [freesoundKey, setFreesoundKey] = useState(aiKeys?.freesound || '')
  const [jamendoKey, setJamendoKey] = useState(aiKeys?.jamendo || '')
  const handleSaveProfile = (e: React.FormEvent): void => {
    e.preventDefault()
    if (name && email) {
      login(email, name, password)
      // Show save confirmation
    }
  }
  const handleSaveKeys = (e: React.FormEvent): void => {
    e.preventDefault()
    setAiKeys({
      gemini: geminiKey,
      geminiTier: geminiTier,
      claude: claudeKey,
      openai: openaiKey,
      pixabay: pixabayKey,
      giphy: giphyKey,
      freesound: freesoundKey,
      jamendo: jamendoKey
    })
    onClose()
  }
  return (
    <div className="settingsmodal-style-1">
      <div className="settingsmodal-style-2">
        {/* Header */}
        <div className="settingsmodal-style-3">
          <h2 className="settingsmodal-style-4">Settings</h2>
          <button
            onClick={onClose}
            className="settingsmodal-style-5"
            title="Close"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="settingsmodal-style-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`settingsmodal-style-7 tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          >
            <User size={16} /> Profile Info
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`settingsmodal-style-8 tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
          >
            <Key size={16} /> AI Integrations
          </button>
        </div>

        {/* Content */}
        <div className="settingsmodal-style-9">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="settingsmodal-style-10">
              <div className="settingsmodal-style-11">
                <label className="settingsmodal-style-12">Full Name</label>
                <input
                  type="text"
                  title="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="settingsmodal-style-13"
                />
              </div>
              <div className="settingsmodal-style-14">
                <label className="settingsmodal-style-15">Email Address</label>
                <input
                  type="email"
                  title="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="settingsmodal-style-16"
                />
              </div>
              <div className="settingsmodal-style-17">
                <label className="settingsmodal-style-18">Password</label>
                <input
                  type="password"
                  title="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="settingsmodal-style-19"
                />
              </div>
              <button type="submit" className="settingsmodal-style-20">
                <Save size={16} /> Update Profile
              </button>
            </form>
          )}

          {activeTab === 'keys' && (
            <form onSubmit={handleSaveKeys} className="settingsmodal-style-21">
              <p className="settingsmodal-style-22">
                Add your API keys to enable the AI Copilot features. Keys are stored locally on your
                machine and never sent to our servers.
              </p>

              <div className="settingsmodal-style-23">
                <div className="settingsmodal-style-24">
                  <label className="settingsmodal-style-25">Google Gemini API Key</label>
                  <div className="settingsmodal-style-26">
                    <select
                      title="Gemini Tier"
                      value={geminiTier}
                      onChange={(e) => setGeminiTier(e.target.value as 'free' | 'paid')}
                      className="settingsmodal-style-27"
                    >
                      <option value="free">Free Tier</option>
                      <option value="paid">Paid Tier (Pay-as-you-go)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.api?.openExternal) {
                          window.api.openExternal('https://aistudio.google.com/app/apikey')
                        } else {
                          window.open('https://aistudio.google.com/app/apikey', '_blank')
                        }
                      }}
                      className="settingsmodal-style-28"
                    >
                      Get Key <span className="settingsmodal-style-29">↗</span>
                    </button>
                  </div>
                </div>
                <input
                  type="password"
                  title="Gemini API Key"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="settingsmodal-style-30"
                />
                <span className="settingsmodal-style-31">
                  {geminiTier === 'free'
                    ? 'App will limit requests to 15 per minute to stay on the free tier.'
                    : 'App will run at maximum speed without artificial rate limits.'}
                </span>
              </div>

              <div className="settingsmodal-style-32">
                <label className="settingsmodal-style-33">Anthropic Claude API Key</label>
                <input
                  type="password"
                  title="Anthropic API Key"
                  placeholder="sk-ant-..."
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  className="settingsmodal-style-34"
                />
              </div>

              <div className="settingsmodal-style-35">
                <label className="settingsmodal-style-36">OpenAI API Key</label>
                <input
                  type="password"
                  title="OpenAI API Key"
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="settingsmodal-style-37"
                />
              </div>

              <div className="settingsmodal-style-38">
                <div className="settingsmodal-style-39">
                  <label className="settingsmodal-style-40">Pixabay API Key (Stock Media)</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.api?.openExternal)
                        window.api.openExternal('https://pixabay.com/api/docs/')
                      else window.open('https://pixabay.com/api/docs/', '_blank')
                    }}
                    className="settingsmodal-style-41"
                  >
                    Get Key <span className="settingsmodal-style-42">↗</span>
                  </button>
                </div>
                <input
                  type="password"
                  title="Pixabay Key"
                  placeholder="Pixabay Key..."
                  value={pixabayKey}
                  onChange={(e) => setPixabayKey(e.target.value)}
                  className="settingsmodal-style-43"
                />
              </div>

              <div className="settingsmodal-style-44">
                <div className="settingsmodal-style-45">
                  <label className="settingsmodal-style-46">Giphy API Key (Stickers)</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.api?.openExternal)
                        window.api.openExternal('https://developers.giphy.com/dashboard/')
                      else window.open('https://developers.giphy.com/dashboard/', '_blank')
                    }}
                    className="settingsmodal-style-47"
                  >
                    Get Key <span className="settingsmodal-style-48">↗</span>
                  </button>
                </div>
                <input
                  type="password"
                  title="Giphy Key"
                  placeholder="Giphy Key..."
                  value={giphyKey}
                  onChange={(e) => setGiphyKey(e.target.value)}
                  className="settingsmodal-style-49"
                />
              </div>

              <div className="settingsmodal-style-50">
                <div className="settingsmodal-style-51">
                  <label className="settingsmodal-style-52">
                    Freesound API Key (Audio Library)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.api?.openExternal) {
                        window.api.openExternal('https://freesound.org/apiv2/apply')
                      } else {
                        window.open('https://freesound.org/apiv2/apply', '_blank')
                      }
                    }}
                    className="settingsmodal-style-53"
                  >
                    Get Key <span className="settingsmodal-style-54">↗</span>
                  </button>
                </div>
                <input
                  type="password"
                  title="Freesound Token"
                  placeholder="Freesound Token..."
                  value={freesoundKey}
                  onChange={(e) => setFreesoundKey(e.target.value)}
                  className="settingsmodal-style-55"
                />
                <span className="settingsmodal-style-56">
                  Important: Copy the long &quot;API Key&quot;, NOT the short Client ID.
                </span>
              </div>

              <div className="settingsmodal-style-57">
                <div className="settingsmodal-style-58">
                  <label className="settingsmodal-style-59">
                    Jamendo Client ID (Music Library)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.api?.openExternal) {
                        window.api.openExternal('https://developer.jamendo.com/v3.0')
                      } else {
                        window.open('https://developer.jamendo.com/v3.0', '_blank')
                      }
                    }}
                    className="settingsmodal-style-60"
                  >
                    Get ID <span className="settingsmodal-style-61">↗</span>
                  </button>
                </div>
                <input
                  type="password"
                  title="Jamendo Client ID"
                  placeholder="Jamendo Client ID..."
                  value={jamendoKey}
                  onChange={(e) => setJamendoKey(e.target.value)}
                  className="settingsmodal-style-62"
                />
              </div>

              <button type="submit" className="settingsmodal-style-63">
                <Save size={16} /> Save API Keys
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
