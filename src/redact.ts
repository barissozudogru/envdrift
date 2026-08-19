import { createHash } from "node:crypto";
import type { DriftResult, ValueAnomaly } from "./types.js";

/**
 * Value redaction.
 *
 * envdrift reads .env files, which routinely hold live credentials. Printing a
 * value to stdout puts it in terminal scrollback and, when the tool runs as the
 * CI step the README recommends, in build logs. Values read from a file on disk
 * are not registered as CI secrets, so no log masking applies to them.
 *
 * Every value is therefore described rather than shown. The description keeps
 * what drift detection actually needs (length, character class, and a stable
 * fingerprint answering whether two files hold the same value) without
 * carrying the value itself.
 */

/** Character class of a value, coarse enough to be useful and not revealing. */
function classify(value: string): string {
  // Ordered most specific first: digits are a subset of hex, and boolean
  // literals are a subset of both token and ascii.
  if (/^(true|false|yes|no|on|off)$/i.test(value)) return "boolean";
  if (/^\d+$/.test(value)) return "digits";
  if (/^[0-9a-f]+$/i.test(value)) return "hex";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return "url";
  if (/^[A-Za-z0-9_-]+$/.test(value)) return "token";
  if (/^[\x20-\x7e]+$/.test(value)) return "ascii";
  return "mixed";
}

/**
 * Short, stable fingerprint. Equal values fingerprint equally across files,
 * which is what makes a redacted drift report still readable.
 */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 4);
}

/**
 * Human-readable shape of a value, e.g. "32 chars, hex, #a41f".
 * Never includes any part of the value itself.
 */
export function describeValue(value: string): string {
  if (value.length === 0) return "(empty)";
  return `${value.length} chars, ${classify(value)}, #${fingerprint(value)}`;
}

/** Replace every value in an anomaly with its description. */
function redactAnomaly(anomaly: ValueAnomaly): ValueAnomaly {
  const values: Record<string, string> = {};
  for (const [file, value] of Object.entries(anomaly.values)) {
    values[file] = describeValue(value);
  }
  return { ...anomaly, values };
}

/**
 * Copy of a result with every value replaced by its description. Used on both
 * output paths so that redirecting output or switching to --json cannot
 * reintroduce the leak.
 */
export function redactResult(result: DriftResult): DriftResult {
  return {
    ...result,
    valueAnomalies: result.valueAnomalies.map(redactAnomaly),
  };
}
