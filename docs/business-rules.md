# Business rules — spikeforge-dashboard

One line per rule. Tests cite the ID; changing a rule means changing
this file, the code, and the test in the same PR. Format per
hq `TESTING_STANDARD.md` (domain-core tier). Example-level tests
stay in `scripts/select_e2e_tier.test.mjs`.

## E2E tier selection (scripts/select_e2e_tier.mjs)

| ID | Rule | Enforced by |
|---|---|---|
| SF-TIER-01 | Tier is monotone: adding changed paths never lowers the selected tier (none < smoke < full). | `adding paths never lowers the tier` |
| SF-TIER-02 | The tier of a change set is the maximum tier of its individual paths — no interaction effects. | `set tier is the max of singleton tiers` |
| SF-TIER-03 | Conservative default: any path under `src/` outside the named presentational surfaces (styles, locale files, chartColors) selects full. Unlisted new source areas pay for the expensive tier until explicitly classified. | `unlisted source paths select full` |
| SF-TIER-04 | Prose never pays: a `.md` path anywhere (docs, e2e specs, styles) selects none on its own — NO_TESTS is checked before every other rule. | `markdown anywhere selects none alone` |
| SF-TIER-05 | Presentational surfaces (`src/styles*`, `src/i18n/locales/`) select exactly smoke — never none, never full — so visual changes always render once in CI. | `presentational surfaces select smoke` |
