import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      saveProject: (data: string) => Promise<string | null>
      openProject: () => Promise<{ path: string; data: string } | null>
      openExternal: (url: string) => void
      saveThumbnail: (id: string, base64: string) => Promise<string | null>
      showItemInFolder: (filePath?: string) => Promise<void>
      openVideosFolder: () => Promise<void>
      pickDirectory: () => Promise<string | null>
      downloadUrl: (url: string, destDir: string, filename: string) => Promise<string>
      readSettings: (key: string) => Promise<string | null>
      writeSettings: (key: string, data: string) => Promise<void>
      getGpuInfo: () => Promise<{
        gpuDevice?: { vendorString: string; deviceString: string; active: boolean }[]
      } | null>
      getMediaMetadata: (filePath: string) => Promise<{ artist: string } | null>
      savePhotoBatch: (photos: { name: string; dataUrl: string }[]) => Promise<string[] | null>
      generateProxy: (filePath: string) => Promise<string | null>
    }
  }
}
