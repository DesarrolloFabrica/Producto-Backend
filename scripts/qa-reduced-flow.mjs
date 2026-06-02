/**
 * QA reduced institutional flow.
 *
 * Preconditions:
 * - Backend running with INSTITUTIONAL_FLOW_MODE=reduced
 * - Seed users active: product@local, fabrica@local, planeacion@local, lms@local, admin@local
 *
 * Run:
 *   node scripts/qa-reduced-flow.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.API_BASE ?? 'http://localhost:3000';
const TS = Date.now();

const QA_USERS = {
  PRODUCT: process.env.QA_PRODUCT_EMAIL ?? 'jose_camachoc@cun.edu.co',
  FABRICA: process.env.QA_FACTORY_EMAIL ?? 'zuany_acuna@cun.edu.co',
  ADMIN: process.env.QA_ADMIN_EMAIL ?? 'desarrollofabrica@cun.edu.co',
  PLANEACION: process.env.QA_PLANNING_EMAIL ?? '',
  LMS: process.env.QA_LMS_EMAIL ?? '',
};

const results = [];

function pass(step, detail) {
  results.push({ step, ok: true, detail });
  console.log(`OK ${step}: ${detail}`);
}

function fail(step, detail) {
  results.push({ step, ok: false, detail });
  console.error(`FAIL ${step}: ${detail}`);
}

function check(step, ok, expected, actual) {
  if (ok) pass(step, actual);
  else fail(step, `esperado ${expected}, obtenido ${actual}`);
}

function requireCheck(step, ok, expected, actual, message) {
  check(step, ok, expected, actual);
  if (!ok) {
    throw new Error(message);
  }
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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = typeof data === 'object' && data?.message ? data.message : JSON.stringify(data);
    throw new Error(`${method} ${path} -> ${res.status}: ${message}`);
  }
  return data;
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function authHint(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('403') || message.toLowerCase().includes('deshabilitado')) {
    return `${message}\nActive AUTH_DEV_EMAIL_LOGIN_ENABLED=true para ejecutar QA local con /auth/dev/email.`;
  }
  return message;
}

async function loginByDevEmail(expectedRole, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error(`No hay correo QA configurado para rol ${expectedRole}. Defina QA_${expectedRole}_EMAIL.`);
  }

  console.log(`AUTH ${expectedRole}: ${normalizedEmail} via /auth/dev/email`);
  let data;
  try {
    data = await api('POST', '/auth/dev/email', null, { email: normalizedEmail });
  } catch (e) {
    throw new Error(authHint(e));
  }

  const token = data?.accessToken;
  if (!token) {
    throw new Error(`POST /auth/dev/email no devolvio accessToken para ${normalizedEmail}`);
  }

  const me = await api('GET', '/auth/me', token);
  const actualRole = me?.role ?? data?.role ?? data?.user?.role;
  const actualEmail = normalizeEmail(me?.email ?? data?.user?.email);
  console.log(`AUTH OK ${expectedRole}: ${actualEmail} (${actualRole})`);

  if (actualRole !== expectedRole) {
    throw new Error(`Usuario ${actualEmail} tiene rol ${actualRole}; esperado ${expectedRole}.`);
  }

  return token;
}

async function resolveQaTokens() {
  const tokens = {};
  const hasRoleToken = { PLANEACION: Boolean(QA_USERS.PLANEACION), LMS: Boolean(QA_USERS.LMS) };
  tokens.PRODUCT = await loginByDevEmail('PRODUCT', QA_USERS.PRODUCT);
  tokens.FABRICA = await loginByDevEmail('FABRICA', QA_USERS.FABRICA);
  tokens.ADMIN = await loginByDevEmail('ADMIN', QA_USERS.ADMIN);

  if (QA_USERS.PLANEACION) {
    tokens.PLANEACION = await loginByDevEmail('PLANEACION', QA_USERS.PLANEACION);
  } else {
    tokens.PLANEACION = tokens.ADMIN;
    console.log('AUTH PLANEACION: sin correo QA; se validara dashboard con token ADMIN.');
  }

  if (QA_USERS.LMS) {
    tokens.LMS = await loginByDevEmail('LMS', QA_USERS.LMS);
  } else {
    tokens.LMS = tokens.ADMIN;
    console.log('AUTH LMS: sin correo QA; se validara dashboard con token ADMIN.');
  }

  return { tokens, hasRoleToken };
}

async function assertNoPlanningPending(projectId, planningToken, adminToken, hasPlanningRoleToken, label) {
  if (hasPlanningRoleToken) {
    const planningWork = await api('GET', '/planning/work', planningToken);
    check(`${label} Planeacion sin work`, !planningWork.some((w) => w.projectId === projectId), 'ausente', String(planningWork.length));
    const radicationWork = await api('GET', '/planning/radication-work', planningToken);
    check(`${label} Planeacion sin radicacion`, !radicationWork.some((w) => w.projectId === projectId), 'ausente', String(radicationWork.length));
    return;
  }

  const summary = await api('GET', '/planning/dashboard-summary', adminToken);
  const kpis = summary?.kpis ?? {};
  const noOperationalPending =
    Number(kpis.initialValidations ?? 0) === 0 &&
    Number(kpis.productionValidations ?? 0) === 0 &&
    Number(kpis.lmsValidations ?? 0) === 0 &&
    Number(kpis.radicationsPending ?? 0) === 0;
  check(`${label} Planeacion dashboard sin pendientes`, noOperationalPending, 'kpis operativos en 0', JSON.stringify(kpis));
}

async function assertNoLmsPending(projectId, lmsToken, adminToken, hasLmsRoleToken, label) {
  if (hasLmsRoleToken) {
    const lmsWork = await api('GET', '/lms/work', lmsToken);
    check(`${label} LMS sin work`, !lmsWork.some((w) => w.projectId === projectId), 'ausente', String(lmsWork.length));
    return;
  }

  const summary = await api('GET', '/lms/dashboard-summary', adminToken);
  const kpis = summary?.kpis ?? {};
  const noOperationalPending =
    Number(kpis.pendingUpload ?? 0) === 0 &&
    Number(kpis.inUpload ?? 0) === 0 &&
    Number(kpis.returnedByPlanning ?? 0) === 0 &&
    Number(kpis.inProgressProjects ?? 0) === 0;
  check(`${label} LMS dashboard sin pendientes`, noOperationalPending, 'kpis operativos en 0', JSON.stringify(kpis));
}

async function approveAcademicRequirements(subjectId, productToken) {
  const topics = ['Fundamentos', 'Aplicacion', 'Practica', 'Evaluacion', 'Cierre'].map(
    (name, idx) => `${name} QA ${TS}-${idx}`,
  );
  const workspace = await api('POST', `/subjects/${subjectId}/topics`, productToken, { topics });

  for (const category of ['informacion_base', 'evaluacion_competencias', 'actividades_recursos']) {
    await api('POST', '/checklist/bulk-approve-section', productToken, {
      subjectId,
      scope: 'CATEGORY',
      category,
    });
  }

  for (const topic of workspace.subject?.topics ?? []) {
    await api('POST', '/checklist/bulk-approve-section', productToken, {
      subjectId,
      scope: 'TOPIC',
      topicId: topic.id,
    });
  }
}

function assertReducedStepper() {
  const frontendRoot = resolve(process.cwd(), '..', 'Producto-Frontend');
  const pipelineFile = readFileSync(
    resolve(frontendRoot, 'src/features/institutional-workflow/components/OperationalPipelineInstitutional.tsx'),
    'utf8',
  );
  const hasReducedSteps =
    pipelineFile.includes('REDUCED_STEPS') &&
    pipelineFile.includes('Solicitud') &&
    pipelineFile.includes('Producci') &&
    pipelineFile.includes('Radicaci') &&
    pipelineFile.includes('Finalizado');
  check('Stepper reduced 4 pasos', hasReducedSteps, 'REDUCED_STEPS con Solicitud/Fabrica/Product/Finalizado', String(hasReducedSteps));
}

async function main() {
  console.log(`\n=== QA reduced flow - ${new Date().toISOString()} ===\n`);

  const { tokens, hasRoleToken } = await resolveQaTokens();
  const productToken = tokens.PRODUCT;
  const factoryToken = tokens.FABRICA;
  const planningToken = tokens.PLANEACION;
  const lmsToken = tokens.LMS;
  const adminToken = tokens.ADMIN;
  pass('Auth', 'dev email + /auth/me validado');

  const project = await api('POST', '/projects', productToken, {
    school: 'Escuela QA',
    program: `QA Reduced ${TS}`,
    modality: 'VIRTUAL',
    subjectMatterExpertType: 'INTERNAL',
    requestType: 'NUEVO',
    priority: 'MEDIUM',
    expectedDeliveryDate: '2026-09-15T00:00:00.000Z',
    semesters: [
      {
        semesterNumber: 1,
        subjects: [{ name: `QA Reduced Subject ${TS}` }],
      },
    ],
  });

  const detail = await api('GET', `/projects/${project.id}`, productToken);
  const semester = detail.semesters?.[0];
  const subject = semester?.subjects?.[0];
  if (!semester?.id || !subject?.id) throw new Error('Proyecto reducido sin semestre/asignatura');
  check('Crear solicitud', Boolean(project.id), 'project id', project.id);

  let workspace = await api('GET', `/semesters/${semester.id}/operational-workspace`, factoryToken);
  requireCheck(
    'Inicia en Fabrica',
    workspace.operationalState === 'PENDING_FACTORY',
    'PENDING_FACTORY',
    workspace.operationalState,
    'El backend no parece estar en INSTITUTIONAL_FLOW_MODE=reduced. Reinicie el servidor con INSTITUTIONAL_FLOW_MODE=reduced y vuelva a ejecutar npm run qa:reduced-flow.',
  );
  check('Sin Planeacion inicial', !workspace.availableActions.includes('PLANNING_VALIDATE_INITIAL'), 'sin PLANNING_VALIDATE_INITIAL', workspace.availableActions.join(','));

  await assertNoPlanningPending(project.id, planningToken, adminToken, hasRoleToken.PLANEACION, 'Inicial');
  await assertNoLmsPending(project.id, lmsToken, adminToken, hasRoleToken.LMS, 'Inicial');

  const factoryWork = await api('GET', '/factory/operational-work', factoryToken);
  check('Fabrica ve solicitud', factoryWork.some((w) => w.semesterId === semester.id), 'visible en factory work', String(factoryWork.length));

  const observation = await api('POST', '/observations', factoryToken, {
    projectId: project.id,
    subjectId: subject.id,
    relatedEntityType: 'SUBJECT',
    relatedEntityId: subject.id,
    text: `QA Fabrica solicita ajuste ${TS}`,
    priority: 'MEDIUM',
  });
  const productObservations = await api('GET', `/subjects/${subject.id}/observations`, productToken);
  check('Product ve observacion Fabrica', productObservations.some((o) => o.id === observation.id && o.role === 'FABRICA'), 'observacion FABRICA visible', String(productObservations.length));
  await api('POST', `/observations/${observation.id}/messages`, productToken, {
    message: 'QA Product responde y ajusta solicitud',
  });
  pass('Product responde observacion', observation.id);
  const resolvedObservations = await api('GET', `/subjects/${subject.id}/observations`, productToken);
  const resolvedObservation = resolvedObservations.find((o) => o.id === observation.id);
  check(
    'Product resuelve observacion reduced',
    resolvedObservation?.status === 'RESUELTA',
    'RESUELTA',
    String(resolvedObservation?.status),
  );

  await api('POST', `/semesters/${semester.id}/operational-transitions`, factoryToken, {
    action: 'FACTORY_START_PRODUCTION',
  });
  workspace = await api('GET', `/semesters/${semester.id}/operational-workspace`, factoryToken);
  check('Fabrica produce', workspace.operationalState === 'IN_FACTORY_PRODUCTION', 'IN_FACTORY_PRODUCTION', workspace.operationalState);

  await api('PATCH', `/subjects/${subject.id}/production-status`, factoryToken, {
    status: 'COMPLETADA',
  });
  workspace = await api('GET', `/semesters/${semester.id}/operational-workspace`, factoryToken);
  check('Produccion lista', workspace.readiness?.ready && workspace.availableActions.includes('FACTORY_DELIVER_CONTENT'), 'ready + FACTORY_DELIVER_CONTENT', JSON.stringify({ ready: workspace.readiness?.ready, actions: workspace.availableActions }));

  workspace = await api('POST', `/semesters/${semester.id}/operational-transitions`, factoryToken, {
    action: 'FACTORY_DELIVER_CONTENT',
    comment: 'QA entrega reduced',
  });
  check('Entrega va a Product', workspace.operationalState === 'PENDING_PRODUCT_ACADEMIC_REVIEW', 'PENDING_PRODUCT_ACADEMIC_REVIEW', workspace.operationalState);

  const productWork = await api('GET', '/product/operational-work', productToken);
  check('Product ve revision', productWork.some((w) => w.semesterId === semester.id), 'visible en product work', String(productWork.length));

  workspace = await api('POST', `/semesters/${semester.id}/operational-transitions`, productToken, {
    action: 'PRODUCT_START_ACADEMIC_REVIEW',
  });
  check('Product inicia revision', workspace.operationalState === 'IN_PRODUCT_ACADEMIC_REVIEW', 'IN_PRODUCT_ACADEMIC_REVIEW', workspace.operationalState);

  await approveAcademicRequirements(subject.id, productToken);
  workspace = await api('POST', `/semesters/${semester.id}/operational-transitions`, productToken, {
    action: 'PRODUCT_APPROVE_ACADEMIC',
    comment: 'QA aprueba reduced',
  });
  check('Product aprueba para radicar', workspace.operationalState === 'PENDING_PROJECT_RADICATION', 'PENDING_PROJECT_RADICATION', workspace.operationalState);

  const readiness = await api('GET', `/projects/${project.id}/radication-readiness`, productToken);
  check('Radicacion habilitada', readiness.canRegisterRadication, 'true', String(readiness.canRegisterRadication));

  await api('POST', `/projects/${project.id}/radication`, productToken, {
    radicationNumber: `RAD-RED-${TS}`,
    radicatedAt: new Date().toISOString(),
    comment: 'QA reduced close',
  });

  const afterDetail = await api('GET', `/projects/${project.id}`, adminToken);
  const afterReadiness = await api('GET', `/projects/${project.id}/radication-readiness`, productToken);
  const afterWorkspace = await api('GET', `/semesters/${semester.id}/operational-workspace`, productToken);
  const subjectWorkspace = await api('GET', `/subjects/${subject.id}/operational-workspace`, productToken);

  check('Proyecto CLOSED', afterDetail.status === 'CLOSED', 'CLOSED', afterDetail.status);
  check('Proyecto FINALIZED', afterDetail.institutionalState === 'FINALIZED', 'FINALIZED', String(afterDetail.institutionalState));
  check('Semestre FINALIZED', afterWorkspace.operationalState === 'FINALIZED', 'FINALIZED', afterWorkspace.operationalState);
  check('Materia FINALIZED', subjectWorkspace.operationalState === 'FINALIZED', 'FINALIZED', subjectWorkspace.operationalState);
  check('Materia APPROVED', afterDetail.semesters[0].subjects[0].status === 'APPROVED', 'APPROVED', afterDetail.semesters[0].subjects[0].status);
  check('Readiness FINALIZED', afterReadiness.projectInstitutionalState === 'FINALIZED', 'FINALIZED', String(afterReadiness.projectInstitutionalState));

  await assertNoPlanningPending(project.id, planningToken, adminToken, hasRoleToken.PLANEACION, 'Final');
  await assertNoLmsPending(project.id, lmsToken, adminToken, hasRoleToken.LMS, 'Final');

  const factorySummary = await api('GET', '/factory/dashboard/summary', factoryToken);
  const productRadicationWork = await api('GET', '/product/radication-work', productToken);
  check(
    'Factory dashboard responde',
    typeof factorySummary.countsByState === 'object',
    'summary countsByState',
    JSON.stringify(factorySummary.countsByState),
  );
  check('Product radication sin pendiente cerrado', !productRadicationWork.some((w) => w.projectId === project.id), 'ausente', String(productRadicationWork.length));

  assertReducedStepper();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${failed.length ? 'FAIL' : 'OK'}: ${results.length - failed.length}/${results.length} ---\n`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('QA abortado:', e.message);
  process.exit(2);
});
