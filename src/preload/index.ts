import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  saveProject: (data: string) => ipcRenderer.invoke('dialog:saveProject', data),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  openExternal: (url: string) => ipcRenderer.send('open-external-url', url),
  saveThumbnail: (id: string, base64: string) => ipcRenderer.invoke('save-thumbnail', id, base64),
  showItemInFolder: (filePath?: string) => ipcRenderer.invoke('show-item-in-folder', filePath),
  openVideosFolder: () => ipcRenderer.invoke('open-videos-folder'),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  downloadUrl: (url: string, destDir: string, filename: string) =>
    ipcRenderer.invoke('system:download-url', url, destDir, filename),
  readSettings: (key: string) => ipcRenderer.invoke('settings:read', key),
  writeSettings: (key: string, data: string) => ipcRenderer.invoke('settings:write', key, data),
  getGpuInfo: () => ipcRenderer.invoke('system:getGpuInfo'),
  getMediaMetadata: (filePath: string) => ipcRenderer.invoke('media:get-metadata', filePath),
  savePhotoBatch: (photos: { name: string; dataUrl: string }[]) =>
    ipcRenderer.invoke('export-photo-batch', photos),
  generateProxy: (filePath: string) => ipcRenderer.invoke('media:generate-proxy', filePath)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
