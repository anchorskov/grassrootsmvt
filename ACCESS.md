# Cloudflare Access — GrassrootsMVT

This app uses **Cloudflare Access** in front of the API at
`https://api.grassrootsmvt.org`. The UI is served from
`https://volunteers.grassrootsmvt.org`.

## Components

- **Access Application (Self-hosted)**
  - **Public hostname:** `api.grassrootsmvt.org`
  - **Path:** `/*`
  - **Policy AUD (kid):** shown on the app page (copy its value)
  - **Team domain:** `skovgard.cloudflareaccess.com`

- **Worker Secrets**
  - `POLICY_AUD` → the app's **AUD** (aka `kid`)
  - `TEAM_DOMAIN` → `skovgard.cloudflareaccess.com`

> Never hardcode secrets in the repo. Both values are injected as Worker
> secrets and surfaced to the UI via a **public** endpoint
> `GET /auth/config`.

## Policies

1. **Bypass** (unauthenticated)
   - Method/Path: `GET /auth/config`
   - Purpose: lets the UI fetch `{ teamDomain, policyAud }` with no session.

2. **Default Require** (authenticated)
   - Everything else under `/*` requires Access (email group / IdP as you prefer).

## Login URL pattern (must match Cloudflare)

When the UI needs a session it performs a **top-level navigation** to:

```
https://<TEAM_DOMAIN>/cdn-cgi/access/login/<API_HOSTNAME>?kid=<POLICY_AUD>&redirect_url=<ENCODED_RETURN_TO_WORKER>
```

For production:

```
https://skovgard.cloudflareaccess.com/cdn-cgi/access/login/api.grassrootsmvt.org?kid=<POLICY_AUD>&redirect_url=https%3A%2F%2Fapi.grassrootsmvt.org%2Fauth%2Ffinish%3Fto%3D<ENCODED_UI_URL>
```

Notes:

- The path segment after `/login/` is the **API hostname**, not the AUD.
- `redirect_url` must point back to the Worker endpoint:
  `https://api.grassrootsmvt.org/auth/finish?to=<UI_URL_ENCODED>`.

## Why we navigate away (not XHR)

Access must set cookies on the protected origin (`api.grassrootsmvt.org`)
and may perform IdP redirects. Browsers block that from XHR due to CORS
and third-party cookie rules. A **top-level navigation** from a small
interstitial (our `connecting.html`) reliably completes the flow and then
returns to the UI.

## Public Config Response

`GET https://api.grassrootsmvt.org/auth/config`

```json
{
  "teamDomain": "https://skovgard.cloudflareaccess.com",
  "policyAud": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```