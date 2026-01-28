import { ipcRenderer, contextBridge } from 'electron'

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

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('api', {
  listVideos: (): Promise<VideoRecord[]> => ipcRenderer.invoke('videos:list'),
  pickMp4: (): Promise<string | null> => ipcRenderer.invoke('videos:pickMp4'),
  createFromFile: (sourcePath: string): Promise<VideoRecord> => ipcRenderer.invoke('videos:createFromFile', sourcePath),
  getVideo: (videoId: string): Promise<VideoRecord | null> => ipcRenderer.invoke('videos:get', videoId),
  extractMetadata: (videoId: string): Promise<VideoMetadata> => ipcRenderer.invoke('videos:extractMetadata', videoId),
  updateStatus: (videoId: string, status: string): Promise<void> => ipcRenderer.invoke('videos:updateStatus', videoId, status)
})
