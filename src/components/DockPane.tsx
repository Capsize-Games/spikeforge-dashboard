import type { ReactNode } from "react";

/** A pane's width policy: fixed for a browser or an inspector, free
 * otherwise. */
type PaneVariant = "assets" | "editor" | "inspector";

interface Props {
  variant: PaneVariant;
  /** Pane heading, rendered in the head row. */
  heading: string;
  /** Small right-aligned fact for the head row, e.g. the current dataset. */
  meta?: string;
  children: ReactNode;
}

/**
 * One docked pane: a full-height child of a workspace, separated from its
 * neighbour by a single hairline. It has no margin, no radius, and no card on
 * a background — the surface step and the hairline are the whole hierarchy.
 *
 * The head is a fixed row and the body scrolls beneath it, so a long form
 * keeps its pane heading and a short one keeps its empty space inside the
 * pane instead of leaving a gap at the bottom of the window.
 */
export function DockPane({ variant, heading, meta, children }: Props) {
  return (
    <section className={`dock-pane dock-pane--${variant}`}>
      <div className="pane-head">
        <span className="pane-title">{heading}</span>
        {meta !== undefined && <span className="pane-head-meta">{meta}</span>}
      </div>
      <div className="pane-body">{children}</div>
    </section>
  );
}
