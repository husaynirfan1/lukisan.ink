// =======================================================================
// SIMPLIFIED API INTERFACES
// =======================================================================

// Model is now a constant since we only use one.
const API_MODEL = "Qubico/wanx";

// TaskType enum is simplified to only the two types you need.
export enum TaskType {
    Txt2Video = "txt2video-14b",
    Img2Video = "img2video-14b",
}

export enum AspectRatio {
    The169 = "16:9",
    The916 = "9:16",
    The11 = "1:1",
}

// The main Input interface is now much cleaner.
export interface Input {
    prompt: string;
    aspect_ratio?: AspectRatio;
    negative_prompt?: string;
    image?: string; // Used only for Img2Video tasks
}

// The structure of the request body we will build.
export interface ApidogRequestPayload {
    model: string;
    task_type: TaskType;
    input: Input;
}

// =======================================================================
// REFACTORED API SERVICE
// =======================================================================

const PIAPI_BASE_URL = 'https://api.piapi.ai'; 
const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;

if (!PIAPI_API_KEY) {
    console.warn('PiAPI key not found. Video generation features will be disabled.');
}

// Response from creating a task - Updated based on PiAPI docs
export interface CreateTaskResponse {
  task_id: string;
  status?: string;
  message?: string;
}

// Response from the status check call
export interface TaskStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'running' | 'completed' | 'failed';
    video_url?: string;
    thumbnail_url?: string;
    progress?: number;
    error?: string;
    output?: {
        video_url?: string;
        thumbnail_url?: string;
        error?: string;
    };
}

// Check if the API is available
export const isVideoGenerationAvailable = (): boolean => {
    return !!PIAPI_API_KEY;
};

// --- Core API Function (Internal) ---
// This private function sends the actual request.
const postToApi = async (payload: ApidogRequestPayload): Promise<CreateTaskResponse> => {
    if (!PIAPI_API_KEY) {
        throw new Error('PiAPI key not configured');
    }
    
    const endpoint = `${PIAPI_BASE_URL}/v1/task`;

    console.log('Sending request to PiAPI:', {
        endpoint,
        payload: JSON.stringify(payload, null, 2)
    });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'x-api-key': PIAPI_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    console.log('PiAPI response status:', response.status, response.statusText);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('PiAPI error response:', errorText);
        
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch {
            errorData = { message: errorText };
        }
        
        throw new Error(errorData.message || `API error: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log('PiAPI response data:', responseData);

    if (!responseData) {
        throw new Error('Empty response from PiAPI service');
    }

    const taskId = responseData.data?.task_id || responseData.task_id;
    
    if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
        console.error('Invalid task_id in response:', responseData);
        throw new Error('PiAPI service returned an invalid or missing task_id. Response: ' + JSON.stringify(responseData));
    }

    return {
        task_id: taskId,
        status: responseData.data?.status || responseData.status,
        message: responseData.message
    };
};

// --- Simplified Public Functions ---

export interface TextToVideoRequest {
    prompt: string;
    aspectRatio?: AspectRatio;
    negativePrompt?: string;
}

export const generateTextToVideo = async (request: TextToVideoRequest): Promise<CreateTaskResponse> => {
    console.log("Building Text-to-Video request:", request);

    const payload: ApidogRequestPayload = {
        model: API_MODEL,
        task_type: TaskType.Txt2Video,
        input: {
            prompt: request.prompt,
            aspect_ratio: request.aspectRatio || AspectRatio.The169,
            negative_prompt: request.negativePrompt,
        }
    };

    return postToApi(payload);
};

export interface ImageToVideoRequest {
    imageUrl: string;
    prompt?: string;
    aspectRatio?: AspectRatio;
    negativePrompt?: string;
}

export const generateImageToVideo = async (request: ImageToVideoRequest): Promise<CreateTaskResponse> => {
    console.log("Building Image-to-Video request:", request);

    const payload: ApidogRequestPayload = {
        model: API_MODEL,
        task_type: TaskType.Img2Video,
        input: {
            prompt: request.prompt || 'Animate this image with natural motion',
            image: request.imageUrl,
            aspect_ratio: request.aspectRatio || AspectRatio.The169,
            negative_prompt: request.negativePrompt,
        }
    };

    return postToApi(payload);
};

/**
 * Check the status of a video generation task
 */
export const checkVideoStatus = async (taskId: string): Promise<TaskStatusResponse> => {
    if (!PIAPI_API_KEY) throw new Error('PiAPI key not configured');

    const endpoint = `${PIAPI_BASE_URL}/v1/task/${taskId}`;

    const response = await fetch(endpoint, { 
        method: 'GET',
        headers: { 
            'x-api-key': PIAPI_API_KEY,
            'Content-Type': 'application/json'
        } 
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Status check failed for task ${taskId}:`, errorText);
        throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();

    const responseData = data.data || data;
    
    const status = responseData.status || 'processing';
    const output = responseData.output || {};
    
    return {
        task_id: responseData.task_id || taskId,
        status: status,
        video_url: output.video_url || responseData.video_url,
        thumbnail_url: output.thumbnail_url || responseData.thumbnail_url,
        progress: responseData.progress || (status === 'completed' ? 100 : status === 'failed' ? 0 : 50),
        error: output.error || responseData.error,
        output: output
    };
};

