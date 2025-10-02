const handler = async ({ request }) => {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || 'WY';
  const county = url.searchParams.get('county') || 'NAT';
  const rows = [
    { code: 'HD57', name: 'House 57' },
    { code: 'SD08', name: 'Senate 8' },
    { code: 'CO01', name: 'Congress 1' }
  ];
  return new Response(JSON.stringify({ rows }), { headers: { 'content-type': 'application/json' } });
};

export const onRequestGet = handler;
export const onRequestPost = handler;
