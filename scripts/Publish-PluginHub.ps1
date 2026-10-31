[CmdletBinding()]
param(
    [string]$SourceDir,
    [string]$Output,
    [string]$BaseURL,
    [string]$HubName = 'CcoreBox Plugin Hub'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SourceDir)) {
    $SourceDir = Join-Path $PSScriptRoot '..\docs\plugins\example'
}
if ([string]::IsNullOrWhiteSpace($Output)) {
    $Output = Join-Path $SourceDir 'plugins.json'
}

$SourceDir = (Resolve-Path -LiteralPath $SourceDir).Path
$idPattern = '^[a-z0-9][a-z0-9-]{0,47}$'
$allowedPermissions = @(
    'fs:data', 'net', 'notify', 'clipboard', 'profiles:read', 'profiles:write',
    'subscriptions:read', 'subscriptions:write', 'tray', 'ui', 'exec'
)

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Content
    )

    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Get-Sha256 {
    param([Parameter(Mandatory)] [string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$catalogPlugins = New-Object System.Collections.Generic.List[object]
$seen = New-Object System.Collections.Generic.HashSet[string]

$metadataFiles = Get-ChildItem -LiteralPath $SourceDir -Filter '*.json' -File |
    Where-Object { $_.Name -ne 'plugins.json' }

foreach ($metadataFile in $metadataFiles) {
    $metadata = Get-Content -LiteralPath $metadataFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $id = [string]$metadata.id
    if ([string]::IsNullOrWhiteSpace($id) -or $id -notmatch $idPattern) {
        throw "$($metadataFile.Name): id must match $idPattern"
    }
    if (-not $seen.Add($id)) {
        throw "$($metadataFile.Name): duplicate plugin id '$id'"
    }
    foreach ($field in @('name', 'version')) {
        if ([string]::IsNullOrWhiteSpace([string]$metadata.$field)) {
            throw "$($metadataFile.Name): $field must not be empty"
        }
    }

    $codeFile = Join-Path $SourceDir "$id.js"
    if (-not (Test-Path -LiteralPath $codeFile -PathType Leaf)) {
        throw "$($metadataFile.Name): missing code file '$id.js'"
    }

    $permissions = @()
    if ($metadata.PSObject.Properties.Name -contains 'permissions') {
        $permissions = @($metadata.permissions)
        foreach ($permission in $permissions) {
            if ($allowedPermissions -notcontains $permission) {
                throw "$($metadataFile.Name): unsupported permission '$permission'"
            }
        }
    }

    $triggers = @()
    if ($metadata.PSObject.Properties.Name -contains 'triggers') {
        $triggers = @($metadata.triggers)
    }
    $tags = @()
    if ($metadata.PSObject.Properties.Name -contains 'tags') {
        $tags = @($metadata.tags)
    }
    $configuration = @()
    if ($metadata.PSObject.Properties.Name -contains 'configuration') {
        $configuration = @($metadata.configuration)
    }
    $description = ''
    if ($metadata.PSObject.Properties.Name -contains 'description') {
        $description = [string]$metadata.description
    }

    $codeUrl = if ([string]::IsNullOrWhiteSpace($BaseURL)) {
        "plugins/$id.js"
    } else {
        "$($BaseURL.TrimEnd('/'))/plugins/$id.js"
    }

    $entry = [ordered]@{
        id            = $id
        name          = [string]$metadata.name
        version       = [string]$metadata.version
        description   = $description
        code_url      = $codeUrl
        sha256        = Get-Sha256 -Path $codeFile
        permissions   = $permissions
        triggers      = $triggers
    }
    if ($metadata.PSObject.Properties.Name -contains 'group' -and -not [string]::IsNullOrWhiteSpace([string]$metadata.group)) {
        $entry.group = [string]$metadata.group
    }
    if ($tags.Count -gt 0) {
        $entry.tags = $tags
    }
    if ($configuration.Count -gt 0) {
        $entry.configuration = $configuration
    }

    $catalogPlugins.Add([pscustomobject]$entry) | Out-Null
    Write-Host "packed $id v$($entry.version) ($($entry.sha256.Substring(0, 12))...)"
}

if ($catalogPlugins.Count -eq 0) {
    throw "no plugin metadata found in $SourceDir"
}

$catalog = [ordered]@{
    schema_version = 1
    name           = $HubName
    plugins        = @($catalogPlugins | Sort-Object name)
}

Write-Utf8NoBom -Path $Output -Content ($catalog | ConvertTo-Json -Depth 12)
Write-Host "wrote $Output with $($catalogPlugins.Count) plugins"
