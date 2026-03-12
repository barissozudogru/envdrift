#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { compareEnvFiles } from "./index.js";
import type { DriftResult } from "./types.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

function bold(s: string): string {
  return `${BOLD}${s}${RESET}`;
}
function red(s: string): string {
  return `${RED}${s}${RESET}`;
}
function yellow(s: string): string {
  return `${YELLOW}${s}${RESET}`;
}
function green(s: string): string {
  return `${GREEN}${s}${RESET}`;
}
function cyan(s: string): string {
  return `${CYAN}${s}${RESET}`;
}
function dim(s: string): string {
  return `${DIM}${s}${RESET}`;
}

function shortName(filePath: string): string {
  return basename(filePath);
}

function printResult(result: DriftResult): void {
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
      console.log(`  ${red("✖")} ${bold(item.key)}`);
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
        const display = value.length > 60 ? value.slice(0, 57) + "..." : value;
        console.log(`    ${dim(shortName(file))}: ${display || dim("(empty)")}`);
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

function autoDetectEnvFiles(cwd: string): string[] {
  const entries = readdirSync(cwd);
  return entries
    .filter((f) => /^\.env(\..+)?$/.test(f))
    .map((f) => resolve(cwd, f))
    .sort();
}

function parseArgs(argv: string[]): { files: string[]; help: boolean; version: boolean } {
  const args = argv.slice(2);
  const help = args.includes("--help") || args.includes("-h");
  const version = args.includes("--version") || args.includes("-v");
  const files = args.filter((a) => !a.startsWith("-"));
  return { files, help, version };
}

function printHelp(): void {
  console.log(`
${bold("envdrift")} - detect environment variable drift across .env files

${bold("USAGE")}
  envdrift [files...]          Compare specified .env files
  envdrift                     Auto-detect .env* files in current directory

${bold("OPTIONS")}
  -h, --help                   Show this help message
  -v, --version                Show version number

${bold("EXAMPLES")}
  envdrift .env .env.staging .env.production
  envdrift                     (auto-detects .env, .env.local, .env.staging, etc.)

${bold("EXIT CODES")}
  0  No drift detected
  1  Drift detected or error

${bold("CI EXAMPLE")}
  # In your GitHub Actions workflow:
  - run: npx @barissozudogru/envdrift .env.example .env.production
`);
}

async function main(): Promise<void> {
  const { files, help, version } = parseArgs(process.argv);

  if (help) {
    printHelp();
    process.exit(0);
  }

  if (version) {
    // Read version from package.json at runtime
    const { createRequire } = await import("node:module");
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
    result = compareEnvFiles(resolvedFiles);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(red(`Error reading files: ${message}`));
    process.exit(1);
  }

  printResult(result);
  process.exit(result.clean ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
