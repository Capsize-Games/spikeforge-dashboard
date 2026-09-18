import { Binary, Boxes, Cpu, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";
import type { CodingType } from "../types";

/** Facts the header can show; each is null when it is not known yet. */
export interface SessionFacts {
  model: string | null;
  dataset: string | null;
  coding: CodingType | null;
  device: string | null;
}

const CODING_KEYS: Record<CodingType, TranslationKey> = {
  rate: "coding.rate",
  latency: "coding.latency",
  delta: "coding.delta",
  random: "coding.random",
};

interface Chip {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

/**
 * Quiet session context for the header: the loaded model, dataset, encoding,
 * and device. Nothing is invented here — a fact whose value is unknown renders
 * nothing at all rather than a placeholder.
 */
export function SessionContext({ facts }: { facts: SessionFacts }) {
  const { t } = useI18n();

  const chips: Chip[] = [];
  if (facts.model !== null) {
    chips.push({
      key: "model",
      icon: Boxes,
      label: t("section.model"),
      value: facts.model,
    });
  }
  if (facts.dataset !== null) {
    chips.push({
      key: "dataset",
      icon: Database,
      label: t("field.dataset"),
      value: facts.dataset,
    });
  }
  if (facts.coding !== null) {
    chips.push({
      key: "coding",
      icon: Binary,
      label: t("field.coding"),
      value: t(CODING_KEYS[facts.coding]),
    });
  }
  if (facts.device !== null) {
    chips.push({
      key: "device",
      icon: Cpu,
      label: t("field.device"),
      value: facts.device.toUpperCase(),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="session-context">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <span
            key={chip.key}
            className="session-chip"
            title={`${chip.label}: ${chip.value}`}
          >
            <span className="session-chip-icon">
              <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="session-chip-value">{chip.value}</span>
          </span>
        );
      })}
    </div>
  );
}
