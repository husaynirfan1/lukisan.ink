import { supabase } from './supabase';
import { urlToBlob, handleSaveGeneratedLogo } from './logoSaver';

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
const TEMP_IMAGE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

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
 * Stores a temporary image for guest users
 */
export const storeTempImage = async (params: {
  imageUrl: string;
  prompt: string;
  category: string;
  aspectRatio: string;
}): Promise<{ success: boolean; tempImage?: TempImage; error?: string }> => {
  try {
    const session = getOrCreateGuestSession();
    
    const tempImage: TempImage = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      sessionId: session.sessionId,
      imageUrl: params.imageUrl,
      prompt: params.prompt,
      category: params.category,
      aspectRatio: params.aspectRatio,
      createdAt: Date.now(),
      expiresAt: Date.now() + TEMP_IMAGE_DURATION,
      transferred: false
    };
    
    // Store in localStorage (for demo - in production, use a temporary storage service)
    const existingImages = getTempImages(session.sessionId);
    const updatedImages = [...existingImages, tempImage];
    
    localStorage.setItem(`temp_images_${session.sessionId}`, JSON.stringify(updatedImages));
    
    console.log('Stored temporary image:', tempImage.id);
    
    return { success: true, tempImage };
  } catch (error: any) {
    console.error('Error storing temporary image:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Retrieves temporary images for a session
 */
export const getTempImages = (sessionId: string): TempImage[] => {
  try {
    const stored = localStorage.getItem(`temp_images_${sessionId}`);
    if (!stored) return [];
    
    const images: TempImage[] = JSON.parse(stored);
    
    // Filter out expired images
    const now = Date.now();
    const validImages = images.filter(img => now < img.expiresAt && !img.transferred);
    
    // Update storage if we filtered out any images
    if (validImages.length !== images.length) {
      localStorage.setItem(`temp_images_${sessionId}`, JSON.stringify(validImages));
    }
    
    return validImages;
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
 * Transfers temporary images to user's permanent library
 */
export const transferTempImagesToUser = async (userId: string): Promise<TransferResult> => {
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
    
    // Get current session
    const session = getOrCreateGuestSession();
    const tempImages = getTempImages(session.sessionId);
    
    if (tempImages.length === 0) {
      console.log('No temporary images to transfer');
      result.success = true;
      return result;
    }

    console.log(`Found ${tempImages.length} temporary images to transfer`);
    
    // Check user credits
    const creditInfo = await checkUserCredits(userId);
    result.creditsAvailable = creditInfo.available;
    result.creditsNeeded = tempImages.length;
    
    if (!creditInfo.canGenerate || creditInfo.available < tempImages.length) {
      console.log('Insufficient credits for transfer');
      result.insufficientCredits = true;
      result.errors.push(`Insufficient credits. Need ${tempImages.length}, have ${creditInfo.available}`);
      
      // Apply grey overlay to images (handled in UI)
      return result;
    }

    // Process each temporary image
    for (const tempImage of tempImages) {
      try {
        console.log(`Transferring image: ${tempImage.id}`);
        
        // Convert URL to blob
        const imageBlob = await urlToBlob(tempImage.imageUrl);
        
        // Save to user's permanent library
        const saveResult = await handleSaveGeneratedLogo({
          imageBlob,
          prompt: tempImage.prompt,
          category: tempImage.category,
          userId,
          aspectRatio: tempImage.aspectRatio
        });

        if (saveResult.success) {
          result.transferredCount++;
          console.log(`Successfully transferred image: ${tempImage.id}`);
          
          // Mark as transferred
          tempImage.transferred = true;
        } else {
          result.failedCount++;
          result.errors.push(`Failed to transfer ${tempImage.id}: ${saveResult.error}`);
          console.error(`Failed to transfer image ${tempImage.id}:`, saveResult.error);
        }
      } catch (error: any) {
        result.failedCount++;
        result.errors.push(`Error processing ${tempImage.id}: ${error.message}`);
        console.error(`Error processing image ${tempImage.id}:`, error);
      }
    }

    // Update user credits if any images were transferred
    if (result.transferredCount > 0) {
      await deductUserCredits(userId, result.transferredCount, creditInfo.isProUser);
    }

    // Clean up transferred images
    const remainingImages = tempImages.filter(img => !img.transferred);
    localStorage.setItem(`temp_images_${session.sessionId}`, JSON.stringify(remainingImages));

    result.success = result.transferredCount > 0;
    
    console.log(`Transfer completed: ${result.transferredCount} transferred, ${result.failedCount} failed`);
    
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
export const cleanupExpiredTempImages = (): void => {
  try {
    const session = getOrCreateGuestSession();
    const tempImages = getTempImages(session.sessionId);
    
    // getTempImages already filters expired images and updates storage
    console.log(`Cleanup completed. ${tempImages.length} valid images remaining`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

/**
 * Clears all temporary data for a session
 */
export const clearGuestSession = (sessionId?: string): void => {
  try {
    const targetSessionId = sessionId || getOrCreateGuestSession().sessionId;
    
    localStorage.removeItem(`temp_images_${targetSessionId}`);
    localStorage.removeItem('guest_session');
    
    console.log('Cleared guest session data');
  } catch (error) {
    console.error('Error clearing guest session:', error);
  }
};

/**
 * Gets current session info for debugging
 */
export const getSessionInfo = (): {
  session: GuestSession | null;
  tempImageCount: number;
  isExpired: boolean;
} => {
  try {
    const sessionData = localStorage.getItem('guest_session');
    if (!sessionData) {
      return { session: null, tempImageCount: 0, isExpired: false };
    }

    const session: GuestSession = JSON.parse(sessionData);
    const tempImages = getTempImages(session.sessionId);
    const isExpired = Date.now() > session.expiresAt;

    return {
      session,
      tempImageCount: tempImages.length,
      isExpired
    };
  } catch (error) {
    console.error('Error getting session info:', error);
    return { session: null, tempImageCount: 0, isExpired: true };
  }
};