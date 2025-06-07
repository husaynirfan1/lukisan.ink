import { supabase } from './supabase';

export interface StoredImage {
  id: string;
  url: string;
  publicUrl: string;
  path: string;
}

/**
 * Downloads an image from a URL and stores it in Supabase Storage
 */
export const storeImageInSupabase = async (
  imageUrl: string, 
  userId: string, 
  filename: string
): Promise<StoredImage> => {
  try {
    console.log('Downloading image from:', imageUrl);
    
    // Download the image
    const response = await fetch(imageUrl, {
      mode: 'cors',
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('Image downloaded, size:', blob.size, 'bytes');

    // Generate a unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = blob.type.split('/')[1] || 'png';
    const storagePath = `logos/${userId}/${timestamp}-${randomId}-${filename}.${fileExtension}`;

    console.log('Uploading to Supabase Storage:', storagePath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(storagePath, blob, {
        contentType: blob.type,
        cacheControl: '3600', // Cache for 1 hour
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    console.log('Upload successful:', uploadData);

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('generated-images')
      .getPublicUrl(storagePath);

    if (!urlData.publicUrl) {
      throw new Error('Failed to get public URL');
    }

    console.log('Public URL generated:', urlData.publicUrl);

    return {
      id: uploadData.id || randomId,
      url: imageUrl, // Original URL
      publicUrl: urlData.publicUrl, // Supabase Storage URL
      path: storagePath
    };

  } catch (error) {
    console.error('Error storing image in Supabase:', error);
    throw error;
  }
};

/**
 * Downloads an image from Supabase Storage
 */
export const downloadImageFromSupabase = async (
  publicUrl: string, 
  filename: string
): Promise<void> => {
  try {
    console.log('Downloading from Supabase Storage:', publicUrl);

    const response = await fetch(publicUrl, {
      mode: 'cors',
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
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
    console.error('Error downloading image from Supabase:', error);
    throw error;
  }
};

/**
 * Deletes an image from Supabase Storage
 */
export const deleteImageFromSupabase = async (path: string): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from('generated-images')
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete image: ${error.message}`);
    }

    console.log('Image deleted successfully:', path);
  } catch (error) {
    console.error('Error deleting image from Supabase:', error);
    throw error;
  }
};

/**
 * Gets the file size of an image in Supabase Storage
 */
export const getImageInfo = async (path: string) => {
  try {
    const { data, error } = await supabase.storage
      .from('generated-images')
      .list(path.split('/').slice(0, -1).join('/'), {
        search: path.split('/').pop()
      });

    if (error) {
      throw new Error(`Failed to get image info: ${error.message}`);
    }

    return data?.[0] || null;
  } catch (error) {
    console.error('Error getting image info:', error);
    return null;
  }
};