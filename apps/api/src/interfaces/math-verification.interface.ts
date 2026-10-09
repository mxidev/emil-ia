export type SandboxStatus =
  | "not_applicable"
  | "success"
  | "planning_failed"
  | "sandbox_failed"
  | "skipped_mock";

export interface MathVerificationResult {
  status: SandboxStatus;
  systemMessage?: string;
  footer?: string;
}
