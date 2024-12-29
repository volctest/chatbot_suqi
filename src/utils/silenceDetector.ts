import { AudioProcessor } from './audioUtils';

export interface SilenceDetectorConfig {
  silenceThreshold: number;  // RMS threshold below which audio is considered silent
  silenceDuration: number;   // Duration in ms to wait before triggering silence callback
  checkInterval: number;     // How often to check audio level in ms
}

export class SilenceDetector {
  private lastSound: number = Date.now();
  private checkIntervalId: number | null = null;
  private config: SilenceDetectorConfig;
  
  constructor(
    private audioProcessor: AudioProcessor,
    config?: Partial<SilenceDetectorConfig>
  ) {
    this.config = {
      silenceThreshold: 0.05,  // Increased threshold for better detection
      silenceDuration: 3000,   // 3 seconds
      checkInterval: 100,      // Check every 100ms
      ...config
    };
  }

  start(onSilence: () => void) {
    // Reset last sound timestamp
    this.lastSound = Date.now();
    
    // Clear any existing interval
    if (this.checkIntervalId !== null) {
      window.clearInterval(this.checkIntervalId);
    }
    
    // Start monitoring audio levels
    this.checkIntervalId = window.setInterval(() => {
      const currentLevel = this.audioProcessor.getAudioLevel();
      
      if (currentLevel > this.config.silenceThreshold) {
        // Sound detected, update timestamp
        this.lastSound = Date.now();
      } else {
        // Check if we've been silent for long enough
        const silentDuration = Date.now() - this.lastSound;
        if (silentDuration >= this.config.silenceDuration) {
          onSilence();
          // Reset timestamp to prevent multiple triggers
          this.lastSound = Date.now();
        }
      }
    }, this.config.checkInterval);
  }

  stop() {
    if (this.checkIntervalId !== null) {
      window.clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  // Allow runtime configuration updates
  updateConfig(config: Partial<SilenceDetectorConfig>) {
    this.config = {
      ...this.config,
      ...config
    };
  }
}
