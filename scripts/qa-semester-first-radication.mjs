/**
 * QA semester-first: cierre de radicación y consistencia institucional.
 * node scripts/qa-semester-first-radication.mjs
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3000';
const TS = Date.now();

const results = [];
function pass(step, detail) {
  results.push({ step, ok: true, detail });
  console.log(`✓ ${step}: ${detail}`);
}
function fail(step, detail) {
  results.push({ step, ok: false, detail });
  console.error(`✗ ${step}: ${detail}`);
}
function check(step, ok, expected, actual) {
  if (ok) pass(step, actual);
  else fail(step, `esperado ${expected}, obtenido ${actual}`);
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function login(email, password) {
  return (await api('POST', '/auth/login', null, { email, password })).accessToken;
}

async function completeSemesterFlow({
  semesterId,
  subjectIds,
  planningToken,
  factoryToken,
  lmsToken,
  productToken,
  skipInitial = false,
}) {
  if (!skipInitial) {
    await api('POST', `/semesters/${semesterId}/operational-transitions`, planningToken, {
      action: 'PLANNING_VALIDATE_INITIAL',
      comment: 'QA radication',
    });
  }
  await api('POST', `/semesters/${semesterId}/operational-transitions`, factoryToken, {
    action: 'FACTORY_START_PRODUCTION',
  });
  for (const sid of subjectIds) {
    await api('PATCH', `/subjects/${sid}/production-status`, factoryToken, { status: 'COMPLETADA' });
  }
  await api('POST', `/semesters/${semesterId}/operational-transitions`, factoryToken, {
    action: 'FACTORY_DELIVER_CONTENT',
    comment: 'QA entrega',
  });
  await api('POST', `/semesters/${semesterId}/operational-transitions`, planningToken, {
    action: 'PLANNING_VALIDATE_PRODUCTION',
  });
  await api('POST', `/semesters/${semesterId}/operational-transitions`, lmsToken, { action: 'LMS_START_UPLOAD' });
  await api('POST', `/semesters/${semesterId}/operational-transitions`, lmsToken, { action: 'LMS_CONFIRM_UPLOAD' });
  await api('POST', `/semesters/${semesterId}/operational-transitions`, planningToken, {
    action: 'PLANNING_VALIDATE_LMS',
  });
  await api('POST', `/semesters/${semesterId}/operational-transitions`, productToken, {
    action: 'PRODUCT_START_ACADEMIC_REVIEW',
  });
  for (const sid of subjectIds) {
    const topics = ['G1', 'G2', 'G3', 'G4', 'G5'].map((g, i) => `QA ${g} ${TS}-${i}`);
    const ws = await api('POST', `/subjects/${sid}/topics`, productToken, { topics });
    for (const cat of ['informacion_base', 'evaluacion_competencias', 'actividades_recursos']) {
      await api('POST', '/checklist/bulk-approve-section', productToken, {
        subjectId: sid,
        scope: 'CATEGORY',
        category: cat,
      });
    }
    for (const topic of ws.subject?.topics ?? []) {
      await api('POST', '/checklist/bulk-approve-section', productToken, {
        subjectId: sid,
        scope: 'TOPIC',
        topicId: topic.id,
      });
    }
  }
  await api('POST', `/semesters/${semesterId}/operational-transitions`, productToken, {
    action: 'PRODUCT_APPROVE_ACADEMIC',
    comment: 'QA aprueba académico',
  });
}

async function main() {
  console.log(`\n=== QA Radicación Semester-First — ${new Date().toISOString()} ===\n`);

  const productToken = await login('product@local', 'Product123!');
  const planningToken = await login('planeacion@local', 'Planeacion123!');
  const factoryToken = await login('fabrica@local', 'Fabrica123!');
  const lmsToken = await login('lms@local', 'Lms123!');

  const project = await api('POST', '/projects', productToken, {
    school: 'Escuela QA',
    program: `QA Radication ${TS}`,
    modality: 'VIRTUAL',
    subjectMatterExpertType: 'INTERNAL',
    requestType: 'NUEVO',
    priority: 'MEDIUM',
    semesters: [
      { semesterNumber: 1, subjects: [{ name: 'QA S1 A' }, { name: 'QA S1 B' }] },
      { semesterNumber: 2, subjects: [{ name: 'QA S2 A' }, { name: 'QA S2 B' }] },
    ],
  });

  const detail = await api('GET', `/projects/${project.id}`, productToken);
  const sem1 = detail.semesters.find((s) => s.semesterNumber === 1);
  const sem2 = detail.semesters.find((s) => s.semesterNumber === 2);
  const s1Ids = sem1.subjects.map((s) => s.id);
  const s2Ids = sem2.subjects.map((s) => s.id);

  check('Proyecto 2 semestres', detail.semesters.length === 2, '2', String(detail.semesters.length));
  check('institutionalState en GET /projects/:id (inicial)', detail.institutionalState != null, 'definido', String(detail.institutionalState));

  await completeSemesterFlow({
    semesterId: sem1.id,
    subjectIds: s1Ids,
    planningToken,
    factoryToken,
    lmsToken,
    productToken,
  });

  const blocked = await api('GET', `/projects/${project.id}/radication-readiness`, productToken);
  check(
    'Radicación bloqueada con 1 semestre completo',
    !blocked.canRegisterRadication,
    'canRegister=false',
    String(blocked.canRegisterRadication),
  );

  await completeSemesterFlow({
    semesterId: sem2.id,
    subjectIds: s2Ids,
    planningToken,
    factoryToken,
    lmsToken,
    productToken,
  });

  const ready = await api('GET', `/projects/${project.id}/radication-readiness`, productToken);
  check('Radicación habilitada', ready.canRegisterRadication, 'true', String(ready.canRegisterRadication));

  await api('POST', `/projects/${project.id}/radication`, productToken, {
    radicationNumber: `RAD-${TS}`,
    radicatedAt: new Date().toISOString(),
    comment: 'QA radicación',
  });

  const planningPending = await api('GET', '/planning/radication-work', planningToken);
  check(
    'Planeación ve radicación pendiente',
    planningPending.some((w) => w.projectId === project.id),
    'en planning/radication-work',
    String(planningPending.some((w) => w.projectId === project.id)),
  );

  await api('POST', `/projects/${project.id}/radication/validate`, planningToken, {});

  const afterDetail = await api('GET', `/projects/${project.id}`, planningToken);
  const readiness = await api('GET', `/projects/${project.id}/radication-readiness`, productToken);
  const planningAfter = await api('GET', '/planning/radication-work', planningToken);

  const ws1 = await api('GET', `/semesters/${sem1.id}/operational-workspace`, planningToken);
  const ws2 = await api('GET', `/semesters/${sem2.id}/operational-workspace`, planningToken);

  check(
    'project.status CLOSED',
    afterDetail.status === 'CLOSED',
    'CLOSED',
    afterDetail.status,
  );
  check(
    'project.institutionalState FINALIZED',
    afterDetail.institutionalState === 'FINALIZED',
    'FINALIZED',
    String(afterDetail.institutionalState),
  );
  check('semestre 1 FINALIZED', ws1.operationalState === 'FINALIZED', 'FINALIZED', ws1.operationalState);
  check('semestre 2 FINALIZED', ws2.operationalState === 'FINALIZED', 'FINALIZED', ws2.operationalState);

  const allSubjects = afterDetail.semesters.flatMap((s) => s.subjects);
  const subjectsOk = allSubjects.every(
    (s) => s.status === 'APPROVED' && (s.operationalState === 'FINALIZED' || s.operationalState === undefined),
  );
  check(
    'materias APPROVED',
    allSubjects.every((s) => s.status === 'APPROVED'),
    'APPROVED',
    allSubjects.map((s) => s.status).join(','),
  );

  const subjectOps = [];
  for (const s of allSubjects) {
    const sw = await api('GET', `/subjects/${s.id}/operational-workspace`, productToken);
    subjectOps.push(sw.operationalState);
  }
  check(
    'materias operational_state FINALIZED',
    subjectOps.every((st) => st === 'FINALIZED'),
    'FINALIZED',
    subjectOps.join(','),
  );

  check(
    'readiness sin blockers',
    readiness.blockers.length === 0,
    '[]',
    JSON.stringify(readiness.blockers),
  );
  check(
    'planning/radication-work sin pendiente',
    !planningAfter.some((w) => w.projectId === project.id),
    'ausente',
    String(planningAfter.some((w) => w.projectId === project.id)),
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${failed.length ? 'FALLÓ' : 'OK'}: ${results.length - failed.length}/${results.length} ---\n`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('QA abortado:', e.message);
  process.exit(2);
});
