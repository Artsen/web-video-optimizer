import { Gauge } from "lucide-react";
import type { JobDto } from "@local-video-optimizer/contracts";
import { jobTitle } from "../../domain/job-presenters";
import { SectionHeader } from "../../components/ui/SectionHeader";

export function CurrentJobs({ jobs, onCancel }: { jobs: JobDto[]; onCancel(job: JobDto): void | Promise<void> }) {
  return (
    <section className="panel job-queue">
      <SectionHeader icon={<Gauge size={20} />} title="Current Jobs" />
      {jobs.length === 0 ? (
        <p className="muted">No jobs running. Start the recommended website package or create a custom export.</p>
      ) : (
        <div className="job-list">
          {jobs.map((runningJob) => (
            <div className="job-row" key={runningJob.id}>
              <div>
                <strong>{jobTitle(runningJob)}</strong>
                <span>{runningJob.message ?? runningJob.status}</span>
              </div>
              <progress value={runningJob.progress} max="100" />
              <button className="button secondary" type="button" onClick={() => void onCancel(runningJob)}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
