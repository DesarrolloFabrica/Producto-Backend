import 'dotenv/config';

const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function token(email) {
  const res = await fetch(`${API}/auth/dev/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  return data.accessToken;
}

async function previewIds(tok) {
  const res = await fetch(`${API}/reports/requests-general/preview?limit=100`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const body = await res.json();
  return (body.rows ?? []).map((r) => r.projectId);
}

const productA = process.env.QA_PRODUCT_A ?? 'angie_fontechapa@cun.edu.co';
const productB = process.env.QA_PRODUCT_B ?? 'jose_camachoc@cun.edu.co';

const [tokA, tokB] = await Promise.all([token(productA), token(productB)]);
const [idsA, idsB] = await Promise.all([previewIds(tokA), previewIds(tokB)]);
const overlap = idsA.filter((id) => idsB.includes(id));

console.log('Product A:', productA, 'projects:', idsA.length, idsA);
console.log('Product B:', productB, 'projects:', idsB.length, idsB);
console.log('Overlap:', overlap.length, overlap);
if (overlap.length > 0 && idsA.length > 0 && idsB.length > 0) {
  console.error('FAIL: possible data leak between Product users');
  process.exit(1);
}
console.log('OK: no overlap between Product owners (or one has empty set)');
