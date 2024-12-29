interface RecognitionResult {
  text: string;
  isFinal: boolean;
}

/// <reference path="../types/speech.d.ts" />

export class SpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private retryCount: number = 0;
  private readonly maxRetries: number = 3;
  private readonly baseRetryDelay: number = 1000; // Base delay of 1 second

  constructor() {
    // Check for browser support
    const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      throw new Error('Speech recognition is not supported in this browser');
    }

    this.recognition = new SpeechRecognitionConstructor();
    this.setupRecognition();
  }

  private setupRecognition() {
    if (!this.recognition) {
      throw new Error('Speech recognition not initialized');
    }
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'zh-CN'; // Set to Chinese as per user requirement
  }

  start(
    onResult: (result: RecognitionResult) => void,
    onError: (error: string) => void
  ) {
    if (this.isListening || !this.recognition) return;
    
    this.retryCount = 0; // Reset retry count when starting fresh

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      onResult({
        text: result[0].transcript,
        isFinal: result.isFinal
      });
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'network' && this.retryCount < this.maxRetries) {
        this.retryCount++;
        const retryDelay = this.baseRetryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
        console.log(`Network error in speech recognition. Retry ${this.retryCount}/${this.maxRetries} in ${retryDelay}ms`);
        onError(`Network error in speech recognition. Retrying... (Attempt ${this.retryCount}/${this.maxRetries})`);
        
        setTimeout(() => {
          if (this.recognition) {
            console.log('Attempting to restart speech recognition...');
            this.start(onResult, onError);
          }
        }, retryDelay);
      } else {
        if (event.error === 'network') {
          onError(`Speech recognition failed after ${this.maxRetries} retry attempts. Please check your connection.`);
        } else {
          onError(`Speech recognition error: ${event.error}`);
        }
        this.retryCount = 0; // Reset retry count for future attempts
      }
    };

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (error) {
      onError(`Failed to start speech recognition: ${error}`);
    }
  }

  stop() {
    if (!this.isListening || !this.recognition) return;
    
    try {
      this.recognition.stop();
      this.isListening = false;
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
    }
  }

  // Method to check if speech recognition is supported
  static isSupported(): boolean {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
}
