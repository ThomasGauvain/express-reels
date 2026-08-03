/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react'
import './CopilotSidebar.css'
import { Send, BrainCircuit, Loader2, Copy, BarChart3, TrendingUp, Clock, Eye, MessageSquare } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { sendCopilotMessage } from '../lib/gemini'
import { MOCK_EFFECTS, MOCK_AUDIO } from '../lib/mockAssets'
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface AnalyticsData {
  totalViews: number
  avgWatchTimeMs: number
  completionRate: number
  curve?: { q25: number; q50: number; q75: number; q100: number; total: number }
  aiTips?: string[]
}

function PerformanceTab({ streamId }: { streamId: string | null | undefined }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!streamId) return
    setLoading(true)
    setError(null)
    fetch(`http://localhost:3000/api/analytics/video/${streamId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Analytics unavailable (${res.status})`)
        return res.json()
      })
      .then((json: AnalyticsData) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[CopilotSidebar] Analytics fetch error:', err)
        setData({
          totalViews: 5240,
          avgWatchTimeMs: 14000,
          completionRate: 0.62,
          curve: { q25: 4100, q50: 3200, q75: 2100, q100: 1600, total: 5240 },
          aiTips: [
            '87% of viewers drop at 0:14 — you transitioned here. Try cutting 3 seconds earlier.',
            'Your videos with text at 0:03 avg 40% longer watch time.',
            'Viewers who heard this music drop after 0:08 — try a more energetic hook.'
          ]
        })
        setError('Showing sample data (server offline or video not yet published)')
        setLoading(false)
      })
  }, [streamId])

  if (!streamId) {
    return (
      <div className="copilotsidebar-style-5" style={{ marginTop: '20px', textAlign: 'center' }}>
        <BarChart3 size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
        <div>No video uploaded yet.</div>
        <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '6px' }}>
          Export and upload to Artisteers to view performance.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="copilotsidebar-style-10" style={{ marginTop: '20px', justifyContent: 'center' }}>
        <Loader2 size={24} className="spin" color="var(--color-accent)" />
        <span className="copilotsidebar-style-11">Loading analytics...</span>
      </div>
    )
  }

  if (!data) return null

  const curveData = data.curve
  const curveMax = curveData ? Math.max(curveData.total, 1) : 0
  const curveItems = curveData
    ? [
        { label: '25%', value: curveData.q25, color: '#10b981' },
        { label: '50%', value: curveData.q50, color: '#f59e0b' },
        { label: '75%', value: curveData.q75, color: '#f97316' },
        { label: '100%', value: curveData.q100, color: '#ef4444' }
      ]
    : []

  return (
    <div
      style={{
        padding: '15px',
        color: 'var(--color-text)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        gap: '16px'
      }}
    >
      {error && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--color-text-muted)',
            background: 'rgba(255,200,0,0.08)',
            border: '1px solid rgba(255,200,0,0.15)',
            padding: '6px 10px',
            borderRadius: '6px'
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ background: 'var(--color-bg-secondary)', padding: '10px', borderRadius: '8px' }}>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px'
            }}
          >
            <Eye size={12} /> Views
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{data.totalViews.toLocaleString()}</div>
        </div>
        <div style={{ background: 'var(--color-bg-secondary)', padding: '10px', borderRadius: '8px' }}>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px'
            }}
          >
            <TrendingUp size={12} /> Completion
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>
            {(data.completionRate * 100).toFixed(1)}%
          </div>
        </div>
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            padding: '10px',
            borderRadius: '8px',
            gridColumn: '1 / -1'
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px'
            }}
          >
            <Clock size={12} /> Avg Watch Time
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
            {(data.avgWatchTimeMs / 1000).toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Retention Quartile Heatmap */}
      {curveItems.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <BarChart3 size={12} /> Retention by Quarter
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '60px' }}>
            {curveItems.map((item) => (
              <div
                key={item.label}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${Math.max(4, (item.value / curveMax) * 52)}px`,
                    background: item.color,
                    borderRadius: '3px 3px 0 0',
                    opacity: 0.85,
                    transition: 'height 0.4s ease'
                  }}
                />
                <div style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Coaching Tips */}
      {data.aiTips && data.aiTips.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <BrainCircuit size={12} color="var(--color-accent)" /> AI Coaching
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.aiTips.map((tip: string, i: number) => (
              <div
                key={i}
                style={{
                  background: 'rgba(139, 92, 246, 0.1)',
                  borderLeft: '2px solid var(--color-accent)',
                  padding: '8px 10px',
                  fontSize: '11px',
                  borderRadius: '0 4px 4px 0',
                  lineHeight: 1.5
                }}
              >
                {tip}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


export function CopilotSidebar(): React.ReactElement {
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [activeTab, setActiveTab] = useState<'copilot' | 'performance'>('copilot')

  const streamId = useProjectStore((s) => s.streamId)

  const aiKeys = useProjectStore((s) => s.aiKeys)
  const copilotMessages = useProjectStore((s) => s.copilotMessages)
  const addCopilotMessage = useProjectStore((s) => s.addCopilotMessage)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    })
  }, [copilotMessages, isTyping])
  const handleSend = async (e?: React.FormEvent, customInput?: string): Promise<void> => {
    if (e) e.preventDefault()
    const text = customInput || input
    if (!text.trim() || isTyping) return

    if (!aiKeys?.gemini) {
      addCopilotMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          '**Error**: You need to configure a Gemini API Key in Settings before you can use the AI Copilot.'
      })
      return
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text
    }
    addCopilotMessage(userMsg)
    setInput('')
    setIsTyping(true)
    try {
      const response = await sendCopilotMessage(text, true)
      if (!response) {
        throw new Error('No response from Gemini')
      }

      const responseText = response.text || ''

      // Process native Tool Calling from Gemini
      if (response.functionCalls && response.functionCalls.length > 0) {
        for (const call of response.functionCalls) {
          if (call.name === 'execute_timeline_commands') {
            const payload = call.args as any
            if (payload.commands && Array.isArray(payload.commands)) {
              const store = useProjectStore.getState()
              payload.commands.forEach((cmd: any) => {
                if (cmd.action === 'ADD_VFX' && store.selectedClipId) {
                  const effect = MOCK_EFFECTS.find((fx) => fx.id === cmd.effectId)
                  if (effect) {
                    store.addVisualEffect(
                      {
                        ...effect,
                        id: crypto.randomUUID()
                      },
                      store.selectedClipId
                    )
                  }
                }
                if (cmd.action === 'ADD_AUDIO') {
                  const audio = MOCK_AUDIO.find((a) => a.id === cmd.id)
                  if (audio) {
                    // Add to media library
                    const newMediaId = crypto.randomUUID()
                    store.addMedia([
                      {
                        id: newMediaId,
                        path: `mock://audio/${audio.id}`,
                        name: audio.name,
                        type: 'audio',
                        duration: audio.duration
                      }
                    ])

                    // Add to timeline on audio track 'a1'
                    const a1Clips = store.clips.filter((c) => c.trackId === 'a1')
                    const maxTime =
                      a1Clips.length > 0
                        ? Math.max(...a1Clips.map((c) => c.startTime + c.duration))
                        : 0
                    store.addClip({
                      id: crypto.randomUUID(),
                      mediaId: newMediaId,
                      trackId: 'a1',
                      startTime: maxTime,
                      duration: audio.duration,
                      sourceOffset: 0
                    })
                  }
                }
                if (cmd.action === 'ADD_KEYFRAME' && store.selectedClipId) {
                  store.addKenBurnsKeyframe(store.selectedClipId, {
                    id: crypto.randomUUID(),
                    time: typeof cmd.time === 'number' ? cmd.time : 0,
                    x: typeof cmd.x === 'number' ? cmd.x : 50,
                    y: typeof cmd.y === 'number' ? cmd.y : 50,
                    zoom: typeof cmd.zoom === 'number' ? cmd.zoom : 1
                  })
                }
              })
            }
          }
        }
      }
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: responseText
      }
      addCopilotMessage(aiMsg)
    } catch (error: any) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Error**: ${error.message || 'Failed to communicate with Gemini.'}`
      }
      addCopilotMessage(errorMsg)
    } finally {
      setIsTyping(false)
    }
  }
  return (
    <div className="panel panel-a-media copilotsidebar-style-1">
      {/* Header Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: '10px', flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab('copilot')}
          style={{ flex: 1, padding: '12px', background: 'transparent', border: 'none', color: activeTab === 'copilot' ? 'var(--color-accent)' : 'var(--color-text-muted)', borderBottom: activeTab === 'copilot' ? '2px solid var(--color-accent)' : '2px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', outline: 'none' }}
        >
          <MessageSquare size={14} /> Copilot
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          style={{ flex: 1, padding: '12px', background: 'transparent', border: 'none', color: activeTab === 'performance' ? 'var(--color-accent)' : 'var(--color-text-muted)', borderBottom: activeTab === 'performance' ? '2px solid var(--color-accent)' : '2px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', outline: 'none' }}
        >
          <BarChart3 size={14} /> Performance
        </button>
      </div>

      {activeTab === 'performance' ? (
        <PerformanceTab streamId={streamId} />
      ) : (
        <>
          {/* Header */}
          <div className="copilotsidebar-style-2">
            <BrainCircuit size={16} color="var(--color-accent)" />
            <h3 className="copilotsidebar-style-3">AI Copilot</h3>
            <span className="copilotsidebar-style-4">3.5 Flash</span>
          </div>

      {/* Warning if no keys */}
      {!aiKeys?.gemini && (
        <div className="copilotsidebar-style-5">
          No Gemini API key configured. Open Settings to add your key.
        </div>
      )}

      {/* Chat Area */}
      <div className="copilotsidebar-style-6">
        {copilotMessages.map((msg) => (
          <div key={msg.id} className={`chat-message copilotsidebar-style-7 msg-${msg.role}`}>
            <div className="copilotsidebar-style-8">{msg.content}</div>
            {msg.role === 'assistant' && (
              <button
                onClick={() => navigator.clipboard.writeText(msg.content)}
                title="Copy message"
                className="copilotsidebar-style-9 msg-copy-btn"
              >
                <Copy size={12} />
              </button>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="copilotsidebar-style-10">
            <Loader2 size={14} className="spin" color="var(--color-text-muted)" />
            <span className="copilotsidebar-style-11">Gemini is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="copilotsidebar-style-12">
        <button
          onClick={() =>
            handleSend(undefined, 'Write a catchy 3-second hook for the clips on my timeline.')
          }
          className="copilotsidebar-style-13"
        >
          ✨ Write Hook
        </button>
        <button
          onClick={() => handleSend(undefined, 'Suggest a trendy TikTok title for this video.')}
          className="copilotsidebar-style-14"
        >
          📝 Suggest Title
        </button>
      </div>

      {/* Input */}
      <div className="copilotsidebar-style-15">
        <form onSubmit={(e) => handleSend(e)} className="copilotsidebar-style-16">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
            placeholder="Ask Copilot anything..."
            className="copilotsidebar-style-17"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            title="Send message"
            aria-label="Send message"
            className="copilotsidebar-style-18"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
        </>
      )}
    </div>
  )
}
