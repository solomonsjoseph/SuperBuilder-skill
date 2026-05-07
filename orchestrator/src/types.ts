// PRD schema types — must stay in sync with docs/ARCHITECTURE.md.

export type RiskLevel = "low" | "medium" | "high";

export interface QualityGates {
  typecheck: string | null;
  lint: string | null;
  format: string | null;
  test: string | null;
  integrationTest: string | null;
  security: string | null;
  secretScan: string | null;
  dependencyAudit: string | null;
  licenseCheck: string | null;
  browser: string | null;
  accessibility: string | null;
  performance: string | null;
}

export interface SourceRefs {
  "addyosmani/agent-skills": string;
  "mattpocock/skills": string;
  "mattpocock/sandcastle": string;
  "snarktank/ralph": string;
  "karpathy/autoresearch": string;
}

export interface StoryEvidence {
  tests: string[];
  security: string[];
  review: string[];
  browser: string[];
  accessibility: string[];
  performance: string[];
  commits: string[];
  diffs: string[];
}

export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  riskLevel: RiskLevel;
  filesLikelyTouched: string[];
  dependencies: string[];
  passes: boolean;
  attempts: number;
  lastFailure: string | null;
  evidence: StoryEvidence;
}

export interface PRD {
  schemaVersion: "superbuilder.prd.v2";
  project: string;
  branchName: string;
  targetBranch: string;
  integrationBranch: string;
  description: string;
  riskLevel: RiskLevel;
  deploymentAllowed: boolean;
  sourceRefs: SourceRefs;
  humanApprovalRequiredFor: string[];
  qualityGates: QualityGates;
  userStories: UserStory[];
}

export interface IterationCaps {
  attemptsPerStory: number;
  repairLoopsPerAttempt: number;
  fullRunStories: number | null; // null = no cap
  selfHealExperiments: number;
}

export const DEFAULT_CAPS: IterationCaps = {
  attemptsPerStory: 3,
  repairLoopsPerAttempt: 2,
  fullRunStories: null,
  selfHealExperiments: 3,
};

export const REQUIRED_APPROVAL_DEFAULTS = [
  "production deploy",
  "destructive commands",
  "secrets changes",
  "billing changes",
  "auth changes",
  "database destructive migrations",
  "dependency additions",
  "security policy changes",
  "quality gate weakening",
] as const;
