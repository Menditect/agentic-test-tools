# Mendix Model Source Guide

Agents need to inspect your Mendix project (Microflows, Entities, Pages) to design accurate test cases. You have two choices for how agents read this data.

## Option 1: mxcli (Recommended for CLI / Headless)
`mxcli` is a command-line tool that parses your Mendix project `.mpr` file directly.
- **Pros**: Does not require Studio Pro to be open. Great for CI/CD or lightweight editors.
- **Cons**: Requires reading the file system directly.
- **How it works**: The workspace provides `mxcli.bat`, `mxcli.ps1`, and `mxcli.sh` wrappers. The AI agent will call these wrappers (e.g., `./mxcli describe entity Sales.Customer`) and the wrappers automatically inject your configured Mendix project path.

## Option 2: Studio Pro MCP (Recommended for Studio Pro users)
Studio Pro 11.10+ includes a built-in MCP server that exposes the model live.
- **Pros**: Agents see exactly what you see in Studio Pro, including unsaved changes.
- **Cons**: Studio Pro must be open and running the MCP server (Preferences > AI > MCP Server).
- **How it works**: If selected during setup, `StudioPro` is added to your IDE's `mcp.json`. The agent communicates with Studio Pro directly over HTTP SSE (default port 7782). If Studio Pro is closed, the agent may report a connection error for that specific server, but MTA tools will continue to work.
