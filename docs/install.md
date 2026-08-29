# Tugra install

One command:

```bash
npx tugra init
```

That writes a vault, a sample fact, and a config block with two paths: `TUGRA_KASA` and `TUGRA_AKIS`. Paste the block into your MCP host. Piped (Claude Desktop, Claude Code, Cursor, Windsurf, Codex) `npx tugra` is the MCP server. A TTY prints help and exits.

`npx` installs into a cache; the default relative vault next to the package is not your project. Set absolute paths.

Authorization: with no authorization store, single-user mode is on. Search works without a profile. If you add `TUGRA_YETKI` or a `yetki/` directory, each agent needs a JSON profile or search returns unauthorized. Read tools default to `mcp-readonly@tugra` when a store exists.

## Claude Desktop

Config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

Restart Desktop after editing.

## Claude Code

Project `.mcp.json` (same `mcpServers` object as above) or:

```bash
claude mcp add tugra -- npx -y tugra
```

Then set `TUGRA_KASA` and `TUGRA_AKIS` in that server entry.

## Cursor

Project `.cursor/mcp.json` or global `~/.cursor/mcp.json`. Same JSON as Claude Desktop. Reload MCP servers after saving.

This repository's local (unpacked) block, after `npm run build` in `kasa-motoru`:

```json
{
  "mcpServers": {
    "tugra": {
      "command": "node",
      "args": ["kasa-motoru/dist/mcp.js"],
      "env": {}
    }
  }
}
```

Tool names are `fact_search` / `fact_read` / `fact_propose` / `event_report`. Old names are not aliases.

## Windsurf

Cascade → Settings → MCP, or `~/.codeium/windsurf/mcp_config.json`. Same `mcpServers` JSON as Claude Desktop.

## Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.tugra]
command = "npx"
args = ["-y", "tugra"]

[mcp_servers.tugra.env]
TUGRA_KASA = "/absolute/path/to/vault"
TUGRA_AKIS = "/absolute/path/to/events"
```

## Shared-vault authorization (optional)

Single-user setups do not need `TUGRA_YETKI`. Set it only when several agents share a vault and each has a profile JSON in that directory. Setting the variable turns single-user mode off.

## What we do not guarantee

No cloud sync. No automatic merge. No delete in this release (retirement only). No automatic conflict detection.

## From this repository

```bash
cd kasa-motoru
npm install
npm run build
node dist-paket/mcp.js
```
