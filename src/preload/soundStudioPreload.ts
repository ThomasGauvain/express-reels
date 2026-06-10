import { contextBridge, ipcRenderer } from 'electron'

const soundStudioApi = {
  // Window controls
  minimize: () => ipcRenderer.send('sound-studio:window-minimize'),
  maximize: () => ipcRenderer.send('sound-studio:window-maximize'),
  close: () => ipcRenderer.send('sound-studio:window-close'),

  // Project management
  saveProject: (data: string) => ipcRenderer.invoke('sound-studio:save-project', data),
  openProject: () => ipcRenderer.invoke('sound-studio:open-project'),

  // Export
  exportAudio: (base64Data: string, format: string) =>
    ipcRenderer.invoke('sound-studio:export-audio', base64Data, format),

  // Send to main app library
  sendToLibrary: (mediaItem: string) => ipcRenderer.send('sound-studio:send-to-library', mediaItem),

  // Settings (shared with main app)
  readSettings: (key: string) => ipcRenderer.invoke('settings:read', key),
  writeSettings: (key: string, data: string) => ipcRenderer.invoke('settings:write', key, data)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('soundStudioApi', soundStudioApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore: window.soundStudioApi is injected by this preload in non-isolated contexts
  window.soundStudioApi = soundStudioApi
}
