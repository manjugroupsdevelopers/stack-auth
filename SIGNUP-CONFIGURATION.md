# Stack Auth Sign-Up Configuration

## ✅ Sign-Up is Now Enabled!

I've updated your `.env.production` file to enable user sign-up.

## Configuration Added

```bash
# Enable user sign-up
STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=true

# Allow localhost (for development)
STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=true

# Enable OTP authentication
STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED=true
```

## What This Does

### Sign-Up Enabled
- ✅ Users can now register/sign up
- ✅ Sign-up forms will be available in your app
- ✅ New users can create accounts

### OTP Enabled
- ✅ One-Time Password authentication available
- ✅ Users can sign in with email codes
- ✅ Passwordless authentication option

### Localhost Allowed
- ✅ Can test on localhost
- ⚠️ Set to `false` in production for security

## Apply Changes

### If Using Docker

Restart the containers to apply changes:

```bash
docker compose -f docker-compose.production.yml restart stack-auth
```

Or stop and start:

```bash
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml up -d
```

### If Using Development Mode

Restart the dev server:

```bash
# Stop current dev server (Ctrl+C)
# Then restart:
pnpm dev
```

## Additional Sign-Up Options

### Enable OAuth Providers

Uncomment and configure in `.env.production`:

```bash
# Enable GitHub and Google OAuth
STACK_SEED_INTERNAL_PROJECT_OAUTH_PROVIDERS=github,google
```

Available providers:
- `github` - GitHub OAuth
- `google` - Google OAuth
- `facebook` - Facebook OAuth
- `microsoft` - Microsoft OAuth
- `apple` - Apple Sign In
- `discord` - Discord OAuth
- `spotify` - Spotify OAuth
- `gitlab` - GitLab OAuth
- `linkedin` - LinkedIn OAuth
- `x` - X (Twitter) OAuth
- `slack` - Slack OAuth

### Create Default Admin User

Uncomment and set in `.env.production`:

```bash
STACK_SEED_INTERNAL_PROJECT_USER_EMAIL=admin@example.com
STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD=your-secure-password
STACK_SEED_INTERNAL_PROJECT_USER_INTERNAL_ACCESS=true
```

This creates an admin user on first startup.

## Configure Sign-Up in Dashboard

After starting Stack Auth, you can configure sign-up settings in the dashboard:

1. Go to: http://localhost:8101
2. Navigate to: **Authentication** → **Sign-Up Settings**
3. Configure:
   - Email verification requirements
   - Password requirements
   - Allowed domains
   - Custom fields
   - Sign-up rules

## Sign-Up Methods Available

With current configuration:

✅ **Email + Password**
- Users can sign up with email and password
- Email verification available

✅ **OTP (One-Time Password)**
- Passwordless sign-up with email codes
- No password required

✅ **OAuth** (if configured)
- Sign up with social providers
- Requires provider configuration

## Testing Sign-Up

### 1. Start Stack Auth

```bash
# Docker
docker compose -f docker-compose.production.yml up -d

# Or Development
pnpm dev
```

### 2. Access Dashboard

Open: http://localhost:8101

### 3. Test Sign-Up Flow

The sign-up option should now be available in:
- Your application's auth UI
- Stack Auth dashboard
- API endpoints

## Disable Sign-Up (If Needed)

To disable sign-up later:

```bash
# In .env.production
STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=false
```

Then restart the service.

## Production Considerations

### Security Settings

For production, update these:

```bash
# Disable localhost
STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=false

# Require email verification
# (Configure in dashboard)

# Set strong password requirements
# (Configure in dashboard)

# Limit sign-up domains if needed
# (Configure in dashboard)
```

### Email Configuration

Make sure email is configured for:
- Email verification
- OTP codes
- Password resets

```bash
# Required for email functionality
STACK_FREESTYLE_API_KEY=your_actual_api_key_here
```

Get your API key from: https://freestyle.sh

## Troubleshooting

### Sign-Up Still Not Available

1. **Check environment variable:**
   ```bash
   grep SIGN_UP_ENABLED .env.production
   # Should show: STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=true
   ```

2. **Restart service:**
   ```bash
   docker compose -f docker-compose.production.yml restart stack-auth
   ```

3. **Check logs:**
   ```bash
   docker logs stack-auth-server
   ```

### Email Not Working

1. **Set Freestyle API key:**
   ```bash
   STACK_FREESTYLE_API_KEY=your_key_here
   ```

2. **Restart service** after updating

### OAuth Not Working

1. **Configure OAuth providers** in dashboard
2. **Set redirect URLs** correctly
3. **Add provider credentials** (client ID, secret)

## Summary

✅ Sign-up is now enabled in your configuration  
✅ OTP authentication is available  
✅ Localhost is allowed for testing  
🔄 Restart your Stack Auth service to apply changes  
🌐 Access dashboard at: http://localhost:8101

---

**Next Steps:**
1. Restart Stack Auth service
2. Test sign-up flow
3. Configure additional settings in dashboard
4. Set up email provider (Freestyle) for full functionality
