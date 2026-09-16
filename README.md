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
- **Automated Mendix AI Scaffolding (`mxcli init`)**: Seamlessly initializes 72+ Mendix AI skills (`.ai-context/skills/`), project architecture store (`docs/brain/`), lint rules, and AI assistant configs (Claude Code, Cursor, Copilot, Windsurf) without clobbering existing instructions or sensitive credentials.
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
  - `[1] Dedicated Tools Workspace (Clone Root)`: Run your AI agent directly from the cloned `agentic-test-tools` directory. The wizard initializes the 72+ Mendix AI skills (`.ai-context/skills/`) and local staging directory (`.mxcli/`) directly inside `agentic-test-tools`, guaranteeing **ZERO files created or modified in your Mendix project repository**. (Optionally prompts if you also wish to scaffold the external Mendix project).
  - `[2] Direct Mendix Project Workspace`: Run your AI agent directly inside your local Mendix project directory. The wizard runs `mxcli init` inside your Mendix project, placing `.ai-context/skills/`, `docs/brain/`, lint configurations, and tool permissions directly into the Mendix app repo so your entire team shares them.
  - `[3] Other Custom Directory`: Run your AI agent from an external directory or monorepo root.
- **Automated Mendix Settings Discovery via `mxcli`**:
  - When a `.mpr` project is detected, the setup wizard automatically inspects the model settings (automatically downloading the `mxcli` binary on-demand if not already present) to discover pre-configured constants across your Mendix Studio Pro configurations:
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
1. Creates your local `.env` (mode `0o600`) and `mta_config.json` (strictly adhering to [mta_config.schema.json](mta_config.schema.json) and the [MTA Configuration Specification](docs/mta-config-reference.md)) with your configured endpoints, tokens, app instances, and workspace targets.
2. Synchronizes official Menditect Agentic Test Skills from the public upstream repository (`Menditect/agentic-test-skills`) into your designated skills folder (`skills/` or module path), and aligns the canonical `mta_config.schema.json` contract.
3. Initializes or refreshes Mendix AI scaffolding via `mxcli init` (`.ai-context/skills/`, `docs/brain/`, and `.mxcli/`), preserving any pre-existing custom `AGENTS.md` instructions.
4. Generates and merges IDE configurations in `.vscode/mcp.json`, `.vscode/settings.json`, `.cursor/mcp.json`, and `.claude/settings.json` in your selected workspace without overwriting existing settings or permissions.
5. Appends the **Menditect Architecture Setup** block to the project-level `AGENTS.md` (and other agent files), commanding agents to dynamically load configuration from `mta_config.json` as the Single Source of Truth (SSOT).
6. Deploys local `./mxcli` wrappers into your workspace so model inspection commands work out of the box.
7. Compiles the Mendix project catalog (`.mxcli/catalog.db`) with full model metadata, activities, widgets, references, and MDL source definitions (`REFRESH CATALOG SOURCE FORCE`), providing advance duration warnings and interactive options for large projects.

---

<!-- BEGIN_SHARED_MTA_CONFIG_CONTRACT -->
## Configuration Contract (`mta_config.json`) & Resolution Hierarchy

All Menditect Agentic Test Skills strictly consume `mta_config.json` as the primary **Single Source of Truth (SSOT)** for workspace paths, MTA server endpoints, model discovery sources, and application instances. Sensitive authentication tokens (`MTA_MCP_AUTH_HEADER`, `PLUGIN_MCP_TOKEN`) are securely maintained in `.env`.

### Canonical JSON Structure (v1.5.0)

