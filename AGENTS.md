# Agentic Test Workspace Orchestrator

You are operating within a Menditect Agent Workspace Template. 

## Environment Details
- Tools available: `mta`, `mta_plugin`, and potentially `StudioPro` (if running locally via MCP).
- Mendix App model info: Use the `./mxcli` wrappers (e.g. `./mxcli.bat`, `./mxcli.sh`) to inspect the project. They will automatically inject the configured Mendix project path.
- Mendix Project Catalog: The SQLite catalog (`.mxcli/catalog.db`) powers code search (`./mxcli search`), callers/callees (`./mxcli callers`), references (`./mxcli refs`), and MTA test element analysis. If missing or out-of-date, rebuild it via `./mxcli -c "REFRESH CATALOG SOURCE FORCE;"` (or `REFRESH CATALOG FULL FORCE;` for fast structural mode). Note: On large projects, compiling full MDL source definitions can take multiple minutes or up to 1 hour.

## Core Rules & Skills
You must strictly follow the Menditect Test Automation skills.
Read the core instruction set located at: `skills/AGENTS.md`.

All Menditect MTA skills (like test design, analysis, installation) are located in the `skills/` directory. Check there for detailed step-by-step instructions when asked to design tests, fix errors, or execute test plans.

## Skills Immutability & Customization Rule
- Official MTA skills in `skills/` are managed upstream and are completely replaced during updates to prevent orphan files.
- NEVER make inline modifications to official MTA skills in `skills/`. Any inline edits will be erased on update.
- Custom organization or domain skills must always be added as separate, new skill folders alongside the MTA skills.

## Repository Architecture & Upstream SSOT
- **Skills Build Repository (`mta-ai-assistant`)**: The internal engineering repository meant for building MTA skills (work occurs on `development`). It is NOT the public contract source.
- **Official Public Skills Repository (`agentic-test-skills`)**: The official public repository (`https://github.com/Menditect/agentic-test-skills`) where MTA skills, contracts (`mta_config.schema.json`), and patterns are published.
- **Public Reference Rule**: In `agentic-test-tools`, you MUST ALWAYS refer to files, contracts, schemas, and skills from the public `agentic-test-skills` repository. NEVER refer to `mta-ai-assistant` in public documentation, contracts, schemas, release notes, or commit messages.
- **Template Release Version**: Governed exclusively by the user when publishing. Applies ONLY to `package.json`, `RELEASES.md`, `releases/`, and git tags.
- **mta_config Contract Version**: SSOT is `agentic-test-skills` (`references/mta_config.schema.json`). NEVER bump or modify `mta_config` version when releasing `agentic-test-tools`. It must strictly match `agentic-test-skills`.

## Upstream Skills & Tools Update Protocol
- When asked to update `skills` or `mxcli` (or check for updates):
  1. Inspect local vs remote versions across all skills (`AGENTS.md` orchestrator and individual `SKILL.md` domain skills) and `mxcli` (e.g. via `node scripts/sync-upstream.js --check` or `npm run update:check`).
  2. Present the detailed comparison table to the user showing which specific skills have updates and which are already up-to-date.
  3. Prompt the user for explicit confirmation before applying any updates.

# Menditect Architecture Setup
- **CRITICAL OPERATIONAL COMMAND:** Always execute tasks using the core rules defined in `skills/AGENTS.md`.
- **ENVIRONMENT SSOT:** All environment configuration (Application name, MTA Base URL, Default App Instance, and ApplicationInstanceToken) must be dynamically loaded from `mta_config.json`.
