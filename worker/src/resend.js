const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendResendEmail(env, { to, subject, html, text, from }) {
  const apiKey = String(env?.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const sender = String(from || env?.RESEND_FROM_EMAIL || 'Grassroots MVT <noreply@grassrootsmvt.org>').trim();
  const payload = {
    from: sender,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`Resend API ${response.status}: ${bodyText || 'unknown error'}`);
  }

  return response.json();
}
