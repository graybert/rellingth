# Video Ingestion & QA Platform

A fully local desktop application for video ingestion, quality assurance review, and automated clip generation. Built with Electron, React, and TypeScript.

## Features

- **Video Upload**: Import MP4 files with automatic validation
- **Metadata Extraction**: Automatic extraction of technical video properties (FPS, resolution, codec, duration, etc.)
- **QA Workflow**: Video playback with approve/reject workflow
- **Automated Clipping**: Generate 2-minute clips with two modes:
  - **Fast Mode**: Quick clip generation (~1-2 minutes) with approximate durations (±3 seconds)
  - **Precise Mode**: Exact 2:00 clips with one-time prepared video generation
- **Clips Browser**: View and play all generated clips with metadata
- **Bulk Operations**: Multi-select delete for video management
- **Persistent Storage**: All data stored locally in JSON with deterministic file structure

## Prerequisites

Before running the application, ensure you have the following installed:

1. **Node.js** (v18 or later)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

2. **npm** (comes with Node.js)
   - Verify: `npm --version`

3. **FFmpeg** (required for video processing)
   - **Windows**: `winget install Gyan.FFmpeg`
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt install ffmpeg` (Ubuntu/Debian)
   - Verify: `ffprobe -version` and `ffmpeg -version`

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd relling-takehome
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Ensure FFmpeg is in your PATH:
   - Windows: Restart your terminal after installing FFmpeg
   - Verify with: `ffprobe -version`

## Running the Application

### Development Mode

```bash
npm run dev
```

This starts the Electron app with hot module reloading for the React frontend.

### Production Build

```bash
npm run build
```

This creates a production-ready build in the `dist-electron` and `dist` directories.

## Usage

### 1. Upload a Video

1. Click **"Upload Video"** on the dashboard
2. Select an MP4 file from your file system
3. The video will appear in the dashboard with status "PENDING"

### 2. QA Review

1. Click on any video in the dashboard to open the QA view
2. Watch the video using the built-in player
3. Click **"Extract Metadata"** to view technical properties
4. Review the video and click **"Approve"** or **"Reject"**

### 3. Generate Clips

Once a video is approved:

1. Choose clipping mode:
   - **Fast Mode** (default): Quick generation with keyframe-based splitting
   - **Precise Mode**: Exact 2:00 clips (first run creates prepared video)
2. Click **"Generate Clips"**
3. Wait for processing to complete
4. Click **"View Clips"** to browse generated clips

### 4. Browse Clips

- Click on any clip card to play it
- View clip metadata (duration, resolution, file size, timestamps)
- Navigate back to QA view with **"← Back to QA"**

### 5. Delete Videos

**Single Delete:**
- Open any video's QA view
- Click the red **"Delete Video"** button
- Confirm deletion

**Bulk Delete:**
1. Click **"Edit"** on the dashboard
2. Check the boxes next to videos to delete
3. Click **"Delete Selected (N)"**
4. Confirm deletion

## Project Structure

```
relling-takehome/
├── src/                    # React frontend source
│   ├── App.tsx            # Main dashboard component
│   ├── QAView.tsx         # QA review interface
│   ├── ClipsView.tsx      # Clips browser interface
│   ├── global.d.ts        # TypeScript type definitions
│   └── App.css            # Styles
├── electron/              # Electron main process
│   ├── main.ts           # Main entry point & IPC handlers
│   ├── preload.ts        # Context bridge (renderer ↔ main)
│   ├── db.ts             # JSON-based database
│   ├── metadata.ts       # FFprobe metadata extraction
│   ├── clipper.ts        # FFmpeg clip generation
│   └── logger.ts         # Structured logging
├── data/                 # Video storage (gitignored)
│   └── videos/
│       └── <uuid>/
│           ├── original.mp4
│           ├── prepared.mp4
│           └── clips/
│               ├── clip_000.mp4
│               ├── clip_001.mp4
│               └── ...
├── logs/                 # Application logs (gitignored)
└── README.md            # This file
```

## Data Storage

All video data is stored locally in the `data/` directory:

- **Database**: `data/db.json` (JSON file with video records)
- **Videos**: `data/videos/<uuid>/original.mp4`
- **Clips**: `data/videos/<uuid>/clips/clip_*.mp4`
- **Prepared Videos**: `data/videos/<uuid>/prepared.mp4` (precise mode only)

Each video gets a unique UUID identifier for deterministic file paths.

## Clipping Modes

### Fast Mode (Default)
- Uses FFmpeg's `-c copy` for fast stream copying
- Duration: ~1-2 minutes for a 60-minute video
- Trade-off: Clips may vary by ±3 seconds due to keyframe positions
- Best for: Quick processing, non-critical duration requirements

### Precise Mode
- First run: Creates `prepared.mp4` with keyframes every 120 seconds (~5-10 min for 60-min video)
- Subsequent runs: Uses prepared video for fast, exact 2:00 clips (~1-2 min)
- Duration: First generation slower, future regenerations are fast
- Trade-off: One-time preparation cost, larger disk usage
- Best for: Exact clip durations required

## Troubleshooting

### "spawn ffprobe ENOENT" Error
- **Cause**: FFmpeg is not installed or not in PATH
- **Solution**: Install FFmpeg and restart your terminal
  ```bash
  # Windows
  winget install Gyan.FFmpeg

  # Then restart PowerShell/Terminal
  ```

### Videos Stored in Wrong Location
- **Cause**: Application started from wrong directory
- **Solution**: Always run `npm run dev` from the project root (`relling-takehome/`)

### Stuck "Generating clips..." Status
- **Cause**: App was closed during clip generation
- **Solution**: Reopen the app - it will auto-detect and mark as FAILED. Click "Retry Clipping"

### Clip Durations Inconsistent
- **Cause**: Fast mode uses keyframe-based splitting
- **Solution**: Use Precise Mode for exact 2:00 clips

## Logs

Application logs are written to `logs/app-YYYY-MM-DD-HH-mm-ss.log` with:
- Structured JSON logging
- FFmpeg command execution details
- Error stack traces
- Timestamps for all operations

## Development

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Electron (Node.js)
- **Video Processing**: FFmpeg + FFprobe
- **Database**: JSON file storage
- **Logging**: Custom structured logger

### Key Design Decisions
- **JSON over SQLite**: Avoid native module compilation issues on Windows
- **Atomic writes**: Database writes use temp files for crash safety
- **Custom protocol**: `video-file://` for local video playback
- **Idempotency**: Clip generation checks existing state before processing
- **Clean slate retry**: Failed operations delete partial data and reset state
- **Startup recovery**: Detects stuck IN_PROGRESS states and auto-recovers

For detailed architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## License

MIT
