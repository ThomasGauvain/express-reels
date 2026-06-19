import exifr from 'exifr'

/**
 * Extracts a thumbnail URL from a RAW file (CR2, NEF, ARW, etc.)
 * Returns a blob URL, or null if no thumbnail is found.
 */
export async function extractRawThumbnail(file: File): Promise<string | null> {
  try {
    // exifr can parse thumbnails from many RAW formats
    const thumbUrl = await exifr.thumbnailUrl(file)
    if (thumbUrl) {
      return thumbUrl
    }
  } catch (error) {
    console.error(`Failed to extract thumbnail for ${file.name}:`, error)
  }

  // Fallback to object URL if it's not a RAW file or extraction failed
  if (file.type.startsWith('image/')) {
    return URL.createObjectURL(file)
  }

  return null
}

/**
 * Parses basic EXIF data from a file
 */
export async function extractExifData(file: File): Promise<Record<string, unknown> | null> {
  try {
    const exif = await exifr.parse(file)
    return exif
  } catch (error) {
    console.error(`Failed to parse EXIF for ${file.name}:`, error)
    return null
  }
}
