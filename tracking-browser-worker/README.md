# Browser tracking worker

Node 22 or newer; install the pinned dependencies with `npm ci --ignore-scripts`.
Start a locally managed Chrome instance, then run `npm run serve`.

The queue listens on loopback only. Set `TRACK_TOKEN`, `REQUIRE_TRACK_TOKEN=1`,
`DATA_DIR`, `CHROME_PORT`, `CHROME_PROFILE`, and `CHROME_SERVICE_MANAGED=1`.
Store credentials and browser profiles outside this checkout with private permissions.

`CMA_CDP_ENDPOINT` optionally selects a separate loopback Chrome for CMA CGM.
Its network route is configured on that Chrome process. Other carriers retain the
default browser. The worker reconnects after a browser restart, and a dedicated
browser failure does not cancel subsequent carriers. There is no automatic route
rotation or fallback to a failing default CMA route.

Hapag normal website sign-in is opt-in through `HAPAG_NAVIGATOR_UI=1`,
`HAPAG_AUTO_LOGIN=1`, and `HAPAG_WEBSITE_CREDENTIALS_FILE`. On Linux the credential
file must be a regular file owned by the worker user with mode 0600. Production
must not set the optional QA-only `HAPAG_TEST_DEADLINE_UTC`.

`npm test` uses synthetic fixtures only. Live carrier acceptance, real reference
numbers, proxy configuration, account credentials and captured PDFs are private
deployment evidence and are deliberately excluded from Git.

Run each browser, queue, and tunnel as a separate systemd service with automatic
restart and persistent private state. Keep CDP and the queue on loopback; expose
the authenticated API through a restricted tunnel. Carrier verification can still
change in future; incomplete detail capture and interactive challenges must be
reported as such rather than saved as successful shipment results.
