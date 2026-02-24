# vps-mcp-server

MCP server for full VPS orchestration via Claude Code. Exposes 15 tools across four categories.

## Tools

### Shell
| Tool | Description |
|------|-------------|
| `vps_run_command` | Run any shell command |
| `vps_get_system_info` | CPU, RAM, disk, uptime snapshot |
| `vps_list_processes` | Top processes by CPU or memory |

### Files
| Tool | Description |
|------|-------------|
| `vps_read_file` | Read file contents (with line limit) |
| `vps_write_file` | Write/overwrite file (auto-backup) |
| `vps_list_directory` | List directory contents |
| `vps_delete_file` | Delete file or directory (auto-backup) |

### Docker
| Tool | Description |
|------|-------------|
| `vps_docker_list_containers` | List running/all containers |
| `vps_docker_container_logs` | Fetch container logs |
| `vps_docker_manage_container` | Start/stop/restart/remove |
| `vps_docker_run` | Pull and run a container |
| `vps_docker_compose` | Run docker compose commands |
| `vps_docker_images` | List available images |

### Nginx
| Tool | Description |
|------|-------------|
| `vps_nginx_status` | Check status + config validity |
| `vps_nginx_create_site` | Create reverse proxy vhost |
| `vps_nginx_toggle_site` | Enable/disable a site |
| `vps_nginx_reload` | Graceful reload or restart |
| `vps_nginx_list_sites` | List available/enabled sites |

## Setup

### On the VPS (once)
```bash
scp -r vps-mcp-server ubuntu@135.125.179.131:~
ssh ubuntu@135.125.179.131 "sudo bash ~/vps-mcp-server/vps-mcp-setup.sh"
```
The script prints an auth token. Copy it.

### On your local machine
Add the contents of `claude-mcp-config.json` to `~/.claude.json`, replacing `REPLACE_WITH_TOKEN_FROM_SETUP_SCRIPT` with the token.

Or via Claude Code CLI:
```bash
claude mcp add vps-0841eec7 \
  --type http \
  --url http://127.0.0.1:3841/mcp \
  --header "Authorization: Bearer <your-token>"
```

## Architecture

```
Your machine (Claude Code)
    │
    │  SSH tunnel (port 3841 forwarded automatically)
    ▼
VPS 135.125.179.131
    └── vps-mcp-server (systemd, port 3841, localhost-only)
            ├── Shell tools   → exec
            ├── File tools    → fs
            ├── Docker tools  → docker CLI
            └── Nginx tools   → nginx + systemctl
```

The MCP server binds to `127.0.0.1` only — never exposed to the public internet.
Access is always through the SSH tunnel + Bearer token auth.

## Security Notes

- MCP port (3841) is **not** opened in UFW — accessible only via SSH tunnel
- Bearer token authentication on all requests
- File write operations auto-backup originals to `<path>.bak`
- SSH private key and shadow files are blocked from read access
