import * as fs from 'fs'
import * as path from 'path'

export type VideoStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ClipState = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'FAILED'

export interface VideoMetadata {
  fps?: number
  resolution?: string
  aspectRatio?: string
  duration?: number
  rotation?: string
  codec?: string
  fileSize?: number
}

export interface ClipRecord {
  filename: string
  startTime: number
  endTime: number
  duration: number
  fps?: number
  resolution?: string
  fileSize: number
}

export interface VideoRecord {
  id: string
  originalFilename: string
  originalPath: string
  preparedVideoPath: string | null
  createdAt: string
  status: VideoStatus
  metadata: VideoMetadata | null
  clipState: ClipState
  lastError: string | null
  clips: ClipRecord[]
  lastClipGenerationTime: number | null
}

interface Database {
  videos: VideoRecord[]
}

const DB_FILE = 'db.json'

export class VideoDatabase {
  private dataDir: string
  private dbPath: string

  constructor() {
    // Use process.cwd() to get repo root (same as logger.ts)
    // This is reliable across dev and production builds
    this.dataDir = path.join(process.cwd(), 'data')
    this.dbPath = path.join(this.dataDir, DB_FILE)
    console.log('[Database] Data directory:', this.dataDir)
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
      const db = JSON.parse(content)

      // Backward compatibility: add clips array and new fields to old records
      db.videos = db.videos.map((video: any) => ({
        ...video,
        clips: video.clips || [],
        preparedVideoPath: video.preparedVideoPath || null,
        lastClipGenerationTime: video.lastClipGenerationTime || null
      }))

      return db
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

  public getPreparedVideoPath(videoId: string): string {
    return path.join(this.getVideoDir(videoId), 'prepared.mp4')
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

  public deleteVideo(videoId: string): void {
    const db = this.readDb()
    db.videos = db.videos.filter(v => v.id !== videoId)
    this.writeDb(db)
  }
}
