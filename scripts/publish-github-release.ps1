param (
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Repo = "Menditect/agentic-test-tools",

    [Parameter(Mandatory = $false)]
    [string]$Token,

    [Parameter(Mandatory = $false)]
    [string]$NotesFile,

    [Parameter(Mandatory = $false)]
    [string]$AssetPath,

    [Parameter(Mandatory = $false)]
    [switch]$Draft = $false,

    [Parameter(Mandatory = $false)]
    [switch]$Prerelease = $false
)

$ErrorActionPreference = "Stop"

# Format tag
$cleanVersion = ([string]$Version).Trim().TrimStart("v")
$tagName = "v$cleanVersion"
$releaseTitle = "Menditect Agent Workspace Template $tagName"

# Resolve Token from parameter or environment
if ([string]::IsNullOrEmpty($Token)) {
    $Token = $env:GITHUB_TOKEN
    if ([string]::IsNullOrEmpty($Token)) {
        $Token = $env:GH_TOKEN
    }
}

if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "[ERROR] GitHub Token is required. Pass -Token or set GITHUB_TOKEN / GH_TOKEN." -ForegroundColor Red
    exit 1
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   GitHub Release Auto-Publisher" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Repository    : $Repo" -ForegroundColor DarkCyan
Write-Host "Version / Tag : $tagName" -ForegroundColor DarkCyan
Write-Host "Release Title : $releaseTitle" -ForegroundColor DarkCyan

# Read Release Notes
$bodyContent = "Automated release of $releaseTitle."
if ($NotesFile -and (Test-Path $NotesFile)) {
    Write-Host "Release Notes : $NotesFile" -ForegroundColor DarkCyan
    $bodyContent = Get-Content -Path $NotesFile -Raw -Encoding UTF8
} else {
    # Check default path
    $defaultNotes = Join-Path (Split-Path -Parent $PSScriptRoot) "releases\$tagName.md"
    if (Test-Path $defaultNotes) {
        Write-Host "Release Notes : $defaultNotes (auto-detected)" -ForegroundColor DarkCyan
        $bodyContent = Get-Content -Path $defaultNotes -Raw -Encoding UTF8
    }
}

$headers = @{
    "Authorization"        = "Bearer $Token"
    "Accept"               = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent"           = "Menditect-Release-Publisher"
}

# Step 1: Check if Release already exists
$releaseUrl = "https://api.github.com/repos/$Repo/releases/tags/$tagName"
$existingRelease = $null

try {
    $existingRelease = Invoke-RestMethod -Uri $releaseUrl -Method Get -Headers $headers -TimeoutSec 30
} catch {
    # 404 is expected when release does not exist yet
}

$releaseId = $null
$uploadUrl = $null

if ($existingRelease) {
    $releaseId = $existingRelease.id
    $uploadUrl = $existingRelease.upload_url
    Write-Host "`n[1/3] Existing release found for $tagName (ID: $releaseId). Updating notes..." -ForegroundColor Yellow
    
    $updateBody = @{
        "name"       = $releaseTitle
        "body"       = $bodyContent
        "draft"      = [bool]$Draft
        "prerelease" = [bool]$Prerelease
    } | ConvertTo-Json -Depth 5

    $patchUrl = "https://api.github.com/repos/$Repo/releases/$releaseId"
    $updatedRelease = Invoke-RestMethod -Uri $patchUrl -Method Patch -Headers $headers -Body $updateBody -ContentType "application/json; charset=utf-8"
    Write-Host "Release details updated successfully!" -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Creating new official GitHub Release $tagName on $Repo..." -ForegroundColor Yellow
    
    $createBody = @{
        "tag_name"         = $tagName
        "target_commitish" = "main"
        "name"             = $releaseTitle
        "body"             = $bodyContent
        "draft"            = [bool]$Draft
        "prerelease"       = [bool]$Prerelease
        "generate_release_notes" = $false
    } | ConvertTo-Json -Depth 5

    $createUrl = "https://api.github.com/repos/$Repo/releases"
    try {
        $newRelease = Invoke-RestMethod -Uri $createUrl -Method Post -Headers $headers -Body $createBody -ContentType "application/json; charset=utf-8"
        $releaseId = $newRelease.id
        $uploadUrl = $newRelease.upload_url
        Write-Host "Release created successfully! (ID: $releaseId, URL: $($newRelease.html_url))" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Failed to create GitHub Release: $_" -ForegroundColor Red
        if ($_.ErrorDetails) {
            Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        exit 1
    }
}

# Step 2: Upload Asset (if specified)
if ($AssetPath) {
    if (-not (Test-Path $AssetPath)) {
        Write-Host "`n[2/3] Asset path '$AssetPath' not found. Skipping asset upload." -ForegroundColor Yellow
    } else {
        $assetName = Split-Path -Path $AssetPath -Leaf
        Write-Host "`n[2/3] Uploading asset '$assetName' to release..." -ForegroundColor Yellow
        
        # Clean up any existing asset with same name on this release
        try {
            $assetsListUrl = "https://api.github.com/repos/$Repo/releases/$releaseId/assets"
            $existingAssets = Invoke-RestMethod -Uri $assetsListUrl -Method Get -Headers $headers -TimeoutSec 30
            foreach ($asset in $existingAssets) {
                if ($asset.name -eq $assetName) {
                    Write-Host "Removing existing asset '$assetName' (ID: $($asset.id))..." -ForegroundColor DarkCyan
                    Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" -Method Delete -Headers $headers
                }
            }
        } catch {
            Write-Host "Note: Error checking existing assets: $_" -ForegroundColor Gray
        }

        # Format upload URI (strip template suffix like {?name,label})
        $cleanUploadUrl = $uploadUrl -replace '\{.*\}$', ""
        $uploadTarget = "$cleanUploadUrl`?name=$assetName"

        $assetHeaders = @{
            "Authorization"        = "Bearer $Token"
            "Accept"               = "application/vnd.github+json"
            "X-GitHub-Api-Version" = "2022-11-28"
            "User-Agent"           = "Menditect-Release-Publisher"
            "Content-Type"         = "application/octet-stream"
        }

        try {
            $uploadRes = Invoke-RestMethod -Uri $uploadTarget -Method Post -Headers $assetHeaders -InFile $AssetPath -TimeoutSec 120
            Write-Host "Asset '$assetName' uploaded successfully! Size: $($uploadRes.size) bytes." -ForegroundColor Green
        } catch {
            Write-Host "[ERROR] Failed to upload asset '$assetName': $_" -ForegroundColor Red
            if ($_.ErrorDetails) {
                Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
            }
            exit 1
        }
    }
} else {
    Write-Host "`n[2/3] No asset path specified. Skipping asset upload." -ForegroundColor Gray
}

Write-Host "`n[3/3] Release publication completed for $tagName!" -ForegroundColor Green
Write-Host "Release URL: https://github.com/$Repo/releases/tag/$tagName" -ForegroundColor Cyan
