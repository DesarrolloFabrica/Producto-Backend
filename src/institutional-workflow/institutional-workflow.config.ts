export function isInstitutionalWorkflowEnabled(): boolean {
  return (process.env.INSTITUTIONAL_WORKFLOW_ENABLED ?? 'true').toLowerCase() !== 'false';
}
