import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DriftResult, EnvMap, MissingKey, TypeMismatch, ValueAnomaly, ValueType } from "./types.js";

export { DriftResult, EnvMap, MissingKey, TypeMismatch, ValueAnomaly, ValueType } from "./types.js";

/**
 * Parse a .env file into a key-value map.
 * Handles comments, blank lines, quoted values, inline comments,
 * export prefixes, and multiline double-quoted values.
 */
export function parseEnvFile(filePath: string): EnvMap {
  const absolutePath = resolve(filePath);
  const content = readFileSync(absolutePath, "utf-8");
  const map: EnvMap = {};

  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    i++;

    const trimmedLine = rawLine.trim();

    // Skip blank lines and full-line comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const eqIndex = rawLine.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    // Strip optional `export ` prefix from the key segment
    let keySegment = rawLine.slice(0, eqIndex).trim();
    if (keySegment.startsWith("export ")) {
      keySegment = keySegment.slice("export ".length).trim();
    }
    const key = keySegment;
    if (!key) {
      continue;
    }

    const rawValue = rawLine.slice(eqIndex + 1);
    let value: string;

    if (rawValue.trimStart().startsWith('"')) {
      // Double-quoted value: supports multiline (embedded \n via actual newlines)
      const afterOpenQuote = rawValue.trimStart().slice(1);
      
      const findClosingQuote = (str: string): number => {
        for (let j = 0; j < str.length; j++) {
          if (str[j] === '\\') j++;
          else if (str[j] === '"') return j;
        }
        return -1;
      };

      const closingOnSameLine = findClosingQuote(afterOpenQuote);

      if (closingOnSameLine !== -1) {
        // Value opens and closes on the same line
        value = afterOpenQuote.slice(0, closingOnSameLine);
      } else {
        // Multiline: accumulate until the closing double-quote is found
        let accumulated = afterOpenQuote.endsWith('\r') ? afterOpenQuote.slice(0, -1) : afterOpenQuote;
        while (i < lines.length) {
          const nextLine = lines[i];
          i++;
          const cleanNextLine = nextLine.endsWith('\r') ? nextLine.slice(0, -1) : nextLine;
          const closeIndex = findClosingQuote(cleanNextLine);
          if (closeIndex !== -1) {
            accumulated += "\n" + cleanNextLine.slice(0, closeIndex);
            break;
          }
          accumulated += "\n" + cleanNextLine;
        }
        value = accumulated;
      }
    } else if (rawValue.trimStart().startsWith("'")) {
      // Single-quoted: single-line only (standard .env behaviour)
      const afterOpenQuote = rawValue.trimStart().slice(1);
      const closingIndex = afterOpenQuote.indexOf("'");
      value = closingIndex !== -1 ? afterOpenQuote.slice(0, closingIndex) : afterOpenQuote.trim();
    } else {
      // Unquoted value: trim and strip trailing inline comment
      value = rawValue.trim();
      // An inline comment is whitespace followed by # (e.g. "value # comment")
      const commentMatch = value.match(/\s+#.*$/);
      if (commentMatch !== null && commentMatch.index !== undefined) {
        value = value.slice(0, commentMatch.index).trim();
      }
    }

    map[key] = value;
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
 * Keys listed in ignoreKeys are excluded from all checks.
 */
export function compareEnvFiles(filePaths: string[], ignoreKeys: string[] = []): DriftResult {
  const ignoreSet = new Set(ignoreKeys);

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

  // Collect the union of all keys, minus ignored ones
  const allKeys = new Set<string>();
  for (const map of Object.values(parsed)) {
    for (const key of Object.keys(map)) {
      if (!ignoreSet.has(key)) {
        allKeys.add(key);
      }
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
