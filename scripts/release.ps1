[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateNotNullOrEmpty()]
  [string]$Message,
  [string]$DeployClone,
  [switch]$DryRun,
  [switch]$AllowDeletes
)

$ErrorActionPreference = 'Stop'
$repositoryUrl = 'https://github.com/AbdelrahmenSalama256/newshamah-cpanel.git'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mirror = Join-Path $root 'cpanel-upload'

if ($DryRun) {
  if (-not [string]::IsNullOrWhiteSpace($DeployClone)) {
    throw 'Do not pass -DeployClone with -DryRun; dry runs use a temporary clone.'
  }
  $DeployClone = Join-Path ([System.IO.Path]::GetTempPath()) ('shamah-release-dry-run-' + [guid]::NewGuid().ToString('N'))
  $removeDeployCloneAfterDryRun = $true
}
elseif ([string]::IsNullOrWhiteSpace($DeployClone)) {
  $DeployClone = Join-Path (Split-Path $root -Parent) 'newshamah-cpanel-deploy'
}
$DeployClone = [System.IO.Path]::GetFullPath($DeployClone)

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$CommandArgs,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )

  Push-Location -LiteralPath $WorkingDirectory
  try {
    & $Executable @CommandArgs
    if ($LASTEXITCODE -ne 0) {
      throw "$Executable exited with code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}

function Get-CheckedCommandOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$CommandArgs,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )

  Push-Location -LiteralPath $WorkingDirectory
  try {
    $result = & $Executable @CommandArgs
    if ($LASTEXITCODE -ne 0) {
      throw "$Executable exited with code $LASTEXITCODE."
    }
    return ($result -join "`n").Trim()
  }
  finally {
    Pop-Location
  }
}

