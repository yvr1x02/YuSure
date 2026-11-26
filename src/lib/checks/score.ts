import { CHECKS, type Outcome, type Section } from "./catalog";
import type { CheckResult } from "./result";

/*
 * SPEC, "Punteggio". A problem loses the check's whole weight, a warning half of it.
 * Unverified checks leave the count: the score is on the others, and says it is partial.
 */

export type Score = { value: number; partial: boolean };
/** No score: the checks that ran weigh less than half of the section (decided in M3). */
export type Unscored = { unverified: number; checks: number };
export type Verdict = "good" | "improve" | "critical";

const LOST_SHARE: Record<Exclude<Outcome, "unverified">, number> = { ok: 0, warning: 0.5, problem: 1 };

export const SECTION_WEIGHTS: Record<Section, number> = { security: 35, performance: 25, seo: 25, accessibility: 15 };

/** 0–100 for one section, or no score when the checks that ran weigh less than half of it. */
export function sectionScore(results: CheckResult[], section: Section): Score | Unscored {
  const inSection = results.filter((r) => CHECKS[r.id].section === section);
  let total = 0;
  let possible = 0;
  let lost = 0;
  for (const { id, outcome } of inSection) {
    total += CHECKS[id].weight;
    if (outcome === "unverified") continue;
    possible += CHECKS[id].weight;
    lost += CHECKS[id].weight * LOST_SHARE[outcome];
  }
  if (possible === 0 || possible * 2 < total) {
    return { unverified: inSection.filter((r) => r.outcome === "unverified").length, checks: inSection.length };
  }
  // possible - lost is a whole or half number: exact, unlike 1 - lost / possible.
  const value = Math.round((100 * (possible - lost)) / possible);
  return { value, partial: inSection.some((r) => r.outcome === "unverified") };
}

/**
 * Weighted mean of the sections that have a score, from their rounded values so the
 * report can be checked by hand. A missing or partial section makes it partial; sections
 * with a score weighing less than half of the total leave no total (same rule as above).
 */
export function totalScore(sections: Partial<Record<Section, Score>>): Score | undefined {
  const scored = (Object.keys(SECTION_WEIGHTS) as Section[]).flatMap((section) => {
    const score = sections[section];
    return score ? [{ score, weight: SECTION_WEIGHTS[section] }] : [];
  });
  const weights = scored.reduce((sum, s) => sum + s.weight, 0);
  const allWeights = Object.values(SECTION_WEIGHTS).reduce((sum, w) => sum + w, 0);
  if (weights === 0 || weights * 2 < allWeights) return undefined;
  const value = Math.round(scored.reduce((sum, s) => sum + s.score.value * s.weight, 0) / weights);
  const partial = scored.length < Object.keys(SECTION_WEIGHTS).length || scored.some((s) => s.score.partial);
  return { value, partial };
}

/** The scores saved with a report, at scan time (ADR-0003). Reports of catalog v1 have security only. */
export type Scores = { security: Score | Unscored; seo?: Score | Unscored; accessibility?: Score | Unscored };

/** Performance and the total arrive with PageSpeed (M5). */
export function scoresOf(results: CheckResult[]): Scores {
  return {
    security: sectionScore(results, "security"),
    seo: sectionScore(results, "seo"),
    accessibility: sectionScore(results, "accessibility"),
  };
}

export function verdict(score: number): Verdict {
  if (score >= 90) return "good";
  return score >= 60 ? "improve" : "critical";
}
