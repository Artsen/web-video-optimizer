import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";

export function Help({ text }: { text: string }) {
  return (
    <span className="help" title={text}>
      <HelpCircle size={15} aria-label={text} role="img" />
    </span>
  );
}

export function Label({ children, help }: { children: ReactNode; help: string }) {
  return (
    <span className="label-row">
      {children}
      <Help text={help} />
    </span>
  );
}
