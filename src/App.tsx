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
  const [editMode, setEditMode] = useState(false)
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set())

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

  const toggleEditMode = () => {
    setEditMode(!editMode)
    setSelectedForDelete(new Set())
  }

  const toggleVideoSelection = (videoId: string) => {
    const newSelection = new Set(selectedForDelete)
    if (newSelection.has(videoId)) {
      newSelection.delete(videoId)
    } else {
      newSelection.add(videoId)
    }
    setSelectedForDelete(newSelection)
  }

  const handleDeleteSelected = async () => {
    if (selectedForDelete.size === 0) return

    const count = selectedForDelete.size
    if (!confirm(`Delete ${count} video${count > 1 ? 's' : ''}? This cannot be undone.`)) {
      return
    }

    try {
      for (const videoId of selectedForDelete) {
        await window.api.deleteVideo(videoId)
      }
      setSelectedForDelete(new Set())
      setEditMode(false)
      await loadVideos()
    } catch (err: any) {
      alert(`Failed to delete videos: ${err.message}`)
    }
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
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={handleUpload}
          disabled={uploading}
          style={{
            marginRight: '10px',
            padding: '10px 20px',
            background: '#2196F3',
            color: 'white',
            border: 'none',
            cursor: uploading ? 'default' : 'pointer',
            opacity: uploading ? 0.6 : 1
          }}
        >
          {uploading ? 'Uploading...' : 'Upload Video'}
        </button>
        {videos.length > 0 && (
          <>
            <button
              onClick={toggleEditMode}
              style={{
                marginRight: '10px',
                background: editMode ? '#666' : '#fff',
                color: editMode ? '#fff' : '#000',
                border: '1px solid #666'
              }}
            >
              {editMode ? 'Cancel' : 'Edit'}
            </button>
            {editMode && selectedForDelete.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                style={{
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  cursor: 'pointer'
                }}
              >
                Delete Selected ({selectedForDelete.size})
              </button>
            )}
          </>
        )}
      </div>
      <div style={{ marginTop: '20px' }}>
        <h2>Videos</h2>
        {videos.length === 0 ? (
          <p>No videos uploaded yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {editMode && <th style={{ width: '40px', padding: '8px', borderBottom: '1px solid #ddd' }}></th>}
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Filename</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr
                  key={video.id}
                  onClick={(e) => {
                    if (editMode) {
                      e.stopPropagation()
                      toggleVideoSelection(video.id)
                    } else {
                      handleVideoClick(video.id)
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    background: 'transparent',
                    borderLeft: selectedForDelete.has(video.id) ? '3px solid #4CAF50' : '3px solid transparent'
                  }}
                >
                  {editMode && (
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                      <input
                        type="checkbox"
                        checked={selectedForDelete.has(video.id)}
                        onChange={() => toggleVideoSelection(video.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  )}
                  <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{video.originalFilename}</td>
                  <td style={{
                    padding: '8px',
                    borderBottom: '1px solid #eee',
                    color: video.status === 'APPROVED' ? '#4CAF50' : video.status === 'REJECTED' ? '#f44336' : '#666',
                    fontWeight: video.status !== 'PENDING' ? 'bold' : 'normal'
                  }}>
                    {video.status}
                  </td>
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
