# GitHub Copilot & Codex Instructions

You are operating within the Menditect Agent Workspace Template. 
Please refer to `AGENTS.md` for core rules and available skills.

When working with Mendix, remember:
1. Always prefer using the provided `./mxcli` wrappers (or StudioPro MCP if available) over raw file searching.
2. Read the skills in the `skills/` folder to understand MTA test execution and analysis flows.

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
