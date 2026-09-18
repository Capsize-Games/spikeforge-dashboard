import type { LucideIcon } from "lucide-react";

interface Props {
  /** The Lucide icon rendered at the shared 16px icon size. */
  icon: LucideIcon;
  /** Accessible name; also the tooltip unless `title` overrides it. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Tooltip text when it should differ from the accessible name. */
  title?: string;
  /** Extra classes for a size or colour override. */
  className?: string;
  /** `aria-expanded` for a button that opens a menu. */
  expanded?: boolean;
  /** `aria-haspopup="menu"` for a button that opens a menu. */
  menu?: boolean;
}

/** Icon-only control: 28x28, neutral until hovered. */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  title,
  className,
  expanded,
  menu,
}: Props) {
  return (
    <button
      type="button"
      className={className === undefined ? "icon-btn" : `icon-btn ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={menu === true ? "menu" : undefined}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
