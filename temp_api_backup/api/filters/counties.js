const handler = async ({ request }) => {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || 'WY';
  // stubbed list
  const rows = [
    { code: 'NAT', name: 'Natrona' },
    { code: 'LAR', name: 'Laramie' },
    { code: 'FRE', name: 'Fremont' }
  ];
  return new Response(JSON.stringify({ rows }), { headers: { 'content-type': 'application/json' } });
};

export const onRequestGet = handler;
export const onRequestPost = handler;
