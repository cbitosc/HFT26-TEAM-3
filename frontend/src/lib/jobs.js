/** Stage names exactly as the backend runner emits them (docs/INTEGRATION_CONTRACT.md section 4). A stage that has no job row is not shown. */
export const STAGE_LABEL = {
  validate: 'Check the file',
  preprocess: 'Index frames',
  extract_interval: 'Re-process interval',
  detect: 'Detect vehicles and people',
  track: 'Track and find events',
  extract_claims: 'Read statements',
};
export const ACTIVE = ['pending', 'validating', 'processing'];
export const STATUS_LABEL = { pending: 'queued', validating: 'running', processing: 'running', completed: 'completed', failed: 'failed', partially_completed: 'completed with warnings' };

const ORDER = ['validate', 'preprocess', 'extract_interval', 'detect', 'track', 'extract_claims'];

/** Jobs for one evidence file in pipeline order, then creation order. Nothing is added for stages that have not been queued. */
export function jobsFor(jobs, evidenceId) {
  return jobs
    .filter((j) => (evidenceId === undefined ? true : j.evidence_id === evidenceId))
    .slice()
    .sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || (a.created_at || '').localeCompare(b.created_at || ''));
}

/** Progress shown for a job is the stored fraction. A completed job is 1; a queued job is not given a percentage. */
export function jobFraction(j) {
  if (j.status === 'completed' || j.status === 'partially_completed') return 1;
  if (j.status === 'pending') return null;
  return Math.max(0, Math.min(1, j.progress ?? 0));
}

export const pipelineDone = (jobs) => jobs.length > 0 && !jobs.some((j) => ACTIVE.includes(j.status));

/** API failures can be plain text or structured {type, message} objects. */
export function jobErrorMessage(error) {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
    if (typeof error.type === 'string' && error.type.trim()) return error.type;
  }
  return 'The job failed. The backend recorded no message.';
}
