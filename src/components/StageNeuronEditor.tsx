import { TRAIN_HELP } from "../helpText";
import { useStageNeurons } from "../hooks/useStageNeurons";
import type { StageNeurons } from "../types";
import { HelpTip } from "./HelpTip";

interface Props {
  /** Per-stage neuron-kind overrides keyed by stage name. */
  value: StageNeurons;
  /** Registered neuron kinds offered by the picker. */
  neurons: string[];
  disabled: boolean;
  onChange: (value: StageNeurons) => void;
}

/** Per-stage neuron-kind overrides for the topology panel. */
export function StageNeuronEditor({
  value,
  neurons,
  disabled,
  onChange,
}: Props) {
  const fallback = neurons[0] ?? "leaky";
  const { draft, setDraft, submit } = useStageNeurons((stage) =>
    onChange({ ...value, [stage]: fallback }),
  );

  const remove = (stage: string) => {
    const next = { ...value };
    delete next[stage];
    onChange(next);
  };

  const kinds = (current: string) => (neurons.length ? neurons : [current]);

  return (
    <div className="stage-neurons">
      {Object.entries(value).map(([stage, kind]) => (
        <div className="stage-row" key={stage}>
          <span className="stage-row-name" title={stage}>
            {stage}
          </span>
          <select
            className="text-input"
            value={kind}
            disabled={disabled}
            aria-label={`Neuron for ${stage}`}
            onChange={(e) => onChange({ ...value, [stage]: e.target.value })}
          >
            {kinds(kind).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn"
            disabled={disabled}
            title={`Remove ${stage} override`}
            aria-label={`Remove ${stage} override`}
            onClick={() => remove(stage)}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="stage-add">
        <input
          className="text-input"
          placeholder="stage name, e.g. lif1"
          aria-label="Stage name to override"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button
          type="button"
          className="apply small"
          disabled={disabled || !draft.trim()}
          onClick={submit}
        >
          Add stage
        </button>
        <HelpTip text={TRAIN_HELP.stage_neurons} />
      </div>
    </div>
  );
}
