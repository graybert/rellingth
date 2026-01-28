import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import { VideoDatabase, VideoRecord } from './db'
import { extractMetadata } from './metadata'
import { getLogger } from './logger'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const db = new VideoDatabase()
const logger = getLogger()

// Register custom protocol for serving local video files
app.whenReady().then(() => {
  protocol.registerFileProtocol('video-file', (request, callback) => {
    const url = request.url.replace('video-file://', '')
    try {
      return callback(decodeURIComponent(url))
    } catch (error) {
      console.error('Failed to serve video file:', error)
    }
  })
})

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  logger.info('Application started')

  // IPC handlers
  ipcMain.handle('videos:list', async () => {
    return db.listVideos()
  })

  ipcMain.handle('videos:pickMp4', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('videos:createFromFile', async (_, sourcePath: string) => {
    try {
      // Validate file extension
      const ext = path.extname(sourcePath).toLowerCase()
      if (ext !== '.mp4') {
        logger.warn('File type validation failed', { sourcePath, ext })
        throw new Error(`Invalid file type: ${ext}. Only .mp4 files are supported.`)
      }

      const videoId = randomUUID()
      const videoDir = db.getVideoDir(videoId)
      const destPath = db.getOriginalVideoPath(videoId)
      const clipsDir = db.getClipsDir(videoId)

      // Create directory structure
      fs.mkdirSync(videoDir, { recursive: true })
      fs.mkdirSync(clipsDir, { recursive: true })

      // Copy file
      fs.copyFileSync(sourcePath, destPath)

      const videoRecord: VideoRecord = {
        id: videoId,
        originalFilename: path.basename(sourcePath),
        originalPath: destPath,
        createdAt: new Date().toISOString(),
        status: 'PENDING',
        metadata: null,
        clipState: 'NOT_STARTED',
        lastError: null,
        clips: []
      }

      db.createVideo(videoRecord)
      logger.info('Video uploaded successfully', { videoId, filename: videoRecord.originalFilename })
      return videoRecord
    } catch (error: any) {
      logger.error('Failed to create video from file', { sourcePath, error: error.message })
      throw error
    }
  })

  ipcMain.handle('videos:get', async (_, videoId: string) => {
    return db.getVideo(videoId)
  })

  ipcMain.handle('videos:extractMetadata', async (_, videoId: string) => {
    try {
      logger.info('Extracting metadata', { videoId })
      const video = db.getVideo(videoId)
      if (!video) {
        throw new Error('Video not found')
      }
      const metadata = await extractMetadata(video.originalPath)
      db.updateVideo(videoId, { metadata })
      logger.info('Metadata extracted successfully', { videoId, metadata })
      return metadata
    } catch (error: any) {
      logger.error('Failed to extract metadata', { videoId, error: error.message })
      throw error
    }
  })

  ipcMain.handle('videos:updateStatus', async (_, videoId: string, status: string) => {
    db.updateVideo(videoId, { status: status as VideoRecord['status'] })
  })

  createWindow()
})
