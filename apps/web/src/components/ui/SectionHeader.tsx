import type { ReactNode } from "react";

export function SectionHeader({
  headingId,
  icon,
  title,
  kicker
}: {
  headingId?: string;
  icon: ReactNode;
  title: string;
  kicker?: string;
}) {
  return (
    <div className="section-title">
      {icon}
      <div>
        <h2 id={headingId}>{title}</h2>
        {kicker && <p>{kicker}</p>}
      </div>
    </div>
  );
}
