if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is required to run the MCP proxy and setup scripts. Please install it from https://nodejs.org."
    exit 1
}

node "$PSScriptRoot\scripts\setup.js"
exit $LASTEXITCODE
