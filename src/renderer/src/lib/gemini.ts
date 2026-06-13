import { GoogleGenAI } from '@google/genai'
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
  return new GoogleGenAI({ apiKey })
}

/**
 * Sends a chat message to Gemini Copilot, optionally attaching the timeline state and visible media.
 */
export async function sendCopilotMessage(
  userMessage: string,
  attachContext: boolean
): Promise<string | undefined> {
  const ai = getAiClient()

  const contents: Record<string, unknown>[] = []

  // Build the user prompt
  const parts: Record<string, unknown>[] = [{ text: userMessage }]

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
If the user asks you to add an effect, music, or a keyframe to the timeline, YOU MUST append a JSON block to the END of your response inside triple backticks like this:
\`\`\`json
{
  "commands": [
    { "action": "ADD_AUDIO", "id": "pixabay-12345", "name": "Cinematic Whoosh" },
    { "action": "ADD_VFX", "effectId": "tx-fade" },
    { "action": "ADD_KEYFRAME", "time": 0.5, "x": 50, "y": 50, "zoom": 1.5 }
  ]
}
\`\`\`
Note: ADD_VFX and ADD_KEYFRAME apply to the currently selected or visible clip. ADD_AUDIO adds to the audio track. Keyframe time is in seconds from the start of the clip. x and y are percentages (0-100), where 50 is the center. Zoom is a multiplier (1 = 100%, 2 = 200%).
`
      parts.push({ text: assetSummary })
    } catch (err) {
      console.warn('Failed to attach context to Copilot message:', err)
    }
  }

  contents.push({ role: 'user', parts })

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents,
    config: {
      systemInstruction:
        "You are an expert video editing assistant embedded inside a professional desktop app called Express Reels. Be concise, helpful, and reference the visual context of the user's timeline when it is provided. If asked to add effects, use the exact JSON command syntax."
    }
  })

  return response.text
}

/**
 * Uses Gemini's vision capabilities to find the most interesting subjects in an image.
 * Returns an array of two coordinates (primary and secondary) for a multi-stage cinematic pan.
 */
export async function analyzeSubjectForKenBurns(base64Media: {
  mimeType: string
  data: string
}): Promise<{ x: number; y: number; desc?: string }[] | null> {
  const ai = getAiClient()

  const prompt = `
Analyze this image and identify TWO distinct points of interest (a primary subject, and a secondary contextual point of interest).
Return ONLY a JSON array of two objects with exact percentage coordinates.
Do not wrap it in markdown block quotes. Just the raw JSON.
Example output: [{"x": 45.5, "y": 60.2, "desc": "Face"}, {"x": 80.0, "y": 20.0, "desc": "Background prop"}]

X is 0 at the left, 100 at the right.
Y is 0 at the top, 100 at the bottom.
`

  try {
    const response = await ai.models.generateContent({
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

    if (Array.isArray(parsed) && parsed.length >= 2) {
      return [
        { x: parsed[0].x, y: parsed[0].y, desc: parsed[0].desc },
        { x: parsed[1].x, y: parsed[1].y, desc: parsed[1].desc }
      ]
    } else if (!Array.isArray(parsed) && parsed.x !== undefined) {
      // Fallback if it only returned one
      return [
        { x: parsed.x, y: parsed.y },
        { x: 50, y: 50 }
      ]
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

  const history: Record<string, unknown>[] = [
    { role: 'user', parts: userParts }
  ]

  try {
    const response = await ai.models.generateContent({
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
    const response = await ai.models.generateContent({
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
