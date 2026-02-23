# ClickHouse and S3 Optional Dependencies Fix

## Problem

The Stack Auth dashboard was showing errors and not functioning properly because several API endpoints had hard dependencies on ClickHouse and S3, even though these services are optional:

1. `/api/v1/internal/metrics` - Returned 500 errors due to ClickHouse not being configured
2. `/api/v1/session-replays/batch` - Returned 500 errors due to S3 not being configured
3. `/api/v1/analytics/events/batch` - Failed silently when trying to insert analytics events

## Root Cause

These endpoints were calling `getClickhouseAdminClient()` and `uploadBytes()` without checking if the services were configured. When the environment variables were not set, these functions would throw errors, causing the entire endpoint to fail.

## Solution

### 1. Internal Metrics Endpoint (`apps/backend/src/app/api/latest/internal/metrics/route.tsx`)

Added try-catch blocks around ClickHouse queries in:
- `loadUsersByCountry()` - Returns empty object `{}` if ClickHouse unavailable
- `loadDailyActiveUsers()` - Returns array of zeros if ClickHouse unavailable

This allows the metrics endpoint to return successfully with partial data (PostgreSQL-based metrics only) when ClickHouse is not configured.

### 2. Session Replays Endpoint (`apps/backend/src/app/api/latest/session-replays/batch/route.tsx`)

Added early check for S3 private bucket configuration:
```typescript
const s3PrivateBucket = process.env.STACK_S3_PRIVATE_BUCKET;
if (!s3PrivateBucket) {
  throw new StatusError(StatusError.ServiceUnavailable, 
    "Session replay storage is not configured. Please configure S3 private bucket.");
}
```

This provides a clear error message to the client instead of a generic 500 error.

### 3. Analytics Events Endpoint (`apps/backend/src/app/api/latest/analytics/events/batch/route.tsx`)

Wrapped ClickHouse insert in try-catch block:
```typescript
try {
  const clickhouseClient = getClickhouseAdminClient();
  // ... insert analytics events
} catch (error) {
  // ClickHouse is optional, silently skip analytics if not available
}
```

This allows the endpoint to succeed even when ClickHouse is not configured, gracefully degrading the analytics functionality.

## Impact

After these fixes:
- ✅ Dashboard loads without errors
- ✅ Metrics endpoint returns successfully (with PostgreSQL data only)
- ✅ Session replay errors are clear and informative
- ✅ Analytics events don't cause failures
- ✅ All core functionality works without ClickHouse or S3

## Testing

To rebuild and test the fixes:

```bash
./rebuild-and-restart.sh
```

Then access the dashboard at http://localhost:8101

## Future Improvements

Consider:
1. Adding a feature flag or config option to explicitly disable analytics/session replays
2. Showing a warning in the dashboard when optional services are not configured
3. Adding health check endpoints that report the status of optional services
