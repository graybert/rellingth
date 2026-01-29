import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { VideoDatabase, ClipRecord } from './db'
import { getLogger } from './logger'

const execFileAsync = promisify(execFile)
const logger = getLogger()

interface FFProbeOutput {
  format: {
    duration?: string
    size?: string
  }
  streams: Array<{
    codec_type: string
    r_frame_rate?: string
    width?: number
    height?: number
  }>
}

async function getClipMetadata(clipPath: string): Promise<Partial<ClipRecord>> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      clipPath
    ])

    const data: FFProbeOutput = JSON.parse(stdout)
    const videoStream = data.streams.find(s => s.codec_type === 'video')

    let fps: number | undefined
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number)
      fps = den ? Math.round((num / den) * 100) / 100 : num
    }

    const width = videoStream?.width
    const height = videoStream?.height
    const resolution = width && height ? `${width}x${height}` : undefined

    const duration = data.format.duration ? parseFloat(data.format.duration) : undefined
    const stats = fs.statSync(clipPath)
    const fileSize = stats.size

    return {
      duration,
      fps,
      resolution,
      fileSize
    }
  } catch (error: any) {
    logger.error('Failed to extract clip metadata', { clipPath, error: error.message })
    // Return partial data - we have filename and fileSize at minimum
    const stats = fs.statSync(clipPath)
    return {
      fileSize: stats.size
    }
  }
}

function deleteClipsFromDisk(clipsDir: string): void {
  if (!fs.existsSync(clipsDir)) {
    return
  }

  const files = fs.readdirSync(clipsDir)
  for (const file of files) {
    if (file.endsWith('.mp4')) {
      const filePath = path.join(clipsDir, file)
      fs.unlinkSync(filePath)
      logger.info('Deleted clip file', { filePath })
    }
  }
}

export async function generateClips(videoId: string, db: VideoDatabase): Promise<ClipRecord[]> {
  const video = db.getVideo(videoId)
  if (!video) {
    throw new Error('Video not found')
  }

  const clipsDir = db.getClipsDir(videoId)
  const originalPath = video.originalPath

  logger.info('Starting clip generation', { videoId, originalPath })

  // Step 1: Check idempotency - if DONE and clips exist on disk, skip
  if (video.clipState === 'DONE' && video.clips.length > 0) {
    // Verify clips still exist on disk
    const allExist = video.clips.every(clip => {
      const clipPath = path.join(clipsDir, clip.filename)
      return fs.existsSync(clipPath)
    })

    if (allExist) {
      logger.info('Clips already generated, skipping', { videoId, clipCount: video.clips.length })
      return video.clips
    } else {
      logger.warn('Clips marked as DONE but files missing, regenerating', { videoId })
    }
  }

  // Step 2: Set state to IN_PROGRESS
  db.updateVideo(videoId, { clipState: 'IN_PROGRESS', lastError: null })
  logger.info('Set clip state to IN_PROGRESS', { videoId })

  // Step 3: Clean slate - delete any existing clips
  deleteClipsFromDisk(clipsDir)

  // Step 4: Ensure clips directory exists
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true })
  }

  // Step 5: Run ffmpeg to generate clips with re-encoding for precise boundaries
  // Trade-off: Slower (re-encode) but exact 2-minute clips vs fast (copy) but imprecise
  // For QA tool, precision matters more than speed
  const outputPattern = path.join(clipsDir, 'clip_%03d.mp4')
  const command = [
    '-i', originalPath,
    '-f', 'segment',
    '-segment_time', '120',
    '-force_key_frames', 'expr:gte(t,n_forced*120)', // Force keyframe every 120 seconds
    '-c:v', 'libx264', // H.264 video codec (re-encode for precision)
    '-preset', 'medium', // Balance speed vs quality
    '-crf', '23', // Constant rate factor - 23 is high quality
    '-c:a', 'aac', // AAC audio codec
    '-b:a', '192k', // Audio bitrate 192kbps
    '-reset_timestamps', '1',
    outputPattern
  ]

  logger.info('Executing ffmpeg command (re-encode mode for precise boundaries)', {
    videoId,
    command: `ffmpeg ${command.join(' ')}`,
    note: 'Using re-encode for exact 2-minute clips. Slower but precise.'
  })

  try {
    const startTime = Date.now()
    const { stderr } = await execFileAsync('ffmpeg', command)
    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    logger.ffmpegLog('generateClips', videoId, `ffmpeg ${command.join(' ')}`, 0, stderr)
    logger.info('ffmpeg completed successfully', { videoId, durationSeconds: duration })

    // Step 6: Scan clips directory and extract metadata
    const clipFiles = fs.readdirSync(clipsDir)
      .filter(f => f.endsWith('.mp4'))
      .sort()

    logger.info('Found clip files', { videoId, clipCount: clipFiles.length, files: clipFiles })

    const clips: ClipRecord[] = []
    for (let i = 0; i < clipFiles.length; i++) {
      const filename = clipFiles[i]
      const clipPath = path.join(clipsDir, filename)

      // Calculate start and end times (each clip is 120 seconds except possibly the last)
      const startTime = i * 120
      const metadata = await getClipMetadata(clipPath)
      const clipDuration = metadata.duration || 120
      const endTime = startTime + clipDuration

      clips.push({
        filename,
        startTime,
        endTime,
        duration: clipDuration,
        fps: metadata.fps,
        resolution: metadata.resolution,
        fileSize: metadata.fileSize || 0
      })
    }

    // Step 7: Update database with clips and set state to DONE
    db.updateVideo(videoId, {
      clips,
      clipState: 'DONE',
      lastError: null
    })

    logger.info('Clip generation completed successfully', {
      videoId,
      clipCount: clips.length,
      totalSize: clips.reduce((sum, c) => sum + c.fileSize, 0)
    })

    return clips
  } catch (error: any) {
    // Clean up partial clips on failure
    deleteClipsFromDisk(clipsDir)

    const errorMessage = `ffmpeg failed: ${error.message}`
    logger.error('Clip generation failed', { videoId, error: error.message, stderr: error.stderr })
    logger.ffmpegLog('generateClips', videoId, `ffmpeg ${command.join(' ')}`, error.code || 1, error.stderr || error.message)

    // Update database with error state
    db.updateVideo(videoId, {
      clipState: 'FAILED',
      lastError: errorMessage,
      clips: []
    })

    throw new Error(errorMessage)
  }
}

export async function regenerateClips(videoId: string, db: VideoDatabase): Promise<ClipRecord[]> {
  logger.info('Regenerating clips (clean slate)', { videoId })

  // Force clean slate by clearing state
  const clipsDir = db.getClipsDir(videoId)
  deleteClipsFromDisk(clipsDir)
  db.updateVideo(videoId, {
    clipState: 'NOT_STARTED',
    clips: [],
    lastError: null
  })

  // Now generate fresh
  return generateClips(videoId, db)
}
