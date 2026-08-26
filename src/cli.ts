#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createRequire } from "node:module";
import { compareEnvFiles } from "./index.js";
import type { DriftResult } from "./types.js";
import { describeValue, redactResult } from "./redact.js";

// ---------------------------------------------------------------------------
// TTY-aware ANSI helpers
// ---------------------------------------------------------------------------

const USE_COLOR = process.stdout.isTTY === true;

function ansi(code: string, s: string): string {
  return USE_COLOR ? `${code}${s}\x1b[0m` : s;
}

function bold(s: string): string  { return ansi("\x1b[1m", s); }
function red(s: string): string   { return ansi("\x1b[31m", s); }
function yellow(s: string): string { return ansi("\x1b[33m", s); }
function green(s: string): string { return ansi("\x1b[32m", s); }
function cyan(s: string): string  { return ansi("\x1b[36m", s); }
function dim(s: string): string   { return ansi("\x1b[2m", s); }

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function shortName(filePath: string): string {
  return basename(filePath);
}

// ---------------------------------------------------------------------------
// Human-readable output
// ---------------------------------------------------------------------------

function printResult(result: DriftResult, showValues: boolean): void {
  console.log();
  console.log(bold("envdrift") + dim(" - environment drift report"));
  console.log(dim("─".repeat(50)));
  console.log();

  console.log(dim("Comparing files:"));
  for (const f of result.files) {
    console.log(`  ${dim("•")} ${shortName(f)}`);
  }
  console.log();

  if (result.clean) {
    console.log(green("No drift detected. All files are in sync."));
    console.log();
    return;
  }

  // MISSING KEYS
  if (result.missingKeys.length > 0) {
    console.log(bold(red(`MISSING KEYS  (${result.missingKeys.length})`)));
    console.log(dim("─".repeat(50)));
    for (const item of result.missingKeys) {
      console.log(`  ${red("x")} ${bold(item.key)}`);
      console.log(`    ${dim("present in:")}  ${item.presentIn.map(shortName).join(", ")}`);
      console.log(`    ${dim("missing from:")} ${item.missingFrom.map(shortName).join(", ")}`);
    }
    console.log();
  }

  // TYPE MISMATCHES
  if (result.typeMismatches.length > 0) {
    console.log(bold(yellow(`TYPE MISMATCHES  (${result.typeMismatches.length})`)));
    console.log(dim("─".repeat(50)));
    for (const item of result.typeMismatches) {
      console.log(`  ${yellow("!")} ${bold(item.key)}`);
      for (const [file, type] of Object.entries(item.types)) {
        console.log(`    ${dim(shortName(file))}: ${cyan(type)}`);
      }
    }
    console.log();
  }

  // VALUE ANOMALIES
  if (result.valueAnomalies.length > 0) {
    console.log(bold(yellow(`VALUE ANOMALIES  (${result.valueAnomalies.length})`)));
    console.log(dim("─".repeat(50)));
    for (const item of result.valueAnomalies) {
      console.log(`  ${yellow("~")} ${bold(item.key)}  ${dim(item.reason)}`);
      for (const [file, value] of Object.entries(item.values)) {
        const display = showValues
          ? value || dim("(empty)")
          : dim(describeValue(value));
        console.log(`    ${dim(shortName(file))}: ${display}`);
      }
    }
    console.log();
  }

  // Summary
  const parts: string[] = [];
  if (result.missingKeys.length > 0) parts.push(red(`${result.missingKeys.length} missing`));
  if (result.typeMismatches.length > 0) parts.push(yellow(`${result.typeMismatches.length} type mismatches`));
  if (result.valueAnomalies.length > 0) parts.push(yellow(`${result.valueAnomalies.length} anomalies`));
  console.log(bold("Summary: ") + parts.join("  "));
  console.log();
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

function printJson(result: DriftResult, showValues: boolean): void {
  const payload = showValues ? result : redactResult(result);
  console.log(JSON.stringify(payload, null, 2));
}

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

// Filenames to exclude from auto-detection (backup/noise files)
const EXCLUDED_SUFFIXES = [".backup", ".bak"];

function autoDetectEnvFiles(cwd: string): string[] {
  const entries = readdirSync(cwd, { withFileTypes: true });
  return entries
    .filter((entry) => {
      if (!entry.isFile() && !entry.isSymbolicLink()) return false;
      const f = entry.name;
      if (!/^\.env(\..+)?$/.test(f)) return false;
      for (const suffix of EXCLUDED_SUFFIXES) {
        if (f.endsWith(suffix)) return false;
      }
      return true;
    })
    .map((entry) => resolve(cwd, entry.name))
    .sort();
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  files: string[];
  help: boolean;
  version: boolean;
  json: boolean;
  ignoreKeys: string[];
  showValues: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const help = args.includes("--help") || args.includes("-h");
  const version = args.includes("--version") || args.includes("-v");
  const json = args.includes("--json");
  const showValues = args.includes("--show-values");

  const ignoreKeys: string[] = [];
  const files: string[] = [];

  let idx = 0;
  while (idx < args.length) {
    const arg = args[idx];
    if (arg === "--ignore" || arg === "-i") {
      idx++;
      if (idx < args.length) {
        // Accept comma-separated or repeated flag: --ignore KEY1,KEY2
        const raw = args[idx];
        for (const k of raw.split(",")) {
          const trimmed = k.trim();
          if (trimmed) ignoreKeys.push(trimmed);
        }
      }
    } else if (!arg.startsWith("-")) {
      files.push(arg);
    }
    idx++;
  }

  return { files, help, version, json, ignoreKeys, showValues };
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
${bold("envdrift")} - detect environment variable drift across .env files

${bold("USAGE")}
  envdrift [files...]               Compare specified .env files
  envdrift                          Auto-detect .env* files in current directory

${bold("OPTIONS")}
  -h, --help                        Show this help message
  -v, --version                     Show version number
  --json                            Output results as JSON (for CI integration)
  --ignore <keys>                   Comma-separated list of keys to exclude
                                    (can be repeated: --ignore KEY1 --ignore KEY2)
  --show-values                     Print raw values instead of their shape.
                                    Never use this in CI: .env values are not
                                    masked in build logs.

${bold("EXAMPLES")}
  envdrift .env .env.staging .env.production
  envdrift                          (auto-detects .env, .env.local, .env.staging, etc.)
  envdrift --json .env .env.staging
  envdrift --ignore SECRET_KEY,INTERNAL_TOKEN .env .env.production

${bold("EXIT CODES")}
  0  No drift detected
  1  Drift detected or error

${bold("CI EXAMPLE")}
  # In your GitHub Actions workflow:
  - run: npx @barissozudogru/envdrift --json .env.example .env.production

${bold("SOURCE AND DOCUMENTATION")}
  https://github.com/barissozudogru/envdrift
`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { files, help, version, json, ignoreKeys, showValues } = parseArgs(process.argv);

  if (help) {
    printHelp();
    process.exit(0);
  }

  if (version) {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version: string };
    console.log(pkg.version);
    process.exit(0);
  }

  let resolvedFiles = files;

  if (resolvedFiles.length === 0) {
    resolvedFiles = autoDetectEnvFiles(process.cwd());
    if (resolvedFiles.length === 0) {
      console.error(red("No .env files found in current directory."));
      console.error(dim("Tip: pass file paths explicitly: envdrift .env .env.staging"));
      process.exit(1);
    }
  }

  if (resolvedFiles.length < 2) {
    console.error(red("At least two .env files are required for comparison."));
    process.exit(1);
  }

  let result;
  try {
    result = compareEnvFiles(resolvedFiles, ignoreKeys);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(red(`Error reading files: ${message}`));
    process.exit(1);
  }

  if (json) {
    printJson(result, showValues);
  } else {
    printResult(result, showValues);
  }

  process.exit(result.clean ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
