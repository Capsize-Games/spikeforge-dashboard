import { Moon, Sun } from "lucide-react";

import { LESSONS } from "../tour/lessons";
import { useTheme } from "../theme";
import { useI18n } from "../i18n/I18nProvider";
import type { ExecutionMode } from "../types";
import { IconButton } from "./IconButton";
import { LanguageSelect } from "./LanguageSelect";
import { ModeToggle } from "./ModeToggle";
import { SessionContext } from "./SessionContext";
import type { SessionFacts } from "./SessionContext";
import { TourLauncher } from "./TourLauncher";

interface Props {
  mode: ExecutionMode;
  onModeChange: (mode: ExecutionMode) => void;
  /** Label of the active section, shown beside the wordmark. */
  section: string;
  /** Facts already held in App state; unknown values render nothing. */
  session: SessionFacts;
  tourOpen: boolean;
  onToggleTours: () => void;
  onOpenTour: (id: string) => void;
}

/**
 * Product header: wordmark and active section on the left, quiet session
 * context next, and the global utilities on the right in descending visual
 * weight (execution mode, tours, language, theme).
 */
export function TopBar({
  mode,
  onModeChange,
  section,
  session,
  tourOpen,
  onToggleTours,
  onOpenTour,
}: Props) {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <header className="topbar">
      <div className="topbar-product">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◈
          </span>
          SPIKEFORGE
        </span>
        <span className="topbar-sep" aria-hidden="true">
          /
        </span>
        <span className="brand-section">{section}</span>
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
        <IconButton
          icon={theme === "dark" ? Sun : Moon}
          label={t("theme.toggle")}
          title={theme === "dark" ? t("theme.light") : t("theme.dark")}
          onClick={toggle}
        />
      </div>
    </header>
  );
}
