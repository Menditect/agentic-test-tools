# Getting Started with Menditect Agent Workspace

Welcome to your new Menditect Agent Workspace Template. This repository allows you to immediately start using AI agents (Cursor, Claude, Copilot, Antigravity) to build and run automated tests for your Mendix applications.

## Prerequisites
- **Node.js (v18+)**: Required to run the setup script and the lightweight MCP proxies. Install from [nodejs.org](https://nodejs.org).
- **Git**: Required to fetch the latest agent skills.

## The 60-Second Setup

1. **Initialize the workspace**
   Open your terminal in this repository and run:
   ```bash
   npm run setup
   # Or on Windows PowerShell:
   .\setup.ps1
   ```

2. **Answer the Prompts**
   The script will ask for:
   - Your MTA URL (Defaults to Trial)
   - Your App under test Plugin URL (Defaults to localhost:8081)
   - Your choice of Mendix model source (`mxcli` or `StudioPro MCP`)
   - The path to your Mendix project (if using mxcli)

3. **Fetch Skills and Binaries**
   Once setup completes, run:
   ```bash
   npm run update
   # Or on Windows PowerShell:
   .\update.ps1
   ```
   This downloads the latest `mxcli` binary into `bin/` and the latest Menditect skills into `skills/`.

   *(Tip: You can also update them separately: `npm run update:skills` or `npm run update:mxcli`)*

## Start Testing!
Open this workspace in your favorite AI code editor (Cursor, VS Code + Copilot) or run a CLI agent (Claude Code). The agent will automatically discover the `.vscode/mcp.json` or `.cursor/mcp.json` configurations generated for you.

You can ask the agent:
> "Run my MTA test cases and analyze any failures."
> "Design a new test case for the Sales.Customer object."
