import { supabase } from './supabase';
import { handleSaveGeneratedLogo } from './logoSaver';
import { 
  saveGuestImageLocally, 
  transferGuestImagesToUserAccount,
  getGuestImages,
  createGuestImageDisplayUrl,
  cleanupAllGuestImages,
  cleanupExpiredGuestImages,
  GuestImageData
} from './guestImageStorage';

export interface GuestSession {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
}

export interface TempImage {
  id: string;
  sessionId: string;
  imageUrl: string;
  prompt: string;
  category: string;
  aspectRatio: string;
  createdAt: number;
  expiresAt: number;
  transferred?: boolean;
}

export interface TransferResult {
  success: boolean;
  transferredCount: number;
  failedCount: number;
  insufficientCredits: boolean;
  creditsNeeded: number;
  creditsAvailable: number;
  errors: string[];
}

// Session management
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Creates or retrieves a guest session identifier
 */
export const getOrCreateGuestSession = (): GuestSession => {
  const existingSession = localStorage.getItem('guest_session');
  
  if (existingSession) {
    try {
      const session: GuestSession = JSON.parse(existingSession);
      
      // Check if session is still valid
      if (Date.now() < session.expiresAt) {
        return session;
      }
    } catch (error) {
      console.warn('Invalid guest session data, creating new session');
    }
  }
  
  // Create new session
  const newSession: GuestSession = {
    sessionId: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION
  };
  
  localStorage.setItem('guest_session', JSON.stringify(newSession));
  console.log('Created new guest session:', newSession.sessionId);
  
  return newSession;
};

/**
 * Stores a temporary image for guest users using IndexedDB
 */
