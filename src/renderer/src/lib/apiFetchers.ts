import { StoryboardAssetOption } from '../store/projectStore'

type PixabayHit = {
  id: number
  tags: string
  user: string
  webformatURL?: string
  largeImageURL?: string
  previewURL?: string
  duration?: number
  picture_id?: string
  videos?: { tiny: { url: string }; large: { url: string } }
}

export async function fetchPixabayOptions(
  query: string,
  type: 'image' | 'video' | 'music',
  apiKey: string
): Promise<StoryboardAssetOption[]> {
  if (!apiKey) return []
  let url = ''

  // Pixabay restricts queries to 100 characters
  const safeQuery = query.length > 100 ? query.substring(0, 100) : query
  const formattedQuery = encodeURIComponent(safeQuery)

  if (type === 'image') {
    url = `https://pixabay.com/api/?key=${apiKey}&q=${formattedQuery}&order=popular&per_page=3`
  } else if (type === 'video') {
    url = `https://pixabay.com/api/videos/?key=${apiKey}&q=${formattedQuery}&order=popular&per_page=3`
  } else {
    // Pixabay doesn't actually have a separate search endpoint for music in the basic API without special access,
    // but assuming there is a theoretical one, we'd use it. However, let's skip music for Pixabay unless supported.
    // Actually Pixabay does have a music API:
    // https://pixabay.com/api/docs/ says order: "popular", "latest". Default is "popular".
    return []
  }

  try {
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Pixabay returned ${res.status}: ${text}`)
    }
    const data = await res.json()
    if (!data.hits) return []

    return data.hits.slice(0, 3).map((hit: PixabayHit) => {
      if (type === 'image') {
        return {
          id: `pixabay-${hit.id}`,
          title: hit.tags,
          previewUrl: hit.webformatURL,
          downloadUrl: hit.largeImageURL,
          source: 'pixabay',
          author: hit.user,
          license: 'Pixabay License',
          thumbnailUrl: hit.previewURL
        } as StoryboardAssetOption
      } else {
        return {
          id: `pixabay-${hit.id}`,
          title: hit.tags,
          previewUrl: hit.videos?.tiny?.url || '',
          downloadUrl: hit.videos?.large?.url || hit.videos?.tiny?.url || '', // Try large, fallback to tiny
          source: 'pixabay',
          author: hit.user,
          license: 'Pixabay License',
          duration: hit.duration,
          thumbnailUrl: hit.picture_id
            ? `https://i.vimeocdn.com/video/${hit.picture_id}_295x166.jpg`
            : undefined
        } as StoryboardAssetOption
      }
    })
  } catch (err) {
    console.error('Pixabay API fetch failed:', err)
    return []
  }
}

type FreesoundHit = {
  id: number | string
  name: string
  username: string
  license: string
  duration: number
  previews: Record<string, string>
}

export async function fetchFreesoundOptions(
  query: string,
  apiKey: string
): Promise<StoryboardAssetOption[]> {
  if (!apiKey) return []
  // sort by rating_desc for popular
  const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&token=${apiKey}&sort=rating_desc&fields=id,name,previews,username,license,duration,download&page_size=3`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text()
      console.warn(`Freesound returned ${res.status}: ${text.substring(0, 150)}...`)
      return []
    }
    const data = await res.json()
    if (!data.results) return []

    return data.results.map((hit: FreesoundHit) => ({
      id: `freesound-${hit.id}`,
      title: hit.name,
      previewUrl: hit.previews['preview-hq-mp3'],
      downloadUrl: hit.previews['preview-hq-mp3'], // For Freesound, actual downloading requires OAuth2 unless we just use the HQ preview link, which is fine for editing. We'll use the HQ preview as the download to avoid OAuth limits.
      source: 'freesound',
      author: hit.username,
      license: hit.license,
      duration: hit.duration
    }))
  } catch (err) {
    console.error('Freesound API fetch failed:', err)
    return []
  }
}

type JamendoHit = {
  id: string
  name: string
  artist_name: string
  audio: string
  audiodownload: string
  duration: number
  image: string
}

export async function fetchJamendoOptions(
  query: string,
  clientId: string
): Promise<StoryboardAssetOption[]> {
  if (!clientId) return []

  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=3&search=${encodeURIComponent(query)}&order=popularity_total`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (!data.results) return []

    return data.results.map((hit: JamendoHit) => ({
      id: `jamendo-${hit.id}`,
      title: hit.name,
      previewUrl: hit.audio,
      downloadUrl: hit.audio,
      source: 'jamendo',
      author: hit.artist_name,
      license: 'Jamendo CC',
      duration: hit.duration,
      thumbnailUrl: hit.image
    }))
  } catch (err) {
    console.error('Jamendo API fetch failed:', err)
    return []
  }
}

type GiphyHit = {
  id: string
  title: string
  username: string
  images: {
    fixed_height_small: { url: string }
    original: { url: string }
  }
}

export async function fetchGiphyOptions(
  query: string,
  apiKey: string
): Promise<StoryboardAssetOption[]> {
  if (!apiKey) return []

  const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=3&rating=g`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (!data.data) return []

    return data.data.map((hit: GiphyHit) => ({
      id: `giphy-${hit.id}`,
      title: hit.title,
      previewUrl: hit.images.fixed_height_small.url,
      downloadUrl: hit.images.original.url,
      source: 'giphy',
      author: hit.username || 'Giphy',
      license: 'Giphy API terms',
      thumbnailUrl: hit.images.fixed_height_small.url
    }))
  } catch (err) {
    console.error('Giphy API fetch failed:', err)
    return []
  }
}
