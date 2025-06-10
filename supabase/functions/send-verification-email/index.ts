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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsResponse({ error: 'Authorization header required' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return corsResponse({ error: 'Invalid authentication' }, 401);
    }

    console.log(`Processing verification email request for user: ${user.id}`);

    // Check if user is already verified
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('is_email_verified')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error checking user profile:', profileError);
      return corsResponse({ error: 'Failed to check user profile' }, 500);
    }

    if (userProfile?.is_email_verified) {
      return corsResponse({ 
        success: true, 
        message: 'Email is already verified',
        alreadyVerified: true 
      });
    }

    // Use Supabase's built-in email confirmation
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: user.email!,
      options: {
        emailRedirectTo: `${req.headers.get('origin') || 'https://lukisan.space'}/auth/callback`
      }
    });

    if (resendError) {
      console.error('Error sending verification email:', resendError);
      return corsResponse({ error: 'Failed to send verification email' }, 500);
    }

    console.log(`Verification email sent successfully to: ${user.email}`);

    return corsResponse({
      success: true,
      message: 'Verification email sent successfully',
      email: user.email
    });

  } catch (error: any) {
    console.error('Verification email error:', error);
    return corsResponse({ 
      error: 'Internal server error', 
      details: error.message 
    }, 500);
  }
});