import { MoreHorizontal } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

export type ContextMenuItem = {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onSelect(): void;
};

export function ContextMenu({ label, items }: { label: string; items: ContextMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      className="context-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeMenu();
        }
      }}
    >
      <button
        ref={triggerRef}
        className="icon-button menu-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div className="menu-surface" role="menu" id={id}>
          {items.map((item) => (
            <button
              className={`menu-item ${item.destructive ? "danger-text" : ""}`}
              role="menuitem"
              type="button"
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
                triggerRef.current?.focus();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
