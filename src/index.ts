import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DriftResult, EnvMap, MissingKey, TypeMismatch, ValueAnomaly, ValueType } from "./types.js";

export { DriftResult, EnvMap, MissingKey, TypeMismatch, ValueAnomaly, ValueType } from "./types.js";

/**
 * Parse a .env file into a key-value map.
 * Handles comments, blank lines, quoted values, and inline comments.
 */
export function parseEnvFile(filePath: string): EnvMap {
  const absolutePath = resolve(filePath);
  const content = readFileSync(absolutePath, "utf-8");
  const map: EnvMap = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    // Skip blank lines and comments
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip inline comments when value is not quoted
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      map[key] = value;
    }
  }

  return map;
}

/**
 * Infer the semantic type of an env value.
 */
export function inferType(value: string): ValueType {
  if (value === "") {
    return "string";
  }

  const lower = value.toLowerCase();

  if (lower === "true" || lower === "false") {
    return "boolean";
  }

  if (!isNaN(Number(value)) && value.trim() !== "") {
    return "number";
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "ftp:") {
      return "url";
    }
  } catch {
    // not a URL
  }

  // Unix-style or Windows-style absolute or relative paths
  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /^[A-Za-z]:\\/.test(value) ||
    /^[A-Za-z]:\//.test(value)
  ) {
    return "path";
  }

  return "string";
}

/**
 * Detect anomalies in values across files for the same key.
 * Anomalies: one file uses a placeholder while others have real values,
 * or values differ only in protocol (http vs https).
 */
function detectValueAnomalies(
  key: string,
  valuesByFile: Record<string, string>
): ValueAnomaly | null {
  const entries = Object.entries(valuesByFile);
  if (entries.length < 2) return null;

  const placeholderPattern = /^(your[-_]?|change[-_]?me|todo|placeholder|example|<.*>|\*\*\*|xxx)/i;
  const placeholders = entries.filter(([, v]) => placeholderPattern.test(v));
  const nonPlaceholders = entries.filter(([, v]) => !placeholderPattern.test(v));

  if (placeholders.length > 0 && nonPlaceholders.length > 0) {
    return {
      key,
      values: Object.fromEntries(entries),
      reason: `Placeholder value detected in ${placeholders.map(([f]) => f).join(", ")}`,
    };
  }

  // Protocol mismatch (http vs https)
  const protocols = new Set(
    entries
      .map(([, v]) => {
        try {
          return new URL(v).protocol;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  );
  if (protocols.size > 1) {
    return {
      key,
      values: Object.fromEntries(entries),
      reason: `Protocol mismatch across files (${[...protocols].join(" vs ")})`,
    };
  }

  // Empty vs non-empty
  const empties = entries.filter(([, v]) => v === "");
  const nonEmpties = entries.filter(([, v]) => v !== "");
  if (empties.length > 0 && nonEmpties.length > 0) {
    return {
      key,
      values: Object.fromEntries(entries),
      reason: `Empty value in ${empties.map(([f]) => f).join(", ")} but set in others`,
    };
  }

  return null;
}

/**
 * Compare multiple .env files and return a structured drift report.
 */
export function compareEnvFiles(filePaths: string[]): DriftResult {
  if (filePaths.length < 2) {
    return {
      files: filePaths,
      missingKeys: [],
      typeMismatches: [],
      valueAnomalies: [],
      clean: true,
    };
  }

  const parsed: Record<string, EnvMap> = {};
  for (const filePath of filePaths) {
    parsed[filePath] = parseEnvFile(filePath);
  }

  // Collect the union of all keys
  const allKeys = new Set<string>();
  for (const map of Object.values(parsed)) {
    for (const key of Object.keys(map)) {
      allKeys.add(key);
    }
  }

  const missingKeys: MissingKey[] = [];
  const typeMismatches: TypeMismatch[] = [];
  const valueAnomalies: ValueAnomaly[] = [];

  for (const key of allKeys) {
    const presentIn: string[] = [];
    const missingFrom: string[] = [];
    const types: Record<string, ValueType> = {};
    const values: Record<string, string> = {};

    for (const filePath of filePaths) {
      if (key in parsed[filePath]) {
        presentIn.push(filePath);
        const value = parsed[filePath][key];
        types[filePath] = inferType(value);
        values[filePath] = value;
      } else {
        missingFrom.push(filePath);
      }
    }

    // Missing key report
    if (missingFrom.length > 0) {
      missingKeys.push({ key, presentIn, missingFrom });
    }

    // Type mismatch (only among files that have the key)
    if (presentIn.length >= 2) {
      const uniqueTypes = new Set(Object.values(types));
      if (uniqueTypes.size > 1) {
        typeMismatches.push({ key, types });
      }
    }

    // Value anomalies (only among files that have the key)
    if (presentIn.length >= 2) {
      const presentValues: Record<string, string> = {};
      for (const f of presentIn) {
        presentValues[f] = values[f];
      }
      const anomaly = detectValueAnomalies(key, presentValues);
      if (anomaly) {
        valueAnomalies.push(anomaly);
      }
    }
  }

  const clean =
    missingKeys.length === 0 &&
    typeMismatches.length === 0 &&
    valueAnomalies.length === 0;

  return {
    files: filePaths,
    missingKeys,
    typeMismatches,
    valueAnomalies,
    clean,
  };
}