```json
{
  "$schema": "./mta_config.schema.json",
  "workspace_type": "clone_root",
  "workspace_dir": "C:\Projecten\mta-trial",
  "skills_dir": "C:\Projecten\mta-trial\skills",
  "skills_style": "standard",
  "mta_output_path": "C:\Projecten\mta-trial\menditect-output",
  "execution_plans_dir": "C:\Projecten\mta-trial\menditect-output\execution-plans",
  "mendix_version": "11.12.011",
  "application_name": "MyMendixApp",
  "mta_base_url": "https://mta-instance.mendixcloud.com",
  "mcp_endpoint": "https://mta-instance.mendixcloud.com/primitivetools/mcp",
  "plugin_mcp_url": "http://localhost:8081/plugin/mcp",
  "app_instances": [
    {
      "name": "Local Development",
      "token": "00000000-0000-0000-0000-000000000000",
      "mtaUrl": "https://mta-instance.mendixcloud.com",
      "runtimeUrl": "http://localhost:8081/",
      "pluginUrl": "http://localhost:8081/plugin/mcp",
      "pluginToken": "Bearer 1",
      "pluginPort": "8081"
    }
  ],
  "default_app_instance": "Local Development",
  "default_app_instance_token": "00000000-0000-0000-0000-000000000000",
  "model_source": "mxcli",
  "mendix_project_dir": "C:\Projects\MyMendixApp",
  "mendix_mpr_path": "C:\Projects\MyMendixApp\MyMendixApp.mpr"
}
```

### Core Properties Reference

| Field | Type | Description |
| :--- | :--- | :--- |
| `mta_base_url` | string (URI) | **(Required)** Base URL of the Menditect Test Automation web portal (e.g. `https://mta-instance.mendixcloud.com`). Used for clickable web navigation links. |
| `mcp_endpoint` | string (URI) | **(Required)** MCP endpoint URL for the MTA primitive tools server (`[mta_base_url]/primitivetools/mcp`). |
| `application_name` | string | **(Required)** Name of the target Mendix application in MTA. Eliminates manual application disambiguation prompts. |
| `execution_plans_dir` | string | **(Required)** Directory where active Execution Plans (`EP_*.md`) are stored and updated in-place. |
| `mendix_project_dir` | string | **(Required)** Absolute path to the target Mendix project folder containing the app model. |
| `mendix_mpr_path` | string | Absolute path to the Mendix `.mpr` project file used by `mxcli`. |
| `mta_auth_header` | string | *(Deprecated)* HTTP Authorization header (`Bearer <session_token>`) for authenticating with MTA server. Stored in `.env` as `MTA_MCP_AUTH_HEADER`. |
| `plugin_mcp_url` | string (URI) | Local runtime plugin MCP endpoint (`[ApplicationRootUrl]/plugin/mcp`) for sub-second in-memory exploratory test execution. |
| `plugin_mcp_token` | string | *(Deprecated)* Authorization header (e.g. `Bearer 1`) for the runtime plugin MCP endpoint. Stored in `.env` as `PLUGIN_MCP_TOKEN`. |
| `app_instances` | array | Discovered application runtime instances with `name`, `token`, `mtaUrl`, `runtimeUrl`, `pluginUrl`, `pluginToken`, and `pluginPort`. |
| `default_app_instance` | string | Name of the primary default application runtime instance. |
| `default_app_instance_token` | string (UUID) | MTA Application Instance Token used for executing tests via `ExecuteTest`. Eliminates manual prompts. |
| `model_source` | string | AST discovery mechanism: `"mxcli"` (headless offline `.mpr` inspection) or `"studiopro"` (Studio Pro live MCP server). |
| `execution_plans_archive_dir` | string | *(Deprecated)* Formerly used for archiving superseded plans. Replaced by in-place plan revisions tracked in Git. |
| `workspace_type` | string | Mode where the agent runs: `"clone_root"` (isolated tools workspace), `"mendix_project"` (direct Mendix project), or `"custom"`. |
| `skills_style` | string | Installation style: `"standard"` (project-level `skills/`) or `"mendix_module"` (Mendix 11.12+ `skillssource/_modules/menditect_agentictestskills`). |

### Automated Application Instance Token Resolution (`ExecuteTest`)

