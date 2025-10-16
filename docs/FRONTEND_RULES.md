# Frontend API Routing Rules

## Local Development API Override

By default, the UI will make API calls to the same origin (e.g., if the UI is served from `http://localhost:8788`, API calls go to `http://localhost:8788/api/*`).

### To Point UI at a Different Local API Port

If you need the UI to call a different local API server (e.g., worker running on port 8787), use this browser console command:

```javascript
localStorage.setItem('GRMVT_API_BASE','http://localhost:8787')
```

After setting this override:
- Reload the page
- All API calls will now go to `http://localhost:8787/api/*` instead of same-origin

### To Clear the Override

```javascript
localStorage.removeItem('GRMVT_API_BASE')
```

After clearing:
- Reload the page  
- API calls return to same-origin behavior

### Notes

- The override only works in local development (localhost/127.0.0.1)
- The override value must be a valid HTTP/HTTPS URL
- This setting persists across browser sessions until manually cleared
- In production, the override is ignored for security

## Implementation Details

- Environment detection: `/static/config/environments.js`
- API client: `/ui/src/apiClient.js`
- All API calls flow through `environmentConfig.getApiUrl()` with localStorage override support