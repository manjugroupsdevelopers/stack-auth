# 🎉 Stack Auth Admin Access

## ✅ Admin User Created Successfully!

An administrator account has been created for you to access the Stack Auth dashboard.

## Login Credentials

```
Email:    admin@localhost.com
Password: admin123456
```

⚠️ **IMPORTANT**: Change this password after first login!

## Access Dashboard

1. **Open your browser** and go to:
   ```
   http://localhost:8101
   ```

2. **Sign in** with the credentials above

3. **You're in!** You can now:
   - ✅ Enable sign-up for other users
   - ✅ Configure authentication methods
   - ✅ Manage users and projects
   - ✅ Set up OAuth providers
   - ✅ Configure email templates

## Enable Sign-Up for Other Users

Once logged in to the dashboard:

1. Navigate to: **Authentication** → **Sign-Up Settings**
2. Toggle: **Enable Sign-Up** ✅
3. Configure sign-up methods:
   - Email/Password
   - OTP (One-Time Password)
   - OAuth (GitHub, Google, etc.)
4. Click **Save**

Now other users can sign up!

## Quick Links

- 🌐 **Dashboard**: http://localhost:8101
- 🔌 **API**: http://localhost:8102
- 📚 **Documentation**: https://docs.stack-auth.com

## What You Can Do Now

### 1. Configure Authentication
- Enable/disable sign-up
- Set password requirements
- Configure email verification
- Add OAuth providers

### 2. Manage Users
- View all users
- Create users manually
- Edit user profiles
- Manage permissions

### 3. Set Up Projects
- Create new projects for your apps
- Get API keys
- Configure project settings

### 4. Customize Emails
- Edit email templates
- Configure email provider
- Test email delivery

### 5. Monitor Activity
- View authentication logs
- Track user sign-ups
- Monitor API usage

## Security Recommendations

### Change Default Password

1. Go to: **Profile** or **Account Settings**
2. Click: **Change Password**
3. Set a strong password

### For Production

Update `.env.production`:

```bash
# Use a strong password
STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD=your-very-secure-password-here

# Or remove these lines after first setup
# STACK_SEED_INTERNAL_PROJECT_USER_EMAIL=admin@localhost.com
# STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD=admin123456
```

Then restart:
```bash
docker compose -f docker-compose.production.yml restart stack-auth
```

## Troubleshooting

### Can't Log In

1. **Check credentials**:
   - Email: `admin@localhost.com`
   - Password: `admin123456`

2. **Check services are running**:
   ```bash
   docker compose -f docker-compose.production.yml ps
   ```

3. **Check logs**:
   ```bash
   docker logs stack-auth-server --tail 50
   ```

### Dashboard Not Loading

1. **Verify URL**: http://localhost:8101
2. **Check if port is accessible**:
   ```bash
   curl http://localhost:8101
   ```
3. **Restart services**:
   ```bash
   docker compose -f docker-compose.production.yml restart
   ```

## Next Steps

1. ✅ Log in to dashboard: http://localhost:8101
2. ✅ Change default password
3. ✅ Enable sign-up for other users
4. ✅ Configure authentication methods
5. ✅ Set up your first project
6. ✅ Get API keys for your app
7. ✅ Integrate Stack Auth in your application

## Summary

🎉 **You're all set!**

- ✅ Stack Auth is running
- ✅ Admin user created
- ✅ Dashboard accessible
- ✅ Ready to configure

**Login now**: http://localhost:8101

```
Email: admin@localhost.com
Password: admin123456
```

Enjoy using Stack Auth! 🚀
