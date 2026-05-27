/**
 * QA obligatorio: flujo semester-first Fábrica → Planeación
 * Ejecutar: node scripts/qa-semester-factory-flow.mjs
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
    const msg = typeof data === 'object' ? JSON.stringify(data) : text;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
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

  // 1. Crear proyecto con 2 semestres, 2 materias cada uno
  const project = await api('POST', '/projects', productToken, {
    school: 'Escuela QA',
    program: `QA Semester Flow ${ts}`,
    modality: 'VIRTUAL',
    subjectMatterExpertType: 'INTERNAL',
    requestType: 'NUEVO',
    priority: 'MEDIUM',
    syllabus: { hasSyllabus: true, url: 'https://example.com/syllabus.pdf' },
    semesters: [
      {
        semesterNumber: 1,
        subjects: [{ name: 'QA S1 Materia A' }, { name: 'QA S1 Materia B' }],
      },
      {
        semesterNumber: 2,
        subjects: [{ name: 'QA S2 Materia A' }, { name: 'QA S2 Materia B' }],
      },
    ],
  });

  const detail = await api('GET', `/projects/${project.id}`, productToken);
  const sem1 = detail.semesters.find((s) => s.semesterNumber === 1);
  const sem2 = detail.semesters.find((s) => s.semesterNumber === 2);
  if (!sem1?.id || !sem2?.id) throw new Error('Semestres no creados');
  pass('1', `Proyecto ${project.id}, semestres ${sem1.id} y ${sem2.id}`);

  // Activar SME si hace falta
  if (detail.subjectMatterExpertStatus !== 'READY') {
    await api('PATCH', `/projects/${project.id}/subject-matter-expert`, productToken, {
      status: 'READY',
    });
  }

  // 2. Planeación valida solo semestre 2
  await api('POST', `/semesters/${sem2.id}/operational-transitions`, planningToken, {
    action: 'PLANNING_VALIDATE_INITIAL',
    comment: 'QA validacion inicial semestre 2',
  });
  const ws2AfterPlanning = await api(
    'GET',
    `/semesters/${sem2.id}/operational-workspace`,
    planningToken,
  );
  if (ws2AfterPlanning.operationalState !== 'PENDING_FACTORY') {
    fail('2', `Estado sem2 esperado PENDING_FACTORY, got ${ws2AfterPlanning.operationalState}`);
  } else {
    pass('2', 'Semestre 2 validado → PENDING_FACTORY');
  }

  const ws1 = await api('GET', `/semesters/${sem1.id}/operational-workspace`, planningToken);
  if (ws1.operationalState !== 'PENDING_PLANNING_INITIAL_VALIDATION') {
    fail('2b', `Semestre 1 debe seguir pendiente inicial, got ${ws1.operationalState}`);
  }

  // 3. Fábrica ve solo semestre 2
  const factoryWork = await api('GET', '/factory/operational-work', factoryToken);
  const factorySemesterIds = factoryWork.map((w) => w.semesterId).filter(Boolean);
  const seesSem2 = factorySemesterIds.includes(sem2.id);
  const seesSem1 = factorySemesterIds.includes(sem1.id);
  if (seesSem2 && !seesSem1) {
    pass('3', `Fábrica ve semestre 2 (${factoryWork.length} ítems), no semestre 1`);
  } else {
    fail('3', `factoryWork ids=${factorySemesterIds.join(',')} sem1=${seesSem1} sem2=${seesSem2}`);
  }

  // Iniciar producción semestre 2
  await api('POST', `/semesters/${sem2.id}/operational-transitions`, factoryToken, {
    action: 'FACTORY_START_PRODUCTION',
  });

  const subjectsS2 = detail.semesters
    .find((s) => s.semesterNumber === 2)
    ?.subjects.map((s) => s.id) ?? sem2.subjects?.map((s) => s.id);
  const subjectIds =
    subjectsS2 ??
    (await api('GET', `/projects/${project.id}`, productToken)).semesters.find(
      (s) => s.semesterNumber === 2,
    )?.subjects.map((s) => s.id);
  if (!subjectIds?.length) throw new Error('No subject ids for semester 2');

  // 4. Marcar 1/2 materias completas
  await api('PATCH', `/subjects/${subjectIds[0]}/production-status`, factoryToken, {
    status: 'COMPLETADA',
  });
  let ws = await api('GET', `/semesters/${sem2.id}/operational-workspace`, factoryToken);
  if (ws.metrics.subjectsReady !== 1 || ws.metrics.subjectsTotal !== 2) {
    fail('4', `KPI ${ws.metrics.subjectsReady}/${ws.metrics.subjectsTotal}`);
  } else {
    pass('4', '1/2 materias marcadas completas');
  }

  // 5. Entrega bloqueada
  const hasDeliverBefore = ws.availableActions.includes('FACTORY_DELIVER_CONTENT');
  const readyBefore = ws.readiness?.ready;
  if (hasDeliverBefore || readyBefore) {
    fail('5', `Entrega no debería estar lista: actions=${hasDeliverBefore} ready=${readyBefore}`);
  } else {
    pass('5', 'Entrega bloqueada (sin FACTORY_DELIVER_CONTENT, readiness=false)');
  }
  try {
    await api('POST', `/semesters/${sem2.id}/operational-transitions`, factoryToken, {
      action: 'FACTORY_DELIVER_CONTENT',
    });
    fail('5b', 'API permitió entrega con 1/2 materias');
  } catch (e) {
    pass('5b', `API rechazó entrega: ${e.message.slice(0, 80)}...`);
  }

  // 6. Marcar 2/2
  await api('PATCH', `/subjects/${subjectIds[1]}/production-status`, factoryToken, {
    status: 'COMPLETADA',
  });
  ws = await api('GET', `/semesters/${sem2.id}/operational-workspace`, factoryToken);
  if (ws.metrics.subjectsReady === 2 && ws.readiness?.ready) {
    pass('6', '2/2 producidas, readiness=true');
  } else {
    fail('6', `ready=${ws.readiness?.ready} KPI=${ws.metrics.subjectsReady}/2`);
  }

  // 7. Entrega habilitada
  if (ws.availableActions.includes('FACTORY_DELIVER_CONTENT')) {
    pass('7', 'FACTORY_DELIVER_CONTENT disponible');
  } else {
    fail('7', `availableActions=${ws.availableActions.join(',')}`);
  }

  // 8. Ejecutar entrega
  const afterDeliver = await api('POST', `/semesters/${sem2.id}/operational-transitions`, factoryToken, {
    action: 'FACTORY_DELIVER_CONTENT',
    comment: 'QA entrega produccion semestre 2',
  });
  pass('8', 'Entrega ejecutada');

  // 9. Estado PENDING_PLANNING_PRODUCTION_VALIDATION
  if (afterDeliver.operationalState === 'PENDING_PLANNING_PRODUCTION_VALIDATION') {
    pass('9', afterDeliver.operationalState);
  } else {
    fail('9', `Estado=${afterDeliver.operationalState}`);
  }

  // 10. Planeación en validación producción
  const planningWork = await api('GET', '/planning/work', planningToken);
  const inPlanning = planningWork.some(
    (w) => w.semesterId === sem2.id && w.operationalState === 'PENDING_PLANNING_PRODUCTION_VALIDATION',
  );
  if (inPlanning) {
    pass('10', 'Visible en /planning/work validación producción');
  } else {
    fail('10', `planning work count=${planningWork.length}`);
  }

  // 11. Botón desaparece en Fábrica
  const factoryWsAfter = await api('GET', `/semesters/${sem2.id}/operational-workspace`, factoryToken);
  const factoryWorkAfter = await api('GET', '/factory/operational-work', factoryToken);
  const stillInFactoryTray = factoryWorkAfter.some((w) => w.semesterId === sem2.id);
  const hasDeliverAfter = factoryWsAfter.availableActions.includes('FACTORY_DELIVER_CONTENT');
  if (!hasDeliverAfter && !stillInFactoryTray) {
    pass('11', 'Sin botón entrega y fuera de bandeja Fábrica activa');
  } else {
    fail('11', `deliverAction=${hasDeliverAfter} inTray=${stillInFactoryTray}`);
  }

  // 12. Refresh (re-fetch)
  const refreshWs = await api('GET', `/semesters/${sem2.id}/operational-workspace`, factoryToken);
  const refreshPlanning = await api('GET', '/planning/work', planningToken);
  const okRefresh =
    refreshWs.operationalState === 'PENDING_PLANNING_PRODUCTION_VALIDATION' &&
    !refreshWs.availableActions.includes('FACTORY_DELIVER_CONTENT') &&
    refreshPlanning.some((w) => w.semesterId === sem2.id);
  if (okRefresh) {
    pass('12', 'Estado persistente tras re-fetch');
  } else {
    fail('12', `state=${refreshWs.operationalState} actions=${refreshWs.availableActions.join(',')}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- RESUMEN ---');
  console.log(`Pasos: ${results.length}, OK: ${results.length - failed.length}, FAIL: ${failed.length}`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('QA abortado:', e.message);
  process.exit(1);
});
