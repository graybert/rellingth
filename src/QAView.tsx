import { useState, useEffect } from 'react'
import type { VideoRecord, VideoMetadata } from './global'

interface QAViewProps {
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

export default function QAView({ videoId, onBack }: QAViewProps) {
  const [video, setVideo] = useState<VideoRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
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

  const handleExtractMetadata = async () => {
    setExtracting(true)
    setError(null)
    try {
      const metadata = await window.api.extractMetadata(videoId)
      setVideo(prev => prev ? { ...prev, metadata } : null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExtracting(false)
    }
  }

  const handleApprove = async () => {
    try {
      await window.api.updateStatus(videoId, 'APPROVED')
      setVideo(prev => prev ? { ...prev, status: 'APPROVED' } : null)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleReject = async () => {
    try {
      await window.api.updateStatus(videoId, 'REJECTED')
      setVideo(prev => prev ? { ...prev, status: 'REJECTED' } : null)
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>
  if (!video) return <div style={{ padding: '20px' }}>Video not found</div>

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={onBack} style={{ marginBottom: '20px' }}>← Back to Dashboard</button>

      <h1>QA: {video.originalFilename}</h1>
      <p>Status: <strong>{video.status}</strong></p>

      {error && (
        <div style={{ padding: '10px', background: '#fee', border: '1px solid #c00', marginBottom: '20px' }}>
          Error: {error}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h2>Video Player</h2>
        <video
          controls
          style={{ maxWidth: '800px', width: '100%', background: '#000' }}
          src={`video-file://${video.originalPath}`}
        >
          Your browser does not support the video tag.
        </video>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>Technical Metadata</h2>
        {!video.metadata ? (
          <div>
            <p>Metadata not extracted yet.</p>
            <button onClick={handleExtractMetadata} disabled={extracting}>
              {extracting ? 'Extracting...' : 'Extract Metadata'}
            </button>
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>FPS</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.fps || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>Resolution</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.resolution || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>Aspect Ratio</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.aspectRatio || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>Duration</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{formatDuration(video.metadata.duration)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>Rotation</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.rotation || 'None (0°)'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>Codec</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.codec || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>File Size</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{formatBytes(video.metadata.fileSize)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2>Actions</h2>
        <button
          onClick={handleApprove}
          disabled={video.status === 'APPROVED'}
          style={{ marginRight: '10px', padding: '10px 20px', background: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Approve
        </button>
        <button
          onClick={handleReject}
          disabled={video.status === 'REJECTED'}
          style={{ padding: '10px 20px', background: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
