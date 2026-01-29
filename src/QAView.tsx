import { useState, useEffect } from 'react'
import type { VideoRecord } from './global'

interface QAViewProps {
  videoId: string
  onBack: () => void
  onViewClips: (videoId: string) => void
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

export default function QAView({ videoId, onBack, onViewClips }: QAViewProps) {
  const [video, setVideo] = useState<VideoRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [clipping, setClipping] = useState(false)
  const [preciseMode, setPreciseMode] = useState(false)
  const [showMetadata, setShowMetadata] = useState(true)
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

  const handleGenerateClips = async () => {
    setClipping(true)
    setError(null)
    try {
      const result = await window.api.generateClips(videoId, preciseMode)
      setVideo(prev => prev ? {
        ...prev,
        clips: result.clips,
        clipState: 'DONE',
        lastClipGenerationTime: result.generationTimeSeconds
      } : null)
    } catch (err: any) {
      setError(err.message)
      await loadVideo()
    } finally {
      setClipping(false)
    }
  }

  const handleRegenerateClips = async () => {
    if (!confirm('This will delete all existing clips and regenerate them. Continue?')) {
      return
    }
    setClipping(true)
    setError(null)
    try {
      const result = await window.api.regenerateClips(videoId, preciseMode)
      setVideo(prev => prev ? {
        ...prev,
        clips: result.clips,
        clipState: 'DONE',
        lastClipGenerationTime: result.generationTimeSeconds
      } : null)
    } catch (err: any) {
      setError(err.message)
      await loadVideo()
    } finally {
      setClipping(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('This will permanently delete the video and all clips. Continue?')) {
      return
    }
    try {
      await window.api.deleteVideo(videoId)
      onBack() // Return to dashboard
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>
  if (!video) return <div style={{ padding: '20px' }}>Video not found</div>

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={onBack}>← Back to Dashboard</button>
        <button
          onClick={handleDelete}
          style={{ padding: '8px 16px', background: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Delete Video
        </button>
      </div>

      <h1 style={{ fontSize: '24px' }}>QA: {video.originalFilename}</h1>
      <p style={{ color: '#666', fontSize: '14px', fontFamily: 'monospace' }}>Video ID: {video.id}</p>
      <p>Status: <strong style={{
        color: video.status === 'APPROVED' ? '#4CAF50' : video.status === 'REJECTED' ? '#f44336' : '#666'
      }}>{video.status}</strong></p>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <h2 style={{ margin: 0 }}>Technical Metadata</h2>
          {video.metadata && (
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              style={{
                padding: '4px 12px',
                background: 'transparent',
                color: '#2196F3',
                border: '1px solid #2196F3',
                cursor: 'pointer',
                fontSize: '12px',
                borderRadius: '3px'
              }}
            >
              {showMetadata ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
        {!video.metadata ? (
          <div>
            <p>Metadata not extracted yet.</p>
            <button
              onClick={handleExtractMetadata}
              disabled={extracting}
              style={{
                padding: '10px 20px',
                background: '#2196F3',
                color: 'white',
                border: 'none',
                cursor: extracting ? 'default' : 'pointer',
                opacity: extracting ? 0.6 : 1
              }}
            >
              {extracting ? 'Extracting...' : 'Extract Metadata'}
            </button>
          </div>
        ) : showMetadata ? (
          <table style={{ borderCollapse: 'collapse', maxWidth: '600px', width: '100%' }}>
            <tbody>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold', width: '40%' }}>FPS</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.fps || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold', width: '40%' }}>Resolution</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.resolution || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold', width: '40%' }}>Aspect Ratio</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.aspectRatio || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold', width: '40%' }}>Duration</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{formatDuration(video.metadata.duration)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold', width: '40%' }}>Rotation</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.rotation || 'None (0°)'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold', width: '40%' }}>Codec</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{video.metadata.codec || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontWeight: 'bold', width: '40%' }}>File Size</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{formatBytes(video.metadata.fileSize)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>

      <div style={{ marginBottom: '20px' }}>
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

      {video.status === 'APPROVED' && (
        <div style={{ marginTop: '20px', padding: '20px', background: '#f5f5f5', border: '1px solid #ddd' }}>
          <h2 style={{ color: '#333', marginTop: 0 }}>Clip Generation</h2>

          {video.clipState === 'NOT_STARTED' && (
            <div>
              <p style={{ color: '#333' }}>Video is approved. Generate 2-minute clips for distribution.</p>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={preciseMode}
                    onChange={(e) => setPreciseMode(e.target.checked)}
                    disabled={clipping}
                  />
                  <span style={{ fontSize: '14px', color: '#333' }}>
                    <strong>Precise mode</strong> (exact 2:00 clips)
                  </span>
                </label>
                <p style={{ fontSize: '12px', color: '#555', marginLeft: '26px', marginTop: '5px' }}>
                  {preciseMode ? (
                    <>First generation creates prepared video (~5-10 min for 60-min video), future regenerations are fast</>
                  ) : (
                    <>Fast mode (~1-2 min) but clip durations may vary by ±3 seconds due to keyframe positions</>
                  )}
                </p>
              </div>
              <button
                onClick={handleGenerateClips}
                disabled={clipping}
                style={{ padding: '10px 20px', background: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                {clipping ? 'Generating Clips...' : 'Generate Clips'}
              </button>
            </div>
          )}

          {video.clipState === 'IN_PROGRESS' && (
            <div>
              <p style={{ color: '#ff9800', fontWeight: 'bold' }}>
                ⏳ Generating clips... This may take several minutes for long videos.
              </p>
              <p style={{ fontSize: '14px', color: '#666' }}>
                Do not close the app while clipping is in progress.
              </p>
            </div>
          )}

          {video.clipState === 'DONE' && (
            <div>
              <p style={{ color: '#4CAF50', fontWeight: 'bold', fontSize: '16px' }}>
                ✓ Clips generated successfully ({video.clips.length} clips)
                {video.lastClipGenerationTime && (
                  <span style={{ fontWeight: 'normal', color: '#666', marginLeft: '10px', fontSize: '14px' }}>
                    in {video.lastClipGenerationTime.toFixed(1)}s
                  </span>
                )}
              </p>
              {video.preparedVideoPath && (
                <p style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
                  ℹ️ Prepared video exists - future regenerations will be fast
                </p>
              )}

              <div style={{ marginTop: '15px' }}>
                <button
                  onClick={() => onViewClips(videoId)}
                  style={{ padding: '10px 20px', background: '#2196F3', color: 'white', border: 'none', cursor: 'pointer', marginRight: '10px' }}
                >
                  View Clips
                </button>
                <button
                  onClick={handleRegenerateClips}
                  disabled={clipping}
                  style={{ padding: '10px 20px', background: '#ff9800', color: 'white', border: 'none', cursor: 'pointer' }}
                >
                  Regenerate Clips
                </button>
              </div>

              <div style={{ marginTop: '15px', marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={preciseMode}
                    onChange={(e) => setPreciseMode(e.target.checked)}
                    disabled={clipping}
                  />
                  <span style={{ fontSize: '14px', color: '#333' }}>
                    <strong>Precise mode</strong> for regeneration
                  </span>
                </label>
              </div>
            </div>
          )}

          {video.clipState === 'FAILED' && (
            <div>
              <p style={{ color: '#f44336', fontWeight: 'bold' }}>
                ✗ Clip generation failed
              </p>
              {video.lastError && (
                <p style={{ fontSize: '14px', color: '#666', marginTop: '10px', padding: '10px', background: '#fee', border: '1px solid #fcc' }}>
                  Error: {video.lastError}
                </p>
              )}
              <button
                onClick={handleGenerateClips}
                disabled={clipping}
                style={{ marginTop: '10px', padding: '10px 20px', background: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                {clipping ? 'Retrying...' : 'Retry Clipping'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
