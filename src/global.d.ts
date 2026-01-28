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
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  metadata: VideoMetadata | null
  clipState: 'NOT_STARTED' | 'DONE' | 'FAILED'
  lastError: string | null
}

declare global {
  interface Window {
    api: {
      listVideos: () => Promise<VideoRecord[]>
      pickMp4: () => Promise<string | null>
      createFromFile: (sourcePath: string) => Promise<VideoRecord>
      getVideo: (videoId: string) => Promise<VideoRecord | null>
      extractMetadata: (videoId: string) => Promise<VideoMetadata>
      updateStatus: (videoId: string, status: string) => Promise<void>
    }
  }
}
