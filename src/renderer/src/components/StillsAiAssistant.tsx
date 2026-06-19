import React, { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useShallow } from 'zustand/react/shallow'
import { GoogleGenAI, Type, Schema } from '@google/genai'
import { generateContentWithRetry } from '../lib/gemini'

const stillsAssistantSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    message: {
      type: Type.STRING,
      description: 'The text response or assistant reply to the user.'
    },
    edits: {
      type: Type.OBJECT,
      description: 'Optional. Slider adjustments if the user asked to edit the photo.',
      properties: {
        exposure: { type: Type.NUMBER, description: '-5 to 5' },
        contrast: { type: Type.NUMBER, description: '-100 to 100' },
        highlights: { type: Type.NUMBER, description: '-100 to 100' },
        shadows: { type: Type.NUMBER, description: '-100 to 100' },
        whites: { type: Type.NUMBER, description: '-100 to 100' },
        blacks: { type: Type.NUMBER, description: '-100 to 100' },
        temperature: { type: Type.NUMBER, description: '-100 to 100' },
        tint: { type: Type.NUMBER, description: '-100 to 100' },
        vibrance: { type: Type.NUMBER, description: '-100 to 100' },
        saturation: { type: Type.NUMBER, description: '-100 to 100' }
      }
    }
  },
  required: ['message']
}
import './StillsAiAssistant.css'

export function StillsAiAssistant(): React.ReactElement {
  const { aiKeys, selectedMediaId, updateMediaStillsData, mediaLibrary } = useProjectStore(
    useShallow((s) => ({
      aiKeys: s.aiKeys,
      selectedMediaId: s.selectedMediaId,
      updateMediaStillsData: s.updateMediaStillsData,
      mediaLibrary: s.mediaLibrary
    }))
  )

  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])

  const selectedImage = mediaLibrary.find((m) => m.id === selectedMediaId && m.type === 'image')

  const handleSend = async (): Promise<void> => {
    if (!prompt.trim() || !aiKeys.gemini || !selectedImage) return

    setMessages((prev) => [...prev, { role: 'user', text: prompt }])
    setPrompt('')
    setLoading(true)

    try {
      const ai = new GoogleGenAI({ apiKey: aiKeys.gemini })

      // Real implementation would upload image or use base64 data to prompt Vision API
      // We pass instructions for the AI to return JSON for slider adjustments
      const response = await generateContentWithRetry(ai, {
        model: 'gemini-3.5-flash',
        contents: [
          `You are an expert photography editor and retoucher. 
           Respond to the user's prompt: "${prompt}".
           If they ask you to edit the photo, populate the 'edits' object with the appropriate slider values.
           Always provide a friendly response in the 'message' field.`
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: stillsAssistantSchema
        }
      })

      const replyStr = response.text || '{}'

      try {
        const payload = JSON.parse(replyStr)
        if (payload.edits && Object.keys(payload.edits).length > 0) {
          const currentEdits = selectedImage.edits || {}
          updateMediaStillsData(selectedImage.id, {
            edits: { ...currentEdits, ...payload.edits }
          })
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: payload.message || 'I have applied those edits to your photo!'
            }
          ])
          setLoading(false)
          return
        }

        if (payload.message) {
          setMessages((prev) => [...prev, { role: 'assistant', text: payload.message }])
        } else {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', text: 'I could not process that request.' }
          ])
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: 'Sorry, I returned invalid data.' }
        ])
      }
    } catch (error) {
      console.error(error)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Sorry, there was an error processing your request.' }
      ])
    }

    setLoading(false)
  }

  const handleAutoCull = async (): Promise<void> => {
    // Simulated AI Culling Logic across all images
    setLoading(true)
    setTimeout(() => {
      mediaLibrary
        .filter((m) => m.type === 'image')
        .forEach((m) => {
          // Mock random culling for now
          const isPick = Math.random() > 0.5
          updateMediaStillsData(m.id, {
            flag: isPick ? 'pick' : 'reject',
            rating: isPick ? 5 : 1
          })
        })
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'I have automatically culled and rated your photoshoot! Check the filmstrip.'
        }
      ])
      setLoading(false)
    }, 1500)
  }

  return (
    <div className="stills-panel stills-ai-panel stills-ai-assistant">
      <h3>AI Assistant</h3>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <strong>{msg.role === 'user' ? 'You' : 'AI'}: </strong>
            {msg.text}
          </div>
        ))}
        {loading && <div className="chat-loading">Thinking...</div>}
      </div>

      {!aiKeys.gemini && (
        <div className="api-key-warning">
          Please add your Gemini API Key in settings to use the AI features.
        </div>
      )}

      <div className="ai-button-group">
        <button onClick={handleAutoCull} className="auto-cull-btn">
          Auto Cull Photoshoot
        </button>
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="E.g. Make it moody and warm..."
          className="chat-text-input"
        />
        <button onClick={handleSend} disabled={loading || !aiKeys.gemini} className="chat-send-btn">
          Send
        </button>
      </div>
    </div>
  )
}
