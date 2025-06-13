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

// FIXED: Response from the status check call - Updated to match actual PiAPI response structure
// Added 'pending_url' to possible status values
export interface TaskStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'pending_url';
    video_url?: string;
    thumbnail_url?: string;
    progress?: number;
    error?: string;
    retry?: boolean; // Added to explicitly signal if polling should continue for certain statuses
    // FIXED: Add the actual response structure from PiAPI
    data?: { // This part seems to be from an older version or direct PiAPI, distinct from normalized TaskStatusResponse
        task_id: string;
        status: string; // Raw status from PiAPI
        progress?: number; // Raw progress from PiAPI
        works?: Array<{
            resource?: {
                resourceWithoutWatermark?: string;
                resource?: string;
            };
            cover?: {
                resource?: string;
            };
        }>;
        // PiAPI might also return video_url directly under data.output or similar
        output?: {
            video_url?: string;
            thumbnail_url?: string;
        }
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
    
    const endpoint = `${PIAPI_BASE_URL}/api/v1/task`;

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

    // FIXED: Handle the actual response structure from PiAPI
    if (!responseData) {
        throw new Error('Empty response from PiAPI service');
    }

    // FIXED: Extract task_id from the correct location in the response
    let taskId;
    if (responseData.data && responseData.data.task_id) {
        taskId = responseData.data.task_id;
    } else if (responseData.task_id) {
        taskId = responseData.task_id;
    } else {
        console.error('Invalid task_id in response:', responseData);
        throw new Error('PiAPI service returned an invalid or missing task_id. Response: ' + JSON.stringify(responseData));
    }

    // Validate task_id
    if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
        console.error('Invalid task_id in response:', responseData);
        throw new Error('PiAPI service returned an invalid or missing task_id. Response: ' + JSON.stringify(responseData));
    }

    // Return the response in the expected format
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
 * COMPLETELY FIXED: Check the status of a video generation task
 * This function polls the PiAPI status endpoint to get real-time updates
 */

