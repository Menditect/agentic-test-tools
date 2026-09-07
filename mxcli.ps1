param([Parameter(ValueFromRemainingArguments = $true)]$ArgsList)

$bin = "$PSScriptRoot\bin\mxcli.exe"
if (-not (Test-Path $bin)) {
    Write-Error "mxcli binary not found in bin/. Run 'npm run update' to fetch it."
    exit 1
}

# If -p or --project is already in arguments, pass through directly
if ($ArgsList -contains "-p" -or $ArgsList -contains "--project") {
    & $bin @ArgsList
    exit $LASTEXITCODE
}

# Otherwise, load MENDIX_MPR_PATH from mta_config.json or .env
$mprPath = $env:MENDIX_MPR_PATH
if (-not $mprPath -and (Test-Path "$PSScriptRoot\mta_config.json")) {
    $config = Get-Content "$PSScriptRoot\mta_config.json" | ConvertFrom-Json
    $mprPath = $config.mendix_mpr_path
}

if ($mprPath) {
    & $bin -p $mprPath @ArgsList
} else {
    & $bin @ArgsList
}
exit $LASTEXITCODE
