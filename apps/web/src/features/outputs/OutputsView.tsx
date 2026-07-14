import { Package, Settings2, Wand2 } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { CurrentJobs } from "./CurrentJobs";
import { OutputCard } from "./OutputCard";
import { PackagePanel } from "./PackagePanel";

export function OutputsView({ controller }: { controller: VideoOptimizerAppController }) {
  const { jobs, navigation } = controller;
  return (
    <section className="workflow-section" id="variations">
      <SectionHeader
        icon={<Package size={21} />}
        title="Jobs & Outputs"
        kicker="Watch active work, review finished files, and build a website-ready package."
      />
      <div className="outputs-layout">
        <div className="outputs-main">
          <CurrentJobs jobs={jobs.runningJobs} onCancel={jobs.cancelJob} />
          <section className="output-cards">
            {jobs.finishedOutputJobs.length === 0 ? (
              <div className="panel empty-panel">
                <SectionHeader icon={<Package size={20} />} title="No Outputs Yet" />
                <p className="muted">
                  Use Optimize For Website to create an MP4 fallback, modern video, and poster, or go to Custom for
                  manual settings.
                </p>
                <div className="actions">
                  <button className="button primary" type="button" onClick={jobs.optimizeForWebsite}>
                    <Wand2 size={18} />
                    Optimize For Website
                  </button>
                  <button className="button secondary" type="button" onClick={() => navigation.setActiveView("custom")}>
                    <Settings2 size={18} />
                    Custom Export
                  </button>
                </div>
              </div>
            ) : (
              jobs.finishedOutputJobs.map((output) => (
                <OutputCard controller={controller} output={output} key={output.id} />
              ))
            )}
          </section>
        </div>
        <PackagePanel controller={controller} />
      </div>
    </section>
  );
}
