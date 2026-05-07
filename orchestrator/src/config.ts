// Static configuration defaults. Anything user-editable should live in the PRD
// or .superbuilder/orchestrator.config.json (loaded at runtime, not here).

export const ORCHESTRATOR_VERSION = "0.1.0";

export const STATE_ROOT_DEFAULT = ".superbuilder";

export const PROMPT_DIR = "prompts";
export const EVIDENCE_DIR = "evidence";
export const RUNS_DIR = "runs";
export const DECISIONS_DIR = "decisions";
export const EXPERIMENTS_DIR = "experiments";
export const SOURCE_AUDITS_DIR = "source-audits";
export const APPROVALS_DIR = "approvals";
export const REPORTS_DIR = "reports";
