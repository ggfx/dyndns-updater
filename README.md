# DynDNS Updater (Astro SSR)

Self-hosted Dynamic DNS manager using Hetzner Cloud DNS (zones + rrsets). Single Astro SSR app with SQLite and Redis for sessions.

## Features

- Admin GUI (create first admin, login, manage DynDNS users and domains)
- DynDNS endpoint with Basic Auth (`/dyndns`), standard `hostname` and `myip` params
- Hetzner Cloud DNS API integration (zones/rrsets). Auto-resolves zone + record name from FQDN
- SQLite storage (WAL) for admins, dyndns users, domains, update logs
- Redis sessions, 30-minute TTL with refresh on activity
- Dashboard shows last 5 update logs per user

## Project Structure

```
.
├─ frontend/                # Astro SSR app (server mode)
│  ├─ src/
│  │  ├─ pages/
│  │  │  ├─ index.astro     # Login / setup redirect
│  │  │  ├─ setup.astro     # First admin setup
│  │  │  ├─ dashboard.astro # Admin dashboard + recent logs
│  │  │  ├─ users/          # DynDNS user CRUD + domain linking
│  │  │  └─ dyndns.ts       # DynDNS update endpoint (GET)
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
   - `GET /dyndns`
- Update all domains with explicit IP:
   - `GET /dyndns?myip=1.2.3.4`
- Update specific hostname:
   - `GET /dyndns?hostname=dyndns.example.com&myip=1.2.3.4`

Auth: HTTP Basic Auth (username/password you created in the GUI)

## Hetzner Cloud DNS

- Uses `https://api.hetzner.cloud/v1` zones/rrsets endpoints (https://docs.hetzner.cloud/reference/cloud#tag/zones)

## Database

- SQLite (better-sqlite3), file at `frontend/data/dyndns.db`

## Production (Docker + Caddy)

### Prerequisites
- Docker and Docker Compose installed
- A public domain pointing to your server

### Configure
1. Create a `.env` next to `docker-compose.prod.yml`:
   ```
   DOMAIN_DYNDNS=dyndns.example.com
   ```
2. Ensure the domain is referenced in Caddy via `{$DOMAIN_DYNDNS}` in [Caddyfile](Caddyfile):
   ```
   {$DOMAIN_DYNDNS} {
     reverse_proxy dyndns:4321
   }
   ```
3. Verify volumes in [docker-compose.prod.yml](docker-compose.prod.yml) to persist SQLite at `./frontend/data`.

### Build and Run
```bash
# from repo root
docker compose -f docker-compose.prod.yml up -d --build
```

- App: `https://$DOMAIN_DYNDNS/`
- DynDNS: `https://$DOMAIN_DYNDNS/dyndns`

### First-Time Setup
- Open the site and complete `/setup` to create the first admin

### Add a DynDNS User and Domain
- In the GUI, create a DynDNS user (username/password + Hetzner API key)
- Add a domain (FQDN) and initial IP; zone and record name auto-resolve via Hetzner Cloud DNS rrsets

### Update Examples
- Curl (Linux/macOS):
  - All domains, IP auto-detect:
    ```
    curl -u user:pass https://$DOMAIN_DYNDNS/dyndns
    ```
  - Specific hostname with IP:
    ```
    curl -u user:pass "https://$DOMAIN_DYNDNS/dyndns?hostname=host.example.com&myip=1.2.3.4"
    ```
- PowerShell (Windows):
  ```
  $pair = "user:pass"
  $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
  Invoke-WebRequest -Uri "https://$DOMAIN_DYNDNS/dyndns?myip=1.2.3.4" -Headers @{ Authorization = "Basic $b64" }
  ```

### Notes
- Uses Hetzner Cloud DNS zones/rrsets `set_records` to update A records
- Recent updates appear on the dashboard (last 5 per user)
- Data persists in `./frontend/data` (SQLite)

## Security

- Secrets: provide Hetzner API key per DynDNS user via the GUI
- Reverse proxy (Caddy) auto-provisions TLS (Let's Encrypt)

