import { GoogleGenAI } from '@google/genai'

/** @returns {Promise<void>} */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY })
  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
  })
  console.log('1.5-flash:', response.text)

  try {
    const response2 = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    })
    console.log('3.5-flash:', response2.text)
  } catch (err) {
    console.error('3.5-flash error:', err.message)
  }
}

run()
