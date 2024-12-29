interface RecognitionResult {
  text: string;
  isFinal: boolean;
}

/// <reference path="../types/speech.d.ts" />
/// <reference path="../types/network.d.ts" />

export class SpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private retryCount: number = 0;
  private readonly maxRetries: number = 3;
  private readonly baseRetryDelay: number = 2000; // Base delay of 2 seconds for better stability
  private isNetworkError: boolean = false;
  private networkStatusListener: (() => void) | null = null;

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
      if (event.error === 'network') {
        this.isNetworkError = true;
        console.error(`Speech recognition network error occurred at ${new Date().toISOString()}`);
        
        // Only retry if we're online and haven't exceeded retry count
        if (navigator.onLine && this.retryCount < this.maxRetries) {
          this.retryCount++;
          const retryDelay = this.baseRetryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
          
          console.log(`Network error details:
            - Retry attempt: ${this.retryCount}/${this.maxRetries}
            - Delay: ${retryDelay}ms
            - Network status: ${navigator.onLine ? 'online' : 'offline'}
            - Timestamp: ${new Date().toISOString()}
            - Browser: ${navigator.userAgent}`
          );
          
          // Additional logging for debugging
          console.log('Connection info:', {
            downlink: navigator.connection?.downlink,
            effectiveType: navigator.connection?.effectiveType,
            rtt: navigator.connection?.rtt
          });
          
          onError(`Network error in speech recognition. Retrying... (Attempt ${this.retryCount}/${this.maxRetries})`);
          
          // Set up network status listener if not already set
          if (!this.networkStatusListener) {
            this.networkStatusListener = () => {
              if (navigator.onLine && this.isNetworkError) {
                console.log('Network is back online. Attempting to restart speech recognition...');
                this.isNetworkError = false;
                this.start(onResult, onError);
              }
            };
            window.addEventListener('online', this.networkStatusListener);
          }
          
          setTimeout(() => {
            if (this.recognition && navigator.onLine) {
              console.log('Attempting to restart speech recognition...');
              this.start(onResult, onError);
            } else if (!navigator.onLine) {
              console.log('Network still offline. Waiting for connection...');
              onError('Waiting for network connection to resume...');
            }
          }, retryDelay);
        } else {
          const reason = this.retryCount >= this.maxRetries
            ? `Maximum retry attempts (${this.maxRetries}) reached`
            : 'Network is offline';
          
          console.error(`Speech recognition failed: ${reason}`);
          onError(`Speech recognition failed: ${reason}. Please check your connection and try again.`);
          this.retryCount = 0; // Reset retry count for future attempts
        }
      } else {
        console.error(`Non-network speech recognition error: ${event.error}`);
        onError(`Speech recognition error: ${event.error}`);
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
      
      // Clean up network status listener
      if (this.networkStatusListener) {
        window.removeEventListener('online', this.networkStatusListener);
        this.networkStatusListener = null;
      }
      
      // Reset error states
      this.isNetworkError = false;
      this.retryCount = 0;
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
    }
  }

  // Method to check if speech recognition is supported
  static isSupported(): boolean {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
}
