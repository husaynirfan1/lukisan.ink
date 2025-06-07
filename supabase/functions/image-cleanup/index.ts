import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Helper function to create responses with CORS headers
function corsResponse(body: string | object | null, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

// Extract storage path from Supabase URL
function extractStoragePath(url: string): string | null {
  if (!url.includes('supabase.co/storage/v1/object/public/generated-images/')) {
    return null;
  }
  
  const parts = url.split('/generated-images/');
  return parts[1] || null;
}

// Clean up expired images for free users
async function cleanupExpiredFreeImages() {
  try {
    console.log('Starting cleanup of expired free user images...');
    
    // Get expired images for free users (older than 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const { data: expiredImages, error: fetchError } = await supabase
      .from('logo_generations')
      .select(`
        id,
        image_url,
        user_id,
        created_at,
        users!inner(tier)
      `)
      .eq('users.tier', 'free')
      .lt('created_at', twoHoursAgo)
      .like('image_url', '%supabase.co/storage/v1/object/public/generated-images/%');

    if (fetchError) {
      console.error('Error fetching expired images:', fetchError);
      throw fetchError;
    }

    if (!expiredImages || expiredImages.length === 0) {
      console.log('No expired images found');
      return { deletedCount: 0, errors: [] };
    }

    console.log(`Found ${expiredImages.length} expired images to delete`);

    let deletedCount = 0;
    const errors: string[] = [];

    // Process each expired image
    for (const image of expiredImages) {
      try {
        // Extract storage path
        const storagePath = extractStoragePath(image.image_url);
        
        if (storagePath) {
          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from('generated-images')
            .remove([storagePath]);

          if (storageError) {
            console.warn(`Failed to delete from storage: ${storagePath}`, storageError);
            errors.push(`Storage deletion failed for ${storagePath}: ${storageError.message}`);
          } else {
            console.log(`Deleted from storage: ${storagePath}`);
          }
        }

        // Delete from database
        const { error: dbError } = await supabase
          .from('logo_generations')
          .delete()
          .eq('id', image.id);

        if (dbError) {
          console.error(`Failed to delete from database: ${image.id}`, dbError);
          errors.push(`Database deletion failed for ${image.id}: ${dbError.message}`);
        } else {
          deletedCount++;
          console.log(`Deleted from database: ${image.id}`);
        }

      } catch (error) {
        console.error(`Error processing image ${image.id}:`, error);
        errors.push(`Processing error for ${image.id}: ${error.message}`);
      }
    }

    console.log(`Cleanup completed. Deleted ${deletedCount} images with ${errors.length} errors`);
    
    return {
      deletedCount,
      errors,
      processedCount: expiredImages.length
    };

  } catch (error) {
    console.error('Cleanup function error:', error);
    throw error;
  }
}

// Clean up images for a specific user (when subscription ends)
async function cleanupUserImages(userId: string) {
  try {
    console.log(`Starting cleanup for user: ${userId}`);
    
    const { data: userImages, error: fetchError } = await supabase
      .from('logo_generations')
      .select('id, image_url')
      .eq('user_id', userId)
      .like('image_url', '%supabase.co/storage/v1/object/public/generated-images/%');

    if (fetchError) {
      console.error('Error fetching user images:', fetchError);
      throw fetchError;
    }

    if (!userImages || userImages.length === 0) {
      console.log(`No images found for user: ${userId}`);
      return { deletedCount: 0, errors: [] };
    }

    console.log(`Found ${userImages.length} images for user: ${userId}`);

    let deletedCount = 0;
    const errors: string[] = [];

    // Process each image
    for (const image of userImages) {
      try {
        // Extract storage path
        const storagePath = extractStoragePath(image.image_url);
        
        if (storagePath) {
          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from('generated-images')
            .remove([storagePath]);

          if (storageError) {
            console.warn(`Failed to delete from storage: ${storagePath}`, storageError);
            errors.push(`Storage deletion failed for ${storagePath}: ${storageError.message}`);
          }
        }

        // Delete from database
        const { error: dbError } = await supabase
          .from('logo_generations')
          .delete()
          .eq('id', image.id);

        if (dbError) {
          console.error(`Failed to delete from database: ${image.id}`, dbError);
          errors.push(`Database deletion failed for ${image.id}: ${dbError.message}`);
        } else {
          deletedCount++;
        }

      } catch (error) {
        console.error(`Error processing image ${image.id}:`, error);
        errors.push(`Processing error for ${image.id}: ${error.message}`);
      }
    }

    // Reset user tier to free
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ tier: 'free', credits_remaining: 0 })
      .eq('id', userId);

    if (userUpdateError) {
      console.error('Failed to update user tier:', userUpdateError);
      errors.push(`User tier update failed: ${userUpdateError.message}`);
    }

    console.log(`User cleanup completed. Deleted ${deletedCount} images with ${errors.length} errors`);
    
    return {
      deletedCount,
      errors,
      processedCount: userImages.length
    };

  } catch (error) {
    console.error('User cleanup function error:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    if (req.method === 'POST') {
      const { action, userId } = await req.json();

      if (action === 'cleanup-expired') {
        const result = await cleanupExpiredFreeImages();
        return corsResponse(result);
      } else if (action === 'cleanup-user' && userId) {
        const result = await cleanupUserImages(userId);
        return corsResponse(result);
      } else {
        return corsResponse({ error: 'Invalid action or missing parameters' }, 400);
      }
    }

    if (req.method === 'GET') {
      // Scheduled cleanup endpoint (can be called by cron jobs)
      const result = await cleanupExpiredFreeImages();
      return corsResponse(result);
    }

    return corsResponse({ error: 'Method not allowed' }, 405);

  } catch (error: any) {
    console.error('Image cleanup error:', error);
    return corsResponse({ 
      error: 'Internal server error', 
      details: error.message 
    }, 500);
  }
});