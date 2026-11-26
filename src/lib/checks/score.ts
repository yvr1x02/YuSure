import { CHECKS, type Outcome, type Section } from "./catalog";
import type { CheckResult } from "./result";

/*
 * SPEC, "Punteggio". A problem loses the check's whole weight, a warning half of it.
 * Unverified checks leave the count: the score is on the others, and says it is partial.
 */

export type Score = { value: number; partial: boolean };
export type Verdict = "good" | "improve" | "critical";

const LOST_SHARE: Record<Exclude<Outcome, "unverified">, number> = { ok: 0, warning: 0.5, problem: 1 };

export const SECTION_WEIGHTS: Record<Section, number> = { security: 35, performance: 25, seo: 25, accessibility: 15 };

/** 0–100 for one section; undefined when none of its checks could run. */
export function sectionScore(results: CheckResult[], section: Section): Score | undefined {
  const inSection = results.filter((r) => CHECKS[r.id].section === section);
  let possible = 0;
  let lost = 0;
  for (const { id, outcome } of inSection) {
    if (outcome === "unverified") continue;
    possible += CHECKS[id].weight;
    lost += CHECKS[id].weight * LOST_SHARE[outcome];
  }
  if (possible === 0) return undefined;
  // possible - lost is a whole or half number: exact, unlike 1 - lost / possible.
  const value = Math.round((100 * (possible - lost)) / possible);
  return { value, partial: inSection.some((r) => r.outcome === "unverified") };
}

/**
 * Weighted mean of the sections that have a score, from their rounded values so the
 * report can be checked by hand. A missing or partial section makes it partial.
 */
export function totalScore(sections: Partial<Record<Section, Score>>): Score | undefined {
  const scored = (Object.keys(SECTION_WEIGHTS) as Section[]).flatMap((section) => {
    const score = sections[section];
    return score ? [{ score, weight: SECTION_WEIGHTS[section] }] : [];
  });
  if (scored.length === 0) return undefined;
  const weights = scored.reduce((sum, s) => sum + s.weight, 0);
  const value = Math.round(scored.reduce((sum, s) => sum + s.score.value * s.weight, 0) / weights);
  const partial = scored.length < Object.keys(SECTION_WEIGHTS).length || scored.some((s) => s.score.partial);
  return { value, partial };
}

export function verdict(score: number): Verdict {
  if (score >= 90) return "good";
  return score >= 60 ? "improve" : "critical";
}
