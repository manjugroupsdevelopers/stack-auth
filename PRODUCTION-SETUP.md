# Stack Auth Production Setup Guide

This guide will help you run Stack Auth in production mode using Docker on your Mac.

## Prerequisites

- Docker installed and running
- At least 4GB of available RAM
- Ports 5432, 8101, and 8102 available

## Quick Start

### 1. Configure Environment Variables

Edit the `.env.production` file and update the following **REQUIRED** values:

```bash
# Generate a secure secret (at least 32 characters)
STACK_SERVER_SECRET=$(openssl rand -base64 32)

# Get your Freestyle API key from https://freestyle.sh
STACK_FREESTYLE_API_KEY=your_actual_api_key_here
```

### 2. Run the Setup Script

```bash
./setup-production.sh
```

This script will:
- Stop and clean up any existing containers
- Start a PostgreSQL database
- Pull the latest Stack Auth image
- Start the Stack Auth server
- Initialize the database

### 3. Access Your Instance

- **Dashboard**: http://localhost:8101
- **API**: http://localhost:8102

## Manual Setup

If you prefer to set up manually:

### Start PostgreSQL

```bash
docker run -d \
  --name stack-postgres-prod \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=stackframe \
  -p 5432:5432 \
  postgres:latest
```

### Start Stack Auth Server

```bash
docker run -d \
  --name stack-auth-server \
  --env-file .env.production \
  -p 8101:8101 \
  -p 8102:8102 \
  stackauth/server:latest
```

## Configuration Details

### Required Environment Variables

| Variable | Description | How to Get |
|----------|-------------|------------|
| `STACK_SERVER_SECRET` | Secret key for encryption | Generate with `openssl rand -base64 32` |
| `STACK_FREESTYLE_API_KEY` | Email service API key | Sign up at https://freestyle.sh |
| `STACK_DATABASE_CONNECTION_STRING` | PostgreSQL connection | Default: `postgresql://postgres:password@host.docker.internal:5432/stackframe` |

### Optional Configuration

#### Custom Domain URLs

If deploying to a custom domain, update:

```bash
NEXT_PUBLIC_STACK_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_STACK_DASHBOARD_URL=https://dashboard.yourdomain.com
```

#### Webhooks (Svix)

To enable webhooks:

```bash
STACK_SVIX_URL=https://your-svix-instance.com
STACK_SVIX_API_KEY=your-svix-api-key
```

#### S3 Storage

For file uploads:

```bash
STACK_AWS_S3_BUCKET=your-bucket-name
STACK_AWS_ACCESS_KEY_ID=your-access-key
STACK_AWS_SECRET_ACCESS_KEY=your-secret-key
STACK_AWS_REGION=us-east-1
```

## Database Management

### Initialize Database

The database is automatically initialized on first run. To manually initialize:

```bash
docker exec -it stack-auth-server pnpm db:init
```

### Run Migrations

```bash
docker exec -it stack-auth-server pnpm db:migrate
```

### Backup Database

```bash
docker exec stack-postgres-prod pg_dump -U postgres stackframe > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker exec -i stack-postgres-prod psql -U postgres stackframe
```

## Monitoring and Logs

### View Stack Auth Logs

```bash
docker logs -f stack-auth-server
```

### View PostgreSQL Logs

```bash
docker logs -f stack-postgres-prod
```

### Check Container Status

```bash
docker ps | grep -E "stack-auth-server|stack-postgres-prod"
```

## Maintenance

### Stop Services

```bash
docker stop stack-auth-server stack-postgres-prod
```

### Start Services

```bash
docker start stack-postgres-prod
docker start stack-auth-server
```

### Restart Services

```bash
docker restart stack-postgres-prod
docker restart stack-auth-server
```

### Remove Containers (Data Loss!)

```bash
docker stop stack-auth-server stack-postgres-prod
docker rm stack-auth-server stack-postgres-prod
```

### Update to Latest Version

```bash
# Pull latest image
docker pull stackauth/server:latest

# Stop and remove old container
docker stop stack-auth-server
docker rm stack-auth-server

# Start new container
docker run -d \
  --name stack-auth-server \
  --env-file .env.production \
  -p 8101:8101 \
  -p 8102:8102 \
  stackauth/server:latest
```

## Troubleshooting

### Container Won't Start

Check logs:
```bash
docker logs stack-auth-server
```

Common issues:
- Missing or invalid environment variables
- Database connection failed
- Ports already in use

### Database Connection Issues

Verify PostgreSQL is running:
```bash
docker ps | grep stack-postgres-prod
```

Test connection:
```bash
docker exec -it stack-postgres-prod psql -U postgres -d stackframe -c "SELECT 1;"
```

### Port Conflicts

If ports are already in use, modify the port mappings:

```bash
# Use different ports
docker run -d \
  --name stack-auth-server \
  --env-file .env.production \
  -p 9101:8101 \
  -p 9102:8102 \
  stackauth/server:latest
```

Update your `.env.production` accordingly:
```bash
NEXT_PUBLIC_STACK_API_URL=http://localhost:9102
NEXT_PUBLIC_STACK_DASHBOARD_URL=http://localhost:9101
```

## Security Considerations

### Production Checklist

- [ ] Change default PostgreSQL password
- [ ] Set a strong `STACK_SERVER_SECRET`
- [ ] Use HTTPS in production (reverse proxy)
- [ ] Enable firewall rules
- [ ] Regular database backups
- [ ] Monitor logs for suspicious activity
- [ ] Keep Docker images updated
- [ ] Disable new user sign-ups for internal project

### Recommended: Use Docker Compose

For easier management, consider using Docker Compose. Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:latest
    container_name: stack-postgres-prod
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD:-password}
      POSTGRES_DB: stackframe
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  stack-auth:
    image: stackauth/server:latest
    container_name: stack-auth-server
    env_file:
      - .env.production
    ports:
      - "8101:8101"
      - "8102:8102"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

Then run:
```bash
docker-compose up -d
```

## Next Steps

1. **Create Admin Account**: Visit http://localhost:8101 and sign up
2. **Configure Project**: Set up your authentication methods
3. **Integrate with Your App**: Add `NEXT_PUBLIC_STACK_API_URL=http://localhost:8102` to your app
4. **Set Up Monitoring**: Configure logging and alerting
5. **Plan Backups**: Schedule regular database backups

## Support

- Documentation: https://docs.stack-auth.com
- GitHub: https://github.com/stack-auth/stack-auth
- Discord: Join the Stack Auth community

## Important Notes

⚠️ **Self-hosting means YOU are responsible for:**
- Security patches and updates
- Database backups and recovery
- Infrastructure reliability
- Monitoring and alerting

Consider using [Stack Auth Cloud](https://app.stack-auth.com) if you prefer managed hosting.
