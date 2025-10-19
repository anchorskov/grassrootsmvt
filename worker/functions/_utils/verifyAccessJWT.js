// worker/functions/_utils/verifyAccessJWT.js
// ✅ Cloudflare Zero Trust JWT verification helper using jose library

import { jwtVerify, createRemoteJWKSet } from 'jose';

export async function verifyAccessJWT(request, env) {
  // Verify required environment variables
  if (!env.POLICY_AUD) {
    throw new Error('Missing required POLICY_AUD environment variable');
  }
  
  if (!env.TEAM_DOMAIN) {
    throw new Error('Missing required TEAM_DOMAIN environment variable');
  }

  // Get JWT from header or cookie
  const jwt = 
    request.headers.get(env.ACCESS_JWT_HEADER || 'Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie')?.match(/CF_Authorization=([^;]+)/)?.[1]);

  console.log('[JWT DEBUG] Looking for JWT token...');
  console.log('[JWT DEBUG] JWT found:', !!jwt, jwt ? jwt.substring(0, 50) + '...' : 'none');

  if (!jwt) {
    throw new Error('Missing required CF Access JWT');
  }

  try {
    // Create JWKS from team domain - handles key rotation automatically
    const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
    
    console.log('[JWT DEBUG] Verifying JWT with:', {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
      jwks_url: `${env.TEAM_DOMAIN}/cdn-cgi/access/certs`
    });

    // Verify the JWT with proper issuer and audience validation
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });

    console.log('[JWT DEBUG] JWT verification successful for:', payload.email);
    console.log('[JWT DEBUG] Payload:', {
      email: payload.email,
      aud: payload.aud,
      iss: payload.iss,
      exp: payload.exp
    });

    // Return payload with email as the main identifier
    return {
      email: payload.email,
      ...payload
    };

  } catch (error) {
    console.error('[JWT ERROR] Token verification failed:', error.message);
    throw new Error(`Invalid token: ${error.message}`);
  }
}
