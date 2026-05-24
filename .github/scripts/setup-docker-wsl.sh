#!/usr/bin/env bash
# Set up dockerd inside a WSL Ubuntu distro and bridge its unix socket
# to the Windows named pipe `\\.\pipe\docker_engine` via WinSocat. After
# this script, Windows-side docker.exe talks to in-WSL dockerd over its
# default transport (no DOCKER_HOST needed).
#
# Usage: setup-docker-wsl.sh <windows-username>
#
# Notes:
#   - This is the documented setup procedure for using in-WSL dockerd
#     from Windows. Direct TCP works in theory but has Windows-to-WSL
#     half-close issues that hide container output in stdin-less
#     environments such as CI (docker/cli#3586, docker/cli#6220).
#   - Docker is installed via the apt repository with docker-ce pinned,
#     so CI is reproducible regardless of upstream Docker releases.
#     https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository
#   - Run-time prerequisite: WinSocat must already be installed on the
#     Windows host (see install-winsocat.ps1).

set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

WINUSER="${1:?usage: $0 <windows-username>}"
DOCKER_CE_VERSION='5:29.4.3-1~ubuntu.24.04~noble'

# --- Install Docker Engine via apt -----------------------------------------
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

SUITE=$(. /etc/os-release && echo "$VERSION_CODENAME")
ARCH=$(dpkg --print-architecture)
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $SUITE
Components: stable
Architectures: $ARCH
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y \
  docker-ce="$DOCKER_CE_VERSION" \
  docker-ce-cli="$DOCKER_CE_VERSION" \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin \
  socat

# --- Bridge dockerd unix socket to Windows named pipe ----------------------
# `Requires=/After=` ensure WinSocat starts after dockerd; `PartOf=` ties
# the bridge's lifecycle to dockerd, so stopping docker.service also stops
# the bridge.
sudo tee /etc/systemd/system/winsocat-docker.service >/dev/null <<UNIT
[Unit]
Description=WinSocat bridge for Docker named pipe
Requires=docker.service
After=docker.service
PartOf=docker.service

[Service]
Type=simple
User=$USER
ExecStart=/mnt/c/Users/$WINUSER/AppData/Local/Programs/winsocat/winsocat.exe NPIPE-LISTEN:docker_engine "WSL:socat STDIO unix-connect:/var/run/docker.sock"
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now winsocat-docker.service
