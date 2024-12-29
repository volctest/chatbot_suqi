interface SpeechOptions {
  lang?: string;
  volume?: number;
  rate?: number;
  pitch?: number;
}

class TextToSpeech {
  private synthesis: SpeechSynthesis;
  private speaking: boolean = false;

  constructor() {
    this.synthesis = window.speechSynthesis;
    if (!this.synthesis) {
      throw new Error('Speech synthesis is not supported in this browser');
    }
  }

  speak(text: string, options: SpeechOptions = {}) {
    // Cancel any ongoing speech
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure speech options
    utterance.lang = options.lang || 'zh-CN'; // Default to Chinese
    utterance.volume = options.volume ?? 1;
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;

    // Handle speech events
    utterance.onstart = () => {
      this.speaking = true;
      console.log('Started speaking');
    };

    utterance.onend = () => {
      this.speaking = false;
      console.log('Finished speaking');
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      this.speaking = false;
    };

    // Start speaking
    this.synthesis.speak(utterance);
  }

  stop() {
    if (this.synthesis && this.speaking) {
      this.synthesis.cancel();
      this.speaking = false;
    }
  }

  isSpeaking() {
    return this.speaking;
  }
}

export const textToSpeech = new TextToSpeech();
