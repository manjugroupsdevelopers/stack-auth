# Enable Sign-Up in Stack Auth Dashboard

Since the environment variable only affects initial setup, you need to enable sign-up through the dashboard.

## Quick Steps

### 1. Access the Dashboard

Open your browser and go to:
```
http://localhost:8101
```

### 2. Sign In to Dashboard

If this is your first time:
- The dashboard will prompt you to create an account
- Or sign in if you already have one

### 3. Navigate to Authentication Settings

Once logged in:
1. Select your project (or create one if needed)
2. Go to: **Authentication** → **Sign-Up Settings**
3. Or look for **Settings** → **Authentication**

### 4. Enable Sign-Up

Toggle or enable:
- ✅ **Allow Sign-Up** or **Enable Sign-Up**
- ✅ **Email/Password Sign-Up**
- ✅ **OTP Sign-Up** (if you want passwordless)

### 5. Configure Sign-Up Options (Optional)

You can also configure:
- Email verification requirements
- Password strength requirements
- Allowed email domains
- Custom sign-up fields
- OAuth providers (GitHub, Google, etc.)

### 6. Save Changes

Click **Save** or **Update** to apply the changes.

## Alternative: Enable via API

If you prefer to enable sign-up programmatically:

```bash
# Get your project ID from the dashboard
PROJECT_ID="your-project-id"

# Get your admin API key from dashboard → Settings → API Keys
ADMIN_KEY="your-admin-key"

# Enable sign-up via API
curl -X PATCH http://localhost:8102/api/v1/projects/$PROJECT_ID \
  -H "x-stack-admin-access-token: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "signUpEnabled": true
    }
  }'
```

## Verify Sign-Up is Enabled

### Test in Your App

If you're integrating Stack Auth in your application:

```typescript
// The sign-up component should now work
import { SignUp } from '@stackframe/stack';

function SignUpPage() {
  return <SignUp />;
}
```

### Test via Dashboard

1. Go to your project in the dashboard
2. Look for **Users** section
3. Try to create a new user manually
4. Or test the sign-up flow in your app

## Troubleshooting

### Sign-Up Still Disabled

1. **Check Project Settings**
   - Make sure you're in the correct project
   - Verify the setting is saved

2. **Clear Browser Cache**
   ```bash
   # Hard refresh in browser
   Ctrl+Shift+R (Windows/Linux)
   Cmd+Shift+R (Mac)
   ```

3. **Restart Stack Auth**
   ```bash
   docker compose -f docker-compose.production.yml restart stack-auth
   ```

### Can't Access Dashboard

1. **Check if services are running:**
   ```bash
   docker compose -f docker-compose.production.yml ps
   ```

2. **Check logs:**
   ```bash
   docker logs stack-auth-server --tail 50
   ```

3. **Verify URLs:**
   - Dashboard: http://localhost:8101
   - API: http://localhost:8102

## Default Project Configuration

When you first access the dashboard, Stack Auth creates an "internal" project. This is where you configure authentication settings including sign-up.

### Project Structure

- **Internal Project**: Used by the dashboard itself
- **Your Projects**: Create new projects for your applications

Make sure you're configuring the correct project!

## Quick Access Links

- 🌐 **Dashboard**: http://localhost:8101
- 🔌 **API**: http://localhost:8102
- 📚 **Docs**: https://docs.stack-auth.com

## Summary

1. ✅ Open dashboard: http://localhost:8101
2. ✅ Navigate to Authentication → Sign-Up Settings
3. ✅ Enable sign-up
4. ✅ Save changes
5. ✅ Test sign-up in your app

The sign-up feature will be immediately available after enabling it in the dashboard!
