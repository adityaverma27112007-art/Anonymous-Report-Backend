# Confidential Reporting Backend

<p align="center">
  <img src="https://media1.tenor.com/images/d8ba502654a54441fdc901618cb75827/tenor.gif?itemid=7325905" alt="Shinchan animated reaction" width="180" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://media2.giphy.com/media/eNvPo1OAXVpZsSIUXU/giphy.gif" alt="Crayon Shinchan animated GIF" width="180" />
</p>

<p align="center">
  <strong>Anonymous reporting • Case-code tracking • Secure moderator review</strong>
</p>

<p align="center">
  <em>A backend-only confidential reporting system designed to keep reporter identity out of the application data model.</em>
</p>

---

> **Note:** The Shinchan GIFs above are decorative. They are externally hosted and are not required for the API to run. For a fully self-contained repository, replace them with locally licensed assets under an `assets/` directory.

## Overview

A backend-only confidential reporting system for anonymous submissions, case-code tracking, and authenticated moderator review.

## Stack

- Node.js 20+
- Express
- SQLite via `better-sqlite3`
- Zod validation
- JWT + bcrypt for moderator authentication
- Helmet, CORS controls, and rate limiting
- OpenAPI 3 specification
- Vitest + Supertest automated tests

## Reporting workflow

<p align="center">
  <code>SUBMITTED</code> &nbsp;→&nbsp; <code>UNDER_REVIEW</code> &nbsp;→&nbsp; <code>RESOLVED</code> / <code>DISMISSED</code>
</p>

<p align="center">
  🔒 Anonymous submission &nbsp; • &nbsp; 🎫 Random case code &nbsp; • &nbsp; 🛡️ Moderator-only review
</p>

## Setup

```bash
git clone <repository-url>
cd confidential-reporting-backend
npm install
cp .env.example .env
```

Generate strong secrets. For example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set `CASE_CODE_SECRET` and `JWT_SECRET` to different random values.

Set a strong `MODERATOR_PASSWORD` (12+ characters).

Start:

```bash
npm start
```

Development:

```bash
npm run dev
```

Tests:

```bash
npm test
```

The API listens on `http://localhost:3000` by default locally.

### Deployed API

**Production URL:** `https://anonymous-report-backend.onrender.com`

Health check:

`GET https://anonymous-report-backend.onrender.com/health`

The production deployment runs on Render using Docker. Production secrets are configured in Render Environment Variables and are not committed to GitHub.

## API

### 1. Submit an anonymous report

`POST /api/reports`

Request:

```json
{
  "category": "Security",
  "description": "A security issue was discovered in the internal service.",
  "evidenceUrl": "https://example.com/reference"
}
```

Response `201`:

```json
{
  "message": "Report submitted successfully.",
  "caseCode": "uX...32-character-random-code...",
  "status": "SUBMITTED"
}
```

The case code is the reporter's credential. It is shown only in this response and should be stored by the reporter.

### 2. Track a report

`POST /api/reports/track`

Request:

```json
{
  "caseCode": "uX...32-character-random-code..."
}
```

Response `200`:

```json
{
  "caseStatus": "UNDER_REVIEW",
  "category": "Security",
  "submittedAt": "2026-09-21T12:00:00.000Z",
  "updatedAt": "2026-09-21T13:15:00.000Z",
  "updates": [
    {
      "status": "SUBMITTED",
      "message": "Report received.",
      "createdAt": "2026-09-21T12:00:00.000Z"
    },
    {
      "status": "UNDER_REVIEW",
      "message": "A moderator is reviewing this report.",
      "createdAt": "2026-09-21T13:15:00.000Z"
    }
  ]
}
```

Tracking intentionally uses POST rather than putting the case code in a URL. This reduces accidental exposure through browser history, proxy logs, and analytics systems.

### 3. Moderator login

`POST /api/mod/auth/login`

Request:

```json
{
  "email": "moderator@example.com",
  "password": "your-password"
}
```

Response:

```json
{
  "tokenType": "Bearer",
  "accessToken": "<jwt>",
  "expiresIn": "8h"
}
```

Use:

```text
Authorization: Bearer <jwt>
```

### 4. List reports

`GET /api/mod/reports`

Optional filters:

```text
GET /api/mod/reports?status=UNDER_REVIEW
GET /api/mod/reports?category=Security&status=SUBMITTED
```

The moderator response contains the report contents, but no reporter identity information and no case code.

### 5. Get a report

`GET /api/mod/reports/:id`

Requires moderator authentication.

### 6. Update status

`PATCH /api/mod/reports/:id/status`

Request:

```json
{
  "status": "UNDER_REVIEW",
  "message": "A moderator is reviewing the report."
}
```

Allowed workflow:

```text
SUBMITTED -> UNDER_REVIEW
UNDER_REVIEW -> RESOLVED
UNDER_REVIEW -> DISMISSED
```

Invalid transitions return `409 Conflict`.

## HTTP status behaviour

- `200 OK` — successful reads/updates
- `201 Created` — report created
- `400 Bad Request` — invalid input
- `401 Unauthorized` — missing/invalid moderator credentials
- `404 Not Found` — unknown report/case code/endpoint
- `409 Conflict` — invalid status transition
- `429 Too Many Requests` — rate limit exceeded
- `500 Internal Server Error` — unexpected server-side error

## How anonymity is maintained

1. **No reporter account exists.** The submission endpoint does not request name, email, phone, employee ID, or any other identity field.
2. **No reporter identity is stored in the database.** The report schema has only category, description, optional evidence URL, status, and timestamps.
3. **Case codes are random.** Each code contains 192 bits of cryptographically secure randomness and is not sequential.
4. **Case codes are not stored in plaintext.** Only an HMAC-SHA-256 hash of the code is stored. The plaintext code is returned once at submission.
5. **Reporter tracking is separated from moderator access.** A reporter can see only public status/update information with the case code. They cannot retrieve the full report through the tracking endpoint.
6. **Moderator responses do not contain the case code.** Moderators work from an internal UUID.
7. **Request bodies are not logged by this application.** The application also avoids adding request logging middleware that could capture descriptions or case codes.
8. **No outbound fetch is performed for evidence URLs.** The server stores the URL as submitted, preventing a server-side URL-fetch/SSRF path.
9. **Tracking uses POST.** The case code is sent in the request body rather than the URL.
10. **Rate limiting reduces case-code guessing and submission abuse.**
11. **Security headers are enabled with Helmet.**
12. **Moderator access is protected by bcrypt password verification and short-lived JWTs.**

### Important operational limitation

Application-level anonymity is not the same as guaranteed network anonymity.

A deployment platform, reverse proxy, WAF, CDN, load balancer, access logger, or hosting provider may independently retain IP addresses or other metadata. If strong anonymity is required, configure the entire deployment stack accordingly: minimize or disable identifying access logs, avoid analytics/tracking, use HTTPS, restrict administrative access, and document the organization's retention policies.

Also, the report description itself can contain identifying information. The API cannot prevent a reporter from identifying themselves in their own text or evidence.

## Security assumptions and design decisions

- SQLite is suitable for a small-to-medium deployment. Use PostgreSQL for larger/high-availability deployments.
- HTTPS is required in production.
- `CASE_CODE_SECRET` and `JWT_SECRET` must be stored in a secret manager/environment, never committed.
- Moderator credentials should be managed through a proper identity provider for production deployments with multiple moderators.
- This reference implementation intentionally does not provide password reset or self-service moderator registration.
- Evidence is represented as a URL only. No file upload is implemented.
- Reports are retained indefinitely unless an operator adds a retention/deletion policy.
- Moderator access is intentionally not anonymous; moderator authentication is separate from reporter anonymity.
- The system does not store reporter IPs in the application database.
- If infrastructure logs include request IPs, that is an infrastructure-level privacy concern and must be configured separately.
- A case code is a bearer credential. Anyone who obtains it can track that case.