function Get-FileHashes {
  param([Parameter(Mandatory = $true)][string]$Directory)

  $base = [System.IO.Path]::GetFullPath($Directory).TrimEnd('\') + '\'
  $hashes = @{}
  foreach ($file in Get-ChildItem -LiteralPath $Directory -File -Recurse -Force) {
    $relativePath = $file.FullName.Substring($base.Length).Replace('\', '/')
    $hashes[$relativePath] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  }
  return $hashes
}

function Copy-MirrorToDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$DestinationDirectory
  )

  New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null
  foreach ($file in Get-ChildItem -LiteralPath $SourceDirectory -File -Recurse -Force) {
    $relativePath = $file.FullName.Substring($SourceDirectory.TrimEnd('\').Length).TrimStart('\')
    $destination = Join-Path $DestinationDirectory $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  }
}

function Assert-DirectoriesMatch {
  param(
    [Parameter(Mandatory = $true)][string]$FirstDirectory,
    [Parameter(Mandatory = $true)][string]$SecondDirectory,
    [Parameter(Mandatory = $true)][string]$Description
  )

  $first = Get-FileHashes -Directory $FirstDirectory
  $second = Get-FileHashes -Directory $SecondDirectory
  $differences = [System.Collections.Generic.List[string]]::new()

  foreach ($path in $first.Keys) {
    if (-not $second.ContainsKey($path) -or $first[$path] -ne $second[$path]) {
      $differences.Add($path)
    }
  }
  foreach ($path in $second.Keys) {
    if (-not $first.ContainsKey($path)) {
      $differences.Add($path)
    }
  }
  if ($differences.Count -gt 0) {
    throw "$Description differs: $($differences -join ', ')"
  }
}

function Assert-FileMatches {
  param(
    [Parameter(Mandatory = $true)][string]$FirstFile,
    [Parameter(Mandatory = $true)][string]$SecondFile,
    [Parameter(Mandatory = $true)][string]$Description
  )

  $firstHash = (Get-FileHash -LiteralPath $FirstFile -Algorithm SHA256).Hash
  $secondHash = (Get-FileHash -LiteralPath $SecondFile -Algorithm SHA256).Hash
  if ($firstHash -ne $secondHash) {
    throw "$Description differs."
  }
}

function Assert-NoSecrets {
  param([Parameter(Mandatory = $true)][string]$Directory)

  $excludedDirectories = @(
    '.git', 'node_modules', '.next', '.next-build', 'coverage',
    'backups', '.tmp', '.shots', '.vercel'
  )
  $textExtensions = @(
    '.cjs', '.conf', '.css', '.env', '.html', '.ini', '.js', '.json',
    '.md', '.mjs', '.ps1', '.sh', '.sql', '.scss', '.ts', '.tsx',
    '.txt', '.xml', '.yaml', '.yml'
  )
  $sensitiveAssignmentPatterns = @(
    '(?i)(?:DATABASE_PASSWORD|DB_PASSWORD|SESSION_SECRET)\s*[:=]\s*(?!<[^>]+>)(?:"[^"<][^"]{7,}"|''[^''<][^'']{7,}''|[A-Za-z0-9!@#$%^&*_+=.-]{16,})',
    '(?i)^\s*(?:password|passwd|passphrase|api[_-]?key|access[_-]?token)\s*[:=]\s*(?:"[^"<][^"]{7,}"|''[^''<][^'']{7,}'')\s*$',
    '(?i)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----',
    '\b(?:gh[pousr]_[A-Za-z0-9_]{24,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{16,})\b'
  )
  $stack = [System.Collections.Generic.Stack[string]]::new()
  $stack.Push((Get-Item -LiteralPath $Directory).FullName)
  $findings = [System.Collections.Generic.List[string]]::new()

  while ($stack.Count -gt 0) {
    $currentDirectory = $stack.Pop()
    foreach ($item in Get-ChildItem -LiteralPath $currentDirectory -Force) {
      if ($item.PSIsContainer) {
        if ($excludedDirectories -notcontains $item.Name) {
          $stack.Push($item.FullName)
        }
        continue
      }

      if (($item.Name -like '.env*' -and $item.Name -ne '.env.example') -or
        $item.Extension -match '^\.(pem|pfx|p12|key)$' -or
        $item.Name -match '(?i)(credentials?|senstive|sensitive)(\.|$)') {
        $findings.Add("$($item.FullName): sensitive filename")
        continue
      }

      if ($textExtensions -notcontains $item.Extension.ToLowerInvariant()) {
        continue
      }

      $reader = [System.IO.File]::OpenText($item.FullName)
      try {
        $lineNumber = 0
        while (($line = $reader.ReadLine()) -ne $null) {
          $lineNumber++
          foreach ($pattern in $sensitiveAssignmentPatterns) {
            if ([System.Text.RegularExpressions.Regex]::IsMatch($line, $pattern)) {
              $findings.Add("$($item.FullName):$lineNumber")
              break
            }
          }
        }
      }
      finally {
        $reader.Dispose()
      }
    }
  }

  if ($findings.Count -gt 0) {
    throw "Potential secrets found; no release was made:`n$($findings -join "`n")"
  }
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  throw 'A non-empty commit message is required.'
}
if (-not (Test-Path -LiteralPath $mirror -PathType Container)) {
  throw "Deploy mirror not found: $mirror"
}

foreach ($directory in @('tests', 'node_modules', '.next')) {
  if (Test-Path -LiteralPath (Join-Path $mirror $directory)) {
    throw "The deploy mirror must not contain $directory."
  }
}
$ignoreFile = Join-Path $mirror '.gitignore'
$ignoreContent = Get-Content -LiteralPath $ignoreFile -Raw
foreach ($requiredPattern in @('(?m)^\.env\*', '(?m)^node_modules/', '(?m)^\.next/')) {
  if ($ignoreContent -notmatch $requiredPattern) {
    throw "The deploy .gitignore is missing a required rule: $requiredPattern"
  }
}

Assert-DirectoriesMatch -FirstDirectory (Join-Path $root 'src') -SecondDirectory (Join-Path $mirror 'src') -Description 'src and cpanel-upload/src'
Assert-FileMatches -FirstFile (Join-Path $root 'package.json') -SecondFile (Join-Path $mirror 'package.json') -Description 'package.json and cpanel-upload/package.json'
Assert-FileMatches -FirstFile (Join-Path $root 'package-lock.json') -SecondFile (Join-Path $mirror 'package-lock.json') -Description 'package-lock.json and cpanel-upload/package-lock.json'
Assert-NoSecrets -Directory $mirror

$validationDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('shamah-release-check-' + [guid]::NewGuid().ToString('N'))
try {
  Copy-MirrorToDirectory -SourceDirectory $mirror -DestinationDirectory $validationDirectory
  $nodeVersion = Get-CheckedCommandOutput -Executable 'node' -CommandArgs @('--version') -WorkingDirectory $validationDirectory
  if ($nodeVersion -notmatch '^v(?<major>\d+)\.' -or [int]$Matches.major -lt 22) {
    throw "Node.js 22 or newer is required for a release build; found $nodeVersion."
  }

  Invoke-CheckedCommand -Executable 'npm' -CommandArgs @('ci', '--include=dev') -WorkingDirectory $validationDirectory
  Invoke-CheckedCommand -Executable 'npm' -CommandArgs @('run', 'copy:check') -WorkingDirectory $validationDirectory
  Invoke-CheckedCommand -Executable 'npm' -CommandArgs @('run', 'typecheck') -WorkingDirectory $validationDirectory
  $env:NEXT_PUBLIC_SITE_URL = 'https://shamahnew.shamahclinics.com'
  Invoke-CheckedCommand -Executable 'npm' -CommandArgs @('run', 'build') -WorkingDirectory $validationDirectory
  Assert-DirectoriesMatch -FirstDirectory (Join-Path $mirror 'src') -SecondDirectory (Join-Path $validationDirectory 'src') -Description 'src and validated deploy source'
}
finally {
  if (Test-Path -LiteralPath $validationDirectory) {
    Remove-Item -LiteralPath $validationDirectory -Recurse -Force
  }
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $DeployClone '.git') -PathType Container)) {
    if (Test-Path -LiteralPath $DeployClone) {
      throw "Deploy clone path exists but is not a Git clone: $DeployClone"
    }
    $parent = Split-Path $DeployClone -Parent
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Invoke-CheckedCommand -Executable 'git' -CommandArgs @('clone', '--branch', 'main', '--single-branch', $repositoryUrl, $DeployClone) -WorkingDirectory $parent
  }

  $remoteUrl = Get-CheckedCommandOutput -Executable 'git' -CommandArgs @('remote', 'get-url', 'origin') -WorkingDirectory $DeployClone
  if ($remoteUrl.TrimEnd('/') -notin @($repositoryUrl, ($repositoryUrl -replace '\.git$', ''))) {
    throw "Deploy clone origin is not $repositoryUrl"
  }
  if ((Get-CheckedCommandOutput -Executable 'git' -CommandArgs @('branch', '--show-current') -WorkingDirectory $DeployClone) -ne 'main') {
    throw 'Deploy clone must be checked out on main.'
  }
  if (Get-CheckedCommandOutput -Executable 'git' -CommandArgs @('status', '--porcelain') -WorkingDirectory $DeployClone) {
    throw 'Deploy clone has local changes; commit or preserve them before releasing.'
  }

  Invoke-CheckedCommand -Executable 'git' -CommandArgs @('fetch', 'origin', 'main') -WorkingDirectory $DeployClone
  Invoke-CheckedCommand -Executable 'git' -CommandArgs @('pull', '--ff-only', 'origin', 'main') -WorkingDirectory $DeployClone
  if ((Get-CheckedCommandOutput -Executable 'git' -CommandArgs @('rev-parse', 'HEAD') -WorkingDirectory $DeployClone) -ne
    (Get-CheckedCommandOutput -Executable 'git' -CommandArgs @('rev-parse', 'origin/main') -WorkingDirectory $DeployClone)) {
    throw 'Deploy clone has unpushed commits; refusing to build on an unexpected history.'
  }
  Assert-NoSecrets -Directory $DeployClone

  $mirrorFiles = Get-FileHashes -Directory $mirror
  $trackedFiles = Get-CheckedCommandOutput -Executable 'git' -CommandArgs @('ls-files') -WorkingDirectory $DeployClone
  $deletePaths = [System.Collections.Generic.List[string]]::new()
  foreach ($trackedPath in ($trackedFiles -split "`n")) {
    if ($trackedPath -and -not $mirrorFiles.ContainsKey($trackedPath)) {
      $deletePaths.Add($trackedPath)
    }
  }
  if ($deletePaths.Count -gt 25 -and -not $AllowDeletes) {
    throw "Release would delete $($deletePaths.Count) tracked files; pass -AllowDeletes to confirm."
  }
  foreach ($trackedPath in $deletePaths) {
    Invoke-CheckedCommand -Executable 'git' -CommandArgs @('rm', '--', $trackedPath) -WorkingDirectory $DeployClone
  }

  foreach ($file in Get-ChildItem -LiteralPath $mirror -File -Recurse -Force) {
    $relativePath = $file.FullName.Substring($mirror.Length).TrimStart('\').Replace('\', '/')
    $destination = Join-Path $DeployClone ($relativePath.Replace('/', '\'))
    $destinationDirectory = Split-Path $destination -Parent
    New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  }

  Assert-NoSecrets -Directory $DeployClone
  Invoke-CheckedCommand -Executable 'git' -CommandArgs @('add', '--all') -WorkingDirectory $DeployClone
  if ($DryRun) {
    Invoke-CheckedCommand -Executable 'git' -CommandArgs @('diff', '--cached', '--name-status') -WorkingDirectory $DeployClone
    Write-Output 'Dry run complete; no commit or push was made.'
    return
  }
  $stagedFiles = Get-CheckedCommandOutput -Executable 'git' -CommandArgs @('diff', '--cached', '--name-only') -WorkingDirectory $DeployClone
  if (-not $stagedFiles) {
    Write-Output 'No deployable changes; nothing to commit or push.'
    return
  }

  Invoke-CheckedCommand -Executable 'git' -CommandArgs @('diff', '--cached', '--check') -WorkingDirectory $DeployClone
  Invoke-CheckedCommand -Executable 'git' -CommandArgs @('commit', '-m', $Message) -WorkingDirectory $DeployClone
  Invoke-CheckedCommand -Executable 'git' -CommandArgs @('fetch', 'origin', 'main') -WorkingDirectory $DeployClone

  Push-Location -LiteralPath $DeployClone
  try {
    & git merge-base --is-ancestor origin/main HEAD
    if ($LASTEXITCODE -ne 0) {
      throw 'origin/main is not an ancestor of this release; refusing a non-fast-forward push.'
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  if ($removeDeployCloneAfterDryRun -and (Test-Path -LiteralPath $DeployClone)) {
    Remove-Item -LiteralPath $DeployClone -Recurse -Force
  }
}

if (-not $DryRun) {
  Invoke-CheckedCommand -Executable 'git' -CommandArgs @('push', 'origin', 'main') -WorkingDirectory $DeployClone
  $commit = Get-CheckedCommandOutput -Executable 'git' -CommandArgs @('rev-parse', 'HEAD') -WorkingDirectory $DeployClone
  Write-Output "Released $commit to origin/main."
}
