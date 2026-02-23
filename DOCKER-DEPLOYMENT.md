# Stack Auth Docker Deployment Guide

This guide explains how to run Stack Auth using Docker and Docker Compose.

## Prerequisites

- Docker installed and running
- Docker Compose installed
- At least 2GB of available RAM
- Ports 8101, 8102, and 5432 available

## Quick Start

### 1. Configure Environment Variables

Copy and edit the `.env.production` file:

```bash
cp .env.production .env.production.local
```

**Required changes:**

```bash
# Generate a secure secret (required)
STACK_SERVER_SECRET=$(openssl rand -base64 32)

# Get your Freestyle API key from https://freestyle.sh (required for emails)
STACK_FREESTYLE_API_KEY=your_actual_api_key_here
```

### 2. Start Stack Auth

```bash
./start-production.sh
```

Or manually with Docker Compose:

```bash
docker-compose -f docker-compose.production.yml up -d
```

### 3. Access the Application

- **Dashboard**: http://localhost:8101
- **API**: http://localhost:8102

## Architecture

The Docker Compose setup includes:

1. **PostgreSQL** (port 5432)
   - Database for Stack Auth
   - Persistent storage with Docker volumes

2. **Stack Auth Server** (ports 8101, 8102)
   - Backend API (8102)
   - Dashboard UI (8101)
   - Runs migrations automatically on startup

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `STACK_SERVER_SECRET` | JWT encryption key (32+ chars) | Generate with `openssl rand -base64 32` |
| `STACK_FREESTYLE_API_KEY` | Email service API key | Get from https://freestyle.sh |
| `NEXT_PUBLIC_STACK_API_URL` | Backend URL | `http://localhost:8102` |
| `NEXT_PUBLIC_STACK_DASHBOARD_URL` | Dashboard URL | `http://localhost:8101` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL password | `password` |
| `STACK_CLICKHOUSE_URL` | ClickHouse URL for analytics | Empty (disabled) |
| `STACK_SVIX_SERVER_URL` | Svix webhook server URL | Empty |
| `STACK_SVIX_API_KEY` | Svix API key | Empty |

## Common Commands

### View Logs

```bash
# All services
docker-compose -f docker-compose.production.yml logs -f

# Stack Auth only
docker logs -f stack-auth-server

# PostgreSQL only
docker logs -f stack-postgres-prod
```

### Stop Services

```bash
docker-compose -f docker-compose.production.yml down
```

### Restart Services

```bash
docker-compose -f docker-compose.production.yml restart
```

### Reset Database (⚠️ Destructive)

```bash
docker-compose -f docker-compose.production.yml down -v
docker-compose -f docker-compose.production.yml up -d
```

## Building Custom Image

If you want to build the Stack Auth image locally:

```bash
# Build the image
docker build --progress=plain -f docker/server/Dockerfile -t stackauth/server:local .

# Update docker-compose.production.yml to use local image
# Change: image: stackauth/server:latest
# To:     image: stackauth/server:local
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker logs stack-auth-server
```

Common issues:
- Missing required environment variables
- Database connection failed
- Port already in use

### Database connection errors

Verify PostgreSQL is running:
```bash
docker exec stack-postgres-prod pg_isready -U postgres
```

### Email not working

Ensure `STACK_FREESTYLE_API_KEY` is set correctly in `.env.production`.

### Port conflicts

If ports 8101, 8102, or 5432 are in use, you can change them in `docker-compose.production.yml`:

```yaml
ports:
  - "9101:8101"  # Change 9101 to your preferred port
  - "9102:8102"
```

## Production Deployment

For production deployments:

1. **Use strong secrets**:
   ```bash
   STACK_SERVER_SECRET=$(openssl rand -base64 48)
   POSTGRES_PASSWORD=$(openssl rand -base64 32)
   ```

2. **Use external PostgreSQL** (recommended):
   - Update `STACK_DATABASE_CONNECTION_STRING`
   - Remove the `postgres` service from docker-compose

3. **Enable HTTPS**:
   - Use a reverse proxy (nginx, Caddy, Traefik)
   - Configure SSL certificates
   - Update URLs to use https://

4. **Configure backups**:
   - Set up PostgreSQL backups
   - Back up Docker volumes

5. **Monitor resources**:
   - Set up health checks
   - Monitor logs
   - Configure alerts

## Advanced Configuration

### With ClickHouse Analytics

Add to `.env.production`:

```bash
STACK_CLICKHOUSE_URL=http://clickhouse:8123
STACK_CLICKHOUSE_ADMIN_USER=stackframe
STACK_CLICKHOUSE_ADMIN_PASSWORD=your_secure_password
STACK_CLICKHOUSE_EXTERNAL_PASSWORD=your_external_password
```

Then add ClickHouse to `docker-compose.production.yml`:

```yaml
clickhouse:
  image: clickhouse/clickhouse-server:25.10
  container_name: stack-clickhouse
  environment:
    CLICKHOUSE_DB: analytics
    CLICKHOUSE_USER: stackframe
    CLICKHOUSE_PASSWORD: your_secure_password
  ports:
    - "8123:8123"
  volumes:
    - clickhouse-data:/var/lib/clickhouse
  restart: unless-stopped
```

### With Svix Webhooks

See the full dependencies setup in `docker/dependencies/docker.compose.yaml` for Svix configuration.

## Support

- Documentation: https://docs.stack-auth.com
- GitHub: https://github.com/stack-auth/stack
- Discord: https://discord.stack-auth.com
