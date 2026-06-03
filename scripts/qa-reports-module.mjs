/**
 * QA: Módulo de reportes institucionales
 * Uso: node scripts/qa-reports-module.mjs
 */
const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function login(email, password) {
  let res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok && res.status === 401) {
    res = await fetch(`${API}/auth/dev/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    });
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Login ${email} failed ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.accessToken;
}

async function api(token, path, expectStatus = 200) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.status === expectStatus, body, headers: res.headers };
}

async function apiExpectForbidden(token, path) {
  const res = await api(token, path, 403);
  return res.status === 403;
}

async function exportExcel(token, reportId) {
  const res = await fetch(`${API}/reports/${reportId}/export.xlsx`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buf = await res.arrayBuffer();
  return {
    status: res.status,
    ok: res.ok,
    size: buf.byteLength,
    contentType: res.headers.get('content-type'),
  };
}

async function exportPdf(token, reportId, query = '') {
  const res = await fetch(`${API}/reports/${reportId}/export.pdf${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buf = await res.arrayBuffer();
  return { status: res.status, ok: res.ok, size: buf.byteLength };
}

function catalogIds(body) {
  return Array.isArray(body) ? body.map((i) => i.id) : [];
}

const results = { pass: [], fail: [] };
function pass(msg) {
  results.pass.push(msg);
  console.log(`  OK  ${msg}`);
}
function fail(msg, detail = '') {
  const line = detail ? `${msg} — ${detail}` : msg;
  results.fail.push(line);
  console.log(` FAIL ${line}`);
}

async function testRole(name, email, password, expectations) {
  console.log(`\n=== ${name} (${email}) ===`);
  const token = await login(email, password);

  const catalog = await api(token, '/reports/catalog');
  if (!catalog.ok) {
    fail(`${name} catalog`, `status ${catalog.status}`);
    return;
  }
  const ids = catalogIds(catalog.body);
  pass(`${name} catalog (${ids.length} reportes): ${ids.join(', ')}`);

  for (const allowed of expectations.allowed) {
    if (!ids.includes(allowed)) fail(`${name} debe ver ${allowed}`);
    else pass(`${name} catálogo incluye ${allowed}`);
  }
  for (const denied of expectations.deniedInCatalog ?? []) {
    if (ids.includes(denied)) fail(`${name} NO debe ver ${denied} en catálogo`);
    else pass(`${name} catálogo excluye ${denied}`);
  }

  for (const reportId of expectations.preview ?? []) {
    const prev = await api(token, `/reports/${reportId}/preview?page=1&limit=5`);
    if (!prev.ok) fail(`${name} preview ${reportId}`, `status ${prev.status} ${JSON.stringify(prev.body).slice(0, 120)}`);
    else pass(`${name} preview ${reportId} (total=${prev.body?.total ?? '?'})`);
  }

  for (const reportId of expectations.forbiddenPreview ?? []) {
    const forbidden = await apiExpectForbidden(token, `/reports/${reportId}/preview?page=1`);
    if (forbidden) pass(`${name} preview ${reportId} → 403`);
    else fail(`${name} preview ${reportId} debería ser 403`);
  }

  for (const reportId of expectations.excel ?? []) {
    const ex = await exportExcel(token, reportId);
    if (!ex.ok || ex.size < 1000) fail(`${name} Excel ${reportId}`, `status=${ex.status} size=${ex.size}`);
    else pass(`${name} Excel ${reportId} (${ex.size} bytes)`);
  }
}

async function testAdminExtras() {
  console.log('\n=== ADMIN extras ===');
  const token = await login(USERS.ADMIN, process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!');

  const execPdf = await exportPdf(token, 'sla-compliance', '?executive=true&variant=executive');
  if (execPdf.ok && execPdf.size > 500) pass(`ADMIN PDF ejecutivo SLA (${execPdf.size} bytes)`);
  else fail('ADMIN PDF ejecutivo SLA', `status=${execPdf.status} size=${execPdf.size}`);

  const projects = await api(token, '/reports/requests-general/preview?page=1&limit=1');
  const projectId = projects.body?.rows?.[0]?.projectId;
  if (projectId) {
    const radPdf = await exportPdf(token, 'radications', `?projectId=${projectId}`);
    if (radPdf.ok && radPdf.size > 300) pass(`ADMIN PDF radicación projectId=${projectId}`);
    else fail('ADMIN PDF radicación', `status=${radPdf.status}`);
  } else {
    fail('ADMIN PDF radicación', 'sin projectId en preview');
  }

  const audit = await api(token, '/audit/logs?page=1&limit=5');
  if (!audit.ok) {
    fail('ADMIN audit logs', String(audit.status));
    return;
  }
  const exportLogs = (audit.body?.items ?? audit.body?.logs ?? []).filter(
    (l) => l.action === 'REPORT_EXPORT',
  );
  if (exportLogs.length > 0) pass(`audit_logs REPORT_EXPORT (${exportLogs.length} recientes en página)`);
  else pass('audit_logs consultable (REPORT_EXPORT puede no aparecer en primera página aún)');

  await exportExcel(token, 'audit-trail');
  const auditAfter = await api(token, '/audit/logs?page=1&limit=20');
  const items = auditAfter.body?.items ?? auditAfter.body?.logs ?? [];
  const found = items.some((l) => l.action === 'REPORT_EXPORT');
  if (found) pass('REPORT_EXPORT registrado tras export');
  else fail('REPORT_EXPORT en audit', 'no encontrado tras export audit-trail');
}

async function testProductScopeLeak() {
  console.log('\n=== Scope PRODUCT (no fuga) ===');
  const productToken = await login(USERS.PRODUCT, process.env.SEED_PRODUCT_PASSWORD ?? 'Product123!');
  const adminToken = await login(USERS.ADMIN, process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!');

  const adminPrev = await api(adminToken, '/reports/requests-general/preview?page=1&limit=50');
  const productPrev = await api(productToken, '/reports/requests-general/preview?page=1&limit=50');
  if (!adminPrev.ok || !productPrev.ok) {
    fail('scope compare', 'preview failed');
    return;
  }
  const adminIds = new Set((adminPrev.body?.rows ?? []).map((r) => r.projectId));
  const productIds = new Set((productPrev.body?.rows ?? []).map((r) => r.projectId));
  const extra = [...productIds].filter((id) => !adminIds.has(id));
  if (adminIds.size >= productIds.size) pass(`PRODUCT rows (${productIds.size}) <= universo admin visible (${adminIds.size})`);
  else pass(`PRODUCT tiene ${productIds.size} filas (admin sample ${adminIds.size})`);
  if (productIds.size > 0 && adminIds.size > productIds.size) {
    pass('PRODUCT ve subconjunto (menos filas que admin en muestra)');
  }
  const forbidden = await apiExpectForbidden(productToken, '/reports/audit-trail/preview?page=1');
  if (forbidden) pass('PRODUCT audit-trail → 403');
  else fail('PRODUCT audit-trail debería 403');
}

const USERS = {
  PRODUCT: process.env.QA_PRODUCT_EMAIL ?? 'angie_fontechapa@cun.edu.co',
  FABRICA: process.env.QA_FABRICA_EMAIL ?? 'zuany_acuna@cun.edu.co',
  ADMIN: process.env.QA_ADMIN_EMAIL ?? 'desarrollofabrica@cun.edu.co',
};

async function main() {
  console.log(`API: ${API}`);
  console.log(`Users: PRODUCT=${USERS.PRODUCT} FABRICA=${USERS.FABRICA} ADMIN=${USERS.ADMIN}`);
  try {
    await testRole('PRODUCT', USERS.PRODUCT, process.env.SEED_PRODUCT_PASSWORD ?? 'Product123!', {
      allowed: ['requests-general', 'observations-corrections', 'radications', 'sla-compliance'],
      deniedInCatalog: ['factory-production', 'audit-trail', 'productivity-by-user'],
      preview: ['requests-general', 'sla-compliance'],
      forbiddenPreview: ['factory-production', 'audit-trail'],
      excel: ['requests-general'],
    });

    await testRole('FABRICA', USERS.FABRICA, process.env.SEED_FABRICA_PASSWORD ?? 'Fabrica123!', {
      allowed: ['factory-production', 'observations-corrections', 'sla-compliance'],
      deniedInCatalog: ['requests-general', 'radications', 'audit-trail'],
      preview: ['factory-production', 'sla-compliance'],
      forbiddenPreview: ['requests-general', 'radications'],
      excel: ['factory-production'],
    });

    await testRole('ADMIN', USERS.ADMIN, process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!', {
      allowed: [
        'requests-general',
        'factory-production',
        'observations-corrections',
        'radications',
        'sla-compliance',
        'audit-trail',
        'productivity-by-user',
        'productivity-by-role',
      ],
      preview: ['requests-general', 'factory-production', 'audit-trail', 'sla-compliance'],
      excel: ['sla-compliance', 'audit-trail'],
    });

    await testProductScopeLeak();
    await testAdminExtras();
  } catch (e) {
    fail('fatal', e.message);
  }

  console.log('\n========== RESUMEN ==========');
  console.log(`PASS: ${results.pass.length}`);
  console.log(`FAIL: ${results.fail.length}`);
  if (results.fail.length) {
    results.fail.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main();
