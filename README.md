# Menditect Agent Workspace Template

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Built by Menditect](https://img.shields.io/badge/Maintained%20by-Menditect%20B.V.-00a4e4.svg)](https://menditect.com)

A plug-and-play Customer Workspace Template for building, designing, and running automated Mendix tests using AI Agents (such as Cursor, Claude Code, GitHub Copilot / Codex, Antigravity / Gemini, Cline) powered by Menditect Test Automation (MTA).

---

## Architecture: Tools vs. Skills

To understand how this workspace functions, it helps to understand the three distinct layers:

```
+------------------------------------------------------------------------+
|                        AI Agent (Cursor, Claude, Copilot)              |
+-------------------------------+-+--------------------------------------+
                                | |
        (1) Reads "How to test" | | (2) Calls "Tools"
                                v v
+------------------------------+ +---------------------------------------+
|     Agentic Test Skills      | |       Menditect Agent Workspace       |
|  (Menditect/agentic-skills)  | |         (agentic-test-tools)          |
+------------------------------+ +---------------------------------------+
| - MTA Test Design Guidelines | | - MTA MCP Bridge (mta-proxy.js)       |
| - Step Sequencing Logic      | | - MTA Plugin MCP Bridge (localhost)   |
| - Assertion Strategies       | | - Mendix Model Wrappers (mxcli / SP)  |
| - Error Diagnosis Rules      | | - Multi-Agent IDE configs (.vscode/..)|
+------------------------------+ +-------------------+-------------------+
                                                     |
                                                     | (3) Inspects Model
                                                     v
                                 +---------------------------------------+
                                 |               mxcli                   |
                                 |         (mendixlabs/mxcli)            |
                                 +---------------------------------------+
                                 | Reads Mendix .mpr (Entities, Pages,   |
                                 | Microflows) outside of Studio Pro     |
                                 +---------------------------------------+
```

1. **The Tools Workspace (This Repository - `agentic-test-tools`)**:
   Provides the runtime environment: the stdio-to-HTTP/SSE proxies, restart-resilience safeguards, environment variable management, and IDE configurations for your AI agents.
2. **The Skills Knowledge Base ([`Menditect/agentic-test-skills`](https://github.com/Menditect/agentic-test-skills))**:
   The MCP tools alone are not enough. The MTA MCP server exposes raw primitives (such as `CreateTestCase`, `CreateObjectActionTestStep`). Without Menditect's skills, an AI agent does not know how to construct valid MTA test cases, how to locate widgets on pages, or how to diagnose execution failures. These skills are automatically synchronized into `./skills/` from the upstream `agentic-test-skills` repository.
3. **The Mendix Model Inspector ([`mendixlabs/mxcli`](https://github.com/mendixlabs/mxcli))**:
   Developed by Mendix Labs, this CLI binary parses your local Mendix `.mpr` project file so the AI agent can inspect your domain model, microflows, and pages without needing Studio Pro open.

---

## Highlights

- **60-Second Setup Wizard**: Interactive CLI script auto-detects your Mendix `.mpr` project, configures environment endpoints, and generates ready-to-use IDE configurations.
- **Resilient MCP Proxy**: Automatically handles Mendix application restarts and offline states. If your Mendix app reboots during microflow edits, the proxy prevents your AI agent from crashing and reconnects automatically.
- **Granular Upstream Updates**: Separate update commands for Menditect Skills (frequent releases) and Mendix Labs `mxcli` (occasional releases).
- **Team Collaboration Ready**: Machine-specific states, downloaded binaries, and IDE configurations are pre-configured in `.gitignore`, allowing entire QA/development teams to collaborate on the same repository cleanly.
- **Zero External Dependencies**: All proxy and tooling scripts use pure Node.js built-ins (`http`, `https`, `fs`, `readline`, `child_process`). No `npm install` or massive `node_modules` folders required.

---

## Prerequisites

Before starting, ensure you have:
1. **[Node.js](https://nodejs.org/) (v18+)** installed (required to run the setup script and local MCP proxies).
2. **[Git](https://git-scm.com/)** installed (used to sync upstream testing skills).
3. Access to an MTA instance:
   - **MTA Trial**: `https://mta-trial.mendixcloud.com/primitivetools/mcp` (free and ready to use).
   - **Your Organization's MTA Cloud/Private Instance**.
4. A Mendix application under test (with the **MTA Plugin** installed, typically running on `http://localhost:8081`).

---

## Quickstart & Setup Instructions

### Step 1: Clone or Use This Template
Create your own repository using this template on GitHub by clicking **"Use this template"**, or clone it locally:

```bash
git clone https://github.com/your-org/your-mta-agent-workspace.git
cd your-mta-agent-workspace
```

### Step 2: Run the Setup Wizard
Run the interactive setup wizard:

```bash
npm run setup
```
*(Windows PowerShell users can alternatively run `.\setup.ps1`)*

The wizard will guide you through:
- **MTA Base URL**: Enter your MTA URL (or press Enter to use the default MTA Trial).
- **MTA Plugin URL & Token**: Defaults to `http://localhost:8081/plugin/mcp` and `Bearer 1`.
- **Mendix Model Information Source**:
  - `[1] mxcli` *(Recommended for headless/CLI/CI)*: Inspects `.mpr` directly without needing Studio Pro open. The wizard will prompt for your project directory and auto-detect your `.mpr` file.
  - `[2] Studio Pro MCP`: Connects live to Studio Pro 11.10+ built-in MCP server (`http://localhost:7782/mcp`).

The setup wizard automatically creates your local `.env`, `mta_config.json`, and dynamic IDE configurations in `.vscode/mcp.json`, `.cursor/mcp.json`, and `.claude/settings.json`.

### Step 3: Fetch Skills and Binaries
Download the official Menditect MTA skills and the platform-specific `mxcli` binary:

```bash
npm run update
```
*(Windows PowerShell users can run `.\update.ps1`)*

### Step 4: Verify Your Setup
Run the built-in diagnostic tool to verify MCP server connectivity:

```bash
npm run verify
```

---

## Keeping Up to Date (Skills vs. mxcli)

Because Menditect Skills and Mendix Labs `mxcli` are maintained by different organizations and released on different cadences, you can update them independently:

| Component | Maintained By | Update Frequency | Command (npm) | Command (PowerShell) |
| :--- | :--- | :--- | :--- | :--- |
| **MTA Skills** (`./skills/`) | **Menditect B.V.** | **Frequent** (new patterns, MTA features) | `npm run update:skills` | `.\update-skills.ps1` |
| **`mxcli` Binary** (`./bin/`) | **Mendix Labs** | **Periodic** (new Mendix version support) | `npm run update:mxcli` | `.\update-mxcli.ps1` |
| **Everything** | Both | When updating entire workspace | `npm run update` | `.\update.ps1` |

None of these updates will ever overwrite your custom test configurations, `.env`, or test scripts.

See [RELEASES.md](RELEASES.md) for changes and version history of this workspace template.

---

## Using with AI Agents & IDEs

Open this workspace in your favorite agentic IDE or CLI:

### 1. Cursor
- Cursor will automatically detect `.cursor/mcp.json`.
- The `mta` and `mta_plugin` tools will be available in chat and composer.
- Point Cursor to `AGENTS.md` for core testing guidelines.

### 2. VS Code / GitHub Copilot / Cline
- VS Code automatically loads MCP servers from `.vscode/mcp.json`.
- Copilot / Codex follows directives in `.github/copilot-instructions.md`.

### 3. Claude Code & Claude Desktop
- **Claude Code (CLI)**: Automatically loads `.claude/settings.json` and reads `CLAUDE.md`.
- **Claude Desktop**: Copy the server definitions from `config/mcp-mxcli.json` (or `.vscode/mcp.json`) into your `claude_desktop_config.json`.

### 4. Antigravity / Gemini
- Reads workspace rules in `GEMINI.md` and `AGENTS.md`.

---

## Example Agent Prompts

Once your agent is running with MTA tools loaded, you can ask it to perform testing workflows:

- **Design Tests**:
  > "Analyze the `Sales.Customer` entity and design an MTA test case covering customer creation with validation checks."
- **Inspect App Model**:
  > "Use mxcli to describe the microflow `ACT_SubmitOrder` and check what parameters it accepts."
- **Execute & Analyze**:
  > "Run the test suite 'OrderProcessing' and analyze the failure reasons if any steps fail."
- **Install & Verify MTA Plugin**:
  > "Check if the MTA Plugin is active on localhost:8081 and verify that test execution tools respond."

---

## Repository Structure

```
agentic-test-tools/
├── .claude/                   # Claude Code MCP configurations (gitignored)
├── .cursor/                   # Cursor MCP configurations (gitignored)
├── .github/                   # Copilot rules and GitHub CI workflows
├── .vscode/                   # VS Code MCP configurations (gitignored)
├── bin/                       # Auto-downloaded mxcli binary from mendixlabs (gitignored)
├── config/                    # Portable MCP configuration templates
├── docs/                      # In-depth setup, agent, and model guides
│   ├── AGENT_COMPATIBILITY.md
│   ├── GETTING_STARTED.md
│   └── MODEL_SOURCE_GUIDE.md
├── releases/                  # Release notes per version
├── scripts/
│   ├── create-release.js      # Release note scaffolding script
│   ├── mta-proxy.js           # Zero-dependency stdio-to-HTTP/SSE bridge & restart protector
│   ├── setup.js               # Interactive CLI setup wizard
│   ├── sync-skills.js         # Dedicated Menditect skills updater
│   ├── sync-mxcli.js          # Dedicated Mendix Labs mxcli updater
│   ├── sync-upstream.js       # Unified updater
│   └── verify-setup.js        # MCP connectivity verification tool
├── skills/                    # Auto-synced Menditect skills (gitignored)
├── AGENTS.md                  # Master orchestrator rulebook for all AI agents
├── CLAUDE.md                  # Claude specific workspace directives
├── GEMINI.md                  # Gemini / Antigravity workspace directives
├── RELEASES.md                # Release history and index
├── mxcli.bat / .ps1 / .sh     # Smart wrappers auto-injecting configured .mpr path
├── setup.ps1                  # Native Windows setup entrypoint
├── update.ps1                 # Native Windows full update entrypoint
├── update-skills.ps1          # Native Windows skills-only update entrypoint
├── update-mxcli.ps1           # Native Windows mxcli-only update entrypoint
├── package.json               # Runner aliases (npm run setup/update/verify/release)
└── README.md                  # Workspace documentation
```

---

## Release Notes

Release notes and upgrade instructions are tracked in [RELEASES.md](RELEASES.md).

---

## License & Copyright

Licensed under the **Apache License, Version 2.0**.

**Copyright 2026 Menditect B.V.** (https://menditect.com)

See [LICENSE](LICENSE) for the full license text.
