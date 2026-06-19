import React, { useState, useRef, useEffect } from 'react'
import './StoryboardModal.css'
import {
  X,
  Film,
  Send,
  BrainCircuit,
  Loader2,
  Music,
  Image as ImageIcon,
  Video,
  Wand2,
  CheckCircle2,
  Play,
  Square
} from 'lucide-react'
import { usePlaybackStore } from '../store/playbackStore'
import { useProjectStore, StoryboardAssetOption } from '../store/projectStore'
import { sendCopilotMessage, analyzeSubjectForKenBurns } from '../lib/gemini'
import {
  fetchFreesoundOptions,
  fetchJamendoOptions,
  fetchPixabayOptions,
  fetchGiphyOptions
} from '../lib/apiFetchers'
import { fileToBase64 } from '../lib/contextBridge'
import { assembleStoryboard } from '../lib/assembly'
import { MediaLibrary } from './MediaLibrary'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Timeline } from './Timeline'
import { LivePreview } from './LivePreview'
import { KenBurnsPlanner } from './KenBurnsPlanner'
import { ToolBar } from './ToolBar'

export function StoryboardModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const storyboard = useProjectStore((s) => s.storyboard) || {
    targetPlatform: 'Facebook',
    targetAudience: ['General'],
    sceneDescription: '',
    assetChecklist: []
  }
  const setStoryboardConfig = useProjectStore((s) => s.setStoryboardConfig)
  const setStoryboardScene = useProjectStore((s) => s.setStoryboardScene)
  const setStoryboardChecklist = useProjectStore((s) => s.setStoryboardChecklist)
  const updateStoryboardAssetOption = useProjectStore((s) => s.updateStoryboardAssetOption)
  const copilotMessages = useProjectStore((s) => s.copilotMessages)
  const addCopilotMessage = useProjectStore((s) => s.addCopilotMessage)
  const aiKeys = useProjectStore((s) => s.aiKeys)
  const mediaLibrary = useProjectStore((s) => s.mediaLibrary)
  const selectedMediaId = useProjectStore((s) => s.selectedMediaId)
  const selectedClipId = useProjectStore((s) => s.selectedClipId)
  const clips = useProjectStore((s) => s.clips)
  const addClip = useProjectStore((s) => s.addClip)
  const tracks = useProjectStore((s) => s.tracks)
  const clearCopilotMessages = useProjectStore((s) => s.clearCopilotMessages)
  const clearStoryboard = useProjectStore((s) => s.clearStoryboard)
  const targetDuration = useProjectStore((s) => s.targetDuration)
  const isPlaying = useProjectStore((s) => s.isPlaying)

  type TabId = 'audience' | 'story' | 'motion' | 'vfx' | 'audio' | 'text' | 'voiceover'
  const [activeTab, setActiveTab] = useState<TabId>('audience')

  const [isChatTyping, setIsChatTyping] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  let selectedImage = mediaLibrary.find((m) => m.id === selectedMediaId && m.type === 'image')
  if (!selectedImage && selectedClipId) {
    const clip = clips.find((c) => c.id === selectedClipId)
    if (clip) {
      selectedImage = mediaLibrary.find((m) => m.id === clip.mediaId && m.type === 'image')
    }
  }

  let targetClipId = selectedClipId
  // Fallback: Just grab the first image on the video track if nothing is selected
  if (!selectedImage) {
    const videoTrack = tracks.find((t) => t.id === 'v1') || tracks.find((t) => t.type === 'video')
    if (videoTrack) {
      const firstClip = clips.find((c) => c.trackId === videoTrack.id)
      if (firstClip) {
        selectedImage = mediaLibrary.find((m) => m.id === firstClip.mediaId && m.type === 'image')
        targetClipId = firstClip.id
      }
    }
  }

  // UI state
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false)
  const [isGeneratingMotion, setIsGeneratingMotion] = useState(false)
  const [isAssembling, setIsAssembling] = useState(false)
  const [plannerNodes, setPlannerNodes] = useState<
    {
      id: string
      x: number
      y: number
      zoom: number
      timeSeconds: number
      description: string
    }[]
  >([])

  // Calculate display nodes based on timeline or local state
  let displayNodes = plannerNodes
  const mainClipForDisplay = clips.find((c) => c.id === targetClipId)
  if (
    plannerNodes.length === 0 &&
    mainClipForDisplay?.kenBurnsEffect?.keyframes &&
    mainClipForDisplay.kenBurnsEffect.keyframes.length > 0
  ) {
    displayNodes = mainClipForDisplay.kenBurnsEffect.keyframes.map((kf) => ({
      id: kf.id,
      x: kf.x,
      y: kf.y,
      zoom: kf.zoom,
      timeSeconds: kf.time,
      description: 'Saved Keyframe'
    }))
  }

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const playingAudioRef = useRef<HTMLAudioElement | null>(null)

  const handleTogglePreview = (optId: string, url: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    if (playingAudioId === optId) {
      if (playingAudioRef.current) {
        playingAudioRef.current.pause()
      }
      setPlayingAudioId(null)
    } else {
      if (playingAudioRef.current) {
        playingAudioRef.current.pause()
      }
      const audio = new Audio(url)
      playingAudioRef.current = audio
      audio.play()
      audio.onended = () => setPlayingAudioId(null)
      setPlayingAudioId(optId)
    }
  }

  useEffect(() => {
    return () => {
      if (playingAudioRef.current) {
        playingAudioRef.current.pause()
      }
    }
  }, [])

  // Storyboard config
  const demographics = [
    'General Audience',
    'Male 13-17',
    'Female 13-17',
    'Male 18-24',
    'Female 18-24',
    'Male 25-34',
    'Female 25-34',
    'Male 35-44',
    'Female 35-44',
    'Male 45+',
    'Female 45+'
  ]

  const interestsEntertainment = [
    'Movie Buffs & Cinema Fans',
    'Gamers (Console, PC, Mobile)',
    'Cosplayers & Prop Makers',
    'Anime & Manga Fans',
    'Fantasy & Sci-Fi Geeks',
    'Music Lovers & Concert-Goers',
    'Pop Culture & Celebrity Fans',
    'Bookworms & Readers',
    'Tabletop & RPG Players',
    'True Crime & Mystery Fans',
    'Sports Fans & Athletes'
  ]

  const interestsLifestyle = [
    'Fitness Buffs',
    'Health & Wellness Enthusiasts',
    'Foodies & Home Cooks',
    'Travelers & Adventurers',
    'DIY & Crafters',
    'Outdoor & Nature Enthusiasts',
    'Fashion & Style Enthusiasts',
    'Beauty & Makeup Enthusiasts',
    'Pet Owners & Animal Lovers',
    'Car Enthusiasts & Gearheads',
    'Tech Gadget Enthusiasts',
    'Home Decor & Interior Design'
  ]

  const interestsProfessional = [
    'Corporate Professionals',
    'Blue-Collar Laborers (Construction, HVAC, etc.)',
    'Entrepreneurs & Founders',
    'Software Developers & IT',
    'Real Estate Agents & Investors',
    'Creatives (Designers, Photographers, Artists)',
    'Finance & Investing Enthusiasts',
    'Small Business Owners',
    'Medical & Healthcare Professionals',
    'Educators & Teachers',
    'Event Planners & Hospitality'
  ]

  const platforms = [
    'Facebook',
    'TikTok',
    'Instagram Reels',
    'YouTube Shorts',
    'LinkedIn',
    'X/Twitter'
  ]

  const commercialGoals = [
    'Book Appointments',
    'Visit Website',
    'Call Phone Number',
    'Purchase Online',
    'Get Free Quote/Assessment',
    'Brand Awareness (Non-commercial)',
    'Entertainment (Non-commercial)'
  ]

  const [audience, setAudience] = useState<string[]>(storyboard.targetAudience || ['General'])
  const [platform, setPlatform] = useState(storyboard.targetPlatform || 'Facebook')

  const handleAudienceToggle = (opt: string): void => {
    let next: string[]
    if (audience.includes(opt)) {
      next = audience.filter((a) => a !== opt)
    } else {
      next = [...audience, opt]
    }
    setAudience(next)
    setStoryboardConfig(platform, next)
  }

  const handlePlatformChange = (p: string): void => {
    setPlatform(p)
    setStoryboardConfig(p, audience)
  }

  const handleSendChat = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault()
    if (!chatInput.trim() || isChatTyping) return

    const text = chatInput
    setChatInput('')
    setIsChatTyping(true)

    addCopilotMessage({ id: crypto.randomUUID(), role: 'user', content: text })

    try {
      let customMedia: { mimeType: string; data: string }[] | undefined = undefined
      let systemPrompt = ''

      const baseContext = `Target Platform: ${platform}\nTarget Audience: ${audience.join(', ')}\nStory/Vibe: ${storyboard.sceneDescription || 'Not defined yet.'}`

      if (activeTab === 'story' || activeTab === 'audience') {
        systemPrompt = `
Act as an expert Video Director and Storyteller. Brainstorm the narrative, mood, and feel.
${baseContext}
Have a back-and-forth conversation. If the user likes a story, summarize it so it can be saved.
`
      } else if (activeTab === 'motion') {
        systemPrompt = `
Act as an expert Video Director planning a Ken Burns effect.
${baseContext}
Analyze the image and return ONLY a strict JSON array of keyframes for the movement.
Each keyframe must have:
- x: number (-50 to 50, where 0 is center)
- y: number (-50 to 50, where 0 is center)
- zoom: number (1.0 to 3.0)
- description: string (why we are looking here)
Make sure it's valid JSON format starting with [ and ending with ].
`
      } else if (activeTab === 'vfx') {
        systemPrompt = `
Act as a VFX Supervisor. We are adding Visual Effects.
${baseContext}
Have a back-and-forth conversation about what effects to add.
If the user wants to test an effect, you MUST output a JSON command to fetch assets.
Example: {"commands":[{"action":"FETCH_ASSET", "type":"video", "query":"cinematic overlay", "sourceHint":"pixabay"}]}
`
      } else if (activeTab === 'audio') {
        systemPrompt = `
Act as a Sound Designer. We are adding sound effects and music.
${baseContext}
Have a back-and-forth conversation about audio.
If the user agrees on an audio element, you MUST output a JSON command to FETCH_ASSET.
Example: {"commands":[{"action":"FETCH_ASSET", "type":"audio", "query":"explosion", "sourceHint":"freesound"}]}
`
      }

      if (selectedImage) {
        if (activeTab === 'motion') {
          const mediaObj = await fileToBase64(selectedImage.path)
          customMedia = [mediaObj]
        } else {
          systemPrompt += "\nBase your reasoning on the user's selected image."
        }
      }

      const rawResponse = await sendCopilotMessage(
        text,
        false,
        customMedia,
        systemPrompt,
        copilotMessages
      )

      if (rawResponse) {
        const responseText = rawResponse.text || ''
        const cleanedResponse = responseText.replace(/```json\s*[\s\S]*?\s*```/, '').trim()
        if (cleanedResponse) {
          addCopilotMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: cleanedResponse
          })
        }

        let jsonStr = ''
        const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1]
        } else {
          const arrMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/)
          const objMatch = responseText.match(/\{[\s\S]*\}/)
          if (arrMatch) jsonStr = arrMatch[0]
          else if (objMatch) jsonStr = objMatch[0]
        }

        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr)

            // Motion Ken Burns JSON
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].zoom !== undefined) {
              setPlannerNodes(
                parsed.map((n: Record<string, unknown>, i: number) => ({
                  id: crypto.randomUUID(),
                  x: Number(n.x) || 0,
                  y: Number(n.y) || 0,
                  zoom: Number(n.zoom) || 1,
                  timeSeconds: Number(n.timeSeconds) || i * 2,
                  description: typeof n.description === 'string' ? n.description : `Point ${i + 1}`
                }))
              )
              if (!cleanedResponse) {
                addCopilotMessage({
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: 'I have updated the Ken Burns path on the image based on your request!'
                })
              }
            }
          } catch (err) {
            console.error('Failed to parse AI command', err)
          }
        }

        // Process native Tool Calling from Gemini
        if (rawResponse.functionCalls && rawResponse.functionCalls.length > 0) {
          for (const call of rawResponse.functionCalls) {
            if (call.name === 'execute_timeline_commands') {
              const parsed = call.args as any
              if (parsed.commands && Array.isArray(parsed.commands)) {
                for (const cmd of parsed.commands) {
                  if (cmd.action === 'FETCH_ASSET') {
                    addCopilotMessage({
                      id: crypto.randomUUID(),
                      role: 'assistant',
                      content: `*Fetching ${cmd.type} options for "${cmd.query}" from ${cmd.sourceHint}...*`
                    })

                    let options: StoryboardAssetOption[] = []
                    if (cmd.sourceHint === 'freesound') {
                      options = await fetchFreesoundOptions(cmd.query, aiKeys.freesound || '')
                    } else if (cmd.sourceHint === 'jamendo') {
                      options = await fetchJamendoOptions(cmd.query, aiKeys.jamendo || '')
                    } else if (cmd.sourceHint === 'giphy') {
                      options = await fetchGiphyOptions(cmd.query, aiKeys.giphy || '')
                    } else if (cmd.sourceHint === 'pixabay') {
                      options = await fetchPixabayOptions(cmd.query, cmd.type, aiKeys.pixabay || '')
                    }

                    if (options.length > 0) {
                      const topOptions = options.slice(0, 3)
                      const newReq = {
                        id: crypto.randomUUID(),
                        type: cmd.type as 'audio' | 'video' | 'image',
                        description: cmd.query,
                        options: topOptions,
                        selectedOptionId: null,
                        status: 'pending' as const
                      }

                      setStoryboardChecklist([...storyboard.assetChecklist, newReq])

                      addCopilotMessage({
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: `I found ${options.length} options! I've added the top 3 to the Asset Checklist (in the Story tab) for you to preview and select.`
                      })
                    } else {
                      addCopilotMessage({
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: `I couldn't find any results for "${cmd.query}".`
                      })
                    }
                  } else if (cmd.action === 'ADD_TO_TIMELINE') {
                    // Try to add from checklist
                    const allOptions = storyboard.assetChecklist.flatMap((req) => req.options)
                    const option = allOptions.find((o) => o.id === cmd.id)
                    if (option) {
                      const track = tracks.find(
                        (t) => t.type === (cmd.type === 'audio' ? 'audio' : 'video')
                      )
                      if (track) {
                        addClip({
                          id: crypto.randomUUID(),
                          trackId: track.id,
                          mediaId: option.id,
                          startTime: usePlaybackStore.getState().playhead,
                          duration: 5,
                          sourceOffset: 0
                        })
                        addCopilotMessage({
                          id: crypto.randomUUID(),
                          role: 'assistant',
                          content: `Added ${option.title} directly to your timeline! Hit play to preview it.`
                        })
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      addCopilotMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`
      })
    } finally {
      setIsChatTyping(false)
    }
  }

  const handleRestart = (): void => {
    if (
      confirm('Are you sure you want to clear the AI chat and storyboard? This cannot be undone.')
    ) {
      clearCopilotMessages()
      clearStoryboard()
      setStoryboardConfig(platform, audience)
    }
  }

  const handleAutoDetectAudience = async (): Promise<void> => {
    if (!aiKeys.gemini) {
      alert('Please configure a Gemini API key in Settings first.')
      return
    }
    if (!selectedImage) {
      alert('Please add an image to your timeline before detecting the audience.')
      return
    }

    setIsGeneratingStoryboard(true)
    try {
      const mediaObj = await fileToBase64(selectedImage.path)

      const allAvailableOptions = [
        ...demographics,
        ...interestsEntertainment,
        ...interestsLifestyle,
        ...interestsProfessional,
        ...commercialGoals
      ]

      const prompt = `
        Act as an expert Marketing Director and Consumer Psychologist.
        Analyze the provided image carefully: its environment, mood, subjects, lighting, and activities.
        Based strictly on the visual story and vibe of the image, select the absolute best-matching target audiences and interests from the provided list.
        
        AVAILABLE OPTIONS:
        ${allAvailableOptions.map((opt) => `"${opt}"`).join(', ')}

        Return ONLY a raw JSON array of strings containing ONLY the exact names of the options you selected. Do not include markdown formatting or backticks.
        Example: ["Fitness Buffs", "Female 25-34", "Brand Awareness (Non-commercial)"]
      `
      const rawResponse = await sendCopilotMessage(prompt, false, [mediaObj], undefined, [])
      if (!rawResponse) throw new Error('No response')

      const cleaned = (rawResponse.text || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim()
      const parsed = JSON.parse(cleaned) as string[]

      const validSelections = parsed.filter((p) => allAvailableOptions.includes(p))
      if (validSelections.length > 0) {
        setAudience(validSelections)
        setStoryboardConfig(platform, validSelections)
        alert('Auto-detection complete! Check out the selected categories below.')
      } else {
        alert('The AI could not confidently detect matching categories for this image.')
      }
    } catch (err: unknown) {
      console.error(err)
      alert(`Auto-detection failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsGeneratingStoryboard(false)
    }
  }

  const handleGenerateStoryboard = async (): Promise<void> => {
    if (!aiKeys.gemini) {
      alert('Please configure a Gemini API key in Settings first.')
      return
    }
    if (!selectedImage) {
      alert('Please add an image to your timeline before generating a plan.')
      return
    }
    if (!targetDuration || targetDuration <= 0) {
      alert(
        'Please set a Target Duration using the transport bar at the bottom before generating a plan.'
      )
      return
    }
    if (!audience || audience.length === 0) {
      alert('Please select at least one Target Audience demographic or category.')
      return
    }

    setIsGeneratingStoryboard(true)

    const prompt = `
      Act as an expert Video Director. 
      CRITICAL INSTRUCTION: I have provided a base photograph. You must deeply analyze its visual contents.
             1. List exactly what you physically see in the photo: the environment, the subjects, their outfits, their facial expressions, and any objects. Provide this list in the 'imageAnalysis' JSON field.
             2. You are generating a storyboard for a cinematic video that takes place ENTIRELY within the exact scene shown in this photo.
             3. DO NOT invent backstories, "behind the scenes" montages, crafting, or any actions that are not actively happening in the photo.
             4. The story you tell must literally just be a vivid, cinematic description of the provided image itself.
             5. Generate 'motionKeyframes' to describe a Ken Burns pan and zoom path that highlights key elements of your story in the image.
             6. Analyze the requested target audience and goals (${audience.join(', ')}). If these include Commercial Goals (like booking appointments, visiting websites, purchasing online, etc.), tailor the scene description, pacing, and overall vibe to be promotional, punchy, and include a strong call-to-action tone. If it is targeting Professional groups (like Laborers or Executives), focus on practical value, reliability, and career growth. If targeting Lifestyle/Entertainment groups, focus on immersion, engagement, and storytelling without aggressive sales pitches.
      
      Based on our chat history, generate a detailed Storyboard JSON object targeting ${audience.join(', ')} on ${platform}.
      Return ONLY a JSON block with the following schema:
      {
        "imageAnalysis": "MANDATORY. A detailed list of the items, composition, facial expressions, outfits, and environment you physically see in the photo.",
        "sceneDescription": "A paragraph describing the tone, vibe, and action happening entirely within the provided image. Do NOT add any events, actions, or settings outside of what the image physically depicts.",
        "motionKeyframes": [
          {
            "x": 0, // -50 to 50, where 0 is center
            "y": 0, // -50 to 50, where 0 is center
            "zoom": 1.5, // 1.0 to 3.0
            "description": "why we are looking here"
          }
        ],
        "assetsNeeded": [
          {
            "id": "unique-id",
            "type": "audio" | "video" | "image",
            "description": "Precise search query for the asset API",
            "sourceHint": "jamendo" | "freesound" | "pixabay" | "giphy"
          }
        ]
      }
    `
    try {
      let customMedia: { mimeType: string; data: string }[] | undefined
      if (selectedImage) {
        try {
          const mediaObj = await fileToBase64(selectedImage.path)
          customMedia = [mediaObj]
          console.log('Sending media to Gemini:', {
            mimeType: mediaObj.mimeType,
            dataLength: mediaObj.data.length
          })
        } catch (err) {
          console.error('Failed to load image for storyboard generation', err)
          alert(
            'Failed to read the image file for AI analysis. The AI might not see the image properly.'
          )
        }
      } else {
        console.warn('selectedImage is undefined! The AI will not receive an image.')
      }

      console.log('Prompt being sent to Gemini:', prompt)
      const rawResponse = await sendCopilotMessage(
        prompt,
        false,
        customMedia,
        undefined,
        copilotMessages
      )
      if (!rawResponse) throw new Error('No response')

      console.log('Raw Gemini response:', rawResponse)
      const resText = rawResponse.text || ''
      const match = resText.match(/```json\s*([\s\S]*?)\s*```/) || resText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Failed to parse JSON')

      const blueprint = JSON.parse(match[0].replace(/```json|```/g, ''))
      console.log('Parsed Storyboard Blueprint:', blueprint)

      let finalDescription = blueprint.sceneDescription || 'No description provided.'
      if (blueprint.imageAnalysis) {
        finalDescription = `**AI Visual Discovery:**\n${blueprint.imageAnalysis}\n\n**Determined Story:**\n${finalDescription}`
      }
      setStoryboardScene(finalDescription)

      const checklist = await Promise.all(
        (blueprint.assetsNeeded || []).map(
          async (req: {
            id?: string
            type: 'audio' | 'video' | 'image'
            description: string
            sourceHint?: string
          }) => {
            let options: StoryboardAssetOption[] = []
            if (req.sourceHint === 'freesound') {
              options = await fetchFreesoundOptions(req.description, aiKeys.freesound || '')
              if (options.length === 0) {
                // Fallback to Jamendo if Freesound is down (e.g. 502 Bad Gateway)
                options = await fetchJamendoOptions(req.description, aiKeys.jamendo || '')
              }
            } else if (req.sourceHint === 'jamendo') {
              options = await fetchJamendoOptions(req.description, aiKeys.jamendo || '')
            } else if (req.sourceHint === 'giphy') {
              options = await fetchGiphyOptions(req.description, aiKeys.giphy || '')
            } else if (req.sourceHint === 'pixabay') {
              options = await fetchPixabayOptions(
                req.description,
                req.type === 'audio' ? 'music' : req.type,
                aiKeys.pixabay || ''
              )
            }
            return {
              id: req.id || crypto.randomUUID(),
              type: req.type,
              description: req.description,
              options: options.slice(0, 3),
              selectedOptionId: null,
              status: 'pending' as const
            }
          }
        )
      )

      // Zustand store update
      useProjectStore.getState().setStoryboardChecklist(checklist)

      let newNodes = plannerNodes
      if (blueprint.motionKeyframes && Array.isArray(blueprint.motionKeyframes)) {
        newNodes = blueprint.motionKeyframes.map((n: Record<string, unknown>, i: number) => ({
          id: crypto.randomUUID(),
          x: Number(n.x) || 0,
          y: Number(n.y) || 0,
          zoom: Number(n.zoom) || 1,
          description: typeof n.description === 'string' ? n.description : `Point ${i + 1}`
        }))
        setPlannerNodes(newNodes)

        // Find main clip and apply it
        const videoTrack =
          tracks.find((t) => t.id === 'v1') || tracks.find((t) => t.type === 'video')
        if (videoTrack) {
          const mainClip = clips.find((c) => c.trackId === videoTrack.id)
          if (mainClip) {
            useProjectStore.getState().updateClip(mainClip.id, {
              kenBurnsEffect: {
                id: crypto.randomUUID(),
                mediaId: mainClip.mediaId,
                easing: 'ease-in-out',
                constrainToFrame: false,
                keyframes: newNodes.map((n, idx) => ({
                  id: crypto.randomUUID(),
                  time:
                    idx === 0
                      ? 0
                      : idx === newNodes.length - 1
                        ? targetDuration || 15
                        : ((targetDuration || 15) / (newNodes.length - 1)) * idx,
                  x: n.x,
                  y: n.y,
                  zoom: n.zoom,
                  rotation: 0
                }))
              }
            })
          }
        }
      }

      // Auto-trigger assembly
      await handleAssembleTimeline()
    } catch (err: unknown) {
      alert(`Generation failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsGeneratingStoryboard(false)
    }
  }

  const handleAutoGenerateMotion = async (): Promise<void> => {
    if (!selectedImage) return
    setIsGeneratingMotion(true)

    try {
      const mediaObj = await fileToBase64(selectedImage.path)
      const base64Clean = mediaObj.data.split(',')[1] || mediaObj.data

      const mainClip = clips.find((c) => c.id === targetClipId)
      const clipDuration = mainClip?.duration || 15

      const result = await analyzeSubjectForKenBurns(
        {
          mimeType: mediaObj.mimeType || 'image/jpeg',
          data: base64Clean
        },
        clipDuration
      )

      if (result && result.keyframes) {
        const newNodes = result.keyframes.map((kf) => ({
          id: crypto.randomUUID(),
          timeSeconds: kf.time,
          x: kf.x,
          y: kf.y,
          zoom: kf.zoom,
          description: 'AI Generated'
        }))

        setPlannerNodes(newNodes)

        const finalClip = clips.find((c) => c.id === targetClipId)
        if (finalClip) {
          useProjectStore.getState().updateClip(finalClip.id, {
            kenBurnsEffect: {
              id: finalClip.kenBurnsEffect?.id || crypto.randomUUID(),
              mediaId: finalClip.mediaId,
              easing: 'ease-in-out',
              constrainToFrame: false,
              keyframes: newNodes.map((n) => ({
                id: n.id,
                time: n.timeSeconds || 0,
                x: n.x,
                y: n.y,
                zoom: n.zoom,
                rotation: 0
              }))
            }
          })
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsGeneratingMotion(false)
    }
  }

  const handleClearMotion = (): void => {
    setPlannerNodes([])
    const mainClip = clips.find((c) => c.id === targetClipId)
    if (mainClip) {
      useProjectStore.getState().updateClip(mainClip.id, {
        kenBurnsEffect: undefined
      })
    }
  }

  const restoreMotionToClip = (): void => {
    const state = useProjectStore.getState()
    const videoTrack =
      state.tracks.find((t) => t.id === 'v1') || state.tracks.find((t) => t.type === 'video')
    if (videoTrack && plannerNodes.length > 0) {
      const mainClip = state.clips.find((c) => c.trackId === videoTrack.id)
      if (mainClip) {
        state.updateClip(mainClip.id, {
          kenBurnsEffect: {
            id: crypto.randomUUID(),
            mediaId: mainClip.mediaId,
            easing: 'ease-in-out',
            constrainToFrame: false,
            keyframes: plannerNodes.map((n) => ({
              id: n.id,
              time: n.timeSeconds,
              x: n.x,
              y: n.y,
              zoom: n.zoom,
              rotation: 0
            }))
          }
        })
      }
    }
  }

  const handleAssembleTimeline = async (): Promise<void> => {
    setIsAssembling(true)
    try {
      await assembleStoryboard(false)
      restoreMotionToClip()
    } catch (err: unknown) {
      alert(`Assembly failed: ${err instanceof Error ? err.message : String(err)}`)
      console.error(err)
    } finally {
      setIsAssembling(false)
    }
  }

  const handleGenerateText = async (): Promise<void> => {
    if (!aiKeys.gemini) {
      alert('Please configure a Gemini API key in Settings first.')
      return
    }
    setIsGeneratingStoryboard(true)
    const prompt = `
      Act as an expert Social Media Copywriter. We are making a reel for ${platform} targeting ${audience.join(', ')}.
      Story: ${storyboard.sceneDescription}
      Duration: ${targetDuration}s
      
      Generate a short, punchy 3-5 word text hook (like "POV: You found...").
      Return ONLY a JSON array of commands:
      [
        { "action": "ADD_TEXT_OVERLAY", "text": "YOUR HOOK HERE", "duration": 3 }
      ]
    `
    try {
      const rawResponse = await sendCopilotMessage(
        prompt,
        false,
        undefined,
        undefined,
        copilotMessages
      )
      if (rawResponse) {
        const resText = rawResponse.text || ''
        const match =
          resText.match(/```json\s*([\s\S]*?)\s*```/) || resText.match(/\[\s*\{[\s\S]*\}\s*\]/)
        if (match) {
          const parsed = JSON.parse(match[0].replace(/```json|```/g, ''))
          for (const cmd of parsed) {
            if (cmd.action === 'ADD_TEXT_OVERLAY') {
              addCopilotMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Added text hook: "${cmd.text}"\n(Timeline integration coming soon)`
              })
            }
          }
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsGeneratingStoryboard(false)
    }
  }

  const handleGenerateVoiceover = async (): Promise<void> => {
    if (!aiKeys.gemini) {
      alert('Please configure a Gemini API key in Settings first.')
      return
    }
    setIsGeneratingStoryboard(true)
    const prompt = `
      Act as an expert Scriptwriter. We are making a reel for ${platform} targeting ${audience.join(', ')}.
      Story: ${storyboard.sceneDescription}
      Duration: ${targetDuration}s
      
      Generate a short, engaging voiceover script that fits exactly within the ${targetDuration}s duration.
      Return ONLY a JSON array of commands:
      [
        { "action": "GENERATE_TTS", "script": "The narration text goes here", "voice": "cinematic" }
      ]
    `
    try {
      const rawResponse = await sendCopilotMessage(
        prompt,
        false,
        undefined,
        undefined,
        copilotMessages
      )
      if (rawResponse) {
        const resText = rawResponse.text || ''
        const match =
          resText.match(/```json\s*([\s\S]*?)\s*```/) || resText.match(/\[\s*\{[\s\S]*\}\s*\]/)
        if (match) {
          const parsed = JSON.parse(match[0].replace(/```json|```/g, ''))
          for (const cmd of parsed) {
            if (cmd.action === 'GENERATE_TTS') {
              addCopilotMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Generated Script: "${cmd.script}"\n(TTS Generation coming soon...)`
              })
            }
          }
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsGeneratingStoryboard(false)
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [copilotMessages, isChatTyping])

  const renderIcon = (type: string): React.ReactElement => {
    if (type === 'audio') return <Music size={16} />
    if (type === 'video') return <Video size={16} />
    return <ImageIcon size={16} />
  }

  return (
    <div className="storyboard-modal-overlay">
      <div className="storyboard-modal">
        {/* Header */}
        <div className="storyboard-header">
          <div className="storyboard-title">
            <Film size={18} color="var(--color-accent)" />
            AI Storyboard Mode
          </div>
          <div className="storyboard-header-actions">
            <button
              className="btn-generate"
              onClick={handleGenerateStoryboard}
              disabled={isGeneratingStoryboard || isAssembling}
            >
              {isGeneratingStoryboard ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Wand2 size={16} />
              )}{' '}
              Generate Plan
            </button>
            <button
              className="btn-assemble"
              onClick={handleAssembleTimeline}
              disabled={
                isGeneratingStoryboard || isAssembling || storyboard.assetChecklist.length === 0
              }
            >
              {isAssembling ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}{' '}
              Auto-Assemble
            </button>
            <button
              className="btn-restart"
              onClick={handleRestart}
              disabled={isGeneratingStoryboard || isAssembling}
              title="Clear AI Chat and Storyboard"
            >
              Restart
            </button>
            <button
              className="storyboard-close-btn"
              onClick={onClose}
              title="Close Storyboard Mode"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body uses PanelGroup */}
        <div className="storyboard-body">
          <PanelGroup direction="horizontal" className="storyboard-main-panel-group">
            {/* LEFT SIDEBAR: Library & AI Chat */}
            <Panel defaultSize={20} minSize={15} maxSize={40}>
              <PanelGroup direction="vertical">
                <Panel defaultSize={50} minSize={20}>
                  <MediaLibrary />
                </Panel>
                <PanelResizeHandle className="resize-handle-v" />
                <Panel defaultSize={50} minSize={20} className="storyboard-chat-area-container">
                  <div className="storyboard-chat-area">
                    <div className="chat-messages">
                      {copilotMessages.map((msg) => (
                        <div key={msg.id} className={`sb-chat-msg ${msg.role}`}>
                          {msg.content}
                        </div>
                      ))}
                      {isChatTyping && (
                        <div className="sb-chat-msg assistant storyboard-typing-indicator">
                          <Loader2 size={12} className="spin" /> Thinking...
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="chat-input-area">
                      <form className="chat-form" onSubmit={handleSendChat}>
                        <input
                          type="text"
                          className="chat-input"
                          placeholder="Ask the AI Director..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          disabled={isChatTyping}
                        />
                        <button
                          type="submit"
                          className="chat-send-btn"
                          disabled={!chatInput.trim() || isChatTyping}
                          title="Send message"
                          aria-label="Send message"
                        >
                          <Send size={14} />
                        </button>
                      </form>
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>

            <PanelResizeHandle className="resize-handle-h" />

            {/* MAIN WORKSPACE: Steps, Preview, Timeline */}
            <Panel defaultSize={80} minSize={50}>
              <PanelGroup direction="vertical">
                {/* Top Workspace */}
                <Panel defaultSize={70} minSize={40}>
                  <PanelGroup direction="horizontal">
                    {/* CENTER PANEL: Wizard Tabs */}
                    <Panel
                      id="sb-center"
                      order={1}
                      defaultSize={35}
                      minSize={20}
                      className="storyboard-center-column"
                    >
                      <div className="storyboard-tabs">
                        <div
                          className={`storyboard-tab ${activeTab === 'audience' ? 'active' : ''}`}
                          onClick={() => setActiveTab('audience')}
                        >
                          1. Audience
                        </div>
                        <div
                          className={`storyboard-tab ${activeTab === 'story' ? 'active' : ''}`}
                          onClick={() => setActiveTab('story')}
                        >
                          2. Story
                        </div>
                        <div
                          className={`storyboard-tab ${activeTab === 'motion' ? 'active' : ''}`}
                          onClick={() => setActiveTab('motion')}
                        >
                          3. Motion
                        </div>
                        <div
                          className={`storyboard-tab ${activeTab === 'vfx' ? 'active' : ''}`}
                          onClick={() => setActiveTab('vfx')}
                        >
                          4. Visual FX
                        </div>
                        <div
                          className={`storyboard-tab ${activeTab === 'audio' ? 'active' : ''}`}
                          onClick={() => setActiveTab('audio')}
                        >
                          5. Audio
                        </div>
                        <div
                          className={`storyboard-tab ${activeTab === 'text' ? 'active' : ''}`}
                          onClick={() => setActiveTab('text')}
                        >
                          6. Text Overlays
                        </div>
                        <div
                          className={`storyboard-tab ${activeTab === 'voiceover' ? 'active' : ''}`}
                          onClick={() => setActiveTab('voiceover')}
                        >
                          7. Voiceover
                        </div>
                      </div>
                      <div className="storyboard-step-controls">
                        {activeTab === 'audience' && (
                          <div className="story-section">
                            <h3>Target Platform</h3>
                            <select
                              value={platform}
                              onChange={(e) => handlePlatformChange(e.target.value)}
                              className="storyboard-platform-select"
                              title="Target Platform"
                              aria-label="Target Platform"
                            >
                              {platforms.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                            <h3>Target Audience</h3>
                            <button
                              className="btn-primary storyboard-auto-detect-btn"
                              onClick={handleAutoDetectAudience}
                              disabled={isGeneratingStoryboard || isAssembling}
                              title="Let AI pick the best audience based on your image"
                            >
                              {isGeneratingStoryboard ? (
                                <Loader2 size={16} className="spin storyboard-auto-detect-icon" />
                              ) : (
                                <Wand2 size={16} className="storyboard-auto-detect-icon" />
                              )}
                              Auto-Detect Target Audience
                            </button>
                            <h4 className="storyboard-audience-heading">Demographics</h4>
                            <div className="audience-group storyboard-audience-grid">
                              {demographics.map((opt) => (
                                <label key={opt} className="audience-label">
                                  <input
                                    type="checkbox"
                                    checked={audience.includes(opt)}
                                    onChange={() => handleAudienceToggle(opt)}
                                  />{' '}
                                  {opt}
                                </label>
                              ))}
                            </div>
                            <h4 className="storyboard-audience-heading">
                              Interests: Entertainment & Media
                            </h4>
                            <div className="audience-group storyboard-audience-grid">
                              {interestsEntertainment.map((opt) => (
                                <label key={opt} className="audience-label">
                                  <input
                                    type="checkbox"
                                    checked={audience.includes(opt)}
                                    onChange={() => handleAudienceToggle(opt)}
                                  />{' '}
                                  {opt}
                                </label>
                              ))}
                            </div>
                            <h4 className="storyboard-audience-heading">
                              Interests: Lifestyle & Hobbies
                            </h4>
                            <div className="audience-group storyboard-audience-grid">
                              {interestsLifestyle.map((opt) => (
                                <label key={opt} className="audience-label">
                                  <input
                                    type="checkbox"
                                    checked={audience.includes(opt)}
                                    onChange={() => handleAudienceToggle(opt)}
                                  />{' '}
                                  {opt}
                                </label>
                              ))}
                            </div>
                            <h4 className="storyboard-audience-heading">
                              Interests: Professional & Commercial
                            </h4>
                            <div className="audience-group storyboard-audience-grid">
                              {interestsProfessional.map((opt) => (
                                <label key={opt} className="audience-label">
                                  <input
                                    type="checkbox"
                                    checked={audience.includes(opt)}
                                    onChange={() => handleAudienceToggle(opt)}
                                  />{' '}
                                  {opt}
                                </label>
                              ))}
                            </div>
                            <h4 className="storyboard-audience-heading">Commercial Goals</h4>
                            <div className="audience-group storyboard-audience-grid">
                              {commercialGoals.map((opt) => (
                                <label key={opt} className="audience-label">
                                  <input
                                    type="checkbox"
                                    checked={audience.includes(opt)}
                                    onChange={() => handleAudienceToggle(opt)}
                                  />{' '}
                                  {opt}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        {activeTab === 'story' && (
                          <>
                            <div className="story-section">
                              <h3>
                                <BrainCircuit size={18} /> Director&apos;s Vision
                              </h3>
                              <textarea
                                className="story-textarea"
                                value={storyboard.sceneDescription}
                                onChange={(e) => setStoryboardScene(e.target.value)}
                                placeholder="Chat with the AI to brainstorm, or click Generate Plan!"
                              />
                            </div>
                            <div className="assets-section">
                              <h3>
                                <CheckCircle2 size={18} /> Asset Checklist
                              </h3>
                              {storyboard.assetChecklist.length === 0 ? (
                                <div className="storyboard-empty-state">
                                  No assets required yet.
                                </div>
                              ) : (
                                storyboard.assetChecklist.map((req) => (
                                  <div key={req.id} className="asset-requirement">
                                    <div className="asset-req-header">
                                      <div className="asset-req-title">
                                        {renderIcon(req.type)} {req.description}
                                      </div>
                                    </div>
                                    {req.options.length === 0 ? (
                                      <div className="storyboard-no-results">No results</div>
                                    ) : (
                                      <div className="asset-options-grid">
                                        {req.options.map((opt) => (
                                          <div
                                            key={opt.id}
                                            className={`asset-option ${req.selectedOptionId === opt.id ? 'selected' : ''}`}
                                            onClick={() =>
                                              updateStoryboardAssetOption(req.id, opt.id)
                                            }
                                          >
                                            <div className="asset-info">{opt.title}</div>
                                            <div className="asset-source">
                                              {opt.source}
                                              {opt.previewUrl && req.type === 'audio' && (
                                                <button
                                                  className="preview-play-btn"
                                                  title={
                                                    playingAudioId === opt.id
                                                      ? 'Stop Preview'
                                                      : 'Play Preview'
                                                  }
                                                  aria-label={
                                                    playingAudioId === opt.id
                                                      ? 'Stop Preview'
                                                      : 'Play Preview'
                                                  }
                                                  onClick={(e) =>
                                                    handleTogglePreview(opt.id, opt.previewUrl!, e)
                                                  }
                                                >
                                                  {playingAudioId === opt.id ? (
                                                    <Square fill="currentColor" size={10} />
                                                  ) : (
                                                    <Play size={12} />
                                                  )}
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </>
                        )}
                        {activeTab === 'motion' && (
                          <div className="story-section">
                            <h3>Cinematic Motion</h3>
                            <p className="motion-description">
                              Let the AI Director analyze your image&apos;s visual hook, timeline
                              duration, and story to perfectly choreograph your camera keyframes.
                            </p>
                            <div className="motion-action-buttons">
                              <button
                                className="btn-primary storyboard-auto-detect-btn"
                                onClick={handleAutoGenerateMotion}
                                disabled={isGeneratingMotion || isAssembling}
                                title="Auto-choreograph Ken Burns keypoints"
                              >
                                {isGeneratingMotion ? (
                                  <Loader2 size={16} className="spin storyboard-auto-detect-icon" />
                                ) : (
                                  <Wand2 size={16} className="storyboard-auto-detect-icon" />
                                )}
                                Auto-Generate Cinematic Motion
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={handleClearMotion}
                                disabled={isGeneratingMotion || plannerNodes.length === 0}
                                title="Clear all motion keyframes"
                              >
                                Clear
                              </button>
                            </div>
                            <p className="coming-soon-text motion-coming-soon">
                              Select an image from the Media Library to plot its Ken Burns
                              keyframes.
                            </p>
                          </div>
                        )}
                        {activeTab === 'vfx' && (
                          <div className="story-section">
                            <h3>Visual FX</h3>
                            <p className="coming-soon-text">
                              Chat with the AI to fetch VFX overlay options. Click options in the
                              Asset Checklist (Story tab) to preview them!
                            </p>
                            <button
                              className="sb-generate-btn"
                              onClick={async () => {
                                setIsAssembling(true)
                                try {
                                  await assembleStoryboard(true, 'vfx')
                                  restoreMotionToClip()
                                } catch (e: unknown) {
                                  alert(e instanceof Error ? e.message : String(e))
                                } finally {
                                  setIsAssembling(false)
                                }
                              }}
                            >
                              <CheckCircle2 size={16} /> Assemble VFX
                            </button>
                          </div>
                        )}
                        {activeTab === 'audio' && (
                          <div className="story-section">
                            <h3>Audio & Sound FX</h3>
                            <p className="coming-soon-text">
                              Chat with the AI to fetch sound effects. Play the previews using the
                              play buttons in the Asset Checklist.
                            </p>
                            <button
                              className="sb-generate-btn"
                              onClick={async () => {
                                setIsAssembling(true)
                                try {
                                  await assembleStoryboard(true, 'audio')
                                  restoreMotionToClip()
                                } catch (e: unknown) {
                                  alert(e instanceof Error ? e.message : String(e))
                                } finally {
                                  setIsAssembling(false)
                                }
                              }}
                            >
                              <CheckCircle2 size={16} /> Assemble Audio
                            </button>
                          </div>
                        )}
                        {activeTab === 'text' && (
                          <div className="story-section">
                            <h3>Text Overlays</h3>
                            <p className="coming-soon-text">
                              Generate punchy Text Hooks and Text Overlays using AI, or create them
                              manually.
                            </p>
                            <button
                              className="sb-generate-btn sb-mb-2"
                              onClick={handleGenerateText}
                            >
                              <Wand2 size={16} /> Generate Text Hook
                            </button>
                            <button className="sb-generate-btn" onClick={handleGenerateText}>
                              <Wand2 size={16} /> Generate Text Overlay
                            </button>
                            <h4 className="storyboard-audience-heading sb-mt-4">Manual Controls</h4>
                            <div className="coming-soon-text sb-text-sm">
                              [Typography controls will be added here]
                            </div>
                          </div>
                        )}
                        {activeTab === 'voiceover' && (
                          <div className="story-section">
                            <h3>Voiceover Narration</h3>
                            <p className="coming-soon-text">
                              Generate a TTS voiceover script based on your story using AI, or type
                              it manually.
                            </p>
                            <button className="sb-generate-btn" onClick={handleGenerateVoiceover}>
                              <Wand2 size={16} /> Generate Voiceover
                            </button>
                            <h4 className="storyboard-audience-heading sb-mt-4">Manual Controls</h4>
                            <div className="coming-soon-text sb-text-sm">
                              [TTS selection controls will be added here]
                            </div>
                          </div>
                        )}
                      </div>
                    </Panel>

                    <PanelResizeHandle className="resize-handle-h" />

                    {/* RIGHT PANEL: Live Preview / Ken Burns */}
                    <Panel
                      id="sb-right"
                      order={2}
                      defaultSize={60}
                      minSize={30}
                      className="storyboard-visual-workspace"
                    >
                      {activeTab === 'motion' && selectedImage && !isPlaying ? (
                        <KenBurnsPlanner
                          mediaPath={selectedImage.path}
                          isVideo={selectedImage.type === 'video'}
                          nodes={displayNodes}
                          clipId={targetClipId}
                          onNodeUpdate={(idx, x, y, zoom, timeSeconds) => {
                            setPlannerNodes((prev) => {
                              const next = [...prev]
                              const current = next[idx]
                              if (!current) return prev
                              next[idx] = {
                                ...current,
                                x,
                                y,
                                zoom: zoom ?? current.zoom,
                                timeSeconds: timeSeconds ?? current.timeSeconds
                              }

                              // Sync to clip automatically
                              const mainClip = clips.find((c) => c.id === targetClipId)
                              if (mainClip) {
                                useProjectStore.getState().updateClip(mainClip.id, {
                                  kenBurnsEffect: {
                                    id: mainClip.kenBurnsEffect?.id || crypto.randomUUID(),
                                    mediaId: mainClip.mediaId,
                                    easing: mainClip.kenBurnsEffect?.easing || 'ease-in-out',
                                    constrainToFrame: false,
                                    keyframes: next.map((n) => ({
                                      id: n.id,
                                      time: n.timeSeconds || 0,
                                      x: n.x,
                                      y: n.y,
                                      zoom: n.zoom,
                                      rotation: 0
                                    }))
                                  }
                                })
                              }

                              return next
                            })
                          }}
                          onAddNode={() => {
                            setPlannerNodes((prev) => {
                              const lastTime =
                                prev.length > 0 ? prev[prev.length - 1].timeSeconds : 0
                              const next = [
                                ...prev,
                                {
                                  id: crypto.randomUUID(),
                                  x: 0,
                                  y: 0,
                                  zoom: 1,
                                  timeSeconds: lastTime + 2,
                                  description: 'Manual Keyframe'
                                }
                              ]

                              const mainClip = clips.find((c) => c.id === targetClipId)
                              if (mainClip) {
                                useProjectStore.getState().updateClip(mainClip.id, {
                                  kenBurnsEffect: {
                                    id: mainClip.kenBurnsEffect?.id || crypto.randomUUID(),
                                    mediaId: mainClip.mediaId,
                                    easing: 'ease-in-out',
                                    constrainToFrame: false,
                                    keyframes: next.map((n) => ({
                                      id: n.id,
                                      time: n.timeSeconds,
                                      x: n.x,
                                      y: n.y,
                                      zoom: n.zoom,
                                      rotation: 0
                                    }))
                                  }
                                })
                              }
                              return next
                            })
                          }}
                          onRemoveNode={(idx) => {
                            setPlannerNodes((prev) => {
                              const next = prev.filter((_, i) => i !== idx)

                              const mainClip = clips.find((c) => c.id === targetClipId)
                              if (mainClip) {
                                useProjectStore.getState().updateClip(mainClip.id, {
                                  kenBurnsEffect: {
                                    id: mainClip.kenBurnsEffect?.id || crypto.randomUUID(),
                                    mediaId: mainClip.mediaId,
                                    easing: 'ease-in-out',
                                    constrainToFrame: false,
                                    keyframes: next.map((n) => ({
                                      id: n.id,
                                      time: n.timeSeconds,
                                      x: n.x,
                                      y: n.y,
                                      zoom: n.zoom,
                                      rotation: 0
                                    }))
                                  }
                                })
                              }
                              return next
                            })
                          }}
                        />
                      ) : (
                        <div className="storyboard-live-preview-container">
                          <LivePreview />
                        </div>
                      )}
                    </Panel>

                    <PanelResizeHandle className="resize-handle-h" />

                    {/* TOOL BAR */}
                    <Panel id="sb-toolbar" order={3} defaultSize={5} minSize={3} maxSize={8}>
                      <ToolBar />
                    </Panel>
                  </PanelGroup>
                </Panel>

                <PanelResizeHandle className="resize-handle-v" />

                {/* Bottom Workspace: Timeline */}
                <Panel defaultSize={30} minSize={15}>
                  <Timeline />
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </div>
      </div>
    </div>
  )
}