// =======================================================================
// UTILITY FUNCTIONS (ADDED BACK)
// =======================================================================

// Convert file to base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // The PiAPI might expect the full data URI, but if not, this part can be adjusted.
      resolve(result);
    };
    reader.onerror = error => reject(error);
  });
};

// Download video
export const downloadVideo = async (videoUrl: string, filename: string): Promise<void> => {
  try {
    const response = await fetch(videoUrl, { mode: 'cors' });
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Video download error:', error);
    throw error;
  }
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission === 'denied') {
    return false;
  }
  const permission = await Notification.requestPermission();
  return permission === 'granted';
};

// Show browser notification
export const showVideoCompleteNotification = (videoTitle: string, onClick?: () => void) => {
  if (Notification.permission === 'granted') {
    const notification = new Notification('Your video is ready!', {
      body: `${videoTitle} has been generated successfully.`,
      icon: '/favicon.png', // Ensure this icon exists in your /public folder
      badge: '/favicon.png',
      tag: 'video-complete',
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
    setTimeout(() => {
      notification.close();
    }, 10000);
  }
};

// --- FIX: Added VideoStatusPoller class back into this file ---
export class VideoStatusPoller {
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private taskId: string,
    private onStatusUpdate: (status: TaskStatusResponse) => void,
    private onComplete: (status: TaskStatusResponse) => void,
    private onError: (error: string) => void,
    private pollInterval: number = 8000 // Polling every 8 seconds
  ) {}

  start(): void {
    if (this.isPolling) {
      console.warn('Polling already started for task:', this.taskId);
      return;
    }
    this.isPolling = true;
    console.log('Starting status polling for task:', this.taskId);
    this.checkStatus(); // Initial check
    this.intervalId = setInterval(() => this.checkStatus(), this.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPolling = false;
    console.log('Stopped status polling for task:', this.taskId);
  }

  private async checkStatus(): Promise<void> {
    try {
      const status = await checkVideoStatus(this.taskId);
      this.onStatusUpdate(status);
      if (status.status === 'completed') {
        this.stop();
        this.onComplete(status);
      } else if (status.status === 'failed') {
        this.stop();
        this.onError(status.error || 'Video generation failed');
      }
    } catch (error: any) {
      console.error('Error checking video status:', error);
      this.onError(error.message || 'Failed to check video status');
      this.stop(); // Stop polling on error to prevent loops
    }
  }

  isActive(): boolean {
    return this.isPolling;
  }
}
