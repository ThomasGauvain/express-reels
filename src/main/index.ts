import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// Disable Chromium autoplay policy so the timeline audio engine can play sounds programmatically
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Remove default application menu to prevent it from intercepting renderer keyboard shortcuts
  Menu.setApplicationMenu(null)

  // Log renderer console messages to terminal
  mainWindow.webContents.on('console-message', (_, _level, message) => {
    console.log(`[Renderer] ${message}`)
  })

  // Open devtools
  mainWindow.webContents.openDevTools()

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let soundStudioWindow: BrowserWindow | null = null

function createSoundStudioWindow(): void {
  if (soundStudioWindow && !soundStudioWindow.isDestroyed()) {
    soundStudioWindow.focus()
    return
  }

  soundStudioWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    autoHideMenuBar: true,
    title: 'Sound Studio — Express Reels',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/soundStudioPreload.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  soundStudioWindow.on('ready-to-show', () => {
    soundStudioWindow!.show()
  })

  soundStudioWindow.on('closed', () => {
    soundStudioWindow = null
  })

  soundStudioWindow.webContents.on('console-message', (_, _level, message) => {
    console.log(`[SoundStudio] ${message}`)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    soundStudioWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/sound-studio.html`)
  } else {
    soundStudioWindow.loadFile(join(__dirname, '../renderer/sound-studio.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.on('open-external-url', (_, url) => {
    shell.openExternal(url)
  })

  // Window Controls IPC
  ipcMain.on('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.minimize()
  })

  ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
  })

  ipcMain.on('window-close', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.close()
  })

  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Media', extensions: ['jpg', 'png', 'gif', 'mp4', 'mov', 'mp3', 'wav'] }]
    })
    if (canceled) {
      return []
    } else {
      return filePaths
    }
  })

  ipcMain.handle('dialog:saveProject', async (_, data: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Project',
      defaultPath: 'project.xpr',
      filters: [{ name: 'Express Reels Project', extensions: ['xpr', 'json'] }]
    })

    if (!canceled && filePath) {
      fs.writeFileSync(filePath, data, 'utf-8')
      return filePath
    }
    return null
  })

  ipcMain.handle('dialog:openProject', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open Project',
      properties: ['openFile'],
      filters: [{ name: 'Express Reels Project', extensions: ['xpr', 'json'] }]
    })

    if (!canceled && filePaths.length > 0) {
      const data = fs.readFileSync(filePaths[0], 'utf-8')
      return { path: filePaths[0], data }
    }
    return null
  })

  ipcMain.handle('settings:read', async (_, key: string) => {
    const filePath = join(app.getPath('userData'), `${key}.json`)
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
    return null
  })

  ipcMain.handle('settings:write', async (_, key: string, data: string) => {
    const filePath = join(app.getPath('userData'), `${key}.json`)
    fs.writeFileSync(filePath, data, 'utf-8')
    return true
  })

  ipcMain.handle('save-thumbnail', async (_, id: string, base64Data: string) => {
    // Create thumbnails directory if it doesn't exist
    const thumbnailsDir = join(app.getPath('userData'), 'thumbnails')
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true })
    }

    // Strip the data URL prefix
    const base64DataOnly = base64Data.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64DataOnly, 'base64')

    const filePath = join(thumbnailsDir, `${id}.jpg`)
    fs.writeFileSync(filePath, buffer)

    // Return the safe file:// protocol path
    return `file:///${filePath.replace(/\\/g, '/')}`
  })

  ipcMain.handle('save-video', async (_, base64Data: string, format: string) => {
    const defaultPath = join(app.getPath('desktop'), `Exported_Reel.${format}`)

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Video Export',
      defaultPath,
      filters: [{ name: 'Video', extensions: [format] }]
    })

    if (canceled || !filePath) return false

    const buffer = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(filePath, buffer)

    return filePath
  })

  // Sound Studio IPC
  ipcMain.on('sound-studio:open', () => {
    createSoundStudioWindow()
  })

  ipcMain.handle('sound-studio:save-project', async (_, data: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Sound Studio Project',
      defaultPath: 'sound-project.xps',
      filters: [{ name: 'Sound Studio Project', extensions: ['xps', 'json'] }]
    })
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, data, 'utf-8')
      return filePath
    }
    return null
  })

  ipcMain.handle('sound-studio:open-project', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open Sound Studio Project',
      properties: ['openFile'],
      filters: [{ name: 'Sound Studio Project', extensions: ['xps', 'json'] }]
    })
    if (!canceled && filePaths.length > 0) {
      const data = fs.readFileSync(filePaths[0], 'utf-8')
      return { path: filePaths[0], data }
    }
    return null
  })

  ipcMain.handle('sound-studio:export-audio', async (_, base64Data: string, format: string) => {
    const defaultPath = join(app.getPath('desktop'), `SoundStudio_Export.${format}`)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: `Export Audio as ${format.toUpperCase()}`,
      defaultPath,
      filters: [{ name: 'Audio', extensions: [format] }]
    })
    if (canceled || !filePath) return false
    const buffer = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(filePath, buffer)
    return filePath
  })

  ipcMain.on('sound-studio:send-to-library', (_, mediaItem: string) => {
    // Broadcast to the main window
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win !== soundStudioWindow) {
        win.webContents.send('sound-studio:add-to-library', mediaItem)
      }
    })
  })

  ipcMain.on('sound-studio:window-minimize', () => {
    if (soundStudioWindow) soundStudioWindow.minimize()
  })

  ipcMain.on('sound-studio:window-maximize', () => {
    if (soundStudioWindow) {
      if (soundStudioWindow.isMaximized()) {
        soundStudioWindow.unmaximize()
      } else {
        soundStudioWindow.maximize()
      }
    }
  })

  ipcMain.on('sound-studio:window-close', () => {
    if (soundStudioWindow) soundStudioWindow.close()
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
