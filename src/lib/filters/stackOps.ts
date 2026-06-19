// src/lib/filters/stackOps.ts
import { makeFilter } from "./kinds";
import type { FilterInstance, FilterKind, FilterPatch, FilterStack } from "./types";

/** The primary-slider value of an instance (radius / value / shift). Hue's
 *  primary slider is `shift`; colorize hue/sat are handled separately by the UI. */
export function amountOf(f: FilterInstance): number {
  if (f.kind === "blur") return f.radius;
  if (f.kind === "hue") return f.shift;
  return f.value;
}

/** Return a copy of `f` with its primary-slider value set to `n`. */
export function withAmount(f: FilterInstance, n: number): FilterInstance {
  if (f.kind === "blur") return { ...f, radius: n };
  if (f.kind === "hue") return { ...f, shift: n };
  return { ...f, value: n };
}

/** Return a new stack with the instance `id` replaced by merging `patch` into it. */
export function updateFilter(
  stack: FilterStack,
  id: string,
  patch: FilterPatch,
): FilterStack {
  return stack.map((f) => (f.id === id ? ({ ...f, ...patch } as FilterInstance) : f));
}

/** Remove the instance `id`. */
export function removeFilter(stack: FilterStack, id: string): FilterStack {
  return stack.filter((f) => f.id !== id);
}

/** Flip the `enabled` flag of instance `id`. */
export function toggleFilter(stack: FilterStack, id: string): FilterStack {
  return stack.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f));
}

/** Append a fresh neutral instance of `kind` with the given id. Duplicates of
 *  the same kind are allowed (e.g. two Blur filters compound). */
export function addFilter(
  stack: FilterStack,
  kind: FilterKind,
  newId: string,
): FilterStack {
  return [...stack, makeFilter(kind, newId)];
}

/** Move the instance at `from` to `to`, shifting the others. Indices clamped. */
export function moveFilter(stack: FilterStack, from: number, to: number): FilterStack {
  if (from === to) return stack;
  if (from < 0 || from >= stack.length) return stack;
  const clampedTo = Math.max(0, Math.min(stack.length - 1, to));
  const next = stack.slice();
  const [moved] = next.splice(from, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}
