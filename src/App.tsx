import { useState, useRef, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Camera, Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { initializeAIChat, processVideoFrame, processConversation } from './services/ai-service'
import { AudioProcessor, createAudioProcessor, ExtendedAudioContext } from './utils/audioUtils'
import { SilenceDetector } from './utils/silenceDetector'
import { SpeechRecognizer } from './utils/speechRecognition'
import { textToSpeech } from './utils/textToSpeech'
import { NetworkStatus, NetworkStatusListener } from './utils/networkStatus'
import { MessageList } from './components/MessageList'
import { useConversation } from './context/ConversationContext'
import './App.css'

function App() {
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [isSilent, setIsSilent] = useState(false)
  const [currentSpeech, setCurrentSpeech] = useState('')
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const { addMessage, clearMessages } = useConversation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameInterval = useRef<number>()
  const speechRecognizer = useRef<SpeechRecognizer | null>(null)
  const audioProcessor = useRef<AudioProcessor>(createAudioProcessor())
  const silenceDetector = useRef<SilenceDetector | null>(null)

  useEffect(() => {
    const initAI = async () => {
      const success = await initializeAIChat();
      if (!success) {
        setError('Failed to initialize AI chat');
      }
    };
    initAI();

    // Setup network status monitoring
    const networkStatus = NetworkStatus.getInstance();
    const networkListener: NetworkStatusListener = {
      onNetworkStatusChange: (isOnline: boolean) => {
        setIsOffline(!isOnline);
        if (!isOnline) {
          setError('Network connection lost. Waiting for connection to resume...');
          if (speechRecognizer.current) {
            speechRecognizer.current.stop();
          }
        } else {
          setError('');
          if (isVideoOn && speechRecognizer.current) {
            speechRecognizer.current.start(
              (result) => {
                setCurrentSpeech(result.text);
                console.log('Speech recognized:', result.text);
              },
              (error) => {
                setError(error);
                console.log('Network status error:', error);
                if (error.includes('network')) {
                  console.log('Network connection issue detected');
                }
              }
            );
          }
        }
      }
    };
    networkStatus.addListener(networkListener);

    return () => {
      networkStatus.removeListener(networkListener);
      networkStatus.cleanup();
    };
  }, [])

  const startVideo = async () => {
    setIsLoading(true);
    setError('');
    
    if (isOffline) {
      setError('Cannot start video chat while offline. Please check your internet connection.');
      setIsLoading(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsVideoOn(true);
        
        // Initialize audio processing
        audioProcessor.current.initialize(stream);
        
        // Initialize speech recognition and silence detection
        try {
          speechRecognizer.current = new SpeechRecognizer();
          NetworkStatus.getInstance().setSpeechRecognizer(speechRecognizer.current);
          speechRecognizer.current.start(
            (result) => {
              setCurrentSpeech(result.text);
              console.log('Speech recognized:', result.text);
            },
            (error) => {
              setError(error);
              console.log('Speech recognition error:', error);
              if (error.includes('network')) {
                console.log('Network issue detected in speech recognition');
              }
            }
          );

          silenceDetector.current = new SilenceDetector(audioProcessor.current);
          silenceDetector.current.start(async () => {
            console.log('Silence detected - processing conversation');
            setIsSilent(true);
            
            try {
              // Store the current speech for processing
              const speechToProcess = currentSpeech;
              if (speechToProcess.trim()) {
                console.log('Processing speech:', speechToProcess);
                
                // Add user message to conversation
                addMessage({
                  text: speechToProcess,
                  sender: 'user'
                });

                // Get the latest video frame for context
                const videoContext = await processVideoFrame(videoRef.current!);
                
                // Process conversation with Gemini
                const response = await processConversation(
                  speechToProcess,
                  videoContext || undefined
                );
                
                if (response.error) {
                  console.error('Error from AI:', response.error);
                  const errorMessage = 'Sorry, I encountered an error processing your message.';
                  addMessage({
                    text: errorMessage,
                    sender: 'ai',
                    error: true
                  });
                } else {
                  const responseText = response.text;
                  // Add AI response to conversation
                  addMessage({
                    text: responseText,
                    sender: 'ai',
                    videoContext: videoContext
                  });
                  // Speak the response if not muted
                  if (!isMuted) {
                    textToSpeech.speak(responseText);
                  }
                }
              }
            } catch (error) {
              console.error('Error in silence detection callback:', error);
              setError('Failed to process conversation');
            } finally {
              // Reset states
              setCurrentSpeech('');
              setTimeout(() => setIsSilent(false), 1000);
            }
          });
        } catch (error) {
          setError('Failed to initialize speech recognition: ' + error);
        }
        
        // Start processing frames every 2 seconds
        frameInterval.current = window.setInterval(async () => {
          try {
            if (videoRef.current) {
              const response = await processVideoFrame(videoRef.current);
              addMessage({
                text: response,
                sender: 'ai',
                videoContext: response
              });
            }
          } catch (error) {
            console.error('Error processing frame:', error);
            addMessage({
              text: 'Error processing video frame',
              sender: 'ai',
              error: true
            });
            setError('Error processing video frame');
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setError('Failed to access camera. Please ensure you have granted camera permissions and have a working webcam connected.');
      addMessage({
        text: 'Camera access error. Please check your camera permissions and hardware.',
        sender: 'ai',
        error: true
      });
    } finally {
      setIsLoading(false);
    }
  }

  const stopVideo = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsVideoOn(false);
      clearMessages();
      textToSpeech.stop();
      
      // Clear the frame processing interval
      if (frameInterval.current) {
        clearInterval(frameInterval.current);
        frameInterval.current = undefined;
      }
      
      // Cleanup audio processing, silence detection, and speech recognition
      if (silenceDetector.current) {
        silenceDetector.current.stop();
        silenceDetector.current = null;
      }
      if (speechRecognizer.current) {
        speechRecognizer.current.stop();
        speechRecognizer.current = null;
      }
      audioProcessor.current.cleanup();
    }
  }

  const toggleMute = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      
      // Stop speaking if muting
      if (newMutedState) {
        textToSpeech.stop();
      }
      
      // If unmuting, resume audio context
      if (!isMuted && audioProcessor.current) {
        const processor = audioProcessor.current;
        const audioCtx = (processor as any).audioContext as ExtendedAudioContext;
        if (audioCtx?.state === 'suspended') {
          void audioCtx.resume().catch(console.error);
        }
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-100 p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-6">AI Video Chat</h1>
        
        {error && (
          <div className={`border px-4 py-3 rounded mb-4 flex items-center justify-between ${
            error.includes('Retrying') || error.includes('Waiting for connection')
              ? 'bg-yellow-100 border-yellow-400 text-yellow-700'
              : 'bg-red-100 border-red-400 text-red-700'
          }`}>
            <span>{error}</span>
            {(error.includes('Retrying') || error.includes('Waiting for connection')) && (
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-yellow-600"></div>
            )}
          </div>
        )}
        
        <div className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden mb-4">
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`w-full h-full ${isVideoOn ? 'block' : 'hidden'}`}
            />
            {isSilent && (
              <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm animate-pulse">
                Silence Detected
              </div>
            )}
          </div>
          {!isVideoOn && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Camera className="w-16 h-16 text-zinc-600" />
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          )}
        </div>
        
        <div className="bg-zinc-50 rounded-lg p-4 mb-4 max-h-96 overflow-y-auto">
          <MessageList />
        </div>

        <div className="flex justify-center gap-4">
          {!isVideoOn ? (
            <Button onClick={startVideo} className="gap-2">
              <Video />
              Start Video
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={toggleMute}>
                {isMuted ? <MicOff /> : <Mic />}
                {isMuted ? 'Unmute' : 'Mute'}
              </Button>
              <Button variant="destructive" onClick={stopVideo}>
                <VideoOff className="mr-2" />
                End Call
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
