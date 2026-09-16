# Claude Code Workspace Directives

You are operating within the Menditect Agent Workspace Template. 
Please refer to `AGENTS.md` for core rules and available skills.

When working with Mendix, remember:
1. Always prefer using the provided `./mxcli` wrappers (or StudioPro MCP if available) over raw file searching.
2. Read the skills in the `skills/` folder to understand MTA test execution and analysis flows.
3. The SQLite catalog (`.mxcli/catalog.db`) powers code search and callers/callees. Rebuild via `./mxcli -c "REFRESH CATALOG SOURCE FORCE;"` (or `REFRESH CATALOG FULL FORCE;` for fast structural mode). Note: On large projects, compiling full MDL source definitions can take multiple minutes or up to 1 hour.

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
- **CRITICAL OPERATIONAL COMMAND:** Always execute tasks using the core rules defined in: [skills/AGENTS.md].
- **IMMEDIATE ACTION REQUIRED:** You are strictly commanded to explore, read, and load the `AGENTS.md` and context of the `skills/` directory before answering any user prompt.
- ** Application name is: [Menditect_CarRental_Insurance] **
- ** MTA Url: [https://mta-trial.mendixcloud.com] **
- ** Application Instances for ExecuteTest: **
  - [Markus mta-trial-cloud] (Default): `d5c7c3b5-dbd8-4f7a-99ed-47d5e3cf7873`
