// === piapi.ts ===

// The model is a constant as it's always the same.
const API_MODEL = "Qubico/wanx";
const PIAPI_BASE_URL = 'https://api.piapi.ai'; // IMPORTANT: This may need to be verified from docs.
const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;

// Simplified TaskType enum for our specific use case.
export enum TaskType {
    Txt2Video = "txt2video-14b",
    Img2Video = "img2video-14b",
}

export enum AspectRatio {
    The169 = "16:9",
    The916 = "9:16",
}

// Simplified Input interface, removing unused features.
export interface Input {
    prompt: string;
    aspect_ratio?: AspectRatio;
    negative_prompt?: string;
    image?: string; // For Img2Video tasks
}

// The main request body structure.
export interface ApidogRequestPayload {
    model: string;
    task_type: TaskType;
    input: Input;
}

// Response from the initial task creation call.
export interface CreateTaskResponse {
  task_id: string;
}

// Response from the status check call.
export interface TaskStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    video_url?: string;
    thumbnail_url?: string;
    progress?: number;
    error?: string;
}

if (!PIAPI_API_KEY) {
  console.warn('PiAPI key not found. Video generation features will be disabled.');
}

// The core private function for making API calls.
const postToApi = async (payload: ApidogRequestPayload): Promise<CreateTaskResponse> => {
    if (!PIAPI_API_KEY) throw new Error('PiAPI key not configured');

    // CRITICAL: This endpoint must be confirmed from the API documentation.
    const endpoint = `${PIAPI_BASE_URL}/v2/create-task`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'x-api-key': PIAPI_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
};

// --- Public Functions to be used by the UI ---

export interface TextToVideoRequest {
    prompt: string;
    aspectRatio?: AspectRatio;
    negativePrompt?: string;
}

export const generateTextToVideo = async (request: TextToVideoRequest): Promise<CreateTaskResponse> => {
    const payload: ApidogRequestPayload = {
        model: API_MODEL,
        task_type: TaskType.Txt2Video,
        input: {
            prompt: request.prompt,
            aspect_ratio: request.aspectRatio,
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
    const payload: ApidogRequestPayload = {
        model: API_MODEL,
        task_type: TaskType.Img2Video,
        input: {
            prompt: request.prompt || 'Animate this image',
            image: request.imageUrl,
            aspect_ratio: request.aspectRatio,
            negative_prompt: request.negativePrompt,
        }
    };
    return postToApi(payload);
};

/**
 * CRITICAL: This function is a placeholder. Its endpoint URL must be found in the
 * API documentation and implemented. The UI update depends on this function.
 */
export const checkVideoStatus = async (taskId: string): Promise<TaskStatusResponse> => {
    if (!PIAPI_API_KEY) throw new Error('PiAPI key not configured');

    // THIS IS A GUESS - REPLACE WITH THE CORRECT ENDPOINT FROM THE DOCS
    const endpoint = `${PIAPI_BASE_URL}/v2/query-task/${taskId}`;

    console.log(`Checking status for task: ${taskId}`);
    const response = await fetch(endpoint, {
        headers: { 'x-api-key': PIAPI_API_KEY },
    });

    if (!response.ok) {
        throw new Error(`Status check failed: ${response.statusText}`);
    }

    // The response mapping might need adjustment based on the actual API response
    const data = await response.json();
    return {
        task_id: data.task_id,
        status: data.status || 'processing',
        video_url: data.video_url,
        thumbnail_url: data.thumbnail_url,
        progress: data.progress || 0,
        error: data.error,
    };
};