Executing test suites or test cases via the `ExecuteTest` MCP tool requires a valid `ApplicationInstanceToken`:
1. **Targeted Instance**: If the user targets a specific environment by name (e.g., *"run test on local"* or *"use instance Markus demo"*), the agent searches `app_instances[]` for a matching `name` and extracts its `token`.
2. **Default Instance**: Otherwise, the agent automatically uses `default_app_instance_token` from `mta_config.json`.
3. **Environment Variable Fallback**: If missing in `mta_config.json`, the agent falls back to `MTA_APPLICATION_INSTANCE_TOKEN` in `.env`.
4. **Interactive Prompt**: The agent prompts the user only if no instance token can be resolved across any source.

### Strict Configuration Resolution Hierarchy

When resolving configuration settings, AI agents must evaluate sources in this strict order of precedence:

1. **`mta_config.json` (Priority #1 - SSOT)**: Evaluates `mcp_endpoint`, `mta_base_url`, `app_instances`, `default_app_instance_token`, `mendix_mpr_path`, and `execution_plans_dir`. Backward-compatible fallback for `mta_auth_header`.
2. **Project `AGENTS.md`**: Reads `- ** MTA Url: <URL> **` and instance token mappings (`- [Name] (Default): <Token>`).
3. **Environment Variables (`.env` / process env)**: Primary secure storage for authentication headers (`MTA_MCP_AUTH_HEADER`, `PLUGIN_MCP_TOKEN`) and environment overrides (`MTA_MCP_ENDPOINT`, `PLUGIN_MCP_URL`, `MTA_APP_INSTANCE_TOKEN`, `MENDIX_MPR_PATH`).
4. **IDE Settings (`.vscode/settings.json`, `.cursor/mcp.json`)**: Reads `MTA_BASE_URL` and `MENDIX_PROJECT_PATH`.
5. **Session State (`mta_state.json`)**: Reads `mta_base_url`.
6. **Interactive Prompt**: Prompts the user on turn 1 only if a required setting is absent across all configuration sources.
<!-- END_SHARED_MTA_CONFIG_CONTRACT -->

---

## Skills Immutability & Customization Architecture

- **Orphan Prevention via Full Replacement**: When updating skills via `npm run update:skills` (or `npm run update`), the skills directory is completely purged and replaced with the official upstream release. This guarantees no obsolete or orphaned skill files remain after upstream refactoring.
- **No Inline Modifications in MTA Skills**: Never modify official MTA skill files inline. Any custom changes made directly within official MTA skills will be overwritten and erased upon the next update.
- **Custom Skills Isolation**: If your organization requires custom testing or domain skills, always create them as separate, independent skill folders (e.g. `skills/my-org-custom-skill/`) alongside the official MTA skills.

---

## Upstream Synchronization & Version Inspection

The workspace includes a version inspection mechanism that queries GitHub releases (`mendixlabs/mxcli`) and repository skill frontmatters (`Menditect/agentic-test-skills`) to compare local versions against remote versions before prompting the user to confirm:

```bash
# Check versions without downloading (Dry Run)
npm run update:check
# or via PowerShell
.\update.ps1 -Check

# Interactive Update (compares versions, presents table, asks for confirmation)
npm run update               # Update all components (skills + mxcli)
npm run update:skills        # Update MTA testing skills only
npm run update:mxcli         # Update mxcli binary only

# Non-interactive / Automation Flags
node scripts/sync-upstream.js --yes      # Auto-confirm and update if changes exist
node scripts/sync-upstream.js --force    # Force re-download even if already up to date
```

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
| **Execution Plans Folder** | `<clone_root>/menditect-output/execution-plans/` | `<mendix_project>/menditect-output/execution-plans/` | `<custom>/menditect-output/execution-plans/` |
| **Git Repository Impact** | Zero impact on Mendix repo | Files tracked & committed in Mendix repo | Isolated to custom dir |

#### Exact File Placement by Option

| File / Directory | Option 1 (Tools Clone Root) | Option 2 (Mendix Project Folder) | Option 3 (Custom Directory) |
| :--- | :--- | :--- | :--- |
| **MTA Skills** | `agentic-test-tools/skills/` | `skillssource/_modules/menditect_agentictestskills/` (if Mendix 11.12+ and module installed) or `skills/` | `<custom>/skills/` |
| **Execution Plans** | `agentic-test-tools/menditect-output/execution-plans/` | `<mendix_project>/menditect-output/execution-plans/` | `<custom>/menditect-output/execution-plans/` |
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

### Step 3: Refresh Skills and Binaries (Periodic Updates)
The setup wizard automatically synchronizes MTA skills on initial setup. To periodically refresh official Menditect MTA skills or update the platform-specific `mxcli` binary in an existing workspace, run:

```bash
npm run update
```
*(Windows PowerShell users can run `.\update.ps1`)*

### Step 4: Verify Your Setup
Run the built-in diagnostic tool to verify configuration compliance, token hygiene, and MCP server connectivity:

```bash
npm run verify
```

The verifier audits:
- `mta_config.json` compliance against the schema contract.
- Presence and integrity of Menditect Agentic Test Skills (`skills/`).
- Availability of the `mxcli` binary, initialization of Mendix AI skills (`.ai-context/skills/`), and presence of the `.mxcli/` operational staging folder.
- Security hygiene (verifies no sensitive Bearer tokens are stored in `.vscode/settings.json` or unignored in Git).
- Agent directives integrity (verifies `# Menditect Architecture Setup` blocks are intact).
- Live preflight connectivity for both `mta` and `mta_plugin` MCP endpoints.

### Restoring Overwritten Directives (`npm run setup:directives`)

If you upgraded `mxcli` or accidentally ran `mxcli init` directly in your workspace, `mxcli` may overwrite your root `AGENTS.md` or `CLAUDE.md` with default templates, removing the `# Menditect Architecture Setup` connection block.

You can instantly restore your directives without running through the interactive setup wizard:

```bash
npm run setup:directives
```

This re-injects the standardized Menditect Architecture Setup block into `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`, enforcing `mta_config.json` as the Single Source of Truth.

---

## Keeping Up to Date (Skills vs. mxcli)

Because Menditect Skills and Mendix Labs `mxcli` are maintained by different organizations and released on different cadences, you can update them independently:

| Component | Maintained By | Update Frequency | Command (npm) | Command (PowerShell) | What It Does |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MTA Skills** (`./skills/`) | **Menditect B.V.** | **Frequent** (new patterns, MTA features) | `npm run update:skills` | `.\update.ps1 -Skills` | Pulls latest skills from `agentic-test-skills` (fully replaces directory to eliminate orphans). |
| **`mxcli` & AI Skills** (`./bin/`, `.ai-context/`) | **Mendix Labs** | **Periodic** (new Mendix version support) | `npm run update:mxcli` | `.\update.ps1 -Mxcli` | Downloads latest binary and automatically runs `mxcli init --sync-skills` across active workspaces without touching custom directives. |
| **Everything** | Both | When updating entire workspace | `npm run update` | `.\update.ps1` | Runs both skill updates and mxcli binary synchronization in sequence. |

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

## Mendix Model Tooling & Project Catalog

The workspace includes wrappers (`./mxcli.bat` on Windows, `./mxcli` on Linux/macOS) that automatically inject your configured project path:

```bash
# Model inspection
./mxcli describe microflow Module.MicroflowName
./mxcli describe entity Module.EntityName
./mxcli search "Order"

# Catalog management
./mxcli -c "REFRESH CATALOG SOURCE FORCE;"   # Deep extraction with full MDL source definitions (recommended for MTA test analysis)
./mxcli -c "REFRESH CATALOG FULL FORCE;"     # Fast structural extraction (metadata, activities, widgets, strings)
```

> [!NOTE]
> `mxcli init` configures static AI scaffolding and skills (`.ai-context/skills/`). The SQLite database (`.mxcli/catalog.db`) is compiled via `REFRESH CATALOG`. On large enterprise applications with thousands of microflows and pages, deep extraction with `REFRESH CATALOG SOURCE` can take multiple minutes or up to 1 hour because it parses the full content of every document.

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
├── docs/                      # Technical specifications and references
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
├── update.ps1                 # Native Windows update entrypoint (-Skills, -Mxcli, or default all)
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
