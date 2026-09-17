import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareEnvFiles } from "../dist/index.js";

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
