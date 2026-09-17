import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareEnvFiles, parseEnvFile } from "../dist/index.js";

function writeEnvPair(pairs) {
  const dir = mkdtempSync(join(tmpdir(), "envdrift-"));
  const files = [];
  for (const [name, body] of Object.entries(pairs)) {
    const path = join(dir, name);
    writeFileSync(path, body);
    files.push(path);
  }
  return { files, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("two host:port values are not a protocol mismatch", () => {
  // WHATWG URL parses localhost:5432 with scheme "localhost:", so the old
  // check reported a bogus mismatch and failed CI on plain database hosts.
  const { files, cleanup } = writeEnvPair({
    "a.env": "DB_HOST=localhost:5432\n",
    "b.env": "DB_HOST=staging-db.internal:5432\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
    assert.equal(result.clean, true);
  } finally {
    cleanup();
  }
});

test("a URL next to a plain host is not a protocol mismatch", () => {
  // Only values inferType classifies as URLs take part in the comparison,
  // so the host contributes no protocol to differ from.
  const { files, cleanup } = writeEnvPair({
    "a.env": "API_URL=http://api.local:8080/dev\n",
    "b.env": "API_URL=localhost:8080\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
  } finally {
    cleanup();
  }
});

test("http and https URLs across files are still a protocol mismatch", () => {
  const { files, cleanup } = writeEnvPair({
    "a.env": "API_ENDPOINT=http://api.example.com/v1\n",
    "b.env": "API_ENDPOINT=https://api.example.com/v1\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.equal(result.valueAnomalies.length, 1);
    assert.match(result.valueAnomalies[0].reason, /Protocol mismatch across files \(http: vs https:\)/);
  } finally {
    cleanup();
  }
});

test("a value that is only an inline comment parses as empty", () => {
  // bash and dotenv give KEY an empty value when everything after = is a
  // comment. The strip ran on the trimmed value, where no whitespace was left
  // in front of the #, so the comment text survived as the value and read as
  // drift against a file with a genuinely empty KEY.
  const { files, cleanup } = writeEnvPair({
    "a.env": "FEATURE_FLAG= # TODO enable in prod\n",
    "b.env": "FEATURE_FLAG=\n",
  });
  try {
    assert.equal(parseEnvFile(files[0]).FEATURE_FLAG, "");
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
    assert.equal(result.clean, true);
  } finally {
    cleanup();
  }
});

test("a sentence that starts with your is not a placeholder", () => {
  // The pattern matched the bare word "your" as a prefix, so a welcome
  // message like "your account is ready" was flagged as a placeholder next
  // to a real value and failed CI. A placeholder needs the separator form,
  // as in your-api-key or your_token.
  const { files, cleanup } = writeEnvPair({
    "a.env": "WELCOME=your account is ready\n",
    "b.env": "WELCOME=account ready\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
    assert.equal(result.clean, true);
  } finally {
    cleanup();
  }
});

test("example.com is a working origin, not a placeholder marker", () => {
  // "example" also matched as a bare prefix, which swallowed the reserved
  // but fully functional domain. Only a standalone "example", or one
  // followed by something other than a domain character, reads as a
  // placeholder.
  const { files, cleanup } = writeEnvPair({
    "a.env": "CORS_ORIGIN=example.com\n",
    "b.env": "CORS_ORIGIN=api.mycorp.dev\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
    assert.equal(result.clean, true);
  } finally {
    cleanup();
  }
});

test("separator-form placeholders next to real values are still flagged", () => {
  // Tightening the prefixes must not stop real placeholders from being
  // reported: your-api-key-here, a standalone example, and <replace-me>
  // all stay placeholder tokens.
  const { files, cleanup } = writeEnvPair({
    "a.env": "API_KEY=your-api-key-here\nDB_NAME=example\nHOOK_URL=<replace-me>\n",
    "b.env": "API_KEY=sk-live-3f9c2a\nDB_NAME=orders_prod\nHOOK_URL=https://hooks.internal/\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(
      result.valueAnomalies.map((a) => a.key).sort(),
      ["API_KEY", "DB_NAME", "HOOK_URL"]
    );
    assert.match(result.valueAnomalies[0].reason, /Placeholder value detected/);
  } finally {
    cleanup();
  }
});

test("a hash inside an unquoted value survives comment stripping", () => {
  // A comment starts at whitespace before the #, so a value that begins with
  // or contains # without preceding whitespace keeps it, as in bash.
  const { files, cleanup } = writeEnvPair({
    "a.env": "COLOR=#fff\nTOKEN=a#b\nLOG_LEVEL=debug # verbose staging builds\n",
  });
  try {
    const parsed = parseEnvFile(files[0]);
    assert.equal(parsed.COLOR, "#fff");
    assert.equal(parsed.TOKEN, "a#b");
    assert.equal(parsed.LOG_LEVEL, "debug");
  } finally {
    cleanup();
  }
});
