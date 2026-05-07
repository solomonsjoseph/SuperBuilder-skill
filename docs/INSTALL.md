# Superbuilder — Install & First Run

## Prerequisites

- Claude Code (CLI, IDE extension, or Desktop) recent enough to support
  plugin auto-discovery.
- Node.js ≥ 20 (for the orchestrator).
- Docker, Podman, or Vercel sandbox (for Sandcastle execution). At least
  one provider must be available.
- `jq` (used by hook scripts).
- Git.

## Install (local)

```bash
# clone the plugin
git clone https://github.com/<your-fork>/superbuilder.git
cd superbuilder

# build the orchestrator
( cd orchestrator && npm install && npm run build )

# install Sandcastle (optional but required for autonomous runs)
( cd orchestrator && npm i sandcastle )
```

Then point Claude Code at the plugin directory. Either:

```bash
# one-shot session
claude --plugin-dir /absolute/path/to/superbuilder
```

or add to your settings:

```json
{
  "plugins": ["/absolute/path/to/superbuilder"]
}
```

Verify discovery:

```bash
claude
> /help
# Look for /superbuilder:superbuild, /superbuilder:superaudit, etc.
```

## First run

In a fresh project (or one with an existing repo):

```bash
cd /path/to/my-project
claude
> /superbuilder:superaudit
> /superbuilder:superbuild
```

Superbuilder will:
1. Audit your project (stack, gates, risks).
2. Grill your idea until success criteria are explicit.
3. Produce a PRD and ask for approval.
4. Materialize `.superbuilder/prd.json`.
5. Iterate stories through Sandcastle with evidence-backed gates.
6. Stop at PR-ready. **Production deploy is a separate, gated act.**

## Configuring providers

The orchestrator defaults to `docker`. Override via `--provider`:

```bash
.superbuilder/run --provider podman
```

Or set in `.superbuilder/orchestrator.config.json`:

```json
{
  "provider": "podman",
  "caps": {
    "attemptsPerStory": 3,
    "fullRunStories": null
  }
}
```

## Ensuring hooks load

Hooks are loaded at session start. If you edit `hooks/hooks.json` or any
script in `hooks/scripts/`, restart Claude Code. Use `claude --debug` to
verify hook registration.

## Uninstall

Remove the plugin path from your settings (or omit `--plugin-dir`). Project
state in `.superbuilder/` is per-project; remove with `rm -rf .superbuilder`
once you've copied out anything you want to keep.
