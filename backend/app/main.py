import os
import json
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from dotenv import load_dotenv
import base64
import asyncio
from datetime import datetime
import time

# Load environment variables
load_dotenv()
api_key = os.getenv("GOOGLE_AI_STUDIO_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_AI_STUDIO_API_KEY environment variable is not set")

# Configure Google AI with specific parameters
print(f"Configuring Google AI with API key: {api_key[:5]}...")
try:
    genai.configure(api_key=api_key)
    print("Successfully configured Google AI")
except Exception as config_error:
    print(f"Error configuring Google AI: {str(config_error)}")
    raise config_error

# Configure the model with specific parameters
print("Setting up model configuration...")
generation_config = {
    "temperature": 0.4,
    "top_p": 1,
    "top_k": 32,
    "max_output_tokens": 100,
}

safety_settings = [
    {
        "category": "HARM_CATEGORY_HARASSMENT",
        "threshold": "BLOCK_NONE",
    },
    {
        "category": "HARM_CATEGORY_HATE_SPEECH",
        "threshold": "BLOCK_NONE",
    },
    {
        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "threshold": "BLOCK_NONE",
    },
    {
        "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
        "threshold": "BLOCK_NONE",
    },
]

try:
    print("Initializing Gemini model...")
    model = genai.GenerativeModel(
        model_name='gemini-1.5-pro',
        generation_config=generation_config,
        safety_settings=safety_settings
    )
    print("Successfully initialized Gemini model")
except Exception as model_error:
    print(f"Error initializing Gemini model: {str(model_error)}")
    raise model_error

app = FastAPI()

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.last_request_time = 0
        self.request_interval = 5.0  # Start with a higher interval
        self.consecutive_errors = 0
        self.max_consecutive_errors = 3
        self.base_interval = 5.0  # Base interval for reset

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def process_frame(self, frame_data: str) -> str:
        try:
            # Rate limiting with exponential backoff
            current_time = time.time()
            if current_time - self.last_request_time < self.request_interval:
                if self.consecutive_errors > 0:
                    self.request_interval = min(self.request_interval * 1.5, 15.0)
                return None  # Skip this frame to respect rate limit
            
            # Reset interval if we've had successful requests
            if self.consecutive_errors == 0 and self.request_interval > self.base_interval:
                self.request_interval = max(self.request_interval * 0.8, self.base_interval)
            
            self.last_request_time = current_time
            
            # Parse JSON data
            print("Parsing JSON frame data...")
            try:
                frame_json = json.loads(frame_data) if isinstance(frame_data, str) else frame_data
            except json.JSONDecodeError:
                raise ValueError("Invalid JSON format")
                
            if not isinstance(frame_json, dict) or 'image' not in frame_json:
                raise ValueError("Invalid frame data format")
            
            try:
                # Extract image data
                image_data = frame_json['image']
                if not isinstance(image_data, dict) or 'data' not in image_data:
                    raise ValueError("Invalid image data format")
                
                # Decode base64 image
                print("Decoding base64 image...")
                image_bytes = base64.b64decode(image_data['data'])
                print(f"Successfully decoded image, size: {len(image_bytes)} bytes")
            except Exception as decode_error:
                print(f"Base64 decoding error: {str(decode_error)}")
                return "视频帧解码错误，请检查图像格式"
            
            try:
                # Generate response from Gemini
                print("Sending request to Gemini API...")
                
                # Create parts for the request
                parts = [
                    {
                        "text": "请描述这个视频帧中的内容，并给出简短的回应。"
                    },
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_bytes).decode('utf-8')
                        }
                    }
                ]
                print("Request parts:", parts)
                
                # Make the API request and handle response
                response = model.generate_content(parts)
                print("API request successful, resolving response...")
                
                # Wait for response to complete
                print("Waiting for Gemini response...")
                response.resolve()
                print("Response resolved successfully")
                
                if not response.text:
                    print("Received empty response from Gemini")
                    return "AI未能生成回应，请稍后再试"
                
                print("Full response:", response.text[:100] + "...")
                
                print(f"Successfully received response: {response.text[:100]}...")
                return response.text
                
            except Exception as api_error:
                error_msg = str(api_error)
                print(f"Gemini API error: {error_msg}")
                
                if "429" in error_msg:
                    self.consecutive_errors += 1
                    if self.consecutive_errors >= self.max_consecutive_errors:
                        self.request_interval = min(self.request_interval * 2.0, 15.0)  # Exponential backoff up to 15 seconds
                        print(f"Increased request interval to {self.request_interval} seconds")
                    else:
                        # Reset interval if we've had some successful requests
                        if self.consecutive_errors == 0:
                            self.request_interval = self.base_interval
                    return "AI服务暂时繁忙，请稍后再试... (自动调整处理速度)"
                else:
                    self.consecutive_errors = 0
                    return f"AI处理错误: {error_msg}"
                
        except Exception as e:
            print(f"Unexpected error: {str(e)}")
            return f"系统错误: {str(e)}"

manager = ConnectionManager()

@app.get("/")
async def root():
    return {"status": "ok"}

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

async def keep_alive():
    while True:
        await asyncio.sleep(30)
        print("Keep-alive ping...")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(keep_alive())

@app.websocket("/ws/video")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    last_ping = time.time()
    last_activity = time.time()
    ping_interval = 15  # Send ping every 15 seconds
    activity_timeout = 300  # 5 minutes inactivity timeout
    
    try:
        while True:
            try:
                # Check for inactivity timeout
                current_time = time.time()
                if current_time - last_activity > activity_timeout:
                    print("Connection inactive for too long, closing...")
                    await websocket.close(code=1000)
                    break
                
                # Send periodic ping to keep connection alive
                if current_time - last_ping >= ping_interval:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                    last_ping = current_time
                    print("Keep-alive ping sent...")
                
                # Receive frame data with a timeout
                frame_data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=ping_interval
                )
                
                # Update last activity time
                last_activity = time.time()
                
                # Process frame and get AI response
                try:
                    response = await manager.process_frame(frame_data)
                    
                    # Ensure response is properly serialized
                    if response is not None:
                        try:
                            response_data = {
                                "type": "response",
                                "data": str(response),
                                "timestamp": int(time.time())
                            }
                            await websocket.send_text(json.dumps(response_data))
                            print("Response sent successfully")
                        except Exception as send_error:
                            print(f"Error sending response: {str(send_error)}")
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": "发送响应时出错，请重试",
                                "timestamp": int(time.time())
                            }))
                    else:
                        # Handle rate limiting case
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "请稍等，正在处理上一帧...",
                            "timestamp": int(time.time())
                        }))
                except Exception as process_error:
                    print(f"Error processing frame: {str(process_error)}")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "处理视频帧时出错，请重试",
                        "timestamp": int(time.time())
                    }))
                
            except asyncio.TimeoutError:
                # Timeout is expected, just continue to send next ping
                continue
            except Exception as e:
                print(f"Error processing frame: {str(e)}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "处理错误，请重试"
                }))
                
    except WebSocketDisconnect:
        print("WebSocket disconnected normally")
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "连接错误，请刷新页面重试"
            }))
        except:
            pass
        manager.disconnect(websocket)
