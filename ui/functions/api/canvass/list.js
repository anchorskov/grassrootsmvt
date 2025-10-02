export const onRequest = async ({ request }) => {
  const filters = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const rows = Array.from({ length: 5 }).map((_, i) => ({
    address: `${100+i} Main St`,
    name: i % 2 ? "John Smith" : "Jane Doe",
    city: "Casper",
    zip: "82601"
  }));
  return new Response(JSON.stringify({ ok:true, method: request.method, filters, rows }), {
    headers: { "content-type": "application/json" }
  });
};
