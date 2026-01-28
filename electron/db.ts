import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export type VideoStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ClipState = 'NOT_STARTED' | 'DONE' | 'FAILED'

export interface VideoMetadata {
  fps?: number
  resolution?: string
  aspectRatio?: string
  duration?: number
  rotation?: string
  codec?: string
  fileSize?: number
}

export interface VideoRecord {
  id: string
  originalFilename: string
  originalPath: string
  createdAt: string
  status: VideoStatus
  metadata: VideoMetadata | null
  clipState: ClipState
  lastError: string | null
}

interface Database {
  videos: VideoRecord[]
}

const DB_FILE = 'db.json'

export class VideoDatabase {
  private dataDir: string
  private dbPath: string

  constructor() {
    // Use app root directory instead of userData
    const appPath = app.getAppPath()
    this.dataDir = path.join(path.dirname(appPath), 'data')
    this.dbPath = path.join(this.dataDir, DB_FILE)
    this.ensureDataDir()
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  private readDb(): Database {
    if (!fs.existsSync(this.dbPath)) {
      return { videos: [] }
    }
    try {
      const content = fs.readFileSync(this.dbPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      console.error('Failed to read database:', err)
      return { videos: [] }
    }
  }

  private writeDb(db: Database): void {
    const tmpPath = this.dbPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8')
    fs.renameSync(tmpPath, this.dbPath)
  }

  public listVideos(): VideoRecord[] {
    const db = this.readDb()
    return db.videos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  public createVideo(videoRecord: VideoRecord): void {
    const db = this.readDb()
    db.videos.push(videoRecord)
    this.writeDb(db)
  }

  public getVideoDir(videoId: string): string {
    return path.join(this.dataDir, 'videos', videoId)
  }

  public getOriginalVideoPath(videoId: string): string {
    return path.join(this.getVideoDir(videoId), 'original.mp4')
  }

  public getClipsDir(videoId: string): string {
    return path.join(this.getVideoDir(videoId), 'clips')
  }

  public getVideo(videoId: string): VideoRecord | null {
    const db = this.readDb()
    return db.videos.find(v => v.id === videoId) || null
  }

  public updateVideo(videoId: string, updates: Partial<VideoRecord>): void {
    const db = this.readDb()
    const index = db.videos.findIndex(v => v.id === videoId)
    if (index === -1) {
      throw new Error(`Video ${videoId} not found`)
    }
    db.videos[index] = { ...db.videos[index], ...updates }
    this.writeDb(db)
  }
}
