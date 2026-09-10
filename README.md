# Menditect Agent Workspace Template

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Built by Menditect](https://img.shields.io/badge/Maintained%20by-Menditect%20B.V.-00a4e4.svg)](https://menditect.com)

A plug-and-play Customer Workspace Template for building, designing, and running automated Mendix tests using AI Agents (such as Cursor, Claude Code, GitHub Copilot / Codex, Antigravity / Gemini, Cline) powered by Menditect Test Automation (MTA).

> [!WARNING]
> **Community & Experimental Tooling (Vibe-Engineered).**  
> This project has been vibe-coded and developed in collaboration with AI coding assistants. It is provided strictly **"AS IS"** without warranties or conditions of any kind.
> 
> Menditect B.V. provides **no official support, SLAs, or guarantees** if tools or workflows fail to operate as expected. Neither Menditect B.V. nor its contributors shall be held liable for any damages, corrupted Mendix project files, data loss, or unintended actions resulting from the use of this repository (as set forth in the Apache License 2.0).
> 
> **Prudent Precautions:**
> - Always work on a copy of your Mendix project or ensure your working tree is fully committed to version control (Git) before running agents.
> - Never run `mxcli` against an `.mpr` project file while it is actively open in Mendix Studio Pro.
> - Carefully review any AI-generated test cases, test steps, and execution plans prior to applying or executing them.

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
- **Self-Healing MCP Proxy (`mta-proxy.js`)**: Automatically detects Mendix application and Studio Pro restarts. If your Mendix app or Studio Pro reboots or loses its session, the proxy transparently re-initializes the MCP handshake in the background, invalidates stale sessions, buffers pending tool calls with an extended restart window, and prevents AI agents from crashing or losing tool connections.
- **Granular Upstream Updates**: Separate update commands for Menditect Skills (frequent releases) and Mendix Labs `mxcli` (occasional releases).
- **Team Collaboration Ready**: Machine-specific states, downloaded binaries, and IDE configurations are pre-configured in `.gitignore`, allowing entire QA/development teams to collaborate on the same repository cleanly.
- **Zero External Dependencies**: All proxy and tooling scripts use pure Node.js built-ins (`http`, `https`, `fs`, `readline`, `child_process`). No `npm install` or massive `node_modules` folders required.

---

## Prerequisites

Before starting, ensure you have:
1. **[Node.js](https://nodejs.org/) (v18+)** installed (required to run the setup script and local MCP proxies).
2. **[Git](https://git-scm.com/)** installed (used to sync upstream testing skills).
3. Access to an MTA instance and an authentication token:
   - **MTA URL**: `https://mta-trial.mendixcloud.com/primitivetools/mcp` (or your private/cloud MTA URL).
   - **MTA Bearer Token**: An authorized user or API Bearer token (required by MTA MCP).
4. A Mendix application under test (with the **MTA Plugin** installed, typically running on `http://localhost:8081`, with a configured Bearer token).

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
- **Workspace Location**:
  - `[1] Dedicated Tools Workspace (Clone Root)`: Run your AI agent directly from the cloned `agentic-test-tools` directory.
  - `[2] Direct Mendix Project Workspace`: Run your AI agent directly inside your Mendix project directory.
  - `[3] Other Custom Directory`: Run your AI agent from an external directory or monorepo root.
- **Automated Mendix Settings Discovery via `mxcli`**:
  - When a `.mpr` project is detected, the setup wizard automatically inspects the model settings to discover pre-configured constants across your Mendix Studio Pro configurations:
    - `MtaPluginModule.ApplicationInstanceToken`: Discovers all application instance tokens (e.g. `local`, `test`, `cloud`).
    - `MtaPluginModule.MTAConnectionUrl`: Scoped per configuration (WebSocket `wss://` / `ws://` converted to `https://` / `http://`).
    - `ApplicationRootUrl`: Uses the runtime URL of the selected configuration to construct the MTA Plugin MCP endpoint (`<runtimeUrl>/plugin/mcp`, e.g. `http://localhost:8081/plugin/mcp`).
    - `MtaPluginModule.McpServerAccessToken`: Reads the plugin MCP server access token from the chosen configuration's constants and formats it as a Bearer token.
  - **Flexible Instance Selection**: You can import all discovered instances (`all` or Enter), pick specific instances using comma-separated numbers or ranges (e.g. `6` or `1, 3, 6` or `1-3, 6`), or skip to manual entry (`none`).
  - **Configuration-Scoped Connection Settings**: When you select your active default instance, the wizard automatically pre-fills the MTA URL, Plugin URL, and Plugin Bearer Token that belong specifically to that selected configuration profile.
- **MTA Application Instance Tokens (`ExecuteTest`)**:
  - Running tests via MTA's `ExecuteTest` requires an `ApplicationInstanceToken` (UUID provided by MTA Portal > Application > Application Instances).
  - If not discovered from the Mendix model, the wizard prompts for how many instances you have (minimum 1) and asks for each instance's name and token, setting `MTA_APP_INSTANCE_TOKEN`.
- **MTA Base URL**: Enter your MTA URL (pre-filled with the discovered URL of your selected instance, or defaults to MTA Trial).
- **MTA Bearer Token**: Enter your MTA Bearer token (required; raw tokens are automatically formatted with `Bearer `).
- **MTA Plugin URL & Token**: Pre-filled from your selected configuration's runtime URL (`ApplicationRootUrl` + `/plugin/mcp`) and access token constant (`MtaPluginModule.McpServerAccessToken`), or defaults to `http://localhost:8081/plugin/mcp` and `Bearer 1`.
- **Mendix Model Information Source**:
  - `[1] mxcli` *(Recommended for headless/CLI/CI)*: Inspects `.mpr` directly without needing Studio Pro open. The wizard prompts for your project directory and auto-detects your `.mpr` file.
  - `[2] Studio Pro MCP`: Connects live to Studio Pro 11.10+ built-in MCP server (`http://localhost:7782/mcp`).
- **Application Name**: Automatically derived from your Mendix `.mpr` filename (e.g. `BillingApp.mpr` becomes `BillingApp`), with interactive confirmation.

The setup wizard automatically:
1. Creates your local `.env` and `mta_config.json` (strictly adhering to [mta_config.schema.json](mta_config.schema.json) and the [MTA Configuration Specification](docs/mta-config-reference.md)) with your configured endpoints, tokens, app instances, and workspace targets.
2. Generates and merges IDE configurations in `.vscode/mcp.json`, `.vscode/settings.json`, `.cursor/mcp.json`, and `.claude/settings.json` in your selected workspace without overwriting existing settings or permissions.
3. Appends the **Menditect Architecture Setup** block (including the application instances mapping) to the project-level `AGENTS.md` (and other agent files), preserving existing rules.
4. Deploys local `./mxcli` wrappers into your workspace so model inspection commands work out of the box.

---

### Workspace Modes: Choosing Where to Run Your Agent

You can choose where your AI agent (VS Code, Cursor, Claude Code) opens and executes:

| Consideration | Option 1: Tools Workspace (Clone Root) | Option 2: Mendix Project Workspace | Option 3: Custom Directory |
| :--- | :--- | :--- | :--- |
| **Active IDE Workspace** | `agentic-test-tools` folder | Local Mendix Project folder | Any custom directory |
| **Mendix Project Code** | Accessed via `mxcli` / relative paths | Directly open in IDE explorer | Depends on directory |
| **MTA Skills Location** | `<clone_root>/skills/` | Module skills or `./skills/` | `<custom>/skills/` |
| **Mendix 11.12+ Module Support** | N/A | Integrates with `skillssource/_modules` (requires Mendix 11.12+) | N/A |
| **Local ./mxcli Runner** | Root `./mxcli` | Local `./mxcli` in Mendix project | Local `./mxcli` in custom dir |
| **Execution Plans Folder** | `<clone_root>/menditect-output/execution-plans/` (+ `archive/`) | `<mendix_project>/menditect-output/execution-plans/` (+ `archive/`) | `<custom>/menditect-output/execution-plans/` (+ `archive/`) |
| **Git Repository Impact** | Zero impact on Mendix repo | Files tracked & committed in Mendix repo | Isolated to custom dir |

#### Exact File Placement by Option

| File / Directory | Option 1 (Tools Clone Root) | Option 2 (Mendix Project Folder) | Option 3 (Custom Directory) |
| :--- | :--- | :--- | :--- |
| **MTA Skills** | `agentic-test-tools/skills/` | `skillssource/_modules/menditect_agentictestskills/` (if Mendix 11.12+ and module installed) or `skills/` | `<custom>/skills/` |
| **Execution Plans** | `agentic-test-tools/menditect-output/execution-plans/` | `<mendix_project>/menditect-output/execution-plans/` | `<custom>/menditect-output/execution-plans/` |
| **Archived Plans** | `agentic-test-tools/menditect-output/execution-plans/archive/` | `<mendix_project>/menditect-output/execution-plans/archive/` | `<custom>/menditect-output/execution-plans/archive/` |
| **Agent Directives** | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | Appends Menditect block to existing `AGENTS.md` (or creates it) | Appends or creates `AGENTS.md` |
| **IDE MCP Configs** | `.vscode/mcp.json`, `.cursor/mcp.json` | Merged into `<mendix_project>/.vscode/` and `.cursor/` | Merged into `<custom>/.vscode/` and `.cursor/` |
| **Tool Permissions** | `.claude/settings.json` | Merged into `<mendix_project>/.claude/settings.json` (preserves existing permissions) | Merged into `<custom>/.claude/settings.json` |
| **Local Runners** | `mxcli.bat`, `mxcli` | Deploys local `mxcli.bat` & `./mxcli` into `<mendix_project>/` | Deploys local runners into `<custom>/` |
| **Environment / Config** | `mta_config.json`, `.env` | `mta_config.json`, `.env` placed in `<mendix_project>/` | Placed in `<custom>/` |

#### Important Notice for Mendix Git Repositories (Option 2)
Typical Mendix projects maintain their own version control repository (Git, GitHub, GitLab, or Mendix Team Server).
When you choose **Option 2 (Direct Mendix Project Workspace)**:
- All generated and updated files (skills, local `./mxcli` wrappers, execution plan directories, and IDE configurations) reside inside your Mendix project folder.
- These files will be detected by `git status` in your Mendix project.
- Committing these files allows your entire development team to share testing skills, execution plans, and MCP agent configurations directly with the app.
- If you prefer not to commit machine-specific files, you can add `.env` or IDE configuration folders to your Mendix project's `.gitignore`.

#### Mendix Version Requirement for Module-Level Skills
Module-level skills (`skillssource/_modules/menditect_agentictestskills`) require **Mendix 11.12 or higher**:
- The setup wizard automatically inspects the `.mpr` header to determine your Mendix Studio Pro version.
- **Mendix 11.12+**: If the `Menditect_AgenticTestSkills` Marketplace module is detected, skills are placed directly into `skillssource/_modules/menditect_agentictestskills/`.
- **Mendix < 11.12** (or if the Marketplace module is not installed): Skills are safely placed as project-level skills in `<mendix_project>/skills/`, ensuring full compatibility with earlier Mendix versions.

#### Option 1: Dedicated Tools Workspace (Clone Root)
- **Description**: Open `agentic-test-tools` in your IDE. This repository acts as a centralized testing station that controls testing against your Mendix app.
- **Pros**:
  - Keeps your Mendix project repository 100% clean from external agent scripts, proxy processes, and IDE config files.
  - Acts as a multi-project cockpit: test different Mendix applications simply by changing `mta_config.json`.
  - Isolate skills and tool dependencies from your application version control.
- **Cons**:
  - Requires maintaining two folders (your Mendix app and this tools repository).
  - Agent edits to project files require explicit relative or absolute file paths.

#### Option 2: Direct Mendix Project Workspace (Mendix Project Folder)
- **Description**: Open your Mendix project root folder directly in your IDE (VS Code, Cursor, or Claude Code). The setup wizard configures the Mendix project workspace with the required MCP proxies, skills, and execution plan directories.
- **Pros**:
  - Seamless developer workflow: the AI agent has direct access to all project resources, domain model files, Java actions, and JavaScript widgets.
  - Native Mendix 11 `skillssource` Integration: When running Mendix 11.12+ with the `Menditect_AgenticTestSkills` Marketplace module, skills are installed directly into `skillssource/_modules/menditect_agentictestskills/` and versioned with your project.
  - Zero-effort `./mxcli` execution: local `./mxcli.bat` and `./mxcli` runners are deployed into your Mendix project root.
  - Safe merging: existing `.claude/settings.json` permissions and `.vscode/settings.json` properties are preserved.
  - Execution plan traceability: test plans and archives are stored directly alongside the project.
- **Cons**:
  - Adds files (`.vscode/mcp.json`, `AGENTS.md`, `./mxcli`) to your Mendix project repository.
  - The `agentic-test-tools` repository must remain cloned on disk because the IDE connects to its proxy.

#### Option 3: Other Custom Directory
- **Description**: Specify an external directory, such as a parent folder containing both the Mendix project and test suites, or a monorepo root.
- **Pros**:
  - Maximum flexibility for complex team setups, monorepos, or automated CI runners.
- **Cons**:
  - Requires manual path verification.

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
│   ├── MODEL_SOURCE_GUIDE.md
│   └── mta-config-reference.md # Canonical MTA configuration specification
├── releases/                  # Release notes per version
├── scripts/
│   ├── create-release.js      # Release note scaffolding script
│   ├── mta-proxy.js           # Self-healing stdio-to-HTTP/SSE bridge & session recovery manager
│   ├── setup.js               # Interactive CLI setup wizard
│   ├── sync-skills.js         # Dedicated Menditect skills updater
│   ├── sync-mxcli.js          # Dedicated Mendix Labs mxcli updater
│   ├── sync-upstream.js       # Unified updater
│   └── verify-setup.js        # MCP connectivity & schema verification tool
├── skills/                    # Auto-synced Menditect skills (gitignored)
├── AGENTS.md                  # Master orchestrator rulebook for all AI agents
├── CLAUDE.md                  # Claude specific workspace directives
├── GEMINI.md                  # Gemini / Antigravity workspace directives
├── RELEASES.md                # Release history and index
├── mta_config.schema.json     # JSON schema specification for mta_config.json
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

## Disclaimer & Support Policy

This repository, its helper scripts, proxies, and multi-agent configurations are **experimental and vibe-engineered** using AI coding assistants. 

- **No Official Support:** Menditect B.V. does not provide technical support, SLAs, bug fixes, or consulting services for this template or its scripts. If you encounter issues, you are encouraged to debug, modify, and contribute improvements back to the community repository.
- **As-Is Provision:** In accordance with Sections 7 and 8 of the Apache License 2.0, the software is provided on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
- **Limitation of Liability:** In no event and under no legal theory shall Menditect B.V. or any contributor be liable for any direct, indirect, special, incidental, or consequential damages (including project file corruption, lost data, work stoppage, or system downtime).
- **Safe Working Practices:** AI agents can execute command-line tools and modify files. Always ensure your Mendix projects are committed to Git so that any unwanted modifications can be reverted instantly.

---

## License & Copyright

Licensed under the **Apache License, Version 2.0**.

**Copyright 2026 Menditect B.V.** (https://menditect.com)

See [LICENSE](LICENSE) for the full license text.
