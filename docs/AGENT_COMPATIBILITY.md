# Agent Compatibility Guide

This workspace is designed to work seamlessly with the most popular AI agents. During setup (`npm run setup`), configurations are automatically generated for each of the tools below.

### 1. Cursor
Cursor natively supports standard `mcp.json` definitions.
- **Config file**: `.cursor/mcp.json` (auto-generated)
- **Instructions**: Cursor will read `AGENTS.md` automatically if you reference it or set it in `.cursorrules`.

### 2. VS Code (Copilot / Codex / Cline)
VS Code can connect to MCP servers via compatible extensions.
- **Config file**: `.vscode/mcp.json` (auto-generated)
- **Instructions**: VS Code Copilot reads `.github/copilot-instructions.md`.

### 3. Claude Code
Anthropic's terminal agent.
- **Config file**: `.claude/settings.json` (auto-generated)
- **Instructions**: It will read `CLAUDE.md`.

### 4. Claude Desktop
Claude Desktop requires you to add the MCP servers to its global configuration.
- **Instructions**: Open your Claude Desktop config (usually `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS) and copy the contents from your generated `.vscode/mcp.json`.

### 5. Gemini / Antigravity
Google's advanced agentic coding tools.
- **Instructions**: Reads `GEMINI.md`. Ensure your global MCP configuration points to the scripts in this workspace.
