const handler = async ({ request }) => {
  const rows = [
    { code: 'WY', name: 'Wyoming' }
  ];
  return new Response(JSON.stringify({ rows }), { headers: { 'content-type': 'application/json' } });
};

export const onRequestGet = handler;
export const onRequestPost = handler;