export async function checkVideoStatus(taskId: string) {
  const url = `${PIAPI_BASE_URL}/api/v1/task/${taskId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_PIAPI_API_KEY}`, // or use process.env if SSR
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[PiAPI] Failed to check task. Status: ${response.status}, Response: ${errText}`);
    throw new Error('Invalid API key or task not found.');
  }

  const json = await response.json();
  // The actual PiAPI response structure can vary. We need to normalize it.
  // The Edge Function `force-check-status` already does robust normalization.
  // This `checkVideoStatus` function in `piapi.ts` is used by the client-side poller.
  // It should ideally either:
  // 1. Call the `force-check-status` Edge Function (preferred for consistency).
  // 2. Or, replicate the normalization logic of the Edge Function if calling PiAPI directly.

  // For this modification, we'll assume it calls PiAPI directly and needs to normalize.
  const taskData = json?.data || json; // Handle if 'data' field is not present

  let rawStatus = (taskData.status || "processing").toLowerCase();
  let normalizedStatus: TaskStatusResponse['status'];
  let videoUrl: string | undefined;
  let thumbnailUrl: string | undefined;
  let currentProgress = taskData.progress ?? 0;

  // Video URL extraction logic (simplified, mirrors part of Edge Function)
  if (taskData.output?.video_url) {
    videoUrl = taskData.output.video_url;
  } else if (taskData.video_url) {
    videoUrl = taskData.video_url;
  } else if (taskData.works && Array.isArray(taskData.works) && taskData.works.length > 0) {
    const work = taskData.works[0];
    if (work && work.resource) {
      videoUrl = work.resource.resourceWithoutWatermark || work.resource.resource;
    }
    if (work && work.cover) {
      thumbnailUrl = work.cover.resource;
    }
  }
  if (!thumbnailUrl && taskData.output?.thumbnail_url) {
    thumbnailUrl = taskData.output.thumbnail_url;
  }


  switch (rawStatus) {
    case "completed": case "success": case "finished": case "99":
      if (videoUrl) {
        normalizedStatus = "completed";
        currentProgress = 100;
      } else {
        // This is the key change: if PiAPI says "completed" but no URL, we mark as 'pending_url'
        console.warn(`[PiAPI] Task ${taskId} reported as '${rawStatus}' by PiAPI but video_url is missing. Setting status to 'pending_url'.`);
        normalizedStatus = "pending_url";
        currentProgress = 95; // Progress for pending_url
      }
      break;
    case "failed": case "error": case "cancelled":
      normalizedStatus = "failed";
      currentProgress = 0;
      break;
    case "pending": case "queued": case "waiting":
      normalizedStatus = "pending";
      break;
    default: // "processing", "running", etc.
      normalizedStatus = "processing";
  }

  // If status is pending_url, we want the poller to retry.
  const shouldRetry = normalizedStatus === 'pending_url';

  return {
    task_id: taskId,
    status: normalizedStatus,
    progress: currentProgress,
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    retry: shouldRetry, // Explicitly tell poller to retry for pending_url
    error: taskData.error // Include error message if any
  };
}

// =======================================================================
// UTILITY FUNCTIONS
// =======================================================================

// Convert file to base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/...;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
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

// Utility functions
export const formatDuration = (seconds: number): string => {
  return `${seconds}s`;
};

export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (file.size > maxSize) {
    return { valid: false, error: 'Image must be smaller than 10MB' };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Only JPEG, PNG, and WebP images are supported' };
  }

  return { valid: true };
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
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: 'video-complete',
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };

    // Auto-close after 10 seconds
    setTimeout(() => {
      notification.close();
    }, 10000);
  }
};

// FIXED: Polling utility for video status
export class VideoStatusPoller {
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 3; // Reduced from 5 to 3

  constructor(
    private taskId: string,
    private onStatusUpdate: (status: TaskStatusResponse) => void,
    private onComplete: (status: TaskStatusResponse) => void,
    private onError: (error: string) => void,
    private pollInterval: number = 10000 // Increased from 5 seconds to 10 seconds
  ) {}

  start(): void {
    if (this.isPolling) {
      console.warn('Polling already started for task:', this.taskId);
      return;
    }

    this.isPolling = true;
    this.consecutiveErrors = 0;
    console.log('Starting status polling for task:', this.taskId);

    // Initial check
    this.checkStatus();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.checkStatus();
    }, this.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPolling = false;
    this.consecutiveErrors = 0;
    console.log('Stopped status polling for task:', this.taskId);
  }

  private async checkStatus(): Promise<void> {
    try {
      console.log(`[VideoStatusPoller] Checking status for task: ${this.taskId}`);
      const status = await checkVideoStatus(this.taskId);
      
      // Reset error counter on successful check
      this.consecutiveErrors = 0;
      
      console.log(`[VideoStatusPoller] Status received:`, status);
      
      // Call the status update callback in all cases where an update is received
      this.onStatusUpdate(status);

      // Check for terminal states or states that require specific actions
      if (status.status === 'completed' && status.video_url) {
        console.log(`[VideoStatusPoller] Task completed: ${this.taskId}, video URL: ${status.video_url}`);
        this.stop(); // Stop polling on successful completion with URL
        this.onComplete(status);
      } else if (status.status === 'failed') {
        console.log(`[VideoStatusPoller] Task failed: ${this.taskId}, error: ${status.error}`);
        this.stop(); // Stop polling on failure
        this.onError(status.error || 'Video generation failed');
      } else if (status.status === 'pending_url') {
        console.log(`[VideoStatusPoller] Task ${this.taskId} is pending_url. Continuing to poll.`);
        // Do not stop polling, onStatusUpdate has been called.
        // The `retry: true` in the status object (if we choose to use it) could also signify this.
      }
      // For other statuses like 'pending', 'processing', polling continues automatically
      // unless stop() is called.
    } catch (error: any) {
      this.consecutiveErrors++;
      console.error(`[VideoStatusPoller] Error checking video status (attempt ${this.consecutiveErrors}):`, error);
      
      // If we've had too many consecutive errors, stop polling and mark as failed
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error(`[VideoStatusPoller] Too many consecutive errors for task ${this.taskId}, stopping polling`);
        this.stop();
        this.onError(`Too many consecutive errors checking status: ${error.message}`);
      }
      // Otherwise, continue polling - the error might be temporary
    }
  }

  isActive(): boolean {
    return this.isPolling;
  }
}