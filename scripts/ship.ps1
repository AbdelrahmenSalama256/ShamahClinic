param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Message,
  [switch]$Release
)
$ErrorActionPreference = 'Stop'
$root  = 'D:\shamah_cms'
$clone = 'D:\deploys\newshamah-cpanel'
Set-Location $root

npm run copy:catalog
if ($LASTEXITCODE -ne 0) { throw 'copy:catalog failed' }
npm run copy:catalog
if ($LASTEXITCODE -ne 0) { throw 'copy:catalog failed' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }

robocopy src cpanel-upload\src /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'robocopy failed' }
foreach ($f in 'package.json','package-lock.json','next.config.ts','tsconfig.json','postcss.config.mjs','eslint.config.mjs') {
  if ((Test-Path $f) -and (Test-Path "cpanel-upload\$f")) { Copy-Item $f "cpanel-upload\$f" -Force }
}
$global:LASTEXITCODE = 0

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -m $Message } else { 'nothing new to commit' }
$global:LASTEXITCODE = 0
if (-not $Release) { 'Committed locally only. Add -Release to push to GitHub.'; return }

if (-not (Test-Path "$clone\.git")) {
  New-Item -ItemType Directory -Force (Split-Path $clone) | Out-Null
  git clone --branch main --single-branch https://github.com/AbdelrahmenSalama256/newshamah-cpanel.git $clone
}
git -C $clone fetch origin main
git -C $clone reset --hard origin/main
git -C $clone clean -fd
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release.ps1 $Message -DeployClone $clone