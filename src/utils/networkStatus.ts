import { SpeechRecognizer } from './speechRecognition';

export interface NetworkStatusListener {
  onNetworkStatusChange: (isOnline: boolean) => void;
}

export class NetworkStatus {
  private static instance: NetworkStatus;
  private listeners: NetworkStatusListener[] = [];
  private isOnline: boolean = navigator.onLine;
  private speechRecognizer: SpeechRecognizer | null = null;
  private wasRecognitionRunning: boolean = false;
  private isRestartingRecognition: boolean = false;
  private restartAttemptTimeout: number | null = null;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): NetworkStatus {
    if (!NetworkStatus.instance) {
      NetworkStatus.instance = new NetworkStatus();
    }
    return NetworkStatus.instance;
  }

  private setupEventListeners() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  private handleOnline() {
    console.log('Network is back online');
    this.isOnline = true;
    this.notifyListeners();

    // Attempt to restart speech recognition if it was running and not already restarting
    if (this.wasRecognitionRunning && this.speechRecognizer && !this.isRestartingRecognition) {
      console.log('Network restored, preparing to restart speech recognition');
      this.isRestartingRecognition = true;

      // Clear any existing restart attempt
      if (this.restartAttemptTimeout !== null) {
        window.clearTimeout(this.restartAttemptTimeout);
      }

      // Add a small delay before attempting restart to ensure network is stable
      this.restartAttemptTimeout = window.setTimeout(() => {
        console.log('Attempting to restart speech recognition');
        this.speechRecognizer?.start(
          (result) => {
            console.log('Speech recognition restarted successfully:', result);
            this.isRestartingRecognition = false;
            this.restartAttemptTimeout = null;
          },
          (error) => {
            console.error('Failed to restart speech recognition:', error);
            this.isRestartingRecognition = false;
            this.restartAttemptTimeout = null;
          }
        );
      }, 2000); // Wait 2 seconds for network to stabilize for better reliability
    }
  }

  private handleOffline() {
    console.log('Network is offline');
    this.isOnline = false;
    this.notifyListeners();

    // Stop speech recognition if it's running
    if (this.speechRecognizer) {
      this.wasRecognitionRunning = true;
      this.speechRecognizer.stop();
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      listener.onNetworkStatusChange(this.isOnline);
    });
  }

  public addListener(listener: NetworkStatusListener) {
    this.listeners.push(listener);
  }

  public removeListener(listener: NetworkStatusListener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  public setSpeechRecognizer(recognizer: SpeechRecognizer | null) {
    this.speechRecognizer = recognizer;
    // Only reset flags if we're removing the recognizer
    if (!recognizer) {
      this.wasRecognitionRunning = false;
      this.isRestartingRecognition = false;
      if (this.restartAttemptTimeout !== null) {
        window.clearTimeout(this.restartAttemptTimeout);
        this.restartAttemptTimeout = null;
      }
    }
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public cleanup() {
    window.removeEventListener('online', () => this.handleOnline());
    window.removeEventListener('offline', () => this.handleOffline());
    
    // Clear any pending restart attempts
    if (this.restartAttemptTimeout !== null) {
      window.clearTimeout(this.restartAttemptTimeout);
      this.restartAttemptTimeout = null;
    }
    
    // Reset all state
    this.listeners = [];
    this.speechRecognizer = null;
    this.wasRecognitionRunning = false;
    this.isRestartingRecognition = false;
  }
}
