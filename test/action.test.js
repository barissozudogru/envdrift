import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const action = readFileSync(new URL("../action.yml", import.meta.url), "utf8");

// The run block is indented by eight spaces under "run: |".
function extractRunScript(yaml) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => /^ {6}run: \|$/.test(line));
  assert.notEqual(start, -1, "action.yml must contain a run block");
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") {
      body.push("");
    } else if (line.startsWith("        ")) {
      body.push(line.slice(8));
    } else {
      break;
    }
  }
  return body.join("\n");
}

const script = extractRunScript(action);

test("the action executes its own checkout instead of the published package", () => {
  // npm exec resolved @barissozudogru/envdrift from the registry, so running
  // the action on a branch ref silently executed the last published release
  // and ignored the code the user had checked out.
  assert.match(script, /node "\$GITHUB_ACTION_PATH\/dist\/cli\.js"/);
  assert.doesNotMatch(script, /npm exec|\bnpx\b|@barissozudogru\/envdrift@/);
});

test("the action builds its checkout before running the CLI", () => {
  // dist is generated and never committed, so without an install and build
  // inside GITHUB_ACTION_PATH there would be no CLI to execute.
  assert.match(script, /cd "\$GITHUB_ACTION_PATH"/);
  assert.match(script, /npm ci/);
  assert.match(script, /npm run build/);
});

test("the run block parses as a bash script", () => {
  const result = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
