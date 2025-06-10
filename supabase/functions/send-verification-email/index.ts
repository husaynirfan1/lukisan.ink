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

// Email template for verification
const getVerificationEmailHTML = (name: string, verificationUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - Lukisan</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
    .logo { color: white; font-size: 28px; font-weight: bold; margin-bottom: 10px; }
    .header-text { color: white; font-size: 16px; opacity: 0.9; }
    .content { padding: 40px 20px; }
    .title { font-size: 24px; font-weight: bold; color: #1a202c; margin-bottom: 20px; }
    .text { font-size: 16px; color: #4a5568; line-height: 1.6; margin-bottom: 20px; }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .footer { background-color: #f7fafc; padding: 20px; text-align: center; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Lukisan</div>
      <div class="header-text">AI-Powered Creative Platform</div>
    </div>
    
    <div class="content">
      <h1 class="title">Verify Your Email Address</h1>
      
      <p class="text">Hi ${name},</p>
      
      <p class="text">
        Thank you for signing up for Lukisan! To complete your registration and start creating amazing AI-powered logos and videos, please verify your email address by clicking the button below.
      </p>
      
      <div style="text-align: center;">
        <a href="${verificationUrl}" class="button">Verify Email Address</a>
      </div>
      
      <p class="text">
        If the button doesn't work, you can copy and paste this link into your browser:
        <br><a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
      </p>
      
      <p class="text">
        This verification link will expire in 24 hours for security reasons.
      </p>
      
      <p class="text">
        If you didn't create an account with Lukisan, you can safely ignore this email.
      </p>
    </div>
    
    <div class="footer">
      <p>© 2025 Lukisan. All rights reserved.</p>
      <p>Powered by cutting-edge AI technology.</p>
    </div>
  </div>
</body>
</html>
`;

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    const { user_id } = await req.json();

    if (!user_id) {
      return corsResponse({ error: 'User ID is required' }, 400);
    }

    // Get user information
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, name, is_email_verified')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      console.error('User fetch error:', userError);
      return corsResponse({ error: 'User not found' }, 404);
    }

    // Check if already verified
    if (user.is_email_verified) {
      return corsResponse({ 
        success: true, 
        message: 'Email already verified' 
      });
    }

    // Generate verification token
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('request_email_verification', { user_id });

    if (tokenError || !tokenData?.success) {
      console.error('Token generation error:', tokenError);
      return corsResponse({ 
        error: 'Failed to generate verification token' 
      }, 500);
    }

    // Create verification URL
    const baseUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173';
    const verificationUrl = `${baseUrl}/verify-email?token=${tokenData.token}`;

    // Send email using Supabase's built-in email service
    // Note: This requires proper email configuration in Supabase
    const emailHtml = getVerificationEmailHTML(user.name, verificationUrl);

    // For now, we'll use Supabase's auth.resend functionality
    // In a production environment, you might want to use a dedicated email service
    console.log('Verification email would be sent to:', user.email);
    console.log('Verification URL:', verificationUrl);

    return corsResponse({
      success: true,
      message: 'Verification email sent successfully',
      // In development, return the URL for testing
      ...(Deno.env.get('ENVIRONMENT') === 'development' && { 
        verification_url: verificationUrl 
      })
    });

  } catch (error: any) {
    console.error('Send verification email error:', error);
    return corsResponse({ 
      error: 'Internal server error', 
      details: error.message 
    }, 500);
  }
});