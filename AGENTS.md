# Agentic Test Workspace Orchestrator

You are operating within a Menditect Agent Workspace Template. 

## Environment Details
- Tools available: `mta`, `mta_plugin`, and potentially `StudioPro` (if running locally via MCP).
- Mendix App model info: Use the `./mxcli` wrappers (e.g. `./mxcli.bat`, `./mxcli.sh`) to inspect the project. They will automatically inject the configured Mendix project path.

## Core Rules & Skills
You must strictly follow the Menditect Test Automation skills.
Read the core instruction set located at: `skills/AGENTS.md`.

All Menditect MTA skills (like test design, analysis, installation) are located in the `skills/` directory. Check there for detailed step-by-step instructions when asked to design tests, fix errors, or execute test plans.

## Repository Architecture & Upstream SSOT
- **Skills Build Repository (`mta-ai-assistant`)**: The internal engineering repository meant for building MTA skills (work occurs on `development`). It is NOT the public contract source.
- **Official Public Skills Repository (`agentic-test-skills`)**: The official public repository (`https://github.com/Menditect/agentic-test-skills`) where MTA skills, contracts (`mta_config.schema.json`), and patterns are published.
- **Public Reference Rule**: In `agentic-test-tools`, you MUST ALWAYS refer to files, contracts, schemas, and skills from the public `agentic-test-skills` repository. NEVER refer to `mta-ai-assistant` in public documentation, contracts, schemas, release notes, or commit messages.
- **Template Release Version**: Governed exclusively by the user when publishing. Applies ONLY to `package.json`, `RELEASES.md`, `releases/`, and git tags.
- **mta_config Contract Version**: SSOT is `agentic-test-skills` (`references/mta_config.schema.json`). NEVER bump or modify `mta_config` version when releasing `agentic-test-tools`. It must strictly match `agentic-test-skills`.

# Menditect Architecture Setup
- **CRITICAL OPERATIONAL COMMAND:** Always execute tasks using the core rules defined in: [skills/AGENTS.md].
- **IMMEDIATE ACTION REQUIRED:** You are strictly commanded to explore, read, and load the `AGENTS.md` and context of the `skills/` directory before answering any user prompt.
- ** Application name is: [YourApplicationName] **
- ** MTA Url: [YourMtaUrl] **
