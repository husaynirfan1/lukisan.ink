import { supabase } from './supabase';

export interface SaveLogoParams {
  imageBlob: Blob;
  prompt: string;
  category: string;
  userId: string;
  aspectRatio?: string;
}

export interface SaveLogoResult {
  success: boolean;
  logoId?: string;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Converts a data URL to a Blob
 */
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * Converts a Blob to a data URL
 */
export const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Saves a generated logo to Supabase Storage and database
 * This function handles the complete workflow of uploading an image and saving its metadata
 */
export const handleSaveGeneratedLogo = async (params: SaveLogoParams): Promise<SaveLogoResult> => {
  const { imageBlob, prompt, category, userId, aspectRatio } = params;

  try {
    console.log('Starting logo save process for user:', userId);

    // Step 1: Validate inputs
    if (!imageBlob || !prompt || !category || !userId) {
      throw new Error('Missing required parameters for saving logo');
    }

    // Step 2: Create a unique file path for Supabase Storage
    // Format: logos/{userId}/{timestamp}-{randomId}-{category}.png
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = imageBlob.type.split('/')[1] || 'png';
    const fileName = `${timestamp}-${randomId}-${category}`;
    const filePath = `logos/${userId}/${fileName}.${fileExtension}`;

    console.log('Generated file path:', filePath);

    // Step 3: Upload the image blob to Supabase Storage
    console.log('Uploading image to Supabase Storage...');
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images') // Make sure this bucket exists in your Supabase project
      .upload(filePath, imageBlob, {
        contentType: imageBlob.type,
        cacheControl: '3600', // Cache for 1 hour
        upsert: false // Don't overwrite if file exists
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    console.log('Upload successful:', uploadData);

    // Step 4: Get the permanent public URL for the uploaded image
    const { data: urlData } = supabase.storage
      .from('generated-images')
      .getPublicUrl(filePath);

    if (!urlData.publicUrl) {
      throw new Error('Failed to get public URL for uploaded image');
    }

    const publicUrl = urlData.publicUrl;
    console.log('Generated public URL:', publicUrl);

    // Step 5: Save the logo metadata to the database with the permanent URL
    console.log('Saving logo metadata to database...');
    const logoData = {
      user_id: userId,
      prompt: aspectRatio ? `${prompt} (${aspectRatio})` : prompt,
      category: category,
      image_url: publicUrl, // This is the permanent URL, not a blob URL
      storage_path: filePath, // Store the path for easier file management
      created_at: new Date().toISOString()
    };

    const { data: insertData, error: insertError } = await supabase
      .from('logo_generations')
      .insert(logoData)
      .select('id')
      .single();

    if (insertError) {
      console.error('Database insertion error:', insertError);
      
      // If database save fails, clean up the uploaded file
      console.log('Cleaning up uploaded file due to database error...');
      await supabase.storage
        .from('generated-images')
        .remove([filePath]);
      
      throw new Error(`Failed to save logo to database: ${insertError.message}`);
    }

    console.log('Logo saved successfully with ID:', insertData.id);

    // Step 6: Return success result
    return {
      success: true,
      logoId: insertData.id,
      publicUrl: publicUrl,
      storagePath: filePath
    };

  } catch (error: any) {
    console.error('Error in handleSaveGeneratedLogo:', error);
    
    return {
      success: false,
      error: error.message || 'An unexpected error occurred while saving the logo'
    };
  }
};

/**
 * Helper function to convert a URL to a Blob
 * Use this if you have an image URL and need to convert it to a Blob for saving
 * Now supports data URLs as well as regular URLs
 */
export const urlToBlob = async (url: string): Promise<Blob> => {
  try {
    // Check if it's a data URL
    if (url.startsWith('data:')) {
      return dataUrlToBlob(url);
    }

    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    return await response.blob();
  } catch (error) {
    console.error('Error converting URL to blob:', error);
    throw new Error('Failed to process image for saving');
  }
};

/**
 * Helper function to delete a logo from both storage and database
 * Use this for cleanup operations
 */
export const deleteSavedLogo = async (logoId: string, storagePath: string): Promise<boolean> => {
  try {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('generated-images')
      .remove([storagePath]);

    if (storageError) {
      console.warn('Failed to delete from storage:', storageError);
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('logo_generations')
      .delete()
      .eq('id', logoId);

    if (dbError) {
      console.error('Failed to delete from database:', dbError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting saved logo:', error);
    return false;
  }
};