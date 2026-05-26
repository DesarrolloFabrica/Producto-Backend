export enum ProjectStatus {
  PENDING_SYLLABUS = 'PENDING_SYLLABUS',
  PENDING_SUBJECT_MATTER_EXPERT = 'PENDING_SUBJECT_MATTER_EXPERT',
  READY_FOR_PRODUCTION = 'READY_FOR_PRODUCTION',
  IN_PRODUCTION = 'IN_PRODUCTION',
  IN_REVIEW = 'IN_REVIEW',
  /**
   * Entrega final administrativa del proyecto.
   * Valor persistido `DELIVERED_TO_LMS` heredado; pendiente renombrar en migración futura.
   */
  DELIVERED_TO_LMS = 'DELIVERED_TO_LMS',
  FEEDBACK_PENDING = 'FEEDBACK_PENDING',
  CLOSED = 'CLOSED',
}
