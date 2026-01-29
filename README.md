# Video Ingestion & QA Platform

A fully local desktop application for video ingestion, quality assurance review, and automated clip generation. Built with Electron, React, and TypeScript.

## Features

- **Video Upload**: Import MP4 files with automatic validation
- **Metadata Extraction**: Automatic extraction of technical video properties (FPS, resolution, codec, duration, rotation, file size)
- **QA Workflow**: Video playback with approve/reject workflow
- **Automated Clipping**: Generate 2-minute clips with fast mode (±3s accuracy) or precise mode (exact 2:00)
- **Clips Browser**: View and play all generated clips with metadata
- **Bulk Operations**: Multi-select delete for video management
- **Persistent Storage**: All data stored locally in JSON with deterministic file structure

## Prerequisites

1. **Node.js** (v18 or later) - [nodejs.org](https://nodejs.org/)
2. **npm** (comes with Node.js)
3. **FFmpeg** (required for video processing)
   - Windows: `winget install Gyan.FFmpeg`
   - macOS: `brew install ffmpeg`
   - Linux: `sudo apt install ffmpeg`

## Installation

```bash
git clone <repository-url>
cd relling-takehome
npm install
```

Ensure FFmpeg is in your PATH (restart terminal after installation, verify with `ffprobe -version`).

## Running the Application

**Development Mode:**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
```

## Usage

1. **Upload**: Click "Upload Video" and select an MP4 file
2. **QA Review**: Click video in dashboard → Extract Metadata → Approve/Reject
3. **Generate Clips**: After approval, choose Fast/Precise mode → Generate Clips
4. **Browse Clips**: Click "View Clips" to play and inspect generated clips
5. **Delete**: Single delete via QA view or bulk delete via Edit mode on dashboard

## Metadata Extraction

The application extracts technical metadata using FFprobe, including FPS, resolution, aspect ratio, duration, codec, and file size. **Rotation metadata is handled by checking both the `side_data_list` (modern format) and `tags.rotate` (legacy format) in FFprobe output.** This dual-check ensures compatibility with videos from various sources and encoders. The rotation value (0°, 90°, 180°, 270°) is displayed in the metadata table and helps QA reviewers identify videos that may need orientation correction. If no rotation metadata is present, the system displays "None (0°)" as the default.

## Data Storage

All video data is stored locally in `data/`:
- **Database**: `data/db.json` (JSON file with video records)
- **Videos**: `data/videos/<uuid>/original.mp4`
- **Clips**: `data/videos/<uuid>/clips/clip_*.mp4`
- **Prepared Videos**: `data/videos/<uuid>/prepared.mp4` (precise mode only)

Each video gets a unique UUID identifier for deterministic file paths.

## Clipping Modes

### Fast Mode (Default)
- Uses FFmpeg `-c copy` for fast stream copying (~1-2 min for 60-min video)
- Clips may vary by ±3 seconds due to keyframe positions
- Best for quick processing with non-critical duration requirements

### Precise Mode
- First run: Creates `prepared.mp4` with keyframes every 120 seconds (~5-10 min for 60-min video)
- Subsequent runs: Uses prepared video for fast, exact 2:00 clips (~1-2 min)
- Best for exact clip durations

## Key Design Decisions

- **JSON over SQLite**: Avoid native module compilation issues on Windows
- **Atomic writes**: Database writes use temp files for crash safety
- **Custom protocol**: `video-file://` for local video playback
- **Idempotency**: Clip generation checks existing state before processing
- **Clean slate retry**: Failed operations delete partial data and reset state
- **Startup recovery**: Detects stuck IN_PROGRESS states and auto-recovers
- **Hybrid clipping**: Fast mode for speed, precise mode for accuracy

## Troubleshooting

### "spawn ffprobe ENOENT" Error
**Cause**: FFmpeg not installed or not in PATH
**Solution**: Install FFmpeg (`winget install Gyan.FFmpeg` on Windows) and restart terminal

### Stuck "Generating clips..." Status
**Cause**: App was closed during clip generation
**Solution**: Reopen the app - it will auto-detect and mark as FAILED. Click "Retry Clipping"

### Clip Durations Inconsistent
**Cause**: Fast mode uses keyframe-based splitting
**Solution**: Use Precise Mode for exact 2:00 clips

## Logs

Application logs are written to `logs/app-YYYY-MM-DD-HH-mm-ss.log` with structured JSON logging, FFmpeg command execution details, error stack traces, and timestamps.

## AI Usage Log

This project was developed with assistance from Claude (Anthropic's AI assistant) via Claude Code CLI. AI assistance included:

- **Architecture Design**: Hybrid clipping system (fast vs precise mode), JSON-based persistence strategy, IPC communication patterns
- **Implementation**: All TypeScript/React code, FFmpeg command construction, error recovery logic, atomic database writes
- **Problem Solving**:
  - Fixed stuck IN_PROGRESS states with startup recovery
  - Optimized precise mode from `-preset medium` (10+ min) to `-preset ultrafast` (3-5 min)
  - Resolved inconsistent clip durations by implementing prepared video with forced keyframes
  - Fixed rotation metadata extraction by checking both `side_data_list` and `tags.rotate`
  - Debugged data directory location issues by switching from `app.getAppPath()` to `process.cwd()`
- **Documentation**: Complete README and ARCHITECTURE.md with diagrams, design decisions, and troubleshooting guides

Key decisions were made collaboratively through iterative testing and user feedback. The AI provided code generation and technical solutions, while the developer provided domain requirements, testing, and validation.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Electron (Node.js)
- **Video Processing**: FFmpeg + FFprobe
- **Database**: JSON file storage
- **Logging**: Custom structured logger

For detailed architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## License

MIT
