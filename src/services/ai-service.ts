const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

interface ConversationResponse {
  text: string;
  error?: string;
}

export const processConversation = async (
  text: string,
  videoContext?: string,
  sessionId?: string
): Promise<ConversationResponse> => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId || crypto.randomUUID(),
        user_text: text,
        video_context: videoContext,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error processing conversation:', error);
    return {
      text: '',
      error: `Failed to process conversation: ${error}`,
    };
  }
};

export const initializeAIChat = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/healthz`);
    return response.ok;
  } catch (error) {
    console.error('Error initializing AI chat:', error);
    return false;
  }
};

export const processVideoFrame = async (videoElement: HTMLVideoElement) => {
  try {
    // Create a canvas to capture the video frame
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Draw the current video frame to canvas
    ctx.drawImage(videoElement, 0, 0);

    // Convert the canvas to a blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, 'image/jpeg');
    });

    // Convert blob to base64
    const base64Data = await blobToBase64(blob);

    // Send the frame to the backend
    const response = await fetch(`${BACKEND_URL}/api/process-frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        frame_data: base64Data
      })
    });

    if (!response.ok) {
      throw new Error('Failed to process frame');
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error('Error processing video frame:', error);
    throw error;
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
