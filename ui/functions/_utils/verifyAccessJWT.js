import { jwtVerify, createRemoteJWKSet } from 'jose';

export async function verifyAccessJWT(request, env) {
  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('cf-access-jwt-assertion');

  if (!token) {
    throw new Error('Missing Access token');
  }

  const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: env.TEAM_DOMAIN,
    audience: env.POLICY_AUD,
  });

  return payload;
}
