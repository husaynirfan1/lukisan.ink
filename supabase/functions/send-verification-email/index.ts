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

// Email template
function createVerificationEmailHTML(name: string, verificationUrl: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - Lukisan</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; }
    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 20px; text-align: center; }
    .logo { color: white; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .header-text { color: white; font-size: 18px; margin: 0; }
    .content { padding: 40px 20px; }
    .title { font-size: 24px; font-weight: bold; color: #1f2937; margin-bottom: 20px; }
    .text { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
    .button { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; }
    .footer { background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
    .divider { height: 1px; background-color: #e5e7eb; margin: 30px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">✨ Lukisan</div>
      <p class="header-text">AI-Powered Creative Platform</p>
    </div>
    
    <div class="content">
      <h1 class="title">Verify Your Email Address</h1>
      
      <p class="text">Hi ${name},</p>
      
      <p class="text">
        Welcome to Lukisan! To complete your account setup and start creating amazing logos and videos, 
        please verify your email address by clicking the button below.
      </p>
      
      <div style="text-align: center;">
        <a href="${verificationUrl}" class="button">Verify Email Address</a>
      </div>
      
      <p class="text">
        This verification link will expire in 24 hours for security reasons. If you didn't create an account 
        with Lukisan, you can safely ignore this email.
      </p>
      
      <div class="divider"></div>
      
      <p class="text" style="font-size: 14px; color: #6b7280;">
        If the button above doesn't work, you can copy and paste this link into your browser:<br>
        <a href="${verificationUrl}" style="color: #6366f1; word-break: break-all;">${verificationUrl}</a>
      </p>
    </div>
    
    <div class="footer">
      <p>© 2025 Lukisan. All rights reserved.</p>
      <p>This email was sent to verify your account. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Send email using a service (you'll need to configure this)
async function sendEmail(to: string, subject: string, html: string) {
  // Example using a generic email service
  // Replace this with your preferred email service (SendGrid, AWS SES, Postmark, etc.)
  
  const emailServiceUrl = Deno.env.get('EMAIL_SERVICE_URL');
  const emailApiKey = Deno.env.get('EMAIL_API_KEY');
  
  if (!emailServiceUrl || !emailApiKey) {
    console.log('Email service not configured. Email would be sent to:', to);
    console.log('Subject:', subject);
    console.log('HTML content length:', html.length);
    return { success: true, message: 'Email service not configured (development mode)' };
  }
  
  try {
    const response = await fetch(emailServiceUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${emailApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        html,
        from: 'noreply@lukisan.space'
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Email service error: ${response.statusText}`);
    }
    
    return { success: true, message: 'Email sent successfully' };
  } catch (error: any) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
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

    // Request verification token
    const { data: tokenResult, error: tokenError } = await supabase
      .rpc('request_email_verification', { user_id: user.id });

    if (tokenError) {
      console.error('Token generation error:', tokenError);
      return corsResponse({ error: 'Failed to generate verification token' }, 500);
    }

    const result = tokenResult as any;
    
    if (!result.success) {
      return corsResponse({ error: result.error || 'Failed to generate token' }, 400);
    }

    // If already verified, return success
    if (result.message === 'Email already verified') {
      return corsResponse({ 
        success: true, 
        message: 'Email is already verified',
        alreadyVerified: true 
      });
    }

    // Create verification URL
    const baseUrl = req.headers.get('origin') || 'https://lukisan.space';
    const verificationUrl = `${baseUrl}/verify-email?token=${result.token}`;

    // Send verification email
    const emailHtml = createVerificationEmailHTML(result.name, verificationUrl);
    const emailResult = await sendEmail(
      result.email,
      'Verify Your Email Address - Lukisan',
      emailHtml
    );

    if (!emailResult.success) {
      console.error('Email sending failed:', emailResult.error);
      return corsResponse({ error: 'Failed to send verification email' }, 500);
    }

    console.log(`Verification email sent successfully to: ${result.email}`);

    return corsResponse({
      success: true,
      message: 'Verification email sent successfully',
      email: result.email
    });

  } catch (error: any) {
    console.error('Verification email error:', error);
    return corsResponse({ 
      error: 'Internal server error', 
      details: error.message 
    }, 500);
  }
});