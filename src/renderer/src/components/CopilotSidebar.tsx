/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react'
import './CopilotSidebar.css'
import { Send, BrainCircuit, Loader2, Copy } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { sendCopilotMessage } from '../lib/gemini'
import { MOCK_EFFECTS, MOCK_AUDIO } from '../lib/mockAssets'
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}
export function CopilotSidebar(): React.ReactElement {
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

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
    </div>
  )
}
