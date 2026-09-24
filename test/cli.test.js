import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("files with identical basenames preserve directory paths in report", () => {
  // shortName previously stripped directory paths unconditionally using basename.
  // When files in different directories shared a filename such as .env,
  // the report displayed identical labels for all files, making missing
  // keys and anomalies ambiguous.
  const dir = mkdtempSync(join(tmpdir(), "envdrift-cli-"));
  mkdirSync(join(dir, "dir1"), { recursive: true });
  mkdirSync(join(dir, "dir2"), { recursive: true });
  writeFileSync(join(dir, "dir1", ".env"), "SECRET=123\n");
  writeFileSync(join(dir, "dir2", ".env"), "OTHER=456\n");

  try {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist/cli.js"), "dir1/.env", "dir2/.env"],
      {
        cwd: dir,
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /• dir1\/\.env/);
    assert.match(result.stdout, /• dir2\/\.env/);
    assert.match(result.stdout, /present in:\s+dir1\/\.env/);
    assert.match(result.stdout, /missing from:\s+dir2\/\.env/);
    assert.match(result.stdout, /present in:\s+dir2\/\.env/);
    assert.match(result.stdout, /missing from:\s+dir1\/\.env/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("type mismatches and anomalies retain directory paths for identical filenames", () => {
  // Files with identical basenames must also preserve their directory prefixes
  // in the type mismatch and anomaly sections of the report.
  const dir = mkdtempSync(join(tmpdir(), "envdrift-cli-"));
  mkdirSync(join(dir, "apps", "web"), { recursive: true });
  mkdirSync(join(dir, "apps", "api"), { recursive: true });
  writeFileSync(
    join(dir, "apps", "web", ".env"),
    "PORT=3000\nAPI_URL=http://localhost:3000\n"
  );
  writeFileSync(
    join(dir, "apps", "api", ".env"),
    "PORT=production\nAPI_URL=https://api.example.com\n"
  );

  try {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist/cli.js"), "apps/web/.env", "apps/api/.env"],
      {
        cwd: dir,
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /apps\/web\/\.env:\s+number/);
    assert.match(result.stdout, /apps\/api\/\.env:\s+string/);
    assert.match(result.stdout, /apps\/web\/\.env:\s+\d+ chars, url/);
    assert.match(result.stdout, /apps\/api\/\.env:\s+\d+ chars, url/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("files in the current directory format as plain filenames without directory prefix", () => {
  // When files are in the working directory, relative paths resolve to plain filenames
  // so the report remains concise.
  const dir = mkdtempSync(join(tmpdir(), "envdrift-cli-"));
  writeFileSync(join(dir, ".env"), "A=1\n");
  writeFileSync(join(dir, ".env.staging"), "B=2\n");

  try {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist/cli.js"), ".env", ".env.staging"],
      {
        cwd: dir,
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /• \.env\b/);
    assert.match(result.stdout, /• \.env\.staging\b/);
    assert.match(result.stdout, /present in:\s+\.env\b/);
    assert.match(result.stdout, /missing from:\s+\.env\.staging\b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI excludes keys passed with --ignore=KEY syntax", () => {
  // Arguments using the --ignore=KEY syntax were previously skipped
  // by the option parser, causing ignored keys to be reported as drift.
  const dir = mkdtempSync(join(tmpdir(), "envdrift-cli-"));
  writeFileSync(join(dir, ".env"), "KEY1=val1\nKEY2=val2\nKEY3=val3\n");
  writeFileSync(join(dir, ".env.staging"), "KEY3=val3\n");

  try {
    const singleFlagResult = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist/cli.js"), "--ignore=KEY1", "--ignore=KEY2", ".env", ".env.staging"],
      {
        cwd: dir,
        encoding: "utf8",
      }
    );
    assert.equal(singleFlagResult.status, 0, singleFlagResult.stderr);
    assert.match(singleFlagResult.stdout, /No drift detected/);

    const commaFlagResult = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist/cli.js"), "--ignore=KEY1,KEY2", ".env", ".env.staging"],
      {
        cwd: dir,
        encoding: "utf8",
      }
    );
    assert.equal(commaFlagResult.status, 0, commaFlagResult.stderr);
    assert.match(commaFlagResult.stdout, /No drift detected/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