export const storeTempImage = async (params: {
  imageUrl: string;
  prompt: string;
  category: string;
  aspectRatio: string;
}): Promise<{ success: boolean; tempImage?: TempImage; error?: string }> => {
  try {
    const guestSession = getOrCreateGuestSession();
    console.log('storeTempImage - guest_session_id:', guestSession.sessionId);
    console.log('Converting image URL to blob for storage...');
    
    // Convert the image URL to a Blob
    const response = await fetch(params.imageUrl, {
      mode: 'cors',
      headers: { 'Accept': 'image/*' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const imageBlob = await response.blob();
    console.log('Successfully converted URL to blob, size:', imageBlob.size);

    // Save the blob to IndexedDB using our new function
    const saveResult = await saveGuestImageLocally(
      imageBlob,
      params.prompt,
      params.category,
      params.aspectRatio
    );

    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to save image locally');
    }

    // Create a temporary image object for compatibility
   const tempImage: TempImage = {
  id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  sessionId: guestSession.sessionId,
  imageUrl: params.imageUrl,
  prompt: params.prompt,
  category: params.category,
  aspectRatio: params.aspectRatio || '1:1',
  createdAt: Date.now(),
  expiresAt: Date.now() + SESSION_DURATION,
  transferred: false // Explicitly set to false
};
    
    console.log('Successfully stored guest image:', saveResult.imageId);
    console.log('storeTempImage - tempImage:', tempImage);
    
    return { success: true, tempImage };
  } catch (error: any) {
    console.error('Error storing temporary image:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Retrieves temporary images for display (now from IndexedDB)
 */
export const getTempImages = async (sessionId?: string): Promise<TempImage[]> => {
  try {
    const guestImages = await getGuestImages();
    
    // Convert GuestImageData to TempImage format for compatibility
    return guestImages.map(imageData => ({
      id: imageData.id,
      sessionId: sessionId || 'current',
      imageUrl: createGuestImageDisplayUrl(imageData), // Create blob URL for display
      prompt: imageData.prompt,
      category: imageData.category,
      aspectRatio: imageData.aspectRatio,
      createdAt: imageData.createdAt,
      expiresAt: imageData.expiresAt,
      transferred: false
    }));
  } catch (error) {
    console.error('Error retrieving temporary images:', error);
    return [];
  }
};

/**
 * Checks user's available credits for image transfer
 */
export const checkUserCredits = async (userId: string): Promise<{
  available: number;
  isProUser: boolean;
  canGenerate: boolean;
}> => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('tier, credits_remaining, daily_generations, last_generation_date')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch user credits: ${error.message}`);
    }

    const isProUser = user.tier === 'pro';
    
    if (isProUser) {
      return {
        available: user.credits_remaining,
        isProUser: true,
        canGenerate: user.credits_remaining > 0
      };
    } else {
      // Free user logic
      const today = new Date().toISOString().split('T')[0];
      const lastGenDate = user.last_generation_date?.split('T')[0];
      
      const dailyUsed = lastGenDate === today ? user.daily_generations : 0;
      const available = Math.max(0, 3 - dailyUsed);
      
      return {
        available,
        isProUser: false,
        canGenerate: available > 0
      };
    }
  } catch (error: any) {
    console.error('Error checking user credits:', error);
    return {
      available: 0,
      isProUser: false,
      canGenerate: false
    };
  }
};

/**
 * Transfers temporary images to user's permanent library using the new IndexedDB approach
 * ENHANCED: Prevents duplicate transfers and ensures only one transfer per session
 */
export const transferTempImagesToUser = async (userId: string): Promise<TransferResult> => {
  console.log('=== STARTING TRANSFER PROCESS ===');
  console.log('transferTempImagesToUser - userId:', userId);
  
  const guestSession = getOrCreateGuestSession();
  console.log('transferTempImagesToUser - guest_session_id:', guestSession.sessionId);
  
  const result: TransferResult = {
    success: false,
    transferredCount: 0,
    failedCount: 0,
    insufficientCredits: false,
    creditsNeeded: 0,
    creditsAvailable: 0,
    errors: []
  };

  try {
    console.log('Starting image transfer for user:', userId);
    
    // Get guest images from IndexedDB for the current session only
    const guestImages = await getGuestImages();
    
    // ENHANCED: Filter out already transferred images and only get untransferred ones
    const sessionImages = guestImages.filter(img => !img.transferred);
    
    console.log(`Found ${guestImages.length} total guest images, ${sessionImages.length} untransferred`);
    
    if (sessionImages.length === 0) {
      console.log('No untransferred guest images found for current session');
      result.success = true;
      return result;
    }

    // Check user credits
    const creditInfo = await checkUserCredits(userId);
    console.log('transferTempImagesToUser - creditInfo:', creditInfo);
    result.creditsAvailable = creditInfo.available;
    result.creditsNeeded = sessionImages.length;
    
    if (!creditInfo.canGenerate || creditInfo.available < sessionImages.length) {
      console.log('Insufficient credits for transfer');
      result.insufficientCredits = true;
      result.errors.push(`Insufficient credits. Need ${sessionImages.length}, have ${creditInfo.available}`);
      return result;
    }

    // Get fresh session to ensure valid auth
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('Error getting user session:', sessionError);
      result.errors.push('Authentication error. Please sign in again.');
      return result;
    }

    // Enhanced upload and save function with better error handling and duplicate prevention
    const uploadAndSaveLogo = async (
      blob: Blob, 
      prompt: string, 
      category: string, 
      userId: string, 
      aspectRatio?: string
    ) => {
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Attempt ${attempt}/${maxRetries}] Uploading logo for user ${userId}`);
          
          // Generate unique filename to prevent duplicates
          const timestamp = Date.now();
          const randomId = Math.random().toString(36).substring(2, 15);
          const fileName = `logo-${timestamp}-${randomId}.png`;
          const filePath = `logos/${userId}/${fileName}`;
          
          // Check if a similar logo already exists (duplicate prevention)
          const { data: existingLogos, error: checkError } = await supabase
            .from('logo_generations')
            .select('id, prompt')
            .eq('user_id', userId)
            .eq('prompt', prompt)
            .eq('category', category)
            .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Within last 5 minutes
          
          if (checkError) {
            console.warn('Could not check for duplicates:', checkError.message);
          } else if (existingLogos && existingLogos.length > 0) {
            console.log('Duplicate logo detected, skipping upload');
            return { success: true, skipped: true };
          }
          
          // Upload to storage with retry
          const { error: uploadError } = await supabase.storage
            .from('generated-images') 
            .upload(filePath, blob, {
              cacheControl: '3600',
              upsert: false, // Don't overwrite existing files
              contentType: 'image/png'
            });

          if (uploadError) {
            throw new Error(`Storage upload failed: ${uploadError.message}`);
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('generated-images')
            .getPublicUrl(filePath);

          // Save to database with retry
          const { error: dbError } = await supabase
            .from('logo_generations') 
            .insert([{
              user_id: userId,
              prompt,
              category,
              image_url: publicUrl,
              aspect_ratio: aspectRatio || '1:1' // Ensure we always have a value
            }]);

          if (dbError) {
            throw new Error(`Database save failed: ${dbError.message}`);
          }

          console.log(`Successfully uploaded and saved logo on attempt ${attempt}`);
          return { success: true };

        } catch (error: any) {
          lastError = error;
          console.error(`Attempt ${attempt} failed:`, error.message);
          
          if (attempt < maxRetries) {
            // Wait before retrying (exponential backoff)
            const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      console.error('All database save attempts failed:', lastError?.message);
      return { 
        success: false, 
        error: `All database save attempts failed:\n\n${lastError?.message}` 
      };
    };

    // Transfer the images
   const transferResult = await transferGuestImagesToUserAccount(
  { id: userId },
  sessionImages, // <-- Pass the filtered list here
  uploadAndSaveLogo
);
    // Update result with transfer results
    result.success = transferResult.success;
    result.transferredCount = transferResult.transferredCount;
    result.failedCount = transferResult.failedCount;
    result.errors = transferResult.errors;

    // Update user credits if any images were transferred
    if (result.transferredCount > 0) {
      await deductUserCredits(userId, result.transferredCount, creditInfo.isProUser);
    }

    console.log(`=== TRANSFER COMPLETED ===`);
    console.log(`Transferred: ${result.transferredCount}, Failed: ${result.failedCount}`);
    return result;

  } catch (error: any) {
    console.error('Error in transferTempImagesToUser:', error);
    result.errors.push(`Transfer error: ${error.message}`);
    return result;
  }
};
/**
 * Deducts credits from user account
 */
const deductUserCredits = async (userId: string, count: number, isProUser: boolean): Promise<void> => {
  try {
    if (isProUser) {
      // Deduct from credits_remaining
      const { error } = await supabase
        .from('users')
        .update({
          credits_remaining: supabase.sql`credits_remaining - ${count}`,
          last_generation_date: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        throw new Error(`Failed to deduct pro credits: ${error.message}`);
      }
    } else {
      // Update daily generations
      const today = new Date().toISOString();
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('daily_generations, last_generation_date')
        .eq('id', userId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch user data: ${fetchError.message}`);
      }

      const todayDate = today.split('T')[0];
      const lastGenDate = user.last_generation_date?.split('T')[0];
      
      const newDailyCount = lastGenDate === todayDate 
        ? user.daily_generations + count 
        : count;

      const { error: updateError } = await supabase
        .from('users')
        .update({
          daily_generations: newDailyCount,
          last_generation_date: today
        })
        .eq('id', userId);

      if (updateError) {
        throw new Error(`Failed to update daily generations: ${updateError.message}`);
      }
    }

    console.log(`Successfully deducted ${count} credits for user ${userId}`);
  } catch (error) {
    console.error('Error deducting user credits:', error);
    throw error;
  }
};

/**
 * Cleans up expired temporary images
 */
export const cleanupExpiredTempImages = async (): Promise<void> => {
  try {
    await cleanupExpiredGuestImages();
    console.log('Cleanup of expired guest images completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

/**
 * Clears all temporary data for a session
 */
export const clearGuestSession = async (sessionId?: string): Promise<void> => {
  try {
    // Clean up IndexedDB
    await cleanupAllGuestImages();
    
    // Clean up localStorage
    localStorage.removeItem('guest_session');
    
    console.log('Cleared all guest session data');
  } catch (error) {
    console.error('Error clearing guest session:', error);
  }
};

/**
 * Gets current session info for debugging
 */
export const getSessionInfo = async (): Promise<{
  session: GuestSession | null;
  tempImageCount: number;
  isExpired: boolean;
}> => {
  try {
    const sessionData = localStorage.getItem('guest_session');
    if (!sessionData) {
      return { session: null, tempImageCount: 0, isExpired: false };
    }

    const session: GuestSession = JSON.parse(sessionData);
    const guestImages = await getGuestImages();
    const isExpired = Date.now() > session.expiresAt;

    return {
      session,
      tempImageCount: guestImages.length,
      isExpired
    };
  } catch (error) {
    console.error('Error getting session info:', error);
    return { session: null, tempImageCount: 0, isExpired: true };
  }
};

// Export the new functions for external use
export { 
  saveGuestImageLocally, 
  transferGuestImagesToUserAccount,
  getGuestImages,
  createGuestImageDisplayUrl,
  cleanupAllGuestImages,
  cleanupExpiredGuestImages,
  type GuestImageData
};