// Extend the AudioContext type to include all necessary methods
export interface ExtendedAudioContext extends AudioContext {
  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

export class AudioProcessor {
  private audioContext: ExtendedAudioContext | null = null;

  private analyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;

  initialize(stream: MediaStream) {
    // Create audio context
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create analyzer node
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    
    // Create buffer for analyzing audio data
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    
    // Create media stream source from the input stream
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    
    // Connect the source to the analyzer
    this.mediaStreamSource.connect(this.analyser);
  }

  getAudioData(): Uint8Array | null {
    if (this.analyser && this.dataArray) {
      this.analyser.getByteTimeDomainData(this.dataArray);
      return this.dataArray;
    }
    return null;
  }

  cleanup() {
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
    }
    if (this.audioContext) {
      // Suspend the audio context instead of closing
      this.audioContext.suspend();
    }
    this.analyser = null;
    this.mediaStreamSource = null;
    this.dataArray = null;
  }

  // Get current audio level (RMS)
  getAudioLevel(): number {
    if (!this.analyser || !this.dataArray) return 0;
    
    this.analyser.getByteTimeDomainData(this.dataArray);
    
    // Calculate RMS value
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const amplitude = (this.dataArray[i] - 128) / 128;
      sum += amplitude * amplitude;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    
    return rms;
  }
}

export const createAudioProcessor = (): AudioProcessor => {
  return new AudioProcessor();
};
