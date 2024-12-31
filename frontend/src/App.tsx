import { useState, useRef, useEffect } from 'react'
import { Camera, VideoOff, MicOff, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import './App.css'

function App() {
  const [isVideoStarted, setIsVideoStarted] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const frameIntervalRef = useRef<number | null>(null)
  const [messages, setMessages] = useState<Array<{ text: string, isAI: boolean }>>([])

  // Cleanup effect
  useEffect(() => {
    return () => {
      stopVideo()
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])
  const startVideo = async () => {
    setError(null)
    setIsLoading(true)
    try {
      if (!videoRef.current || !canvasRef.current) {
        throw new Error('无法初始化视频组件')
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 },
        audio: true 
      })
      videoRef.current.srcObject = stream
      setIsVideoStarted(true)

      // Initialize canvas for frame processing
      const ctx = canvasRef.current.getContext('2d')
      if (!ctx) {
        throw new Error('无法初始化视频处理')
      }

      // Connect to WebSocket using environment variable
      const backendUrl = import.meta.env.VITE_BACKEND_URL?.replace('https://', 'wss://') || ''
      wsRef.current = new WebSocket(`${backendUrl}/ws/video`)
            
      wsRef.current.onopen = () => {
        console.log('WebSocket connected')
        setError(null)
        // Start sending frames every second
        frameIntervalRef.current = window.setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && videoRef.current && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
              // Draw current video frame to canvas
              ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
              // Convert to base64
              const imageData = canvasRef.current.toDataURL('image/jpeg', 0.8)
              // Remove the "data:image/jpeg;base64," prefix
              const base64Data = imageData.split(',')[1]
              const frameData = {
                image: {
                  mime_type: "image/jpeg",
                  data: base64Data
                }
              }
              wsRef.current.send(JSON.stringify(frameData))
            }
          }
        }, 1000)
            }

      wsRef.current.onmessage = (event) => {
        console.log('Received message:', event.data)
        // Only add message if it's not null (skipped due to rate limiting)
        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ping') {
              wsRef.current?.send(JSON.stringify({ type: 'pong' }));
              return;
            }
            setMessages(prev => [...prev, { text: data.message || data, isAI: true }]);
          } catch (e) {
            setMessages(prev => [...prev, { text: event.data, isAI: true }]);
          }
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('连接错误 - 正在尝试重新连接...')
        // Close the connection to trigger reconnect
        wsRef.current?.close()
      }

      wsRef.current.onclose = () => {
        console.log('WebSocket closed')
        clearInterval(frameIntervalRef.current!)
        frameIntervalRef.current = null
        setError('连接已断开 - 正在尝试重新连接...')
        
        // Attempt to reconnect after 2 seconds
        setTimeout(() => {
          if (isVideoStarted) {
            console.log('Attempting to reconnect...')
            const backendUrl = import.meta.env.VITE_BACKEND_URL?.replace('https://', 'wss://') || ''
            wsRef.current = new WebSocket(`${backendUrl}/ws/video`)
            // Re-attach all event handlers
            wsRef.current.onopen = wsRef.current.onopen
            wsRef.current.onmessage = wsRef.current.onmessage
            wsRef.current.onerror = wsRef.current.onerror
            wsRef.current.onclose = wsRef.current.onclose
          }
        }, 2000)
      }
    } catch (err) {
      setError('初始化视频失败，请重试。')
      console.error('Error initializing video:', err)
    } finally {
      setIsLoading(false)
    }

  }

  const stopVideo = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
      setIsVideoStarted(false)
      setIsMuted(false)  // Reset mute state when stopping video
      
      // Clean up WebSocket and interval
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current)
        frameIntervalRef.current = null
      }
    }
  }

  const toggleMute = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      const audioTracks = stream.getAudioTracks()
      
      if (audioTracks.length > 0) {
        const audioTrack = audioTracks[0]
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!isMuted)
      } else {
        console.warn('No audio tracks found in the stream')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="container mx-auto">
        <canvas ref={canvasRef} style={{ display: 'none' }} width="640" height="480" />
        <div className="grid grid-cols-2 gap-4">
          {/* Left column - Video */}
          <div className="space-y-4">
            <Card className="p-4 h-96">
              <div className="h-64 bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-4 flex flex-col items-center space-y-2">
                {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
                <div className="flex justify-center space-x-4">
                  <Button
                    onClick={isVideoStarted ? stopVideo : startVideo}
                    variant={isVideoStarted ? "destructive" : "default"}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      "正在初始化..."
                    ) : isVideoStarted ? (
                      <><VideoOff className="mr-2" /> 停止视频</>
                    ) : (
                      <><Camera className="mr-2" /> 开始视频</>
                    )}
                  </Button>
                {isVideoStarted && (
                  <Button onClick={toggleMute} variant="outline">
                    {isMuted ? (
                      <><MicOff className="mr-2" /> 取消静音</>
                    ) : (
                      <><Mic className="mr-2" /> 静音</>
                    )}
                  </Button>
                )}
                </div>
              </div>
            </Card>
          </div>

          {/* Right column - Chat */}
          <div className="space-y-4">
            <Card className="p-4 h-96 overflow-y-auto">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-4">
                    点击"开始视频"开始对话
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        message.isAI ? 'justify-start' : 'justify-end'
                      }`}
                    >
                      <div
                        className={`rounded-lg p-3 max-w-[80%] ${
                          message.isAI
                            ? 'bg-gray-200'
                            : 'bg-blue-500 text-white'
                        }`}
                      >
                        {message.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
