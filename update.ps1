param(
    [switch]$Skills,
    [switch]$Mxcli,
    [switch]$All,
    [switch]$Check,
    [switch]$Yes,
    [switch]$Force
)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is required. Please install it from https://nodejs.org."
    exit 1
}

$flags = @()
if ($Check) { $flags += "--check" }
if ($Yes) { $flags += "--yes" }
if ($Force) { $flags += "--force" }

if ($Skills -and -not $Mxcli) {
    node "$PSScriptRoot\scripts\sync-skills.js" @flags
} elseif ($Mxcli -and -not $Skills) {
    node "$PSScriptRoot\scripts\sync-mxcli.js" @flags
} else {
    node "$PSScriptRoot\scripts\sync-upstream.js" @flags
}
exit $LASTEXITCODE
