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

interface ClipGenerationResult {
  clips: ClipRecord[]
  generationTimeSeconds: number
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

async function createPreparedVideo(originalPath: string, preparedPath: string, videoId: string): Promise<void> {
  logger.info('Creating prepared video with keyframes every 120s', { videoId, preparedPath })

  const command = [
    '-i', originalPath,
    '-force_key_frames', 'expr:gte(t,n_forced*120)', // Keyframe every 120 seconds
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    preparedPath
  ]

  const startTime = Date.now()
  const { stderr } = await execFileAsync('ffmpeg', command)
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  logger.ffmpegLog('createPreparedVideo', videoId, `ffmpeg ${command.join(' ')}`, 0, stderr)
  logger.info('Prepared video created', { videoId, durationSeconds: duration })
}

export async function generateClips(videoId: string, db: VideoDatabase, preciseMode: boolean = false): Promise<ClipGenerationResult> {
  const overallStartTime = Date.now()
  const video = db.getVideo(videoId)
  if (!video) {
    throw new Error('Video not found')
  }

  const clipsDir = db.getClipsDir(videoId)
  const originalPath = video.originalPath

  logger.info('Starting clip generation', { videoId, originalPath, preciseMode })

  // Check idempotency
  if (video.clipState === 'DONE' && video.clips.length > 0) {
    const allExist = video.clips.every(clip => {
      const clipPath = path.join(clipsDir, clip.filename)
      return fs.existsSync(clipPath)
    })

    if (allExist) {
      logger.info('Clips already generated, skipping', { videoId, clipCount: video.clips.length })
      return {
        clips: video.clips,
        generationTimeSeconds: 0
      }
    } else {
      logger.warn('Clips marked as DONE but files missing, regenerating', { videoId })
    }
  }

  // Set state to IN_PROGRESS
  db.updateVideo(videoId, { clipState: 'IN_PROGRESS', lastError: null })
  logger.info('Set clip state to IN_PROGRESS', { videoId })

  // Clean slate - delete any existing clips
  deleteClipsFromDisk(clipsDir)

  // Ensure clips directory exists
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true })
  }

  try {
    let sourceVideoPath = originalPath

    // Precise mode: Create prepared video if it doesn't exist
    if (preciseMode) {
      const preparedPath = db.getPreparedVideoPath(videoId)

      if (!fs.existsSync(preparedPath)) {
        logger.info('Precise mode: Creating prepared video (one-time cost)', { videoId })
        await createPreparedVideo(originalPath, preparedPath, videoId)
        db.updateVideo(videoId, { preparedVideoPath: preparedPath })
        sourceVideoPath = preparedPath
      } else {
        logger.info('Precise mode: Using existing prepared video (fast)', { videoId })
        sourceVideoPath = preparedPath
      }
    }

    // Segment video (fast with -c copy)
    const outputPattern = path.join(clipsDir, 'clip_%03d.mp4')
    const segmentCommand = [
      '-i', sourceVideoPath,
      '-f', 'segment',
      '-segment_time', '120',
      '-c', 'copy', // Fast copy mode
      '-reset_timestamps', '1',
      outputPattern
    ]

    const mode = preciseMode ? 'precise (using prepared video)' : 'fast (copy mode, approximate durations)'
    logger.info(`Executing ffmpeg segmentation in ${mode}`, {
      videoId,
      command: `ffmpeg ${segmentCommand.join(' ')}`
    })

    const segmentStartTime = Date.now()
    const { stderr } = await execFileAsync('ffmpeg', segmentCommand)
    const segmentDuration = ((Date.now() - segmentStartTime) / 1000).toFixed(2)

    logger.ffmpegLog('segmentVideo', videoId, `ffmpeg ${segmentCommand.join(' ')}`, 0, stderr)
    logger.info('Segmentation completed', { videoId, durationSeconds: segmentDuration })

    // Scan clips directory and extract metadata
    const clipFiles = fs.readdirSync(clipsDir)
      .filter(f => f.endsWith('.mp4'))
      .sort()

    logger.info('Found clip files', { videoId, clipCount: clipFiles.length, files: clipFiles })

    const clips: ClipRecord[] = []
    for (let i = 0; i < clipFiles.length; i++) {
      const filename = clipFiles[i]
      const clipPath = path.join(clipsDir, filename)

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

    const totalTime = ((Date.now() - overallStartTime) / 1000).toFixed(2)

    // Update database
    db.updateVideo(videoId, {
      clips,
      clipState: 'DONE',
      lastError: null,
      lastClipGenerationTime: parseFloat(totalTime)
    })

    logger.info('Clip generation completed successfully', {
      videoId,
      clipCount: clips.length,
      totalSize: clips.reduce((sum, c) => sum + c.fileSize, 0),
      totalTimeSeconds: totalTime
    })

    return {
      clips,
      generationTimeSeconds: parseFloat(totalTime)
    }
  } catch (error: any) {
    // Clean up partial clips on failure
    deleteClipsFromDisk(clipsDir)

    const errorMessage = `ffmpeg failed: ${error.message}`
    logger.error('Clip generation failed', { videoId, error: error.message, stderr: error.stderr })
    logger.ffmpegLog('generateClips', videoId, 'ffmpeg (failed)', error.code || 1, error.stderr || error.message)

    db.updateVideo(videoId, {
      clipState: 'FAILED',
      lastError: errorMessage,
      clips: []
    })

    throw new Error(errorMessage)
  }
}

export async function regenerateClips(videoId: string, db: VideoDatabase, preciseMode: boolean = false): Promise<ClipGenerationResult> {
  logger.info('Regenerating clips (clean slate)', { videoId, preciseMode })

  const clipsDir = db.getClipsDir(videoId)
  deleteClipsFromDisk(clipsDir)
  db.updateVideo(videoId, {
    clipState: 'NOT_STARTED',
    clips: [],
    lastError: null
  })

  return generateClips(videoId, db, preciseMode)
}
