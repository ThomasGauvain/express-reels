import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  saveProject: (data: string) => ipcRenderer.invoke('dialog:saveProject', data),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  openExternal: (url: string) => ipcRenderer.send('open-external-url', url),
  saveThumbnail: (id: string, base64: string) => ipcRenderer.invoke('save-thumbnail', id, base64),
  readSettings: (key: string) => ipcRenderer.invoke('settings:read', key),
  writeSettings: (key: string, data: string) => ipcRenderer.invoke('settings:write', key, data),
  getGpuInfo: () => ipcRenderer.invoke('system:getGpuInfo')
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
