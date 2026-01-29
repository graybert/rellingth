import { useState, useEffect } from 'react'
import './App.css'
import type { VideoRecord } from './global'
import QAView from './QAView'
import ClipsView from './ClipsView'

type View = 'dashboard' | 'qa' | 'clips'

function App() {
  const [videos, setVideos] = useState<VideoRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<View>('dashboard')

  const loadVideos = async () => {
    const list = await window.api.listVideos()
    setVideos(list)
  }

  useEffect(() => {
    loadVideos()
  }, [])

  const handleUpload = async () => {
    setUploading(true)
    try {
      const filePath = await window.api.pickMp4()
      if (filePath) {
        await window.api.createFromFile(filePath)
        await loadVideos()
      }
    } catch (err: any) {
      console.error('Upload failed:', err)
      alert(`Failed to upload video: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleVideoClick = (videoId: string) => {
    setSelectedVideoId(videoId)
    setCurrentView('qa')
  }

  const handleViewClips = (videoId: string) => {
    setSelectedVideoId(videoId)
    setCurrentView('clips')
  }

  const handleBackToDashboard = () => {
    setSelectedVideoId(null)
    setCurrentView('dashboard')
    loadVideos()
  }

  const handleBackToQA = () => {
    setCurrentView('qa')
  }

  if (currentView === 'qa' && selectedVideoId) {
    return <QAView videoId={selectedVideoId} onBack={handleBackToDashboard} onViewClips={handleViewClips} />
  }

  if (currentView === 'clips' && selectedVideoId) {
    return <ClipsView videoId={selectedVideoId} onBack={handleBackToQA} />
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Video Ingestion Dashboard</h1>
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? 'Uploading...' : 'Upload Video'}
      </button>
      <div style={{ marginTop: '20px' }}>
        <h2>Videos</h2>
        {videos.length === 0 ? (
          <p>No videos uploaded yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Filename</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr
                  key={video.id}
                  onClick={() => handleVideoClick(video.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{video.originalFilename}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{video.status}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                    {new Date(video.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default App
