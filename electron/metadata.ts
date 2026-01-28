import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import { VideoMetadata } from './db'

const execFileAsync = promisify(execFile)

export async function extractMetadata(videoPath: string): Promise<VideoMetadata> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ])

    const data = JSON.parse(stdout)
    const videoStream = data.streams.find((s: any) => s.codec_type === 'video')

    if (!videoStream) {
      throw new Error('No video stream found')
    }

    // Extract FPS
    let fps: number | undefined
    if (videoStream.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number)
      fps = den ? Math.round((num / den) * 100) / 100 : num
    }

    // Extract resolution
    const width = videoStream.width
    const height = videoStream.height
    const resolution = width && height ? `${width}x${height}` : undefined

    // Extract aspect ratio
    let aspectRatio: string | undefined
    if (videoStream.display_aspect_ratio && videoStream.display_aspect_ratio !== '0:1') {
      aspectRatio = videoStream.display_aspect_ratio
    } else if (width && height) {
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
      const divisor = gcd(width, height)
      aspectRatio = `${width / divisor}:${height / divisor}`
    }

    // Extract duration
    const duration = data.format.duration ? parseFloat(data.format.duration) : undefined

    // Extract rotation (from side_data_list or tags)
    let rotation: string | undefined
    if (videoStream.side_data_list) {
      const rotationData = videoStream.side_data_list.find((sd: any) => sd.rotation !== undefined)
      if (rotationData) {
        rotation = `${rotationData.rotation}°`
      }
    }
    if (!rotation && videoStream.tags?.rotate) {
      rotation = `${videoStream.tags.rotate}°`
    }

    // Extract codec
    const codec = videoStream.codec_name

    // Extract file size
    const stats = fs.statSync(videoPath)
    const fileSize = stats.size

    return {
      fps,
      resolution,
      aspectRatio,
      duration,
      rotation,
      codec,
      fileSize
    }
  } catch (error: any) {
    throw new Error(`Failed to extract metadata: ${error.message}`)
  }
}