## cURL examples

The following examples use the deployed Render API. Replace placeholder credentials and tokens with your own values.

### Health check

```bash
curl https://anonymous-report-backend.onrender.com/health
```

Expected response:

```json
{"status":"ok"}
```

### Submit an anonymous report

```bash
curl -X POST https://anonymous-report-backend.onrender.com/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "category":"Harassment",
    "description":"A detailed description of the incident."
  }'
```

Save the returned `caseCode` for tracking.

### Track a report

```bash
curl -X POST https://anonymous-report-backend.onrender.com/api/reports/track \
  -H "Content-Type: application/json" \
  -d '{"caseCode":"PASTE_CASE_CODE_HERE"}'
```

### Moderator login

```bash
curl -X POST https://anonymous-report-backend.onrender.com/api/mod/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"moderator@example.com","password":"your-password"}'
```

Copy the returned `accessToken` and use it as a Bearer token.

### List reports

```bash
curl https://anonymous-report-backend.onrender.com/api/mod/reports \
  -H "Authorization: Bearer PASTE_JWT_HERE"
```

### Filter reports

```bash
curl "https://anonymous-report-backend.onrender.com/api/mod/reports?status=UNDER_REVIEW&category=Security" \
  -H "Authorization: Bearer PASTE_JWT_HERE"
```

### Update report status

```bash
curl -X PATCH https://anonymous-report-backend.onrender.com/api/mod/reports/REPORT_UUID/status \
  -H "Authorization: Bearer PASTE_JWT_HERE" \
  -H "Content-Type: application/json" \
  -d '{"status":"UNDER_REVIEW","message":"The report is being reviewed."}'
```

## OpenAPI

The complete OpenAPI 3 specification is in `openapi.json`. It can be imported into Swagger UI, Postman, Insomnia, or another API client.

## Project structure

```text
.
├── src/
│   ├── app.js          # Express routes/middleware
│   ├── auth.js         # Moderator JWT middleware
│   ├── bootstrap.js    # First moderator bootstrap
│   ├── db.js           # SQLite schema and connection
│   ├── security.js     # Case-code hashing and auth helpers
│   ├── server.js       # Startup
│   └── validation.js   # Zod schemas
├── tests/
│   └── api.test.js
├── openapi.json
├── .env.example
├── package.json
└── README.md
```

## A small Shinchan corner

<p align="center">
  <img src="https://media1.tenor.com/images/d8ba502654a54441fdc901618cb75827/tenor.gif?itemid=7325905" alt="Shinchan" width="140" />
  &nbsp; Keep the README fun; keep the reporting data private. &nbsp;
  <img src="https://media2.giphy.com/media/eNvPo1OAXVpZsSIUXU/giphy.gif" alt="Shinchan animation" width="140" />
</p>

## Suggested production hardening

- Put the API behind TLS and a reverse proxy with carefully reviewed logging.
- Use a managed PostgreSQL database for production scale.
- Store secrets in a secret manager.
- Use an organization SSO/OIDC provider for moderators and role-based access control.
- Add a dedicated audit log for moderator actions without storing reporter identifiers.
- Add database encryption-at-rest and encrypted backups.
- Add automated dependency/security scanning.
- Define explicit retention/deletion policies.
- Consider separating the public reporter service from the moderator service at the network layer.
- If attachments are added, store them in a private object store with malware scanning and randomized object keys; never expose filesystem paths.


---

### README animation sources

- Shinchan reaction GIF: Tenor
- Crayon Shinchan GIF: GIPHY

These animations are presentation-only and have no dependency on the backend. Review the respective host's usage/licensing terms before redistributing the repository publicly.
