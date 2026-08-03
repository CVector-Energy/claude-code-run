import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

const ACTION = parse(fs.readFileSync("action.yml", "utf8"));
const UPSTREAM = "anthropics/claude-code-action";

/** The one step that does the work; everything else here is wiring. */
const agentStep = () => {
  const steps = ACTION.runs.steps.filter((step) =>
    String(step.uses ?? "").startsWith(UPSTREAM),
  );
  assert.equal(steps.length, 1, "expected exactly one wrapped agent step");
  return steps[0];
};

/** kebab input name -> the snake_case name upstream knows it by. */
const FORWARDED = {
  prompt: "prompt",
  "claude-args": "claude_args",
  "anthropic-api-key": "anthropic_api_key",
  "github-token": "github_token",
  "allowed-bots": "allowed_bots",
  "show-full-output": "show_full_output",
};

/** kebab output name -> the upstream output it passes through. */
const PASSED_THROUGH = {
  "session-id": "session_id",
  "structured-output": "structured_output",
  "execution-file": "execution_file",
  "branch-name": "branch_name",
};

test("it is a composite action", () => {
  assert.equal(ACTION.runs.using, "composite");
});

test("the wrapped action is pinned to a commit, not a tag", () => {
  // The whole point of the wrapper: this pin exists once instead of at every
  // call site, so a tag that can be repointed would give away what it buys.
  const [, ref] = agentStep().uses.split("@");
  assert.match(ref, /^[0-9a-f]{40}$/);
});

test("nothing else runs here", () => {
  // A wrapper that grows steps of its own stops being a pin and starts being a
  // second implementation of the caller's job.
  const uses = ACTION.runs.steps.filter((step) => step.uses);
  assert.equal(uses.length, 1);
});

test("every input reaches the wrapped action", () => {
  const forwarded = agentStep().with;
  for (const [ours, theirs] of Object.entries(FORWARDED)) {
    assert.ok(ACTION.inputs[ours], `undeclared input: ${ours}`);
    assert.equal(
      String(forwarded[theirs]).trim(),
      `\${{ inputs.${ours} }}`,
      `input ${ours} is not forwarded as ${theirs}`,
    );
  }
});

test("no input is declared and then dropped", () => {
  assert.deepEqual(Object.keys(ACTION.inputs).sort(), Object.keys(FORWARDED).sort());
});

test("the caller can read every result the agent produces", () => {
  const id = agentStep().id;
  assert.ok(id, "the wrapped step needs an id for its outputs to be reachable");
  for (const [ours, theirs] of Object.entries(PASSED_THROUGH)) {
    assert.equal(
      String(ACTION.outputs[ours]?.value).trim(),
      `\${{ steps.${id}.outputs.${theirs} }}`,
      `output ${ours} does not pass through ${theirs}`,
    );
  }
  assert.deepEqual(
    Object.keys(ACTION.outputs).sort(),
    Object.keys(PASSED_THROUGH).sort(),
  );
});

test("the inputs an agent cannot run without are required", () => {
  for (const name of ["prompt", "anthropic-api-key", "github-token"]) {
    assert.equal(ACTION.inputs[name].required, true, name);
  }
});

test("it does not decide who may trigger an agent", () => {
  // allowed-bots defaults to upstream's default of "no bots". A wrapper that
  // quietly widened it would loosen the gate of every caller at once.
  assert.equal(ACTION.inputs["allowed-bots"].default, "");
  assert.equal(ACTION.inputs["show-full-output"].default, "false");
});

test("the description says which upstream release it wraps", () => {
  // The pin is invisible to callers, so the version it corresponds to has to be
  // legible somewhere they will look.
  const readme = fs.readFileSync("README.md", "utf8");
  const [, ref] = agentStep().uses.split("@");
  assert.ok(readme.includes(ref), "README does not name the pinned sha");
});
