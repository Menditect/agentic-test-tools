if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is required. Please install it from https://nodejs.org."
    exit 1
}

node "$PSScriptRoot\scripts\sync-mxcli.js"
exit $LASTEXITCODE
