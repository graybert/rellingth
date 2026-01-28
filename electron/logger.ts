import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

class Logger {
  private logsDir: string
  private logFile: string
  private initialized: boolean = false

  constructor() {
    // Initialize with empty values, will be set on first use
    this.logsDir = ''
    this.logFile = ''
  }

  private ensureInitialized(): void {
    if (this.initialized) return

    try {
      // Use process.cwd() which is always the repo root when running npm run dev
      this.logsDir = path.join(process.cwd(), 'logs')

      console.log('[Logger] Initializing logs directory at:', this.logsDir)
      console.log('[Logger] process.cwd():', process.cwd())
      this.ensureLogsDir()

      // Create a new log file with timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
      this.logFile = path.join(this.logsDir, `app-${timestamp}.log`)
      console.log('[Logger] Log file created at:', this.logFile)
      this.initialized = true
    } catch (error) {
      console.error('[Logger] Failed to initialize:', error)
      throw error
    }
  }

  private ensureLogsDir(): void {
    try {
      if (!fs.existsSync(this.logsDir)) {
        console.log('[Logger] Creating logs directory:', this.logsDir)
        fs.mkdirSync(this.logsDir, { recursive: true })
        console.log('[Logger] Logs directory created successfully')
      } else {
        console.log('[Logger] Logs directory already exists')
      }
    } catch (error) {
      console.error('[Logger] Failed to create logs directory:', error)
      throw error
    }
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : ''
    return `[${timestamp}] [${level}] ${message}${dataStr}\n`
  }

  private writeLog(level: string, message: string, data?: any): void {
    try {
      this.ensureInitialized()
      const logMessage = this.formatMessage(level, message, data)

      // Write to file
      fs.appendFileSync(this.logFile, logMessage, 'utf-8')

      // Also log to console
      console.log(logMessage.trim())
    } catch (error) {
      console.error('[Logger] Failed to write log:', error)
    }
  }

  info(message: string, data?: any): void {
    this.writeLog('INFO', message, data)
  }

  error(message: string, data?: any): void {
    this.writeLog('ERROR', message, data)
  }

  warn(message: string, data?: any): void {
    this.writeLog('WARN', message, data)
  }

  debug(message: string, data?: any): void {
    this.writeLog('DEBUG', message, data)
  }

  // Special method for ffmpeg operations
  ffmpegLog(operation: string, videoId: string, command: string, exitCode: number, stderr: string): void {
    this.writeLog('FFMPEG', `${operation} for video ${videoId}`, {
      command,
      exitCode,
      stderr: stderr.slice(-500) // Last 500 chars of stderr
    })
  }
}

// Singleton instance
let loggerInstance: Logger | null = null

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger()
  }
  return loggerInstance
}
