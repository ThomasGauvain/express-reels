// Simple XMP Parser for Lightroom Presets
// Extracts basic CRS settings (Exposure, Contrast, Highlights, Shadows, Whites, Blacks)

export interface ParsedXmpEdits {
  exposure?: number
  contrast?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
  temperature?: number
  tint?: number
  vibrance?: number
  saturation?: number
}

export function parseLightroomXmp(xmpContent: string): ParsedXmpEdits {
  const edits: ParsedXmpEdits = {}

  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmpContent, 'text/xml')

    // Look for Description element with crs namespace
    const descriptionTags = xmlDoc.getElementsByTagName('rdf:Description')

    for (let i = 0; i < descriptionTags.length; i++) {
      const node = descriptionTags[i]

      const getAttr = (name: string): string | null => {
        return node.getAttribute(`crs:${name}`) || node.getAttribute(name)
      }

      if (getAttr('Exposure2012')) edits.exposure = parseFloat(getAttr('Exposure2012')!)
      if (getAttr('Contrast2012')) edits.contrast = parseFloat(getAttr('Contrast2012')!)
      if (getAttr('Highlights2012')) edits.highlights = parseFloat(getAttr('Highlights2012')!)
      if (getAttr('Shadows2012')) edits.shadows = parseFloat(getAttr('Shadows2012')!)
      if (getAttr('Whites2012')) edits.whites = parseFloat(getAttr('Whites2012')!)
      if (getAttr('Blacks2012')) edits.blacks = parseFloat(getAttr('Blacks2012')!)
      if (getAttr('Temperature')) edits.temperature = parseFloat(getAttr('Temperature')!)
      if (getAttr('Tint')) edits.tint = parseFloat(getAttr('Tint')!)
      if (getAttr('Vibrance')) edits.vibrance = parseFloat(getAttr('Vibrance')!)
      if (getAttr('Saturation')) edits.saturation = parseFloat(getAttr('Saturation')!)
    }
  } catch (error) {
    console.error('Failed to parse XMP preset:', error)
  }

  return edits
}
