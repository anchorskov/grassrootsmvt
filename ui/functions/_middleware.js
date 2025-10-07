import { getCorsHeaders } from './_utils/cors.js';

export async function onRequest(context) {
  const response = await context.next();
  try {
    const req = context.request;
    const cors = getCorsHeaders(req);
    if (cors) {
      Object.entries(cors).forEach(([k, v]) => response.headers.set(k, v));
    }
  } catch (e) {
    // swallow errors; middleware should not block requests
  }
  return response;
}
