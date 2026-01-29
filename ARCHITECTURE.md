# Architecture Documentation

This document provides a detailed technical overview of the Video Ingestion & QA Platform architecture, design decisions, and implementation details.

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Technology Stack](#technology-stack)
- [System Components](#system-components)
- [Data Flow](#data-flow)
- [Database Schema](#database-schema)
- [File System Structure](#file-system-structure)
- [IPC Communication](#ipc-communication)
- [Video Processing Pipeline](#video-processing-pipeline)
- [Error Handling & Recovery](#error-handling--recovery)
- [Key Design Decisions](#key-design-decisions)

## High-Level Architecture

The application follows a classic Electron architecture with clear separation between the renderer process (React UI) and main process (Node.js backend):

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   App.tsx    │  │  QAView.tsx  │  │ClipsView.tsx │  │
│  │  (Dashboard) │  │  (QA Review) │  │ (Clip List)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │           │
│         └─────────────────┴──────────────────┘           │
│                           │                              │
│                     window.api                           │
│                           │                              │
└───────────────────────────┼──────────────────────────────┘
                            │
                    Context Bridge
                      (preload.ts)
                            │
┌───────────────────────────┼──────────────────────────────┐
│                    Main Process                          │
│                           │                              │
│                    ┌──────┴──────┐                       │
│                    │   main.ts   │                       │
│                    │ IPC Handlers│                       │
│                    └──────┬──────┘                       │
│                           │                              │
│         ┌─────────────────┼─────────────────┐            │
│         │                 │                 │            │
│    ┌────┴────┐      ┌─────┴─────┐    ┌─────┴──────┐    │
│    │  db.ts  │      │metadata.ts│    │ clipper.ts │    │
│    │ (JSON)  │      │ (ffprobe) │    │  (ffmpeg)  │    │
│    └────┬────┘      └─────┬─────┘    └─────┬──────┘    │
│         │                 │                 │            │
│         │           ┌─────┴─────┐           │            │
│         │           │ logger.ts │           │            │
│         │           └───────────┘           │            │
└─────────┼─────────────────────────────────────┼──────────┘
          │                                    │
          │                                    │
    ┌─────▼─────┐                        ┌─────▼─────┐
    │data/db.json│                       │  FFmpeg   │
    │   videos/  │                       │  FFprobe  │
    └────────────┘                       └───────────┘
```

## Technology Stack

### Frontend
- **React 18**: UI library with hooks-based state management
- **TypeScript**: Type-safe development
- **Vite**: Fast development server and build tool
- **CSS**: Inline styles for simplicity and component locality

### Backend
- **Electron 33**: Desktop application framework
- **Node.js**: JavaScript runtime for main process
- **FFmpeg**: Video processing (clipping)
- **FFprobe**: Metadata extraction

### Data Layer
- **JSON**: File-based database for simplicity
- **File System**: Video storage with UUID-based paths

## System Components

### 1. Renderer Process (Frontend)

#### App.tsx
- Main dashboard component
- Displays video list in table format
- Handles video upload flow
- Implements edit mode for bulk deletion
- Routes to QAView and ClipsView

**State Management:**
```typescript
videos: VideoRecord[]           // List of all videos
uploading: boolean              // Upload in progress
selectedVideoId: string | null  // Currently selected video
currentView: View               // 'dashboard' | 'qa' | 'clips'
editMode: boolean               // Bulk delete mode
selectedForDelete: Set<string>  // UUIDs selected for deletion
```

#### QAView.tsx
- Video playback using HTML5 video element
- Metadata display with show/hide toggle
- Approve/Reject workflow
- Clip generation with fast/precise mode toggle
- Delete video functionality

**State Management:**
```typescript
video: VideoRecord | null       // Current video data
loading: boolean                // Initial load state
extracting: boolean             // Metadata extraction in progress
clipping: boolean               // Clip generation in progress
preciseMode: boolean            // Clipping mode toggle
showMetadata: boolean           // Metadata table visibility
error: string | null            // Error message display
```

#### ClipsView.tsx
- Grid layout of clip cards
- Click-to-play functionality
- Video player with autoplay
- Per-clip metadata display

**State Management:**
```typescript
video: VideoRecord | null       // Video with clips
loading: boolean                // Initial load state
selectedClipIndex: number | null // Currently playing clip
error: string | null            // Error message display
```

### 2. Main Process (Backend)

#### main.ts
- Electron main entry point
- IPC handler registration
- Custom protocol registration (`video-file://`)
- Startup recovery for stuck IN_PROGRESS states

**IPC Handlers:**
- `videos:list` → List all videos
- `videos:pickMp4` → Open file picker dialog
- `videos:createFromFile` → Upload and store video
- `videos:get` → Fetch single video by ID
- `videos:extractMetadata` → Extract video metadata
- `videos:updateStatus` → Update approval status
- `videos:generateClips` → Generate clips (idempotent)
- `videos:regenerateClips` → Delete and regenerate clips
- `videos:delete` → Delete video and all data

**Startup Recovery:**
```typescript
// Detect videos stuck in IN_PROGRESS state
videos.forEach(video => {
  if (video.clipState === 'IN_PROGRESS') {
    db.updateVideo(video.id, {
      clipState: 'FAILED',
      lastError: 'Clipping was interrupted (app closed or crashed). Please retry.'
    })
  }
})
```

#### db.ts
- JSON-based database with atomic writes
- CRUD operations for VideoRecord
- Path resolution for video files and clips

**Key Methods:**
- `createVideo(record)` → Insert new video
- `getVideo(id)` → Fetch video by UUID
- `listVideos()` → Get all videos
- `updateVideo(id, updates)` → Partial update
- `deleteVideo(id)` → Remove video record
- `getVideoDir(id)` → Get video directory path
- `getOriginalVideoPath(id)` → Get original.mp4 path
- `getPreparedVideoPath(id)` → Get prepared.mp4 path
- `getClipsDir(id)` → Get clips directory path

**Atomic Writes:**
```typescript
private writeDb(data: Database): void {
  const tempPath = this.dbPath + '.tmp'
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2))
  fs.renameSync(tempPath, this.dbPath)
}
```

#### metadata.ts
- FFprobe wrapper for video metadata extraction
- Handles rotation from both `side_data_list` and `tags`

**Extracted Fields:**
- FPS (r_frame_rate)
- Resolution (width × height)
- Aspect Ratio (display_aspect_ratio)
- Duration (seconds)
- Rotation (degrees)
- Codec (codec_name)
- File Size (bytes)

#### clipper.ts
- FFmpeg wrapper for clip generation
- Implements fast mode and precise mode
- Creates prepared video with forced keyframes
- Extracts per-clip metadata

**Fast Mode:**
```bash
ffmpeg -i original.mp4 \
  -f segment \
  -segment_time 120 \
  -c copy \
  -reset_timestamps 1 \
  clips/clip_%03d.mp4
```

**Precise Mode (Preparation):**
```bash
ffmpeg -i original.mp4 \
  -force_key_frames 'expr:gte(t,n_forced*120)' \
  -c:v libx264 \
  -preset ultrafast \
  -crf 23 \
  -c:a aac \
  -b:a 192k \
  prepared.mp4
```

**Idempotency Check:**
```typescript
if (video.clipState === 'DONE' && video.clips.length > 0) {
  const allExist = video.clips.every(clip => {
    const clipPath = path.join(clipsDir, clip.filename)
    return fs.existsSync(clipPath)
  })
  if (allExist) return { clips: video.clips, generationTimeSeconds: 0 }
}
```

#### logger.ts
- Singleton structured logger
- Timestamped log files in `logs/` directory
- Special handling for FFmpeg stderr logs

**Log Levels:**
- `info` → General information
- `warn` → Warnings (non-fatal issues)
- `error` → Errors with stack traces
- `debug` → Verbose debugging output
- `ffmpegLog` → FFmpeg command + stderr capture

## Data Flow

### Video Upload Flow

```
User clicks "Upload Video"
    ↓
File picker dialog (videos:pickMp4)
    ↓
User selects MP4 file
    ↓
IPC: videos:createFromFile(path)
    ↓
Validate .mp4 extension
    ↓
Generate UUID
    ↓
Create directory: data/videos/<uuid>/
    ↓
Copy file to: data/videos/<uuid>/original.mp4
    ↓
Create VideoRecord in db.json
    ↓
Return VideoRecord to renderer
    ↓
Update UI with new video
```

### Metadata Extraction Flow

```
User clicks "Extract Metadata"
    ↓
IPC: videos:extractMetadata(videoId)
    ↓
Execute: ffprobe -print_format json -show_format -show_streams original.mp4
    ↓
Parse JSON output
    ↓
Extract: fps, resolution, aspectRatio, duration, rotation, codec, fileSize
    ↓
Update VideoRecord.metadata in db.json
    ↓
Return VideoMetadata to renderer
    ↓
Display metadata table
```

### Clip Generation Flow (Fast Mode)

```
User clicks "Generate Clips"
    ↓
IPC: videos:generateClips(videoId, preciseMode=false)
    ↓
Check idempotency (clips already exist?)
    ↓
Update clipState to IN_PROGRESS
    ↓
Delete any existing clip files
    ↓
Execute: ffmpeg -i original.mp4 -f segment -segment_time 120 -c copy clips/clip_*.mp4
    ↓
Scan clips directory for generated files
    ↓
For each clip: extract metadata with ffprobe
    ↓
Update VideoRecord.clips and clipState=DONE
    ↓
Return ClipGenerationResult to renderer
    ↓
Update UI with clip count and generation time
```

### Clip Generation Flow (Precise Mode)

```
User enables "Precise mode" checkbox
User clicks "Generate Clips"
    ↓
IPC: videos:generateClips(videoId, preciseMode=true)
    ↓
Check if prepared.mp4 exists
    ↓
IF NOT EXISTS:
    Execute: ffmpeg -i original.mp4 -force_key_frames 'expr:gte(t,n_forced*120)' prepared.mp4
    (5-10 minutes for 60-min video)
    Update VideoRecord.preparedVideoPath
    ↓
Execute: ffmpeg -i prepared.mp4 -f segment -segment_time 120 -c copy clips/clip_*.mp4
(Fast because keyframes aligned)
    ↓
Scan clips directory for generated files
    ↓
For each clip: extract metadata with ffprobe
    ↓
Update VideoRecord.clips and clipState=DONE
    ↓
Return ClipGenerationResult to renderer
```

## Database Schema

### VideoRecord

```typescript
interface VideoRecord {
  id: string                    // UUID v4
  originalFilename: string      // Original file name (e.g., "video.mp4")
  originalPath: string          // Absolute path to original.mp4
  preparedVideoPath: string | null  // Path to prepared.mp4 (precise mode)
  createdAt: string             // ISO 8601 timestamp
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  metadata: VideoMetadata | null
  clipState: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'FAILED'
  lastError: string | null      // Error message from last operation
  clips: ClipRecord[]           // Array of generated clips
  lastClipGenerationTime: number | null  // Seconds taken for last generation
}
```

### VideoMetadata

```typescript
interface VideoMetadata {
  fps?: number                  // Frames per second
  resolution?: string           // e.g., "1920x1080"
  aspectRatio?: string          // e.g., "16:9"
  duration?: number             // Seconds
  rotation?: string             // e.g., "90°", "180°"
  codec?: string                // e.g., "h264", "hevc"
  fileSize?: number             // Bytes
}
```

### ClipRecord

```typescript
interface ClipRecord {
  filename: string              // e.g., "clip_000.mp4"
  startTime: number             // Seconds from video start
  endTime: number               // Seconds from video start
  duration: number              // Clip duration in seconds
  fps?: number                  // Frames per second
  resolution?: string           // e.g., "1920x1080"
  fileSize: number              // Bytes
}
```

### Database File Format (db.json)

```json
{
  "videos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "originalFilename": "sample.mp4",
      "originalPath": "C:\\...\\data\\videos\\550e8400...\\original.mp4",
      "preparedVideoPath": null,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "status": "APPROVED",
      "metadata": {
        "fps": 30,
        "resolution": "1920x1080",
        "aspectRatio": "16:9",
        "duration": 3600,
        "rotation": "None (0°)",
        "codec": "h264",
        "fileSize": 1073741824
      },
      "clipState": "DONE",
      "lastError": null,
      "clips": [
        {
          "filename": "clip_000.mp4",
          "startTime": 0,
          "endTime": 120,
          "duration": 120,
          "fps": 30,
          "resolution": "1920x1080",
          "fileSize": 35651584
        }
      ],
      "lastClipGenerationTime": 89.34
    }
  ]
}
```

## File System Structure

```
relling-takehome/
├── data/
│   ├── db.json                                    # Database file
│   └── videos/
│       ├── 550e8400-e29b-41d4-a716-446655440000/
│       │   ├── original.mp4                       # Uploaded video
│       │   ├── prepared.mp4                       # Prepared video (precise mode)
│       │   └── clips/
│       │       ├── clip_000.mp4                   # 0:00 - 2:00
│       │       ├── clip_001.mp4                   # 2:00 - 4:00
│       │       └── clip_002.mp4                   # 4:00 - 6:00
│       └── 7c9e6679-7425-40de-944b-e07fc1f90ae7/
│           ├── original.mp4
│           └── clips/
│               └── clip_000.mp4
└── logs/
    ├── app-2024-01-15-10-30-45.log
    └── app-2024-01-15-11-00-12.log
```

## IPC Communication

### Context Bridge (preload.ts)

Exposes `window.api` to the renderer process with type-safe methods:

```typescript
contextBridge.exposeInMainWorld('api', {
  listVideos: () => ipcRenderer.invoke('videos:list'),
  pickMp4: () => ipcRenderer.invoke('videos:pickMp4'),
  createFromFile: (path: string) => ipcRenderer.invoke('videos:createFromFile', path),
  getVideo: (id: string) => ipcRenderer.invoke('videos:get', id),
  extractMetadata: (id: string) => ipcRenderer.invoke('videos:extractMetadata', id),
  updateStatus: (id: string, status: string) => ipcRenderer.invoke('videos:updateStatus', id, status),
  generateClips: (id: string, precise: boolean) => ipcRenderer.invoke('videos:generateClips', id, precise),
  regenerateClips: (id: string, precise: boolean) => ipcRenderer.invoke('videos:regenerateClips', id, precise),
  deleteVideo: (id: string) => ipcRenderer.invoke('videos:delete', id)
})
```

### Security Model

- **No nodeIntegration**: Renderer process cannot access Node.js APIs directly
- **Context isolation**: Renderer and main processes are strictly separated
- **Preload script**: Only explicitly exposed APIs are available
- **No remote module**: All file system operations happen in main process

## Video Processing Pipeline

### FFmpeg Command Reference

#### Metadata Extraction (FFprobe)
```bash
ffprobe -v quiet \
        -print_format json \
        -show_format \
        -show_streams \
        original.mp4
```

#### Fast Mode Clipping
```bash
ffmpeg -i original.mp4 \
       -f segment \
       -segment_time 120 \
       -c copy \
       -reset_timestamps 1 \
       clips/clip_%03d.mp4
```

#### Precise Mode Preparation
```bash
ffmpeg -i original.mp4 \
       -force_key_frames 'expr:gte(t,n_forced*120)' \
       -c:v libx264 \
       -preset ultrafast \
       -crf 23 \
       -c:a aac \
       -b:a 192k \
       prepared.mp4
```

#### Precise Mode Clipping
```bash
ffmpeg -i prepared.mp4 \
       -f segment \
       -segment_time 120 \
       -c copy \
       -reset_timestamps 1 \
       clips/clip_%03d.mp4
```

### Performance Characteristics

| Operation | Fast Mode | Precise Mode (First) | Precise Mode (Subsequent) |
|-----------|-----------|---------------------|---------------------------|
| Preparation | 0 sec | ~5-10 min (60-min video) | 0 sec (reuses prepared) |
| Clipping | ~1-2 min | ~1-2 min | ~1-2 min |
| Total | ~1-2 min | ~6-12 min | ~1-2 min |
| Accuracy | ±3 seconds | Exact 2:00 | Exact 2:00 |
| Disk Usage | 1× video | ~2× video (prepared + original) | ~2× video |

## Error Handling & Recovery

### 1. Stuck IN_PROGRESS Recovery

**Problem:** App closed during clip generation leaves clipState stuck.

**Solution:** On startup, detect and auto-recover:
```typescript
videos.forEach(video => {
  if (video.clipState === 'IN_PROGRESS') {
    db.updateVideo(video.id, {
      clipState: 'FAILED',
      lastError: 'Clipping was interrupted (app closed or crashed). Please retry.'
    })
  }
})
```

### 2. Clean Slate Retry

**Problem:** Partial clip files after FFmpeg failure.

**Solution:** Always delete existing clips before regeneration:
```typescript
try {
  deleteClipsFromDisk(clipsDir)
  // ... generate clips
} catch (error) {
  deleteClipsFromDisk(clipsDir)  // Clean up partial files
  db.updateVideo(videoId, { clipState: 'FAILED', clips: [] })
  throw error
}
```

### 3. Idempotency Check

**Problem:** Redundant clip generation.

**Solution:** Check if clips already exist and are valid:
```typescript
if (video.clipState === 'DONE' && video.clips.length > 0) {
  const allExist = video.clips.every(clip => fs.existsSync(path.join(clipsDir, clip.filename)))
  if (allExist) return { clips: video.clips, generationTimeSeconds: 0 }
}
```

### 4. Atomic Database Writes

**Problem:** Corrupted db.json after app crash during write.

**Solution:** Write to temp file, then atomic rename:
```typescript
const tempPath = this.dbPath + '.tmp'
fs.writeFileSync(tempPath, JSON.stringify(data, null, 2))
fs.renameSync(tempPath, this.dbPath)  // Atomic on most filesystems
```

### 5. File Type Validation

**Problem:** Non-MP4 files uploaded.

**Solution:** Validate extension before processing:
```typescript
const ext = path.extname(sourcePath).toLowerCase()
if (ext !== '.mp4') {
  throw new Error(`Invalid file type: ${ext}. Only .mp4 files are supported.`)
}
```

## Key Design Decisions

### 1. JSON over SQLite

**Decision:** Use JSON file for database instead of SQLite.

**Rationale:**
- Avoids native module compilation issues on Windows
- Simple CRUD operations don't require SQL
- Easy to inspect and debug (human-readable)
- Atomic writes provide crash safety
- No migration headaches

**Trade-offs:**
- Not suitable for >10,000 videos (acceptable for use case)
- No query optimization or indexing
- Full read/write on every operation

### 2. Custom video-file:// Protocol

**Decision:** Register custom protocol instead of using file:// URLs.

**Rationale:**
- file:// URLs don't work reliably in Electron for video playback
- Custom protocol provides full control over file serving
- Allows future extensions (streaming, range requests)

**Implementation:**
```typescript
protocol.registerFileProtocol('video-file', (request, callback) => {
  const url = request.url.replace('video-file://', '')
  return callback(decodeURIComponent(url))
})
```

### 3. Hybrid Clipping System

**Decision:** Implement both fast mode and precise mode, not just one.

**Rationale:**
- Fast mode: Good enough for most use cases, very quick
- Precise mode: Required when exact durations are critical
- One-time preparation cost amortized across multiple regenerations
- User choice based on requirements

**Evolution:**
1. Initially tried `-preset medium` (too slow)
2. Switched to `-c copy` (fast but inaccurate)
3. Implemented hybrid with `-preset ultrafast` preparation (best of both)

### 4. Strict Process Separation

**Decision:** Renderer never touches filesystem, all FS operations in main.

**Rationale:**
- Security: Renderer process is untrusted (displays web content)
- Consistency: Single source of truth for data operations
- Error handling: Centralized in main process
- Logging: All operations logged in one place

### 5. UUID-based File Paths

**Decision:** Use UUID v4 for video identifiers and directory names.

**Rationale:**
- Guaranteed uniqueness (no collisions)
- No need for auto-increment counters
- Deterministic file paths: `data/videos/<uuid>/original.mp4`
- Easy to reference in logs and debugging

### 6. In-line Styles

**Decision:** Use inline styles instead of CSS modules or styled-components.

**Rationale:**
- Simplicity: No build configuration needed
- Locality: Styles colocated with components
- Type safety: TypeScript checks style objects
- No naming conflicts or specificity issues

**Trade-offs:**
- No CSS features (media queries, pseudo-selectors)
- Some duplication (acceptable for small app)
- Harder to theme globally

### 7. No External State Management

**Decision:** Use React useState instead of Redux/Zustand/etc.

**Rationale:**
- Simple component state sufficient
- No shared state between views (clean navigation)
- Backend is source of truth (not frontend state)
- Reduces bundle size and complexity

### 8. Structured Logging

**Decision:** Custom logger with JSON output instead of console.log.

**Rationale:**
- Persistent logs survive app restarts
- Searchable and parseable
- Timestamps for debugging timing issues
- FFmpeg stderr capture for troubleshooting

**Format:**
```json
{"timestamp":"2024-01-15T10:30:45.123Z","level":"info","message":"Clip generation completed successfully","context":{"videoId":"550e8400-e29b-41d4-a716-446655440000","clipCount":30,"totalTimeSeconds":"89.34"}}
```

## Future Enhancements

Potential improvements for production use:

1. **Parallel Clip Generation**: Process multiple clips concurrently
2. **Progress Callbacks**: Real-time progress updates during FFmpeg processing
3. **Cloud Storage**: S3/Azure Blob integration for video storage
4. **Thumbnails**: Generate preview thumbnails for clips
5. **Search**: Full-text search across video metadata
6. **Export**: Batch export clips to ZIP or external drive
7. **Analytics**: Clip duration distribution, storage usage charts
8. **Undo Delete**: Soft deletes with trash bin
9. **Video Trimming**: Trim videos before clipping
10. **Quality Presets**: Configurable CRF and preset for prepared videos

## Conclusion

This architecture prioritizes simplicity, reliability, and maintainability while meeting all functional requirements. The hybrid clipping system provides both speed and precision, the JSON database avoids native module complexity, and strict process separation ensures security and consistency.

For questions or contributions, please refer to the README.md and open issues on GitHub.
