export function isInstitutionalWorkflowEnabled(): boolean {
  return (process.env.INSTITUTIONAL_WORKFLOW_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export type InstitutionalFlowMode = 'full' | 'reduced';

export function getInstitutionalFlowMode(): InstitutionalFlowMode {
  const raw = (process.env.INSTITUTIONAL_FLOW_MODE ?? 'full').toLowerCase();
  return raw === 'reduced' ? 'reduced' : 'full';
}

export function isReducedInstitutionalFlow(): boolean {
  return getInstitutionalFlowMode() === 'reduced';
}
