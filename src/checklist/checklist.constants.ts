/** Checklist principal por asignatura — ownerRole: PRODUCT (revisión académica). */
export const SUBJECT_CHECKLIST_LABELS = [
  'Presentación',
  'Foro presentación',
  'Syllabus',
  'Lecturas y bibliografía',
  'Resultados de aprendizaje',
  'Evaluación diagnóstica entrada',
  'Evaluaciones',
  'Evaluación diagnóstica salida',
  'ACA',
  'Foro Taller',
  'Taller RAE',
  'Seminario Alemán',
] as const;

/** Checklist por tema — ownerRole: FABRICA (producción de materiales). */
export const TOPIC_CHECKLIST_LABELS = [
  'Material descargable',
  'Podcast',
  'Videos',
  'Infografías',
] as const;

/** Agrupación de ítems de asignatura para aprobación masiva por sección (ownerRole PRODUCT). */
export const CHECKLIST_CATEGORY_LABELS: Record<string, readonly string[]> = {
  informacion_base: [
    'Presentación',
    'Foro presentación',
    'Syllabus',
    'Lecturas y bibliografía',
  ],
  evaluacion_competencias: [
    'Resultados de aprendizaje',
    'Evaluación diagnóstica entrada',
    'Evaluaciones',
    'Evaluación diagnóstica salida',
  ],
  actividades_recursos: ['ACA', 'Foro Taller', 'Taller RAE', 'Seminario Alemán'],
};

export function labelBelongsToChecklistCategory(label: string, categoryId: string): boolean {
  const labels = CHECKLIST_CATEGORY_LABELS[categoryId];
  if (!labels) return false;
  const normalized = label.trim().toLowerCase();
  return labels.some((entry) => entry.trim().toLowerCase() === normalized);
}
