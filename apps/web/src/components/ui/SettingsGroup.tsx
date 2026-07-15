import type { ReactNode } from "react";

export function SettingsGroup({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h3>
        {icon}
        {title}
      </h3>
      <div className="settings-grid">{children}</div>
    </section>
  );
}
