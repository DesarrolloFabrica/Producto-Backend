/**
 * Verificación post-merge: subjects.service (factoryProductionStatus + workspace)
 * Ejecutar: node scripts/qa-subjects-merge-verify.mjs
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3000';

const results = [];
function pass(step, detail) {
  results.push({ step, ok: true, detail });
  console.log(`✓ ${step}: ${detail}`);
}
function fail(step, detail) {
  results.push({ step, ok: false, detail });
  console.error(`✗ ${step}: ${detail}`);
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
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

async function login(email, password) {
  const data = await api('POST', '/auth/login', null, { email, password });
  return data.accessToken;
}

async function main() {
  const ts = Date.now();
  const productToken = await login('product@local', 'Product123!');
  const planningToken = await login('planeacion@local', 'Planeacion123!');
  const factoryToken = await login('fabrica@local', 'Fabrica123!');

  const project = await api('POST', '/projects', productToken, {
    school: 'Escuela QA Subjects',
    program: `QA Subjects Merge ${ts}`,
    modality: 'VIRTUAL',
    subjectMatterExpertType: 'INTERNAL',
    requestType: 'NUEVO',
    priority: 'MEDIUM',
    syllabus: { hasSyllabus: true, url: 'https://example.com/syllabus.pdf' },
    semesters: [{ semesterNumber: 1, subjects: [{ name: 'QA Subject Merge A' }] }],
  });

  let detail = await api('GET', `/projects/${project.id}`, productToken);
  const semester = detail.semesters[0];
  const subjectId = semester.subjects[0].id;

  if (detail.subjectMatterExpertStatus !== 'READY') {
    await api('PATCH', `/projects/${project.id}/subject-matter-expert`, productToken, {
      status: 'READY',
    });
  }

  await api('POST', `/semesters/${semester.id}/operational-transitions`, planningToken, {
    action: 'PLANNING_VALIDATE_INITIAL',
    comment: 'QA subjects merge verify',
  });

  await api('POST', `/semesters/${semester.id}/operational-transitions`, factoryToken, {
    action: 'FACTORY_START_PRODUCTION',
  });

  const wsAfterStart = await api('GET', `/subjects/${subjectId}/workspace`, factoryToken);
  if (
    wsAfterStart.subject.status === 'IN_PRODUCTION' &&
    wsAfterStart.subject.factoryProductionStatus === 'IN_PROGRESS'
  ) {
    pass('A', 'Tras FACTORY_START_PRODUCTION → IN_PRODUCTION + factory IN_PROGRESS');
  } else {
    fail(
      'A',
      `status=${wsAfterStart.subject.status} factory=${wsAfterStart.subject.factoryProductionStatus}`,
    );
  }

  try {
    await api('PATCH', `/subjects/${subjectId}/production-status`, factoryToken, {
      status: 'EN_PRODUCCION',
    });
    fail('B', 'EN_PRODUCCION no debería permitirse si ya está en producción');
  } catch (e) {
    pass('B', `EN_PRODUCCION rechazado correctamente (${e.message.slice(0, 60)}...)`);
  }

  await api('PATCH', `/subjects/${subjectId}/production-status`, factoryToken, {
    status: 'COMPLETADA',
  });

  const wsCompleted = await api('GET', `/subjects/${subjectId}/workspace`, factoryToken);
  if (
    wsCompleted.subject.factoryProductionStatus === 'COMPLETED' &&
    wsCompleted.subject.progress >= 100 &&
    wsCompleted.subject.factoryProductionCompletedAt
  ) {
    pass(
      'C',
      `COMPLETADA → factory COMPLETED, progress=${wsCompleted.subject.progress}, completedAt set`,
    );
  } else {
    fail(
      'C',
      `factory=${wsCompleted.subject.factoryProductionStatus} progress=${wsCompleted.subject.progress} completedAt=${wsCompleted.subject.factoryProductionCompletedAt}`,
    );
  }

  const semWs = await api('GET', `/semesters/${semester.id}/operational-workspace`, factoryToken);
  if (semWs.metrics.subjectsReady === 1 && semWs.readiness?.ready) {
    pass('D', 'Semestre readiness coherente con materia completada');
  } else {
    fail('D', `subjectsReady=${semWs.metrics.subjectsReady} ready=${semWs.readiness?.ready}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- RESUMEN ---');
  console.log(`Pasos: ${results.length}, OK: ${results.length - failed.length}, FAIL: ${failed.length}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('QA abortado:', e.message);
  process.exit(1);
});
