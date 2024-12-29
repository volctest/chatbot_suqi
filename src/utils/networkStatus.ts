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

    // Attempt to restart speech recognition if it was running
    if (this.wasRecognitionRunning && this.speechRecognizer) {
      console.log('Attempting to restart speech recognition');
      this.speechRecognizer.start(
        (result) => {
          console.log('Speech recognition restarted successfully:', result);
        },
        (error) => {
          console.error('Failed to restart speech recognition:', error);
        }
      );
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
    this.wasRecognitionRunning = false;
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public cleanup() {
    window.removeEventListener('online', () => this.handleOnline());
    window.removeEventListener('offline', () => this.handleOffline());
    this.listeners = [];
    this.speechRecognizer = null;
  }
}
