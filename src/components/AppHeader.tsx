import type {
  CodingType,
  DeviceChoice,
  ExecutionMode,
  ModelLoadedPayload,
} from "../types";
import type { TabId } from "../tabs";
import { TAB_LABEL_KEYS } from "../tabLabels";
import { useI18n } from "../i18n/I18nProvider";
import { LoadedModelPanel } from "./LoadedModelPanel";
import { TopBar } from "./TopBar";
import type { SessionFacts } from "./SessionContext";

interface Props {
  mode: ExecutionMode;
  onModeChange: (mode: ExecutionMode) => void;
  /** The section currently shown, so the header can name it. */
  active: TabId;
  /** Session facts read from App state; an unknown value renders nothing. */
  loaded: ModelLoadedPayload | null;
  dataset: string;
  coding: CodingType;
  device: DeviceChoice;
  tourOpen: boolean;
  onToggleTours: () => void;
  onOpenTour: (id: string) => void;
}

/**
 * The fixed header: the product / session-context bar plus, when a checkpoint
 * is loaded, its one-row summary. Both live outside the scrolling workspace so
 * they stay visible whichever section is shown.
 */
export function AppHeader({
  mode,
  onModeChange,
  active,
  loaded,
  dataset,
  coding,
  device,
  tourOpen,
  onToggleTours,
  onOpenTour,
}: Props) {
  const { t } = useI18n();
  const session: SessionFacts = {
    model: loaded?.name ?? null,
    dataset,
    coding,
    device,
  };

  return (
    <header className="app-header">
      <TopBar
        mode={mode}
        onModeChange={onModeChange}
        section={t(TAB_LABEL_KEYS[active])}
        session={session}
        tourOpen={tourOpen}
        onToggleTours={onToggleTours}
        onOpenTour={onOpenTour}
      />

      {loaded !== null && (
        <div className="loaded-model-bar">
          <LoadedModelPanel loaded={loaded} />
        </div>
      )}
    </header>
  );
}
