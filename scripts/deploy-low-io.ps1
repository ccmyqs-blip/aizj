param(
  [string]$Server = "root@114.55.229.142",
  [string]$RemoteDir = "/opt/aizj",
  [string]$GitRef = "HEAD"
)

$ErrorActionPreference = "Stop"

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $Name"
  }
}

Assert-Command git
Assert-Command docker
Assert-Command ssh
Assert-Command scp

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tempDir = Join-Path $env:TEMP "aizj-low-io-$timestamp"
New-Item -ItemType Directory -Path $tempDir | Out-Null

$srcTar = Join-Path $tempDir "aizj-src.tar"
$webTar = Join-Path $tempDir "aizj-web.tar"

Write-Host "[1/5] Package source from git ref: $GitRef"
git archive --format=tar -o $srcTar $GitRef

Write-Host "[2/5] Build production image locally (linux/amd64)"
docker build --platform linux/amd64 -t aizj-web:latest -f Dockerfile .

Write-Host "[3/5] Export web image tar"
docker save -o $webTar aizj-web:latest

Write-Host "[4/5] Upload package and image to server"
scp $srcTar "${Server}:/tmp/aizj-src.tar"
scp $webTar "${Server}:/tmp/aizj-web.tar"

Write-Host "[5/5] Apply release on server"
$remoteScript = @'
set -euo pipefail
REMOTE_DIR="$1"
mkdir -p "$REMOTE_DIR"
tar -xf /tmp/aizj-src.tar -C "$REMOTE_DIR"
bash "$REMOTE_DIR/scripts/server-apply-release.sh" "$REMOTE_DIR" /tmp/aizj-src.tar /tmp/aizj-web.tar
'@
$remoteScriptPath = Join-Path $tempDir "remote-apply.sh"
Set-Content -Path $remoteScriptPath -Value $remoteScript -Encoding ascii

$scriptContent = Get-Content -Raw $remoteScriptPath
$scriptContent | ssh $Server "bash -s -- '$RemoteDir'"

Write-Host "Done. Check status with: ssh $Server 'cd $RemoteDir && docker compose ps'"

Remove-Item -Recurse -Force $tempDir
