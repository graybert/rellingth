import { useState, useEffect } from 'react'
import type { VideoRecord } from './global'

interface ClipsViewProps {
  videoId: string
  onBack: () => void
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return 'N/A'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return 'N/A'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function ClipsView({ videoId, onBack }: ClipsViewProps) {
  const [video, setVideo] = useState<VideoRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadVideo()
  }, [videoId])

  const loadVideo = async () => {
    try {
      const v = await window.api.getVideo(videoId)
      setVideo(v)
      setLoading(false)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>
  if (!video) return <div style={{ padding: '20px' }}>Video not found</div>
  if (video.clips.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <button onClick={onBack}>← Back to QA</button>
        <h1>Clips: {video.originalFilename}</h1>
        <p>No clips generated yet.</p>
      </div>
    )
  }

  const selectedClip = selectedClipIndex !== null ? video.clips[selectedClipIndex] : null
  const clipPath = selectedClip ? `video-file://${video.originalPath.replace('original.mp4', `clips/${selectedClip.filename}`)}` : ''

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={onBack} style={{ marginBottom: '20px' }}>← Back to QA</button>

      <h1>Clips: {video.originalFilename}</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        {video.clips.length} clips • Total size: {formatBytes(video.clips.reduce((sum, c) => sum + c.fileSize, 0))}
      </p>

      {error && (
        <div style={{ padding: '10px', background: '#fee', border: '1px solid #c00', marginBottom: '20px' }}>
          Error: {error}
        </div>
      )}

      {selectedClip && (
        <div style={{ marginBottom: '30px', padding: '20px', background: '#f9f9f9', border: '1px solid #ddd' }}>
          <h2 style={{ marginTop: 0 }}>{selectedClip.filename}</h2>
          <video
            key={clipPath}
            controls
            autoPlay
            style={{ maxWidth: '800px', width: '100%', background: '#000', marginBottom: '15px' }}
            src={clipPath}
          >
            Your browser does not support the video tag.
          </video>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', maxWidth: '500px' }}>
            <div>
              <strong>Duration:</strong> {formatDuration(selectedClip.duration)}
            </div>
            <div>
              <strong>Resolution:</strong> {selectedClip.resolution || 'N/A'}
            </div>
            <div>
              <strong>FPS:</strong> {selectedClip.fps || 'N/A'}
            </div>
            <div>
              <strong>File Size:</strong> {formatBytes(selectedClip.fileSize)}
            </div>
            <div>
              <strong>Start Time:</strong> {formatDuration(selectedClip.startTime)}
            </div>
            <div>
              <strong>End Time:</strong> {formatDuration(selectedClip.endTime)}
            </div>
          </div>
        </div>
      )}

      <h2>All Clips</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
        {video.clips.map((clip, index) => (
          <div
            key={clip.filename}
            onClick={() => setSelectedClipIndex(index)}
            style={{
              padding: '15px',
              border: selectedClipIndex === index ? '2px solid #2196F3' : '1px solid #ddd',
              background: selectedClipIndex === index ? '#e3f2fd' : '#fff',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{clip.filename}</div>
            <div style={{ fontSize: '13px', color: '#666' }}>
              {formatDuration(clip.duration)}
            </div>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
              {formatBytes(clip.fileSize)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
