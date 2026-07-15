import type { ReactNode } from "react";

export function SectionHeader({ icon, title, kicker }: { icon: ReactNode; title: string; kicker?: string }) {
  return (
    <div className="section-title">
      {icon}
      <div>
        <h2>{title}</h2>
        {kicker && <p>{kicker}</p>}
      </div>
    </div>
  );
}
