import { supabase } from './supabase';

export interface VideoStorageResult {
  success: boolean;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Downloads a video from a URL and stores it in Supabase Storage
 */
export const storeVideoInSupabase = async (
  videoUrl: string,
  userId: string,
  filename: string
): Promise<VideoStorageResult> => {
  try {
    console.log('Downloading video from:', videoUrl);
    
    // Download the video
    const response = await fetch(videoUrl, {
      mode: 'cors',
      headers: {
        'Accept': 'video/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('Video downloaded, size:', blob.size, 'bytes');

    // Generate a unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = 'mp4'; // PiAPI generates MP4 videos
    const storagePath = `videos/${userId}/${timestamp}-${randomId}-${filename}.${fileExtension}`;

    console.log('Uploading to Supabase Storage:', storagePath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-videos')
      .upload(storagePath, blob, {
        contentType: 'video/mp4',
        cacheControl: '3600', // Cache for 1 hour
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload video: ${uploadError.message}`);
    }

    console.log('Upload successful:', uploadData);

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('generated-videos')
      .getPublicUrl(storagePath);

    if (!urlData.publicUrl) {
      throw new Error('Failed to get public URL');
    }

    console.log('Public URL generated:', urlData.publicUrl);

    return {
      success: true,
      publicUrl: urlData.publicUrl,
      storagePath: storagePath
    };

  } catch (error)  {
    console.error('Error storing video in Supabase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * Downloads a video from Supabase Storage
 */
export const downloadVideoFromSupabase = async (
  publicUrl: string, 
  filename: string
): Promise<void> => {
  try {
    console.log('Downloading from Supabase Storage:', publicUrl);

    const response = await fetch(publicUrl, {
      mode: 'cors',
      headers: {
        'Accept': 'video/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const blob = await response.blob();
    
    // Create download link
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    
  } catch (error) {
    console.error('Error downloading video from Supabase:', error);
    throw error;
  }
};

/**
 * Deletes a video from Supabase Storage
 */
export const deleteVideoFromSupabase = async (path: string): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from('generated-videos')
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete video: ${error.message}`);
    }

    console.log('Video deleted successfully:', path);
  } catch (error) {
    console.error('Error deleting video from Supabase:', error);
    throw error;
  }
};

/**
 * Gets the file info of a video in Supabase Storage
 */
export const getVideoInfo = async (path: string) => {
  try {
    const { data, error } = await supabase.storage
      .from('generated-videos')
      .list(path.split('/').slice(0, -1).join('/'), {
        search: path.split('/').pop()
      });

    if (error) {
      throw new Error(`Failed to get video info: ${error.message}`);
    }

    return data?.[0] || null;
  } catch (error) {
    console.error('Error getting video info:', error);
    return null;
  }
};

/**
 * Updates a video record in the database with the final video URL
 */
export const updateVideoUrlInDatabase = async (
  videoId: string, 
  videoUrl: string,
  storagePath?: string
): Promise<boolean> => {
  try {
    const updateData: any = { video_url: videoUrl };
    if (storagePath) {
      updateData.storage_path = storagePath;
    }

    const { error } = await supabase
      .from('video_generations')
      .update(updateData)
      .eq('video_id', videoId);

    if (error) {
      console.error('Error updating video URL in database:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating video URL:', error);
    return false;
  }
};

/**
 * Checks for pending videos in the database and returns them
 */
export const getPendingVideos = async (userId: string): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('video_generations')
      .select('*')
      .eq('user_id', userId)
      .or('video_url.eq.,video_url.eq.null')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending videos:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting pending videos:', error);
    return [];
  }
};