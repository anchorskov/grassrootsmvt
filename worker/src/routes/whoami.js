// worker/src/routes/whoami.js
// Relative path: worker/src/routes/whoami.js
export default async function whoami(request) {
  // Access runs before this Worker and sets these headers for authenticated users.
  const email = request.headers.get('CF-Access-Authenticated-User-Email');
  const name  = request.headers.get('CF-Access-Authenticated-User-Name') || email;

  if (!email) {
    // User is not authenticated at the edge, or the route is not covered by Access.
    return Response.json({ user: null }, { status: 200 });
  }
  return Response.json({ user: { email, name } }, { status: 200 });
}