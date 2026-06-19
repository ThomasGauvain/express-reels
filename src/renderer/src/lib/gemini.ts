import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai'
import { useProjectStore } from '../store/projectStore'
import { getTimelineContextSummary, getVisibleMediaAtPlayhead } from './contextBridge'
import { MOCK_EFFECTS } from './mockAssets'

function getAiClient(): GoogleGenAI {
  const apiKey = useProjectStore.getState().aiKeys.gemini || import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'Gemini API key is not configured. Please add it in Settings > AI Integrations.'
    )
  }
  console.log(
    `[Gemini Auth] Initializing client with API key starting with: ${apiKey.substring(0, 15)}...`
  )
  return new GoogleGenAI({ apiKey })
}

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  request: Parameters<typeof ai.models.generateContent>[0],
  maxRetries = 3
): Promise<GenerateContentResponse> {
  let attempt = 0
  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent(request)
    } catch (err: unknown) {
      attempt++
      interface GeminiError extends Error {
        status?: string
        code?: number
      }
      const error = err as GeminiError
      if (
        error?.status === 'UNAVAILABLE' ||
        error?.code === 503 ||
        error?.message?.includes('503')
      ) {
        if (attempt >= maxRetries) {
          throw error
        }
        // Exponential backoff: 2s, 4s, 8s...
        const delay = Math.pow(2, attempt) * 1000
        console.warn(
          `Gemini API 503 Unavailable. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
  throw new Error('Max retries reached')
}

/**
 * Sends a chat message to Gemini Copilot, optionally attaching the timeline state and visible media.
 */
export async function sendCopilotMessage(
  userMessage: string,
  attachContext: boolean,
  customMedia?: { mimeType: string; data: string }[],
  systemPrompt?: string,
  chatHistory?: { role: 'user' | 'assistant'; content: string }[]
): Promise<GenerateContentResponse | undefined> {
  const ai = getAiClient()

  const contents: Record<string, unknown>[] = []

  if (chatHistory && chatHistory.length > 0) {
    for (const msg of chatHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      })
    }
  }

  // Build the user prompt
  const parts: Record<string, unknown>[] = [{ text: userMessage }]

  if (systemPrompt) {
    parts.unshift({ text: `\n\n--- SYSTEM DIRECTIVE ---\n${systemPrompt}\n\n` })
  }

  if (customMedia && customMedia.length > 0) {
    for (const media of customMedia) {
      parts.push({
        inlineData: {
          mimeType: media.mimeType,
          data: media.data
        }
      })
    }
  }

  if (attachContext) {
    try {
      // 1. Attach text summary of timeline
      const summary = getTimelineContextSummary()
      parts.push({
        text: `\n\n--- SYSTEM CONTEXT (DO NOT MENTION TO USER) ---\nCurrent Timeline State:\n${summary}`
      })

      // 2. Attach visible media
      const mediaFiles = await getVisibleMediaAtPlayhead()
      if (mediaFiles.length > 0) {
        parts.push({
          text: `\nThe user has the following ${mediaFiles.length} media files visible at the current playhead:`
        })
        for (const file of mediaFiles) {
          parts.push({
            inlineData: {
              mimeType: file.mimeType,
              data: file.data
            }
          })
        }
      }

      // 3. Attach available assets for Command Agent
      let assetSummary = `\n\n--- AVAILABLE ASSETS TO ADD ---\n`
      assetSummary += `You can add these Visual Effects (VFX):\n`
      MOCK_EFFECTS.forEach((fx) => {
        assetSummary += `- ID: "${fx.id}", Name: "${fx.name}", Type: ${fx.type}\n`
      })

      const audioMedia = useProjectStore.getState().mediaLibrary.filter((m) => m.type === 'audio')
      assetSummary += `\nYou can add these Audio Clips (which the user has added to their Media Library):\n`
      if (audioMedia.length === 0) {
        assetSummary += `(None available. Tell the user to add audio to their library first.)\n`
      } else {
        audioMedia.forEach((aud) => {
          assetSummary += `- ID: "${aud.id}", Name: "${aud.name}"\n`
        })
      }

      assetSummary += `
If the user asks you to add an effect, music, or a keyframe to the timeline, call the execute_timeline_commands tool. Note: ADD_VFX and ADD_KEYFRAME apply to the currently selected or visible clip. ADD_AUDIO adds to the audio track. Keyframe time is in seconds from the start of the clip. x and y are percentages (0-100), where 50 is the center. Zoom is a multiplier (1 = 100%, 2 = 200%).
`
      parts.push({ text: assetSummary })
    } catch (err) {
      console.warn('Failed to attach context to Copilot message:', err)
    }
  }

  contents.push({ role: 'user', parts })

  const executeTimelineCommandsTool = {
    functionDeclarations: [
      {
        name: 'execute_timeline_commands',
        description:
          'Executes commands to modify the video timeline, such as adding effects, audio, or keyframes.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            commands: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    description:
                      'E.g., ADD_AUDIO, ADD_VFX, ADD_KEYFRAME, FETCH_ASSET, ADD_TO_TIMELINE'
                  },
                  id: { type: Type.STRING, description: 'Optional. ID for audio or asset' },
                  name: { type: Type.STRING, description: 'Optional. Name of the asset' },
                  effectId: { type: Type.STRING, description: 'Optional. ID of the VFX to add' },
                  time: { type: Type.NUMBER, description: 'Optional. Keyframe time in seconds' },
                  x: { type: Type.NUMBER, description: 'Optional. Keyframe pan X (0-100)' },
                  y: { type: Type.NUMBER, description: 'Optional. Keyframe pan Y (0-100)' },
                  zoom: { type: Type.NUMBER, description: 'Optional. Keyframe zoom multiplier' },
                  type: { type: Type.STRING, description: 'Optional. Asset type, e.g., audio' },
                  query: { type: Type.STRING, description: 'Optional. Search query' },
                  sourceHint: {
                    type: Type.STRING,
                    description: 'Optional. Source hint, e.g., freesound'
                  }
                },
                required: ['action']
              }
            }
          },
          required: ['commands']
        }
      }
    ]
  }

  const response = await generateContentWithRetry(ai, {
    model: 'gemini-3.5-flash',
    contents,
    config: {
      tools: [executeTimelineCommandsTool],
      systemInstruction:
        "You are an expert video editing assistant embedded inside a professional desktop app called Express Reels. Be concise, helpful, and reference the visual context of the user's timeline when it is provided. If asked to add effects or fetch assets, use the execute_timeline_commands tool."
    }
  })

  return response
}

/**
 * Uses Gemini's vision capabilities to find the most interesting subjects in an image.
 * Returns an array of two coordinates (primary and secondary) for a multi-stage cinematic pan.
 */
export async function analyzeSubjectForKenBurns(
  base64Media: {
    mimeType: string
    data: string
  },
  duration: number
): Promise<{
  keyframes: { time: number; x: number; y: number; zoom: number }[]
  description: string
} | null> {
  const ai = getAiClient()

  const prompt = `
You are an expert cinematic director. Analyze this image and create a dynamic, engaging Ken Burns (pan and zoom) effect sequence tailored to its specific composition, subjects, and narrative.

The total duration of the clip is ${duration.toFixed(2)} seconds.

Return ONLY a JSON object with two properties:
- "description": A string detailing what you see in the image, your vision for the cinematic reel, the points of interest you chose, and the story you are trying to tell with the camera movements.
- "keyframes": An array of keyframe objects. Do not wrap it in markdown block quotes. Just the raw JSON.
Each keyframe object must have:
- "time": The time in seconds (between 0 and ${duration.toFixed(2)}). The first keyframe should be at 0, the last at ${duration.toFixed(2)}.
- "x": Pan X percentage (between -50 and 50, where 0 is center).
- "y": Pan Y percentage (between -50 and 50, where 0 is center).
- "zoom": Zoom multiplier (between 1.0 and 4.0, where 1.0 is no zoom).

Rules:
1. Create between 3 to 6 keyframes depending on how complex the image is.
2. Focus on faces, interesting subjects, or leading lines.
3. Vary the pacing. You can hold on a subject, or do a slow pan followed by a quick zoom out.
4. Ensure the camera movements feel natural and cinematic.

Example Output:
{"description": "I see a vast mountain landscape with a small hiker on the right. I am starting zoomed in on the hiker to establish the subject, then slowly panning left and zooming out to reveal the grand scale of the environment.", "keyframes": [{"time": 0, "x": -10.5, "y": 5.2, "zoom": 1.8}, {"time": 2.5, "x": 15.0, "y": -10.0, "zoom": 2.5}, {"time": ${duration.toFixed(2)}, "x": 0, "y": 0, "zoom": 1.0}]}
`

  try {
    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { inlineData: base64Media }]
        }
      ]
    })

    const text = response.text || ''

    // Fallback manual parse
    const rawJson = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()
    const parsed = JSON.parse(rawJson)

    if (parsed && Array.isArray(parsed.keyframes)) {
      return {
        description: parsed.description || 'Generated auto Ken Burns keyframes.',
        keyframes: parsed.keyframes.map((p: Record<string, unknown>) => ({
          time: Number(p.time) || 0,
          x: Number(p.x) || 0,
          y: Number(p.y) || 0,
          zoom: Number(p.zoom) || 1
        }))
      }
    }

    return null
  } catch (error) {
    console.error('Auto Ken Burns Analysis failed:', error)
    return null
  }
}

export interface SocialPostState {
  history: Record<string, unknown>[]
  currentPost: string
}

/**
 * Starts a new social media post generation session.
 */
export async function startSocialMediaPost(
  platform: string,
  tone: string,
  topic: string
): Promise<SocialPostState> {
  const ai = getAiClient()

  let context = ''
  const mediaParts: Record<string, unknown>[] = []

  try {
    const summary = getTimelineContextSummary()
    if (summary) {
      context = `\n\n--- AUTO-EXTRACTED TIMELINE CONTEXT ---\n${summary}\n`
    }

    // Attempt to grab a frame from the playhead
    const mediaFiles = await getVisibleMediaAtPlayhead()
    if (mediaFiles.length > 0) {
      for (const file of mediaFiles) {
        mediaParts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data
          }
        })
      }
    }
  } catch (err) {
    console.warn('Failed to extract timeline context', err)
  }

  const prompt = `
You are an expert social media manager.
I have just exported a video to post on ${platform}.
Tone: ${tone}

${topic ? `The main topic/description provided by the user is: "${topic}"` : 'The user did not provide a description, so please infer the topic from the timeline context below.'}
${context}

Please generate an engaging social media post for ${platform}.
Requirements:
1. Start with a catchy, scroll-stopping Hook.
2. Include a short, engaging story or description that fits the platform's style.
3. Include 5-8 highly relevant hashtags.
4. Format it cleanly so it can be directly copied and pasted. Do NOT wrap it in markdown block quotes. Just the raw text.
5. IF there are "Required Attributions" listed in the context above (e.g. for Freesound creators), you MUST append them verbatim to the very bottom of the post, separated by an empty line. Do NOT alter them or integrate them into the story.
`

  const userParts = [{ text: prompt }, ...mediaParts]

  const history: Record<string, unknown>[] = [{ role: 'user', parts: userParts }]

  try {
    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: history
    })

    const text = response.text || ''
    history.push({ role: 'model', parts: [{ text }] })

    return { history, currentPost: text }
  } catch (err) {
    console.error('Failed to generate social media post:', err)
    throw err
  }
}

/**
 * Continues an existing social media post generation session.
 */
export async function continueSocialMediaPost(
  history: Record<string, unknown>[],
  userMessage: string
): Promise<SocialPostState> {
  const ai = getAiClient()

  const newHistory = [...history]
  const userPrompt = `
The user says: "${userMessage}"
Please rewrite the social media post based on this feedback. Output ONLY the rewritten post text. Do not wrap it in quotes or markdown.
`
  newHistory.push({ role: 'user', parts: [{ text: userPrompt }] })

  try {
    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: newHistory
    })

    const text = response.text || ''
    newHistory.push({ role: 'model', parts: [{ text }] })

    return { history: newHistory, currentPost: text }
  } catch (err) {
    console.error('Failed to update social media post:', err)
    throw err
  }
}
