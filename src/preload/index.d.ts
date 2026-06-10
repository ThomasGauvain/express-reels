import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      saveProject: (data: string) => Promise<string | null>
      openProject: () => Promise<{ path: string; data: string } | null>
      openExternal: (url: string) => void
      saveThumbnail: (id: string, base64: string) => Promise<string | null>
      readSettings: (key: string) => Promise<string | null>
      writeSettings: (key: string, data: string) => Promise<void>
    }
  }
}
