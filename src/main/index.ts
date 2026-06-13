import { app, shell, BrowserWindow, ipcMain, Menu, dialog, powerSaveBlocker } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { exec } from 'child_process'
import { promisify } from 'util'
import ffmpegPath from 'ffmpeg-static'

const execAsync = promisify(exec)

// Read preferences synchronously for Hardware Acceleration
try {
  const prefsPath = join(app.getPath('userData'), 'preferences.json')
  if (fs.existsSync(prefsPath)) {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'))
    if (prefs.forceDedicatedGpu) {
      app.commandLine.appendSwitch('force_high_performance_gpu')
      app.commandLine.appendSwitch('enable-gpu-rasterization')
    }
  }
} catch (e) {
  console.error('Failed to read preferences:', e)
}

// Disable Chromium autoplay policy so the timeline audio engine can play sounds programmatically
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Completely disable Chromium's background throttling and power management
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

// FIX TRACKPAD SCROLL BUG & DECODER CRASH:
// Prevent videos from utilizing hardware decoders or DirectComposition layers.
// When Windows runs out of GPU video decoders, it crashes the pipeline (freezing overlays)
// and orphans the hardware overlay (permanently blocking trackpad wheel events).
app.commandLine.appendSwitch('disable-accelerated-video-decode')
app.commandLine.appendSwitch('disable-features', 'DirectComposition,DirectCompositionVideoOverlays')
app.commandLine.appendSwitch('disable-direct-composition')

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
      webSecurity: false,
      backgroundThrottling: false
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
  // Prevent OS from sleeping or throttling the app
  powerSaveBlocker.start('prevent-app-suspension')
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

  ipcMain.handle('show-item-in-folder', (_, filePath) => {
    if (filePath) {
      shell.showItemInFolder(filePath)
    } else {
      shell.openPath(app.getPath('desktop'))
    }
  })

  ipcMain.handle('open-videos-folder', () => {
    shell.openPath(app.getPath('desktop'))
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

  ipcMain.handle('dialog:openFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return []
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Media', extensions: ['jpg', 'png', 'gif', 'mp4', 'mov', 'mp3', 'wav'] }]
    })
    if (canceled) {
      return []
    } else {
      return filePaths
    }
  })

  ipcMain.handle('dialog:saveProject', async (event, data: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    win.focus() // Force window to front so dialog isn't hidden
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
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

  ipcMain.handle('dialog:openProject', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
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

  ipcMain.handle('system:getGpuInfo', async () => {
    try {
      return await app.getGPUInfo('complete')
    } catch (e) {
      console.error('Failed to get GPU info:', e)
      return null
    }
  })

  ipcMain.handle('system:read-file-base64', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath)
        return data.toString('base64')
      }
      return null
    } catch (err) {
      console.error('Failed to read file for base64:', err)
      return null
    }
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

  ipcMain.handle('save-audio-asset', async (_, id: string, base64Data: string) => {
    const audioDir = join(app.getPath('userData'), 'audio_assets')
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true })
    }
    const buffer = Buffer.from(base64Data, 'base64')
    const filePath = join(audioDir, `${id}.wav`)
    fs.writeFileSync(filePath, buffer)
    return filePath
  })

  let currentTempWebmPath: string | null = null
  let currentTempWriteStream: fs.WriteStream | null = null

  ipcMain.handle('save-video-start', () => {
    currentTempWebmPath = join(app.getPath('temp'), `temp_video_${Date.now()}.webm`)
    currentTempWriteStream = fs.createWriteStream(currentTempWebmPath)
    return true
  })

  ipcMain.handle('save-video-chunk', (_event, chunk: Uint8Array) => {
    if (currentTempWriteStream) {
      currentTempWriteStream.write(Buffer.from(chunk))
    }
    return true
  })

  ipcMain.handle(
    'save-video-finish',
    async (event, format: string, codec?: string, quality?: string, hwAccel?: boolean) => {
      if (currentTempWriteStream) {
        // Wait for the stream to fully flush and close before proceeding
        await new Promise<void>((resolve) => {
          currentTempWriteStream!.end(() => resolve())
        })
        currentTempWriteStream = null
      }

      if (!currentTempWebmPath) return false
      const tempWebmPath = currentTempWebmPath
      currentTempWebmPath = null

      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return false
      const defaultPath = join(app.getPath('desktop'), `Exported_Reel.${format}`)

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Save Video Export',
        defaultPath,
        filters: [{ name: 'Video', extensions: [format] }]
      })

      if (canceled || !filePath) {
        if (fs.existsSync(tempWebmPath)) {
          fs.unlinkSync(tempWebmPath)
        }
        return false
      }

      if (format === 'webm' && (!codec || codec === 'vp9')) {
        // Fast path for raw WebM
        fs.copyFileSync(tempWebmPath, filePath)
        fs.unlinkSync(tempWebmPath)
        return filePath
      }

      try {
        let videoCodecStr = '-c:v libx264'
        let qualityStr = '-crf 23'
        let hwCodecsToTry: string[] = []

        if (codec === 'h264' || !codec) {
          videoCodecStr = '-c:v libx264'
          hwCodecsToTry =
            process.platform === 'darwin'
              ? ['h264_videotoolbox']
              : ['h264_nvenc', 'h264_amf', 'h264_qsv']
          const crf = quality === 'high' ? 18 : quality === 'low' ? 28 : 23
          qualityStr = `-crf ${crf}`
        } else if (codec === 'h265') {
          videoCodecStr = '-c:v libx265'
          hwCodecsToTry =
            process.platform === 'darwin'
              ? ['hevc_videotoolbox']
              : ['hevc_nvenc', 'hevc_amf', 'hevc_qsv']
          const crf = quality === 'high' ? 24 : quality === 'low' ? 32 : 28
          qualityStr = `-crf ${crf}`
          if (format === 'mov') qualityStr += ' -tag:v hvc1'
        } else if (codec === 'prores') {
          videoCodecStr = '-c:v prores_ks'
          const profile = quality === 'high' ? 3 : quality === 'low' ? 0 : 2
          qualityStr = `-profile:v ${profile} -vendor apl0`
        } else if (codec === 'mpeg4') {
          videoCodecStr = '-c:v mpeg4 -vtag xvid'
          const qscale = quality === 'high' ? 2 : quality === 'low' ? 8 : 4
          qualityStr = `-qscale:v ${qscale}`
        } else if (codec === 'vp9') {
          videoCodecStr = '-c:v libvpx-vp9'
          const crf = quality === 'high' ? 30 : quality === 'low' ? 40 : 35
          qualityStr = `-crf ${crf} -b:v 0`
        }

        // Fix MediaRecorder's variable timestamps safely without breaking audio
        const timestampFix = `-async 1 -vsync cfr`

        let success = false
        if (hwAccel && hwCodecsToTry && hwCodecsToTry.length > 0) {
          for (const hwCodec of hwCodecsToTry) {
            try {
              // Map CRF quality to a rough bitrate for generic hardware encoding compatibility
              const bitRate = quality === 'high' ? '15M' : quality === 'low' ? '4M' : '8M'
              const hwCmd = `"${ffmpegPath}" -y -i "${tempWebmPath}" ${timestampFix} -c:v ${hwCodec} -b:v ${bitRate} -c:a aac -b:a 192k "${filePath}"`
              await execAsync(hwCmd)
              success = true
              console.log(`Successfully used hardware encoder: ${hwCodec}`)
              break // Exit loop on first successful hardware encode
            } catch {
              console.log(`Hardware acceleration with ${hwCodec} failed. Trying next...`)
            }
          }
        }

        if (!success) {
          const swCmd = `"${ffmpegPath}" -y -i "${tempWebmPath}" ${timestampFix} ${videoCodecStr} -preset fast ${qualityStr} -c:a aac -b:a 192k "${filePath}"`
          await execAsync(swCmd)
        }

        return filePath
      } catch (err) {
        console.error('FFmpeg video export error:', err)
        throw err
      } finally {
        if (fs.existsSync(tempWebmPath)) {
          fs.unlinkSync(tempWebmPath)
        }
      }
    }
  )

  // Sound Studio IPC
  ipcMain.on('sound-studio:open', () => {
    createSoundStudioWindow()
  })

  ipcMain.handle('sound-studio:save-project', async (event, data: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    win.focus()
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
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

  ipcMain.handle('sound-studio:open-project', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
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

  ipcMain.handle('sound-studio:export-audio', async (event, base64Data: string, format: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const defaultPath = join(app.getPath('desktop'), `SoundStudio_Export.${format}`)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: `Export Audio as ${format.toUpperCase()}`,
      defaultPath,
      filters: [{ name: 'Audio', extensions: [format] }]
    })
    if (canceled || !filePath) return false
    const buffer = Buffer.from(base64Data, 'base64')

    if (format === 'wav') {
      fs.writeFileSync(filePath, buffer)
      return filePath
    }

    // Use ffmpeg for mp3 / aac conversion
    const tempWavPath = join(app.getPath('temp'), `temp_export_${Date.now()}.wav`)
    fs.writeFileSync(tempWavPath, buffer)

    try {
      const ffmpegCmd = `"${ffmpegPath}" -y -i "${tempWavPath}" -b:a 192k "${filePath}"`
      await execAsync(ffmpegCmd)
      return filePath
    } catch (err) {
      console.error('FFmpeg export error:', err)
      throw err
    } finally {
      if (fs.existsSync(tempWavPath)) {
        fs.unlinkSync(tempWavPath)
      }
    }
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
