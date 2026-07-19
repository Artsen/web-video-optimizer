import { Clapperboard } from "lucide-react";

export function AppMark({ size = "default" }: { size?: "default" | "small" }) {
  return (
    <span className={`app-mark ${size === "small" ? "small" : ""}`} aria-hidden="true">
      <Clapperboard size={size === "small" ? 17 : 20} strokeWidth={2.4} />
    </span>
  );
}
