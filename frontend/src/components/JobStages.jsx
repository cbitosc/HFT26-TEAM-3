import { Badge, ProgressBar } from '../ui-kit';
import { STAGE_LABEL, STATUS_LABEL, jobFraction, jobsFor, jobErrorMessage } from '../lib/jobs';

const VARIANT = { pending: 'neutral', validating: 'info', processing: 'info', completed: 'success', failed: 'danger', partially_completed: 'warning' };

/** One row per job the backend actually has. Stages that have not been queued are not listed, so the list can grow as the pipeline chains. */
export default function JobStages({ jobs, evidenceId, empty = 'No processing job has been created yet.' }) {
  const list = jobsFor(jobs, evidenceId);
  if (!list.length) return <p className="t-small text-fg-3">{empty}</p>;
  return (
    <ol className="space-y-3" aria-label="Processing stages">
      {list.map((j) => {
        const f = jobFraction(j);
        return (
          <li key={j.id} data-stage={j.stage} data-status={j.status}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="t-small text-fg">{STAGE_LABEL[j.stage] || j.stage}</span>
              <Badge variant={VARIANT[j.status] || 'neutral'}>{STATUS_LABEL[j.status] || j.status}</Badge>
            </div>
            {f !== null && j.status !== 'failed' && <ProgressBar value={f} ariaLabel={`${STAGE_LABEL[j.stage] || j.stage} progress`} showValue size="sm" />}
            {j.status === 'failed' && <p className="t-caption text-danger">{jobErrorMessage(j.error)}</p>}
            {j.result?.warnings?.length > 0 && <p className="t-caption text-fg-3">{j.result.warnings.join(' · ')}</p>}
          </li>
        );
      })}
    </ol>
  );
}
