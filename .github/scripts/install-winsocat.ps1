#!/usr/bin/env pwsh
# Download firejox/WinSocat to $env:LOCALAPPDATA\Programs\winsocat. The
# WSL-side companion script registers a systemd unit that invokes this
# winsocat.exe via /mnt/c/Users/<winuser>/AppData/Local/Programs/winsocat/,
# so this script also emits `winuser=<windows username>` as a step output
# for that path resolution.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ver  = '0.1.3'
$zip  = Join-Path $env:TEMP "winsocat-$ver.zip"
$dest = Join-Path $env:LOCALAPPDATA 'Programs\winsocat'

if (-not (Test-Path $dest)) {
  New-Item -ItemType Directory -Path $dest | Out-Null
}

Invoke-WebRequest `
  -Uri "https://github.com/firejox/WinSocat/releases/download/v$ver/winsocat-portable-x64-$ver.zip" `
  -OutFile $zip `
  -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $dest -Force

if ($env:GITHUB_OUTPUT) {
  "winuser=$env:USERNAME" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
}
