import type { ReactNode } from "react";

export function SettingsGroup({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <fieldset className="settings-group">
      <legend>
        {icon}
        {title}
      </legend>
      <div className="settings-grid">{children}</div>
    </fieldset>
  );
}
