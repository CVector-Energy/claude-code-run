# Claude Code Run Action

A thin wrapper around [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) that holds the pin.

This release wraps **v1.0.182** (`e0cf66d1d257526b5d07f141838c338921cb8455`).

## What This Action Does

Very little, on purpose. It forwards six inputs to one pinned copy of the upstream action and passes four outputs back. What that buys:

1. **One upgrade point.** A repository running the agent at four call sites pins the upstream sha four times; two repositories running it at eleven pin it eleven times. Bumping it becomes one edit here plus a sha bump per consumer, instead of an eleven-line sweep that has to land identically everywhere.
2. **One set of names.** Callers write `claude-args` and read `session-id`; if upstream renames an input, the rename is absorbed here.
3. **Somewhere to put shared behaviour.** Anything every call site would otherwise repeat — a future `prompt-file` once upstream accepts one, a trace upload, a default argument — has a home that is not a copy-paste.

It is explicitly **not** a place to put the caller's job. There is one step inside, and a test that keeps it that way.

## Usage

```yaml
- name: Restore the Claude session
  id: session
  uses: CVector-Energy/claude-code-session@v0.1.1
  with:
    scope: issue-${{ github.event.issue.number }}

- name: Triage the issue
  id: triage
  uses: CVector-Energy/claude-code-run@v0.1.0
  with:
    prompt: ${{ steps.triage-prompt.outputs.body }}
    claude-args: |
      ${{ env.TRIAGE_CLAUDE_ARGS }}
      ${{ steps.session.outputs.resume-args }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ steps.app.outputs.token }}
    allowed-bots: 'my-org-bot[bot]'
    show-full-output: true

- name: Act on the result
  run: echo '${{ steps.triage.outputs.structured-output }}' | jq .
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `prompt` | The prompt to send to Claude Code | Yes | |
| `claude-args` | Arguments passed straight to the CLI — model, `--allowedTools`, `--json-schema`, `--resume` | No | `''` |
| `anthropic-api-key` | Anthropic API key | Yes | |
| `github-token` | Token the agent uses for git and gh | Yes | |
| `allowed-bots` | Comma-separated bot logins whose comments may reach the agent, or `*` | No | `''` |
| `show-full-output` | Log Claude's full JSON output, tool results included | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `session-id` | The session this run wrote, for `--resume` or for claude-code-session to save |
| `structured-output` | The JSON the agent returned when `--json-schema` was in `claude-args` |
| `execution-file` | Path to the execution log, for uploading as a trace artifact |
| `branch-name` | The branch the agent worked on, when it created one |

## What It Does Not Absorb

Four of the six inputs have to be passed at every call site no matter what, and it is worth being clear why, so nobody expects this action to shrink a workflow much:

- **`anthropic-api-key`** — a composite action cannot read the calling workflow's `secrets` context. It must be handed in.
- **`github-token`** — usually `steps.<app>.outputs.token` from the caller's own App-token step.
- **`prompt`** and **`claude-args`** — the payload, different at every site.

So this saves roughly a line or two per call. The value is the pin and the shared home, not the line count.

## Defaults Are Upstream's

`allowed-bots` defaults to empty, which allows no bots — the same default the wrapped action has. A wrapper that quietly widened it would loosen the trigger gate of every caller at once, so a test pins that default too.

`show-full-output` defaults to `false` for the same reason: it logs every tool result, and those can carry secrets into a public log.

## Upgrading the Wrapped Action

1. Bump the sha in `action.yml` and the version line at the top of this README.
2. `npm test` — the wiring tests check the pin is a full sha and that the README names it.
3. Tag a release, then bump the sha each consumer pins.

Consumers should pin this action by full commit sha too. There is deliberately no floating `v1` tag: this action carries an API key and a write-scoped token, so a ref that can be repointed under a consumer is the wrong thing to depend on.

## Development

```sh
npm install
npm test    # node --test over src/*.test.js — action.yml wiring only, no runtime
```

There is no `dist/`: a composite action runs from source, so there is nothing to build and nothing to drift.

## License

MIT
