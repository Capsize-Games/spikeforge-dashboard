import type { HubAction, HubActionError } from "../hubActionError";

interface Props {
  error: HubActionError;
}

/** How each action reads in the unsupported-server note. */
const ACTION_NOUN: Record<HubAction, string> = {
  pull: "pull",
  build: "bundle build",
};

/**
 * A failed pull or build, in the server's own words. When a pre-1.1
 * server rejected the action type itself, say that explicitly instead
 * of leaving the raw validation error to speak for itself.
 */
export function HubActionErrorView({ error }: Props) {
  return (
    <div className="hub-error" role="alert" data-testid="hub-action-error">
      <div>{error.detail}</div>
      {error.unsupported && (
        <div className="hub-note">
          This server does not support {ACTION_NOUN[error.action]} (needs
          protocol 1.1 or newer).
        </div>
      )}
    </div>
  );
}
