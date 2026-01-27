# DynDNS Updater middleware

Self-hosted Dynamic DNS manager with support for multiple DNS providers.

## Supported Providers

- **Hetzner Cloud DNS** - Zones + records management
- **DigitalOcean DNS** - Domain + records management

Easily extensible: add new providers by creating a new module in `lib/providers/`.

## Features

- Single Astro SSR app with SQLite storage (WAL) and Redis for sessions
- Management GUI (create first admin, login, manage DynDNS users with provider selection, API keys and domains)
- DynDNS endpoint with Basic Auth (`/nic/update`), standard `hostname` and `myip` params
- Multi-provider DNS API integration - auto-resolves zone/domain + record name from FQDN
- SQLite storage (WAL) for admins, dyndns users, domains, update logs
- Dashboard shows last 5 update logs per user and their DNS provider
- Provider-agnostic architecture for easy extensibility

## Project Structure

```
.
├─ frontend/                # Astro SSR app (server mode)
│  ├─ src/
│  │  ├─ pages/
│  │  │  ├─ index.astro     # Login / setup redirect
│  │  │  ├─ setup.astro     # First admin setup
│  │  │  ├─ dashboard.astro # Admin dashboard + recent logs
│  │  │  ├─ nic/update.ts   # DynDNS update endpoint (GET)
│  │  │  └─ users/          # DynDNS user CRUD + domain linking
│  │  └─ lib/               # db, auth, session, hetzner client
│  ├─ astro.config.mjs      # Node adapter (standalone)
│  ├─ Dockerfile            # Production image
│  └─ package.json
├─ docker-compose.prod.yml  # Redis + app + Caddy
├─ Caddyfile                # Reverse proxy + TLS
└─ README.md
```

## Local Development

Prereqs: Node 20+, npm

```bash
cd frontend
npm install
npm run dev
# http://localhost:4321
```

On first run, you’ll be redirected to `/setup` to create the initial admin.

## DynDNS Endpoint

- Update all domains (IP auto-detect):
   - `GET /nic/update`
- Update all domains with explicit IP:
   - `GET /nic/update?myip=1.2.3.4`
- Update specific hostname:
   - `GET /nic/update?hostname=dyndns.example.com&myip=1.2.3.4`

Auth: HTTP Basic Auth (username/password you created in the GUI)

## Production (Docker + Caddy)

### Prerequisites
- Docker and Docker Compose installed
- A public domain pointing to your server

### Configure
1. Create a `.env` next to `docker-compose.prod.yml`:
   ```
   DOMAIN_DYNDNS_UPDATER=dyndns.example.com
   ```
2. Ensure the domain is referenced in Caddy via `{$DOMAIN_DYNDNS_UPDATER}` in [Caddyfile](Caddyfile):
   ```
   {$DOMAIN_DYNDNS_UPDATER} {
     reverse_proxy dyndns-web:4321
   }
   ```
3. Verify volumes in [docker-compose.prod.yml](docker-compose.prod.yml) to persist SQLite at `./frontend/data`.

### Build and Run
```bash
# from repo root
docker compose -f docker-compose.prod.yml up -d --build
```

- App: `https://$DOMAIN_DYNDNS_UPDATER/`
- DynDNS: `https://$DOMAIN_DYNDNS_UPDATER/nic/update`

### First-Time Setup
- Open the site and complete `/setup` to create the first admin

### Add a DynDNS User, choose a Provider, add Domain(s)
- In the GUI, create a DynDNS user/password which is used for Basic Auth to access the DynDNS Endpoint `/nic/update`
- Choose from the available provider list and add your API key / Token
- Add a domain (FQDN) and initial IP; zone and record name auto-resolve via the providers' API

### Update Examples
- Curl (Linux/macOS):
  - All domains, IP auto-detect:
    ```
    curl -u user:pass https://$DOMAIN_DYNDNS_UPDATER/nic/update
    ```
  - Specific hostname with IP:
    ```
    curl -u user:pass "https://$DOMAIN_DYNDNS_UPDATER/nic/update?hostname=host.example.com&myip=1.2.3.4"
    ```
- PowerShell (Windows):
  ```
  $pair = "user:pass"
  $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
  Invoke-WebRequest -Uri "https://$DOMAIN_DYNDNS_UPDATER/nic/update?myip=1.2.3.4" -Headers @{ Authorization = "Basic $b64" }
  ```

### Notes
- Recent updates appear on the dashboard (last 5 per user)

## Security
- Secrets: Provider API keys per DynDNS user via the GUI
- Reverse proxy (Caddy) auto-provisions TLS (Let's Encrypt)
- Data persists locally in `./frontend/data/dyndns.db` (SQLite)