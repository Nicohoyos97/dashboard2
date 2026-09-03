// Shared vocabulary of the deterministic checks. Every check compares what
// arithmetic on transcribed figures says (`expectedCents`) with what the
// document prints (`actualCents`), on integer cents, within a tolerance.

export const RECONCILE_TOLERANCE_CENTS = 100;
export const CONFIDENCE_THRESHOLD = 0.85;

export type ReconciliationCheck = {
  key: string;
  ok: boolean;
  expectedCents: number;
  actualCents: number;
  toleranceCents: number;
  label: string;
};

export type Reconciliation = {
  passed: boolean;
  checks: ReconciliationCheck[];
  lowConfidence: { count: number; refs: string[] };
};

export function makeCheck(
  key: string,
  label: string,
  expectedCents: number,
  actualCents: number,
): ReconciliationCheck {
  return {
    key,
    label,
    expectedCents,
    actualCents,
    toleranceCents: RECONCILE_TOLERANCE_CENTS,
    ok: Math.abs(expectedCents - actualCents) <= RECONCILE_TOLERANCE_CENTS,
  };
}

export function isLowConfidence(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLD;
}

export function finishReconciliation(checks: ReconciliationCheck[], lowConfidenceRefs: string[]): Reconciliation {
  return {
    passed: checks.every((check) => check.ok) && lowConfidenceRefs.length === 0,
    checks,
    lowConfidence: { count: lowConfidenceRefs.length, refs: lowConfidenceRefs },
  };
}
