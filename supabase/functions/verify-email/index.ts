import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

Deno.serve(async (req) => {
  try {
    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      // Redirect to error page
      const baseUrl = req.headers.get('origin') || 'https://lukisan.space';
      return Response.redirect(`${baseUrl}/verification-error?reason=missing-token`, 302);
    }

    console.log(`Processing email verification for token: ${token.substring(0, 8)}...`);

    // Verify the token
    const { data: verificationResult, error: verificationError } = await supabase
      .rpc('verify_email_token', { token });

    if (verificationError) {
      console.error('Verification error:', verificationError);
      const baseUrl = req.headers.get('origin') || 'https://lukisan.space';
      return Response.redirect(`${baseUrl}/verification-error?reason=server-error`, 302);
    }

    const result = verificationResult as any;

    if (!result.success) {
      console.log('Verification failed:', result.error);
      const baseUrl = req.headers.get('origin') || 'https://lukisan.space';
      return Response.redirect(`${baseUrl}/verification-error?reason=invalid-token`, 302);
    }

    console.log(`Email verification successful for user: ${result.user_id}`);

    // Redirect to success page
    const baseUrl = req.headers.get('origin') || 'https://lukisan.space';
    return Response.redirect(`${baseUrl}/verification-success`, 302);

  } catch (error: any) {
    console.error('Email verification error:', error);
    const baseUrl = req.headers.get('origin') || 'https://lukisan.space';
    return Response.redirect(`${baseUrl}/verification-error?reason=unexpected-error`, 302);
  }
});