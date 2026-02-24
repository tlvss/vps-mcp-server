#!/usr/bin/env bash
# =============================================================================
# vps-mcp-setup.sh — One-shot installer for vps-mcp-server on Ubuntu
# Run as root or a sudo user:  bash vps-mcp-setup.sh
# =============================================================================
set -euo pipefail

VPS_ID="vps-0841eec7"
MCP_PORT=3841
MCP_DIR="/opt/vps-mcp-server"
SERVICE_USER="mcp"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }

# ── 0. Root check ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}[ERROR]${NC} Run as root: sudo bash vps-mcp-setup.sh"
  exit 1
fi

info "Starting vps-mcp-server setup for ${VPS_ID}"

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating packages and installing dependencies..."
apt-get update -qq
apt-get install -y -qq curl git ufw nginx certbot python3-certbot-nginx

# ── 2. Node.js (LTS via NodeSource) ──────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  info "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
NODE_VER=$(node --version)
success "Node.js ${NODE_VER}"

# ── 3. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable --now docker
fi
DOCKER_VER=$(docker --version)
success "Docker: ${DOCKER_VER}"

# ── 4. UFW Firewall ───────────────────────────────────────────────────────────
info "Configuring UFW firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# MCP port only on localhost (Claude Code tunnels over SSH)
# → NOT opened to public internet on purpose
success "UFW configured (SSH, 80, 443 open; MCP port ${MCP_PORT} localhost-only)"

# ── 5. Nginx baseline ─────────────────────────────────────────────────────────
info "Enabling Nginx..."
systemctl enable --now nginx
success "Nginx running"

# ── 6. Create service user ────────────────────────────────────────────────────
if ! id -u "${SERVICE_USER}" &>/dev/null; then
  info "Creating service user '${SERVICE_USER}'..."
  useradd --system --shell /bin/bash --create-home "${SERVICE_USER}"
  # Allow mcp user to run docker
  usermod -aG docker "${SERVICE_USER}"
fi

# ── 7. Install MCP server ─────────────────────────────────────────────────────
info "Installing vps-mcp-server to ${MCP_DIR}..."
mkdir -p "${MCP_DIR}"
chown "${SERVICE_USER}:${SERVICE_USER}" "${MCP_DIR}"

# Copy server files (they should be next to this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "${SCRIPT_DIR}/." "${MCP_DIR}/"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${MCP_DIR}"

# Install deps and build
cd "${MCP_DIR}"
sudo -u "${SERVICE_USER}" npm install --quiet
sudo -u "${SERVICE_USER}" npm run build

success "vps-mcp-server built"

# ── 8. Generate auth token ────────────────────────────────────────────────────
TOKEN_FILE="/etc/${VPS_ID}-mcp.token"
if [[ ! -f "${TOKEN_FILE}" ]]; then
  MCP_TOKEN=$(openssl rand -hex 32)
  echo "${MCP_TOKEN}" > "${TOKEN_FILE}"
  chmod 640 "${TOKEN_FILE}"
  chown "root:${SERVICE_USER}" "${TOKEN_FILE}"
fi
MCP_TOKEN=$(cat "${TOKEN_FILE}")
success "Auth token saved to ${TOKEN_FILE}"

# ── 9. systemd service ────────────────────────────────────────────────────────
info "Creating systemd service..."
cat > "/etc/systemd/system/vps-mcp-server.service" <<EOF
[Unit]
Description=VPS MCP Server (${VPS_ID})
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${MCP_DIR}
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${MCP_PORT}
Environment=HOST=127.0.0.1
EnvironmentFile=${TOKEN_FILE}.env

[Install]
WantedBy=multi-user.target
EOF

# Write env file
cat > "${TOKEN_FILE}.env" <<EOF
MCP_AUTH_TOKEN=${MCP_TOKEN}
EOF
chmod 640 "${TOKEN_FILE}.env"
chown "root:${SERVICE_USER}" "${TOKEN_FILE}.env"

systemctl daemon-reload
systemctl enable --now vps-mcp-server
sleep 2

# ── 10. Health check ──────────────────────────────────────────────────────────
info "Verifying MCP server..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${MCP_PORT}/health)
if [[ "${HTTP_STATUS}" == "200" ]]; then
  success "MCP server is healthy (HTTP 200)"
else
  warn "MCP server returned HTTP ${HTTP_STATUS} — check: journalctl -u vps-mcp-server -n 50"
fi

# ── 11. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}  vps-mcp-server setup complete — ${VPS_ID}${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  MCP endpoint : http://127.0.0.1:${MCP_PORT}/mcp"
echo "  Auth token   : ${MCP_TOKEN}"
echo ""
echo "  Add to your LOCAL ~/.claude.json (or Claude Code MCP config):"
echo ""
echo '  {
    "mcpServers": {
      "'"${VPS_ID}"'": {
        "type": "http",
        "url": "http://127.0.0.1:'"${MCP_PORT}"'/mcp",
        "headers": {
          "Authorization": "Bearer '"${MCP_TOKEN}"'"
        },
        "tunnel": {
          "type": "ssh",
          "host": "135.125.179.131",
          "user": "ubuntu",
          "localPort": '"${MCP_PORT}"',
          "remotePort": '"${MCP_PORT}"'
        }
      }
    }
  }'
echo ""
echo "  Or use the generated claude-mcp-config.json in this directory."
echo ""
echo "  Manage the service:"
echo "    systemctl status vps-mcp-server"
echo "    journalctl -u vps-mcp-server -f"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
