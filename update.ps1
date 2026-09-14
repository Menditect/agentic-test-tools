param(
    [switch]$Skills,
    [switch]$Mxcli,
    [switch]$All
)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is required. Please install it from https://nodejs.org."
    exit 1
}

if ($Skills -and -not $Mxcli) {
    node "$PSScriptRoot\scripts\sync-skills.js"
} elseif ($Mxcli -and -not $Skills) {
    node "$PSScriptRoot\scripts\sync-mxcli.js"
} else {
    node "$PSScriptRoot\scripts\sync-upstream.js"
}
exit $LASTEXITCODE
