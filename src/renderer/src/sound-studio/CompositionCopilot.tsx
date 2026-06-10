import React, { useState, useRef, useEffect } from 'react'
import { Send, Bot } from 'lucide-react'
import { GoogleGenAI } from '@google/genai'
import {
  useSoundStudioStore,
  BUILT_IN_INSTRUMENTS,
  type AiComposition
} from '../store/soundStudioStore'
import { useProjectStore } from '../store/projectStore'

function buildSystemPrompt(): string {
  const instrumentList = BUILT_IN_INSTRUMENTS.map(
    (i) => `- id: "${i.id}", name: "${i.name}", category: "${i.category}"`
  ).join('\n')

  return `You are an expert music composition AI assistant inside a professional audio app called Sound Studio (part of Express Reels).

Your job is to help the user compose music and sound effects. When the user asks you to create or modify a composition, you MUST respond with ONLY a valid JSON object matching this exact schema — no extra text, no markdown, no explanation outside the JSON:

{
  "bpm": <number, optional>,
  "beatsPerMeasure": <number, optional>,
  "totalMeasures": <number, optional>,
  "tracks": [
    {
      "instrumentId": "<one of the IDs below>",
      "name": "<track name>",
      "notes": [
        { "startBeat": <number>, "durationBeats": <number>, "velocity": <0-127>, "pitch": "<optional, e.g. C4>" }
      ],
      "effects": {
        "eq": { "bass": <-12 to 12>, "mid": <-12 to 12>, "treble": <-12 to 12> },
        "compression": { "threshold": <-60 to 0>, "ratio": <1 to 20> },
        "gate": { "threshold": <-80 to 0> },
        "reverb": { "mix": <0 to 1>, "decay": <0.1 to 10> }
      }
    }
  ],
  "message": "<a short friendly message shown to the user after applying the composition>"
}

AVAILABLE INSTRUMENTS (use ONLY these instrumentId values):
${instrumentList}

RULES:
- beats are 0-indexed (beat 0 is the first beat of measure 1)
- Only use instrumentIds from the list above
- For percussion instruments, omit the "pitch" field
- For synth/string/wind/midi instruments, include a "pitch" like "C4", "D#3", "Bb2" etc.
- If the user asks a conversational question (not a composition request), still return valid JSON but with an empty "tracks" array and put your answer in the "message" field
- Keep note velocities between 60 and 127 for realistic dynamics`
}

export function CompositionCopilot({
  onSendRef
}: {
  onSendRef?: React.MutableRefObject<((prompt: string) => void) | null>
}): React.ReactElement {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatHistory = useSoundStudioStore((s) => s.chatHistory)
  const appendChatMessage = useSoundStudioStore((s) => s.appendChatMessage)
  const setIsAiLoading = useSoundStudioStore((s) => s.setIsAiLoading)
  const isAiLoading = useSoundStudioStore((s) => s.isAiLoading)
  const applyAiComposition = useSoundStudioStore((s) => s.applyAiComposition)
  const { bpm, tracks, clips, beatsPerMeasure, totalMeasures } = useSoundStudioStore()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isAiLoading])

  const sendMessage = async (prompt: string): Promise<void> => {
    const text = prompt.trim()
    if (!text || isAiLoading) return

    appendChatMessage({ role: 'user', content: text })
    setInput('')
    setIsAiLoading(true)

    try {
      const apiKey =
        useProjectStore.getState().aiKeys?.gemini || import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        appendChatMessage({
          role: 'assistant',
          content:
            'No Gemini API key found. Please add one in the main app Settings → AI Integrations.'
        })
        return
      }

      const ai = new GoogleGenAI({ apiKey })

      // Build context from current session
      const context = {
        currentBpm: bpm,
        beatsPerMeasure,
        totalMeasures,
        existingTracks: tracks.map((t) => ({
          id: t.id,
          name: t.name,
          instrumentId: t.instrumentId
        })),
        existingClips: clips.slice(0, 20).map((c) => ({
          trackId: c.trackId,
          startBeat: c.startBeat,
          durationBeats: c.durationBeats,
          pitch: c.pitch
        }))
      }

      const userMessage = `CURRENT SESSION STATE:\n${JSON.stringify(context, null, 2)}\n\nUSER REQUEST: ${text}`

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: buildSystemPrompt(),
          responseMimeType: 'application/json'
        }
      })

      const raw = response.text || '{}'
      let composition: AiComposition
      try {
        composition = JSON.parse(raw)
      } catch {
        composition = {
          tracks: [],
          message:
            'I had trouble generating a composition. Please try again with a different description.'
        }
      }

      if (composition.tracks && composition.tracks.length > 0) {
        applyAiComposition(composition)
      }

      appendChatMessage({
        role: 'assistant',
        content: composition.message || "Done! I've applied the composition to your timeline."
      })
    } catch (err) {
      console.warn('[AI Copilot] Request failed:', err)
      appendChatMessage({
        role: 'assistant',
        content: 'Something went wrong. Please check your API key and try again.'
      })
    } finally {
      setIsAiLoading(false)
    }
  }

  // Expose send function via ref so CommandLibrary can trigger it
  useEffect(() => {
    if (onSendRef) onSendRef.current = sendMessage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="ss-copilot">
      <div className="ss-section-header ss-section-header--static">
        <Bot size={11} /> AI Composition Copilot
      </div>

      {/* Messages */}
      <div className="ss-chat-messages">
        {chatHistory.length === 0 && (
          <div className="ss-chat-empty">
            Describe a sound, beat, or song and I&apos;ll compose it for you.
          </div>
        )}
        {chatHistory.map((msg) => (
          <div key={msg.id} className={`ss-chat-msg ${msg.role}`}>
            <div className="ss-chat-bubble">{msg.content}</div>
          </div>
        ))}
        {isAiLoading && (
          <div className="ss-ai-loading">
            <div className="ss-ai-dot" />
            <div className="ss-ai-dot" />
            <div className="ss-ai-dot" />
            <span>Composing…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ss-chat-input-row">
        <textarea
          className="ss-chat-input"
          placeholder="Describe a beat or song…"
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage(input)
            }
          }}
        />
        <button
          className="ss-chat-send-btn"
          onClick={() => sendMessage(input)}
          disabled={isAiLoading || !input.trim()}
          title="Send (Enter)"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  )
}
