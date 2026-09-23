# Stack Auth - Linux Server Deployment

## Prerequisites

- Docker & Docker Compose installed
- PostgreSQL 16 running (can be Docker or standalone)
- Ports 8101 (Dashboard) and 8102 (API) available

## 1. Pull the Image

```bash
docker pull manjugroups/stackauth:latest
```

## 2. Set Up Directory Structure

```bash
mkdir -p ~/devops/stack-auth/dev ~/devops/stack-auth/prod
cd ~/devops/stack-auth
```

## 3. Create docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: stackframe
    ports:
      - "5434:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  stack-auth:
    image: manjugroups/stackauth:${TAG:-latest}
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - ${ENV_FILE:-.env}
    ports:
      - "${DASHBOARD_PORT:-8101}:8101"
      - "${API_PORT:-8102}:8102"
    restart: unless-stopped

volumes:
  postgres-data:
```

## 4. Create Environment File

### Dev (dev/.env)

```env
ENV_FILE=dev/.env
TAG=latest

NEXT_PUBLIC_STACK_API_URL=http://YOUR_SERVER_IP:8102
NEXT_PUBLIC_STACK_DASHBOARD_URL=http://YOUR_SERVER_IP:8101

STACK_DATABASE_CONNECTION_STRING=postgresql://postgres:password@postgres:5432/stackframe

STACK_SERVER_SECRET=CHANGE_THIS_TO_A_RANDOM_32_CHAR_STRING

STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=true
STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=true
STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED=true
STACK_SEED_INTERNAL_PROJECT_USER_EMAIL=admin@localhost.com
STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD=admin123456
STACK_SEED_INTERNAL_PROJECT_USER_INTERNAL_ACCESS=true

STACK_RUN_MIGRATIONS=true
STACK_RUN_SEED_SCRIPT=true

STACK_JS_EXECUTION_ENGINE=legacy
STACK_SANDBOX_TIMEOUT_MS=30000
STACK_SANDBOX_ALLOWED_MODULES=react@19.1.1,react-dom@19.1.1,@react-email/components@1.0.6,arktype@2.1.20

# Airix SMS (Phone OTP)
STACK_SMS_PROVIDER=airix
STACK_AIRIX_SMS_API_URL=https://api-mfpl.theairix.com/api/integrations/otp/send
STACK_AIRIX_SMS_API_KEY=CHANGE_THIS_TO_YOUR_AIRIX_API_KEY
STACK_AIRIX_SMS_APP_ID=airix-meet
STACK_AIRIX_SMS_MESSAGE_TYPE=verification

NODE_ENV=production
DASHBOARD_PORT=8101
API_PORT=8102
```

### Prod (prod/.env)

Same as dev but update:
- `NEXT_PUBLIC_STACK_API_URL` and `NEXT_PUBLIC_STACK_DASHBOARD_URL` to your domain
- `STACK_SERVER_SECRET` to a unique secure value
- `STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=false`

## 5. Start Services

```bash
# Dev
docker compose --env-file dev/.env up -d

# Prod
docker compose --env-file prod/.env up -d
```

## 6. Verify

```bash
# Check containers
docker compose ps

# Check logs
docker compose logs -f stack-auth

# Test API
curl http://localhost:8102
curl http://localhost:8101
```

## 7. Update to Latest Image

```bash
docker compose --env-file dev/.env pull
docker compose --env-file dev/.env up -d
```

## 8. Database Backup & Restore

```bash
# Backup
docker exec $(docker compose ps -q postgres) pg_dump -U postgres stackframe > backup.sql

# Restore
cat backup.sql | docker exec -i $(docker compose ps -q postgres) psql -U postgres stackframe
```

## Phone OTP API Usage

### Send OTP
```bash
curl -X POST http://YOUR_SERVER:8102/api/latest/auth/phone-otp/send-code \
  -H "Content-Type: application/json" \
  -H "x-stack-access-type: client" \
  -H "x-stack-project-id: YOUR_PROJECT_ID" \
  -H "x-stack-publishable-client-key: YOUR_PUBLISHABLE_KEY" \
  -d '{"phone": "+91XXXXXXXXXX"}'
```

Response: `{"nonce": "..."}`

### Verify OTP
```bash
curl -X POST http://YOUR_SERVER:8102/api/latest/auth/phone-otp/sign-in \
  -H "Content-Type: application/json" \
  -H "x-stack-access-type: client" \
  -H "x-stack-project-id: YOUR_PROJECT_ID" \
  -H "x-stack-publishable-client-key: YOUR_PUBLISHABLE_KEY" \
  -d '{"code": "XXXXXX_NONCE_FROM_STEP_1"}'
```

The `code` is the 6-digit OTP concatenated with the nonce (45 chars total).

Response: `{"refresh_token": "...", "access_token": "...", "is_new_user": true, "user_id": "..."}`

## Troubleshooting

- **Container won't start:** Check `docker compose logs stack-auth`
- **DB connection error:** Ensure postgres is healthy: `docker compose ps`
- **Port conflict:** Change `DASHBOARD_PORT` / `API_PORT` in .env
- **SMS 401 error:** Check Airix API credentials in `.env`
