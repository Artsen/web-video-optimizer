import type { ReactNode } from "react";

export function StatusBadge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "error" | "info";
}) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}
