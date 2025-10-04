export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json().catch(() => ({}));
  const {
    state = "", county = "", city = "", zip = "",
    street = "", house = "", limit = 50
  } = body || {};

  // Basic validation
  if (!street.trim()) {
    return new Response(JSON.stringify({ ok:false, error:"street is required" }), {
      status: 400, headers: { "content-type":"application/json" }
    });
  }

  // TODO: swap this for a DB query
  const SAMPLE = [
    { house:"100", street:"Main St", city:"Casper", state:"WY", zip:"82601",
      voter:{ voter_id:"V1", first_name:"Jane", last_name:"Doe", party:"R", phone_e164:"+13075551234"} },
    { house:"101", street:"Main St", city:"Casper", state:"WY", zip:"82601",
      voter:{ voter_id:"V2", first_name:"John", last_name:"Smith", party:"NP", phone_e164:null} },
    { house:"102", street:"Main Street", city:"Casper", state:"WY", zip:"82601",
      voter:{ voter_id:"V3", first_name:"Ava", last_name:"Li", party:"D", phone_e164:"+13075550000"} }
  ];

  const norm = s => (s||"").toString().trim().toUpperCase().replace(/\s+/g," ");
  const nState = norm(state), nCounty = norm(county), nCity = norm(city), nZip = norm(zip);
  const nStreetQ = norm(street);
  const houseNum = parseInt(house||"", 10);

  const streetLike = (s) => {
    const ns = norm(s);
    return ns.includes(nStreetQ) || nStreetQ.includes(ns) ||
           ns.replace(/\b(ST|STREET|AVE|AVENUE)\b/g,"").trim() ===
           nStreetQ.replace(/\b(ST|STREET|AVE|AVENUE)\b/g,"").trim();
  };

  const filtered = SAMPLE.filter(r => {
    if (nState && norm(r.state) !== nState) return false;
    if (nCounty && norm(r.county||"") !== nCounty) return false;
    if (nCity && norm(r.city) !== nCity) return false;
    if (nZip && norm(r.zip) !== nZip) return false;
    return streetLike(r.street);
  });

  // group by address
  const keyOf = r => [norm(r.house), norm(r.street), norm(r.city), norm(r.zip)].join("|");
  const groups = new Map();
  for (const r of filtered) {
    const key = keyOf(r);
    if (!groups.has(key)) {
      groups.set(key, {
        address: { house: r.house, street: r.street, city: r.city, zip: r.zip, state: r.state },
        voters: []
      });
    }
    groups.get(key).voters.push(r.voter);
  }

  // compute pseudo-distance by house-number delta (if provided)
  const out = [];
  for (const g of groups.values()) {
    const hn = parseInt(g.address.house||"", 10);
    const dist = Number.isFinite(houseNum) && Number.isFinite(hn) ? Math.abs(hn - houseNum) : null;
    out.push({ ...g, distance_house_numbers: dist });
  }

  out.sort((a,b) => {
    const da = a.distance_house_numbers ?? Infinity;
    const db = b.distance_house_numbers ?? Infinity;
    if (da !== db) return da - db;
    return (a.address.house||"").localeCompare(b.address.house||"");
  });

  return new Response(JSON.stringify({
    ok: true,
    query: { state, county, city, zip, street, house, limit },
    results: out.slice(0, Math.max(1, Math.min(500, +limit||50)))
  }), { headers: { "content-type": "application/json" }});
}
