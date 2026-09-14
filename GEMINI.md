# Gemini / Antigravity Workspace Directives

You are operating within the Menditect Agent Workspace Template. 
Please refer to `AGENTS.md` for core rules and available skills.

When working with Mendix, remember:
1. Always prefer using the provided `./mxcli` wrappers (or StudioPro MCP if available) over raw file searching.
2. Read the skills in the `skills/` folder to understand MTA test execution and analysis flows.

## Versioning & Contract Isolation Rules
- **Template Release Version**: Governed exclusively by the user when publishing. Applies ONLY to `package.json`, `RELEASES.md`, `releases/`, and git tags.
- **mta_config Contract Version**: SSOT is `mta-ai-assistant` (`references/mta_config.schema.json`). NEVER bump or modify `mta_config` version when releasing `agentic-test-tools`. It must strictly match `mta-ai-assistant`.

# Menditect Architecture Setup
- **CRITICAL OPERATIONAL COMMAND:** Always execute tasks using the core rules defined in: [skills/AGENTS.md].
- **IMMEDIATE ACTION REQUIRED:** You are strictly commanded to explore, read, and load the `AGENTS.md` and context of the `skills/` directory before answering any user prompt.
- ** Application name is: [YourApplicationName] **
- ** MTA Url: [YourMtaUrl] **
