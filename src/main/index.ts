import { app, shell, BrowserWindow, ipcMain, Menu, dialog, powerSaveBlocker } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import ffmpegPath from 'ffmpeg-static'
import exifr from 'exifr'

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
      backgroundThrottling: false,
      webviewTag: true
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

  ipcMain.handle('dialog:pickDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) {
      return null
    }
    return filePaths[0]
  })

  ipcMain.handle(
    'system:download-url',
    async (_, url: string, destDir: string, filename: string) => {
      try {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }
        const fullPath = join(destDir, filename)

        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`)
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        fs.writeFileSync(fullPath, buffer)
        return fullPath
      } catch (err: unknown) {
        console.error('Download error:', err)
        throw err
      }
    }
  )

  ipcMain.handle('dialog:openDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return []
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (canceled || filePaths.length === 0) {
      return []
    }

    const dirPath = filePaths[0]
    const mediaFiles: string[] = []
    const allowedExts = new Set([
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.mp4',
      '.mov',
      '.mkv',
      '.webm',
      '.avi',
      '.mp3',
      '.wav',
      '.cr2',
      '.nef',
      '.arw'
    ])

    const scanDir = (dir: string): void => {
      try {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const fullPath = join(dir, file)
          try {
            const stat = fs.statSync(fullPath)
            if (stat.isDirectory()) {
              scanDir(fullPath)
            } else {
              const ext = fullPath.substring(fullPath.lastIndexOf('.')).toLowerCase()
              if (allowedExts.has(ext)) {
                mediaFiles.push(fullPath)
              }
            }
          } catch (err) {
            console.error('Error stating file', fullPath, err)
          }
        }
      } catch (err) {
        console.error('Error reading dir', dir, err)
      }
    }

    scanDir(dirPath)
    return mediaFiles
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
    const tempPath = join(app.getPath('userData'), `${key}.tmp`)
    try {
      fs.writeFileSync(tempPath, data, 'utf-8')
      fs.renameSync(tempPath, filePath)
    } catch (e) {
      console.error('Failed to write settings atomically:', e)
    }
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

  ipcMain.handle('system:read-file-buffer', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath)
        return new Uint8Array(data)
      }
      return null
    } catch (e) {
      console.error('Failed to read file buffer', e)
      return null
    }
  })

  ipcMain.handle('debug:log', async (_, data: string) => {
    fs.writeFileSync(join(app.getPath('userData'), 'debug-export.json'), data)
    return true
  })

  ipcMain.handle('system:decode-audio-ffmpeg', async (_, filePath: string) => {
    return new Promise((resolve) => {
      try {
        let binaryPath = ffmpegPath as string
        if (binaryPath.replace('app.asar', 'app.asar.unpacked')) {
          binaryPath = binaryPath.replace('app.asar', 'app.asar.unpacked')
        }

        const ffmpeg = spawn(binaryPath, [
          '-i',
          filePath,
          '-vn', // no video
          '-acodec',
          'pcm_s16le',
          '-ar',
          '48000',
          '-ac',
          '2',
          '-f',
          'wav',
          'pipe:1'
        ])

        const chunks: Buffer[] = []
        ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))

        ffmpeg.on('close', (code: number) => {
          if (code === 0) {
            resolve(new Uint8Array(Buffer.concat(chunks)))
          } else {
            console.error('ffmpeg decode failed with code', code)
            resolve(null)
          }
        })
      } catch (e) {
        console.error('system:decode-audio-ffmpeg error', e)
        resolve(null)
      }
    })
  })

  ipcMain.handle('media:get-metadata', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        // Parse metadata using exifr (works for jpg, png, tiff, heic, mov, mp4)
        const metadata = await exifr.parse(filePath)
        if (metadata) {
          // Look for common artist/author fields
          const artist =
            metadata.Artist ||
            metadata.Author ||
            metadata.Creator ||
            metadata.Photographer ||
            metadata.Copyright
          if (artist) {
            return { artist: artist.toString().trim() }
          }
        }
      }
      return null
    } catch (err) {
      console.error(`Failed to extract metadata for ${filePath}:`, err)
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

  let currentTempH264Path: string | null = null
  let currentTempAudioPath: string | null = null
  let currentTempWriteStream: fs.WriteStream | null = null

  ipcMain.handle('save-video-start', () => {
    currentTempH264Path = join(app.getPath('temp'), `temp_video_${Date.now()}.h264`)
    currentTempWriteStream = fs.createWriteStream(currentTempH264Path)
    return true
  })

  ipcMain.handle('save-audio-buffer', (_event, buffer: Uint8Array) => {
    currentTempAudioPath = join(app.getPath('temp'), `temp_audio_${Date.now()}.wav`)
    fs.writeFileSync(currentTempAudioPath, Buffer.from(buffer))
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
    async (
      event,
      format: string,
      codec?: string,
      quality?: string,
      _hwAccel?: boolean,
      fps: number = 30
    ) => {
      if (currentTempWriteStream) {
        // Wait for the stream to fully flush and close before proceeding
        await new Promise<void>((resolve) => {
          currentTempWriteStream!.end(() => resolve())
        })
        currentTempWriteStream = null
      }

      if (!currentTempH264Path || !currentTempAudioPath) return false
      const tempH264Path = currentTempH264Path
      const tempAudioPath = currentTempAudioPath
      currentTempH264Path = null
      currentTempAudioPath = null

      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return false
      const defaultPath = join(app.getPath('desktop'), `Exported_Reel.${format}`)

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Save Video Export',
        defaultPath,
        filters: [{ name: 'Video', extensions: [format] }]
      })

      if (canceled || !filePath) {
        if (fs.existsSync(tempH264Path)) fs.unlinkSync(tempH264Path)
        if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath)
        return false
      }

      try {
        let success = false

        // Since VideoEncoder already produced flawless H.264 Annex B, if the user requested H.264 MP4/MOV,
        // we can achieve instantaneous saving by copying the stream without re-encoding!
        if ((format === 'mp4' || format === 'mov') && (codec === 'h264' || !codec)) {
          const muxCmd = `"${ffmpegPath}" -y -framerate ${fps} -i "${tempH264Path}" -i "${tempAudioPath}" -c:v copy -c:a aac -b:a 192k "${filePath}"`
          await execAsync(muxCmd)
          success = true
        }

        // If they requested a different codec/format (like WebM or ProRes), we have to transcode the flawless H.264 temp file
        if (!success) {
          let videoCodecStr = '-c:v libx264'
          let qualityStr = '-crf 23'

          if (codec === 'h265') {
            videoCodecStr = '-c:v libx265'
            const crf = quality === 'high' ? 24 : quality === 'low' ? 32 : 28
            qualityStr = `-crf ${crf}`
            if (format === 'mov') qualityStr += ' -tag:v hvc1'
          } else if (codec === 'prores') {
            videoCodecStr = '-c:v prores_ks'
            const profile = quality === 'high' ? 3 : quality === 'low' ? 0 : 2
            qualityStr = `-profile:v ${profile} -vendor apl0`
          } else if (codec === 'vp9' || format === 'webm') {
            videoCodecStr = '-c:v libvpx-vp9'
            const crf = quality === 'high' ? 30 : quality === 'low' ? 40 : 35
            qualityStr = `-crf ${crf} -b:v 0`
          }

          const transcodeCmd = `"${ffmpegPath}" -y -framerate ${fps} -i "${tempH264Path}" -i "${tempAudioPath}" ${videoCodecStr} -preset fast ${qualityStr} -c:a aac -b:a 192k "${filePath}"`
          await execAsync(transcodeCmd)
        }

        return filePath
      } catch (err) {
        console.error('FFmpeg video export error:', err)
        throw err
      } finally {
        if (fs.existsSync(tempH264Path)) fs.unlinkSync(tempH264Path)
        if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath)
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

  ipcMain.handle('export-photo-batch', async (_, photos: { name: string; dataUrl: string }[]) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Export Folder',
      properties: ['openDirectory', 'createDirectory']
    })

    if (canceled || filePaths.length === 0) {
      return null
    }

    const exportDir = filePaths[0]
    const savedPaths: string[] = []

    for (const photo of photos) {
      try {
        // Strip data prefix (e.g., "data:image/jpeg;base64,")
        const base64Data = photo.dataUrl.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        const safeName = photo.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        // Extract extension from dataUrl
        const extMatch = photo.dataUrl.match(/^data:image\/(\w+);base64,/)
        const ext = extMatch ? extMatch[1] : 'jpeg'

        const filePath = join(exportDir, `${safeName}.${ext}`)
        fs.writeFileSync(filePath, buffer)
        savedPaths.push(filePath)
      } catch (err) {
        console.error('Failed to save photo:', photo.name, err)
      }
    }

    return savedPaths
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
