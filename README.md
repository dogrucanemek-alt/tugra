# tugra

```bash
npx tugra init
```

That creates a vault, writes a sample fact, and prints a config block. Paste the block into your MCP client. On a TTY, `npx tugra` prints help and exits. Piped (Claude Desktop, Cursor, Claude Code) it is the MCP server.

Provenance-aware memory for AI agents. Every claim carries its **source**, its **age**, and its **boundary**. There is no cloud.

## What it is

A fact that cannot name where it came from is not a fact. Tugra stores each claim as a file whose frontmatter holds source, last verification date, shelf life, and — when the topic is off-limits — a boundary that forbids invention. Search ranks by token score, then freshness, then confidence. Retired and rotten facts stay out of the default set.

## Tools

| Tool | What it does |
| --- | --- |
| `fact_search` | Search the vault. Retired/rotten omitted unless `archive: true`. |
| `fact_read` | Read one fact by `uid`. Body is escaped before the model sees it. |
| `fact_propose` | Write a draft. Secret patterns are rejected before any write. `type: "boundary"` is always quarantined. |
| `event_report` | Append a local telemetry line. No network. |

Stored field names stay in the vault's native shape (`kaynak`, `guven`, `raf_omru`, `sinir`). The tool names and parameter names above are the public contract.

## Install — env paths (optional)

`tugra init` is enough to start. Override the two paths only if you already have a vault elsewhere. Without them, the server looks next to the installed package — that is wrong for a bare `npx` with no init.

- `TUGRA_KASA` — vault (markdown facts)
- `TUGRA_AKIS` — telemetry directory

Authorization: if no authorization store is configured, **single-user mode** is on — search and propose work without a profile. If an authorization store *is* configured (a `yetki/` directory, or `TUGRA_YETKI`), each agent needs a JSON profile or search returns unauthorized.

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tugra": {
      "command": "npx",
      "args": ["-y", "tugra"],
      "env": {
        "TUGRA_KASA": "/absolute/path/to/vault",
        "TUGRA_AKIS": "/absolute/path/to/events"
      }
    }
  }
}
```

### Claude Code

`.mcp.json` at the project root, or `claude mcp add`:

```json
{
  "mcpServers": {
    "tugra": {
      "command": "npx",
      "args": ["-y", "tugra"],
      "env": {
        "TUGRA_KASA": "/absolute/path/to/vault",
        "TUGRA_AKIS": "/absolute/path/to/events"
      }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` or Cursor Settings → MCP:

```json
{
  "mcpServers": {
    "tugra": {
      "command": "npx",
      "args": ["-y", "tugra"],
      "env": {
        "TUGRA_KASA": "/absolute/path/to/vault",
        "TUGRA_AKIS": "/absolute/path/to/events"
      }
    }
  }
}
```

### Windsurf

`mcp_config.json`:

```json
{
  "mcpServers": {
    "tugra": {
      "command": "npx",
      "args": ["-y", "tugra"],
      "env": {
        "TUGRA_KASA": "/absolute/path/to/vault",
        "TUGRA_AKIS": "/absolute/path/to/events"
      }
    }
  }
}
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.tugra]
command = "npx"
args = ["-y", "tugra"]

[mcp_servers.tugra.env]
TUGRA_KASA = "/absolute/path/to/vault"
TUGRA_AKIS = "/absolute/path/to/events"
```

Windows: use a full path (`C:\\Users\\…\\vault`). Node 20 or newer.

More client notes: [docs/install.md](docs/install.md).

## Shared-vault authorization (optional)

Single-user setups do **not** need this. Add `TUGRA_YETKI` only when several agents share one vault and each needs its own profile (`mcp-readonly@tugra` and others as JSON files in that directory). Setting the variable, even to an empty path, turns single-user mode off: a missing profile then returns unauthorized. That is intentional.

## What we do not guarantee

- **No cloud sync.** The vault is the files you pointed at. Nothing is uploaded.
- **No automatic merge.** Two writers, two files. You reconcile.
- **No delete in this release.** Retirement exists; erasure is later.
- **No automatic conflict detection.** Contradictory facts can sit side by side until a human says otherwise.
- **No hosted service.** `npx tugra` is a local stdio process.

This package is not published as a SaaS. There is no price table here.

## Requirements

- Node.js 20 or newer. This is a support decision, not a technical floor: the
  package is tested on 20 and 22 in CI, and it also runs on 18 — but 18 is past
  its end of life, so we do not support it.
- A vault directory you own

## Topic map (optional)

`<vault>/_konu-haritasi.json` — `{ "desen", "bayrak", "konu" }` rules in
`harita`, `alt_kirilim`, and `stem`. If the file is missing the map is empty:
unknown text falls back to `kurum.genel` or `dunya.<world>.genel`. Broken or
over-long patterns are skipped and logged. This package does not ship a
company taxonomy.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.

The marketing page lives in `../site/` (`npm run preview` there). It is not deployed from this package.

Compatibility: `TALAMUS_*` and `MULTI_*` names still work as fallback if `TUGRA_*` is unset.
