import { set, get, keys, del } from 'idb-keyval';
import { blobToDataUrl, dataUrlToBlob } from './logoSaver';

export interface GuestImageData {
  id: string;
  blob: Blob;
  prompt: string;
  category: string;
  aspectRatio: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Saves a guest-generated image to IndexedDB
 * This replaces the old method of storing blob URLs in localStorage
 */
export const saveGuestImageLocally = async (
  imageBlob: Blob,
  prompt: string,
  category: string,
  aspectRatio: string = '1:1'
): Promise<{ success: boolean; imageId?: string; error?: string }> => {
  try {
    // Generate a unique key for this image
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const imageId = `guest-image-${timestamp}-${randomId}`;

    // Create the image data object with the actual Blob
    const imageData: GuestImageData = {
      id: imageId,
      blob: imageBlob, // Store the actual Blob, not a URL
      prompt,
      category,
      aspectRatio,
      createdAt: timestamp,
      expiresAt: timestamp + (2 * 60 * 60 * 1000), // 2 hours from now
    };

    // Save to IndexedDB using idb-keyval
    await set(imageId, imageData);

    console.log(`Successfully saved guest image to IndexedDB: ${imageId}`);
    
    return {
      success: true,
      imageId
    };

  } catch (error: any) {
    console.error('Error saving guest image to IndexedDB:', error);
    return {
      success: false,
      error: error.message || 'Failed to save image locally'
    };
  }
};

/**
 * Transfers all guest images to the authenticated user's account
 * This replaces the old transferTempImagesToUser function
 */
export const transferGuestImagesToUserAccount = async (
  user: any, // Supabase user object
  uploadAndSaveLogo: (blob: Blob, prompt: string, category: string, userId: string, aspectRatio?: string) => Promise<{ success: boolean; error?: string }>
): Promise<{
  success: boolean;
  transferredCount: number;
  failedCount: number;
  errors: string[];
}> => {
  const result = {
    success: false,
    transferredCount: 0,
    failedCount: 0,
    errors: [] as string[]
  };

  try {
    console.log('Starting guest image transfer to user account...');

    // Get all keys from IndexedDB that start with 'guest-image-'
    const allKeys = await keys();
    const guestImageKeys = allKeys.filter(key => 
      typeof key === 'string' && key.startsWith('guest-image-')
    ) as string[];

    if (guestImageKeys.length === 0) {
      console.log('No guest images found to transfer.');
      result.success = true;
      return result;
    }

    console.log(`Found ${guestImageKeys.length} guest images to transfer.`);

    // Process each guest image
    for (const imageKey of guestImageKeys) {
      try {
        console.log(`Processing guest image: ${imageKey}`);

        // Retrieve the image data from IndexedDB
        const imageData: GuestImageData | undefined = await get(imageKey);

        if (!imageData) {
          console.warn(`Image data not found for key: ${imageKey}`);
          result.failedCount++;
          result.errors.push(`Image data not found for ${imageKey}`);
          continue;
        }

        // Check if the image has expired
        if (Date.now() > imageData.expiresAt) {
          console.log(`Image ${imageKey} has expired, skipping transfer`);
          // Delete expired image from IndexedDB
          await del(imageKey);
          result.failedCount++;
          result.errors.push(`Image ${imageKey} has expired`);
          continue;
        }

        console.log(`[Logo Migration] Attempting to migrate logo ${imageData.id} for user ${user.id}. Prompt: "${imageData.prompt}". Timestamp: ${new Date().toISOString()}`);
        // Upload and save the logo using the existing function
        const uploadResult = await uploadAndSaveLogo(
          imageData.blob,
          imageData.prompt,
          imageData.category,
          user.id,
          imageData.aspectRatio
        );

        if (uploadResult.success) {
          console.log(`Successfully transferred image: ${imageKey}`);
          result.transferredCount++;
          await markGuestImageAsTransferred(image.id);
          // Delete the image from IndexedDB after successful transfer
          await del(imageKey);
          console.log(`Cleaned up IndexedDB entry: ${imageKey}`);

        } else {
          console.error(`Failed to upload image ${imageKey}:`, uploadResult.error);
          result.failedCount++;
          result.errors.push(`Upload failed for ${imageKey}: ${uploadResult.error}`);
        }

      } catch (error: any) {
        console.error(`Error processing image ${imageKey}:`, error);
        result.failedCount++;
        result.errors.push(`Processing error for ${imageKey}: ${error.message}`);
      }
    }

    // Mark as successful if at least one image was transferred
    result.success = result.transferredCount > 0;

    console.log(`Transfer completed: ${result.transferredCount} successful, ${result.failedCount} failed`);

    return result;

  } catch (error: any) {
    console.error('Error in transferGuestImagesToUserAccount:', error);
    result.errors.push(`Transfer process error: ${error.message}`);
    return result;
  }
};

/**
 * Gets all guest images for preview/display purposes
 */
export const getGuestImages = async (): Promise<GuestImageData[]> => {
  try {
    const allKeys = await keys();
    const guestImageKeys = allKeys.filter(key => 
      typeof key === 'string' && key.startsWith('guest-image-')
    ) as string[];

    const images: GuestImageData[] = [];
    const now = Date.now();

    for (const key of guestImageKeys) {
      try {
        const imageData: GuestImageData | undefined = await get(key);
        
        if (imageData) {
          // Check if expired
          if (now > imageData.expiresAt) {
            // Delete expired image
            await del(key);
            console.log(`Deleted expired guest image: ${key}`);
          } else {
            images.push(imageData);
          }
        }
      } catch (error) {
        console.error(`Error retrieving guest image ${key}:`, error);
      }
    }

    return images;
  } catch (error) {
    console.error('Error getting guest images:', error);
    return [];
  }
};

/**
 * Creates a display URL for a guest image
 */
export const createGuestImageDisplayUrl = (imageData: GuestImageData): string => {
  return URL.createObjectURL(imageData.blob);
};

/**
 * Cleans up all guest images (call on sign out or cleanup)
 */
export const cleanupAllGuestImages = async (): Promise<void> => {
  try {
    const allKeys = await keys();
    const guestImageKeys = allKeys.filter(key => 
      typeof key === 'string' && key.startsWith('guest-image-')
    ) as string[];

    for (const key of guestImageKeys) {
      await del(key);
    }

    console.log(`Cleaned up ${guestImageKeys.length} guest images from IndexedDB`);
  } catch (error) {
    console.error('Error cleaning up guest images:', error);
  }
};

/**
 * Cleans up expired guest images only
 */
export const cleanupExpiredGuestImages = async (): Promise<void> => {
  try {
    const allKeys = await keys();
    const guestImageKeys = allKeys.filter(key => 
      typeof key === 'string' && key.startsWith('guest-image-')
    ) as string[];

    const now = Date.now();
    let cleanedCount = 0;

    for (const key of guestImageKeys) {
      try {
        const imageData: GuestImageData | undefined = await get(key);
        
        if (imageData && now > imageData.expiresAt) {
          await del(key);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Error checking expiration for ${key}:`, error);
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired guest images`);
    }
  } catch (error) {
    console.error('Error cleaning up expired guest images:', error);
  }
};