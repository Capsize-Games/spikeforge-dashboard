import { LESSONS } from "../tour/lessons";
import type { ExecutionMode } from "../types";
import { LanguageSelect } from "./LanguageSelect";
import { ModeToggle } from "./ModeToggle";
import { SessionContext } from "./SessionContext";
import type { SessionFacts } from "./SessionContext";
import { TourLauncher } from "./TourLauncher";

interface Props {
  mode: ExecutionMode;
  onModeChange: (mode: ExecutionMode) => void;
  /** Name of the active workspace, shown as the toolbar breadcrumb. */
  workspace: string;
  /** Facts already held in App state; unknown values render nothing. */
  session: SessionFacts;
  tourOpen: boolean;
  onToggleTours: () => void;
  onOpenTour: (id: string) => void;
}

/**
 * Product header: the identity and the active workspace on the left, the two
 * session facts next, and the global controls on the right in descending
 * visual weight (execution mode, tours, language).
 *
 * The theme control lives at the foot of the navigation rail with the rest of
 * the shell's own settings, so the toolbar holds only what changes per task.
 */
export function TopBar({
  mode,
  onModeChange,
  workspace,
  session,
  tourOpen,
  onToggleTours,
  onOpenTour,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-product">
        <span className="topbar-workspace">{workspace}</span>
      </div>

      <SessionContext facts={session} />

      <div className="topbar-utils">
        <ModeToggle mode={mode} onChange={onModeChange} />
        <TourLauncher
          lessons={LESSONS}
          open={tourOpen}
          onToggle={onToggleTours}
          onOpen={onOpenTour}
        />
        <LanguageSelect />
      </div>
    </header>
  );
}
