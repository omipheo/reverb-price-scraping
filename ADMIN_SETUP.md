# Admin and logging setup

## Making a user an admin

Existing users have no `role` until set. To set Dovid and Justin (or any user) as admin, run from project root:

```bash
node scripts/set-admin.js <their-email@example.com>
```

Example:

```bash
node scripts/set-admin.js dovid@company.com
node scripts/set-admin.js justin@company.com
```

Then they must log out and log back in so the session gets `userRole: 'admin'`. After that they can create new users (Login modal → "Create user (admin only)" tab) and set each new user as User or Admin.

## Error logging

- **Server**: Every API request is logged with a timestamp (`[ISO date] METHOD /path`). Errors and 4xx/5xx responses are logged as errors. View logs in the terminal or redirect stdout to a file when starting the app, e.g. `node index.js 2>&1 | tee app.log`.
- **Client**: If loading a calculation fails, the client sends the error message to `POST /api/log-client-error` (timestamped on the server). Use this to debug issues like "loaded calculation then results disappeared."

## No match / partial match log

When a user checks "No match?" or "Partial match?", a record is written to the `matchfeedbacklogs` collection with: calculationId, userId, pedal (input name), personName, productId, noMatch, partialMatch, createdAt. You can query this collection to analyze and improve search (e.g. which pedals are often marked no-match).
