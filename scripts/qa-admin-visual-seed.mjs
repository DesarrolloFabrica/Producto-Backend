/**
 * Semilla visual para QA panel Admin Fase 1.
 * Ejecutar: node scripts/qa-admin-visual-seed.mjs
 */
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE ?? 'http://localhost:3000';

async function api(method, pathUrl, token, body) {
  const res = await fetch(`${BASE}${pathUrl}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathUrl} → ${res.status}: ${typeof data === 'object' ? JSON.stringify(data) : text}`);
  }
  return data;
}

async function login(email, password) {
  const data = await api('POST', '/auth/login', null, { email, password });
  return data.accessToken;
}

async function createProject(token, program, semesters) {
  return api('POST', '/projects', token, {
    school: 'Escuela QA Admin',
    program,
    modality: 'VIRTUAL',
    subjectMatterExpertType: 'INTERNAL',
    requestType: 'NUEVO',
    priority: 'MEDIUM',
    syllabus: { hasSyllabus: true, url: 'https://example.com/qa-syllabus.pdf' },
    semesters,
  });
}

async function ensureSmeReady(token, projectId) {
  const detail = await api('GET', `/projects/${projectId}`, token);
  if (detail.subjectMatterExpertStatus !== 'READY') {
    await api('PATCH', `/projects/${projectId}/subject-matter-expert/confirm`, token, {});
  }
  return api('GET', `/projects/${projectId}`, token);
}

async function main() {
  const productToken = await login('product@local', 'Product123!');
  const planningToken = await login('planeacion@local', 'Planeacion123!');
  const factoryToken = await login('fabrica@local', 'Fabrica123!');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL missing');
  const pgClient = new pg.Client({ connectionString: dbUrl });
  await pgClient.connect();

  const created = [];

  // 1. Vencido
  const pOverdue = await createProject(productToken, '[QA Admin] VENCIDO', [
    { semesterNumber: 1, subjects: [{ name: 'Mat Vencido' }] },
  ]);
  const dOverdue = await ensureSmeReady(productToken, pOverdue.id);
  const semOverdue = dOverdue.semesters[0].id;
  await pgClient.query(
    `UPDATE semesters SET operational_stage_due_at = NOW() - INTERVAL '3 days',
     operational_stage_entered_at = NOW() - INTERVAL '10 days' WHERE id = $1`,
    [semOverdue],
  );
  created.push({ label: 'VENCIDO', projectId: pOverdue.id, semesterId: semOverdue });

  // 2. Devolución
  const pReturn = await createProject(productToken, '[QA Admin] DEVOLUCION', [
    { semesterNumber: 1, subjects: [{ name: 'Mat Devolucion' }] },
  ]);
  const dReturn = await ensureSmeReady(productToken, pReturn.id);
  const semReturn = dReturn.semesters[0].id;
  await api('POST', `/semesters/${semReturn}/operational-transitions`, planningToken, {
    action: 'PLANNING_RETURN_INITIAL',
    comment: 'QA devolucion visual admin',
    returnReason: 'Faltan datos de alcance para validacion inicial',
  });
  created.push({ label: 'DEVOLUCION', projectId: pReturn.id, semesterId: semReturn });

  // 3. AT_RISK
  const pRisk = await createProject(productToken, '[QA Admin] AT RISK', [
    { semesterNumber: 1, subjects: [{ name: 'Mat At Risk' }] },
  ]);
  const dRisk = await ensureSmeReady(productToken, pRisk.id);
  const semRisk = dRisk.semesters[0].id;
  await pgClient.query(
    `UPDATE semesters SET operational_stage_entered_at = NOW() - INTERVAL '8 days',
     operational_stage_due_at = NOW() + INTERVAL '1 day' WHERE id = $1`,
    [semRisk],
  );
  created.push({ label: 'AT_RISK', projectId: pRisk.id, semesterId: semRisk });

  // 4. En curso normal
  const pNormal = await createProject(productToken, '[QA Admin] EN CURSO', [
    { semesterNumber: 1, subjects: [{ name: 'Mat En Curso' }] },
  ]);
  await ensureSmeReady(productToken, pNormal.id);
  created.push({ label: 'EN_CURSO', projectId: pNormal.id });

  // 5. Pre-institutional / legacy
  const pLegacy = await createProject(productToken, '[QA Admin] LEGACY', [
    { semesterNumber: 1, subjects: [{ name: 'Mat Legacy' }] },
  ]);
  await pgClient.query(`UPDATE projects SET legacy_workflow = true WHERE id = $1`, [pLegacy.id]);
  created.push({ label: 'LEGACY', projectId: pLegacy.id });

  // 6. Finalizado (cierre directo en BD — close API exige delivered)
  const pClosed = await createProject(productToken, '[QA Admin] FINALIZADO', [
    { semesterNumber: 1, subjects: [{ name: 'Mat Finalizado' }] },
  ]);
  await pgClient.query(`UPDATE projects SET status = 'CLOSED' WHERE id = $1`, [pClosed.id]);
  created.push({ label: 'FINALIZADO', projectId: pClosed.id });

  // 7. Cuello de botella multi-semestre
  const pNeck = await createProject(productToken, '[QA Admin] BOTTLENECK', [
    { semesterNumber: 1, subjects: [{ name: 'Neck S1 A' }, { name: 'Neck S1 B' }] },
    { semesterNumber: 2, subjects: [{ name: 'Neck S2 A' }] },
  ]);
  const dNeck = await ensureSmeReady(productToken, pNeck.id);
  const semNeck1 = dNeck.semesters.find((s) => s.semesterNumber === 1)?.id;
  const semNeck2 = dNeck.semesters.find((s) => s.semesterNumber === 2)?.id;
  await api('POST', `/semesters/${semNeck2}/operational-transitions`, planningToken, {
    action: 'PLANNING_VALIDATE_INITIAL',
    comment: 'QA semestre 2 adelantado',
  });
  await api('POST', `/semesters/${semNeck2}/operational-transitions`, factoryToken, {
    action: 'FACTORY_START_PRODUCTION',
  });
  created.push({
    label: 'BOTTLENECK',
    projectId: pNeck.id,
    sem1: semNeck1,
    sem2: semNeck2,
    note: 'S1 pendiente inicial, S2 en fabrica',
  });

  await pgClient.end();

  const adminToken = await login('admin@local', 'Admin123!');
  const work = await api('GET', '/planning/work', adminToken);
  const projects = await api('GET', '/projects', adminToken);

  console.log('\n==> Semilla QA Admin visual creada');
  console.table(created);
  console.log(`\nplanning/work items: ${work.length}`);
  console.log(`projects total: ${projects.length}`);
  console.log('\nOrden esperado en Admin (activos): VENCIDO → DEVOLUCION → AT RISK → EN CURSO → BOTTLENECK → LEGACY');
  console.log('Final al final: FINALIZADO');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
