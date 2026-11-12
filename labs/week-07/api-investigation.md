# Week 7 API investigation

Your name: Vandana Ramanjinappa
Date: 12th November 2026
Atrium address and port: http://localhost:9090
Atrium version or date of local copy: v0.1.0 (package.json, local copy)

Fill this in as you work. Give statuses and short response excerpts. Record
whether a request carried a session cookie, but never paste its full value
or a password.

## 1. Original profile request

- Signed-in account: alice.nolan
- Page that made the request: My profile (`http://localhost:9090/profile`)
- Method and full API path: `GET /api/profile/17`
- Was a session cookie present? (yes/no, value hidden): Yes (Cookie header present, value not recorded)
- First response status and content type: 200 OK, `application/json`
- Returned ID, username and field names: ID 17, username `alice.nolan`. Fields present: `id`, `username`, `displayName`, `email`, `department`, `role`, `bio`
- What did the request ask for, in your own words? The request asked the server to return the profile record for the colleague with ID 17, using the browser's signed-in session to identify who was asking. The response identified the returned record by its `id` field (17) and matching `username` (alice.nolan), confirming it was Alice's own profile.

## 2. Replayed and changed profile requests

| Request | Account whose session I used | First status | Returned ID and name, or error | Evidence reference |
|---|---|---|---|---|
| Repeat of the original path | alice.nolan | 200 | ID 17, Alice Nolan | Direct browser request to `/api/profile/17` |
| Path with one ID changed | alice.nolan | 200 | ID 18, Bob Keane | Direct browser request to `/api/profile/18` |

- What I changed: Only the final number in the URL path (17 → 18). Nothing else — same browser, same signed-in session as Alice.
- What stayed the same: The account used (Alice's session cookie), the HTTP method (GET), and the overall path structure (`/api/profile/:id`).
- Whose record the changed ID names, and how I checked: ID 18 returned a profile for "Bob Keane", `bob.keane@atrium.example`, Finance department — confirmed directly from the JSON body returned, matching the username pattern seen for Alice (`alice.nolan` → ID 17).
- What the comparison shows: The server returned another colleague's full profile data in response to a request made with Alice's own session, without checking whether Alice is entitled to view Bob's record. The only authorisation check applied was confirming *someone* was signed in — not whether *this specific signed-in user* may access *this specific record*.

## 3. Without sign-in 

- How I made sure the window had no Atrium session: Used a fresh Incognito browser window, which starts with no cookies or stored session, separate from the ordinary signed-in Alice window.
- `GET /api/profile/17`: first status and response body:  first status and response body: Status 401. Body: `{"error":"You need to sign in to use this part of Atrium."}`
- `GET /profile`: first status, redirect if any, and final page: first status, redirect if any, and final page: Request to `/profile` redirected to `/login`, landing on the "Sign in to Atrium" page.
- What this establishes about authentication: Both the API and the page correctly refuse access when no session is present — this confirms Atrium does enforce authentication (identity checking) consistently across the page and its API.
- What it does not establish about authorisation: This test only shows what happens with *no* session at all. It says nothing about whether a *signed-in* user is restricted to their own records — that's what Task 2 already demonstrated (Alice could read Bob's profile). Authentication (are you anyone at all?) and authorisation (are you allowed to see *this specific* thing?) are two separate checks, and this task only tests the first one.

## 4. Administration page and API

| Account | Request path | First status | Relevant response text or JSON fields | Evidence reference |
|---|---|---|---|---|
| Alice | `/admin/users` | 403 | "Administrators only." | Captured directly, 13 Nov 2026 |
| Alice | `/api/admin/users` | 200 | Full array of 3 users with `id`, `displayName`, `username`, `department`, `role` — including Morgan Doyle, role: admin | Captured directly, 13 Nov 2026 |
| Morgan | `/admin/users` | 200 | "Staff accounts" table showing all 3 users: Alice Nolan (member), Bob Keane (member), Morgan Doyle (admin), with ID, name, username, department, role columns | Captured directly, 13 Nov 2026 |
| Morgan | `/api/admin/users` | 200 | Same 3 users as JSON: `[{"id":17,...,"role":"member"},{"id":18,...,"role":"member"},{"id":99,...,"role":"admin"}]` | Captured directly, 13 Nov 2026 |

- Which request did Morgan's page make after loading?
- What role decision should the server make for each route?
- Where did the observed decisions agree or differ?

## 5. Security conclusions

**Profile request.** State the account, exact request, response and rule the
server should apply. Keep any effect you did not observe conditional.
Signed in as `alice.nolan`, a GET request to `/api/profile/18` returned status 200 with Bob Keane's full profile (id, username, displayName, email, department, role, bio), even though Alice's own session should only entitle her to her own record (id 17). The server checked that *someone* was signed in (authentication), but did not check whether that specific signed-in user was entitled to read record 18 (authorisation). The rule the server should apply is: an authenticated user may only retrieve their own profile via this endpoint, or the request must be refused (403) for any ID that does not belong to the requesting session. I did not test whether this also allows writing or modifying another user's profile, since this task used only GET requests.


**Administration request.** State the account, exact request, response and
role rule the server should apply.
Signed in as `alice.nolan` (role: member), a GET request to `/admin/users` correctly returned 403 Forbidden ("Administrators only."). However, a GET request to `/api/admin/users`, using the same signed-in session, returned 200 OK with the full staff list, including Morgan Doyle's role as admin. Signed in as `morgan.doyle` (role: admin), both routes correctly returned 200 with the same data. The rule the server should apply is: both `/admin/users` and `/api/admin/users` should require the admin role, refusing any non-admin session with 403. The evidence shows the page enforces this rule, but the API route does not — it only requires an authenticated session, not a specific role.

**Directory comparison.** Which returned fields are already visible at
`/directory` to a signed-in colleague? Which fields does an API add? How does
that limit your impact claim?
At `/directory`, a signed-in colleague can already see each person's `name`, `department`, `email`, and `role` — this is visible to Alice without needing to use the API at all. The `/api/profile/:id` endpoint adds two fields beyond this: `username` and `bio`. This limits the impact claim for the profile finding: the authorisation failure is real (Alice could request any colleague's record via one URL change), but the *additional* information exposed beyond what she could already see in the directory is limited to a username and a short bio, not a secret identity or hidden personal data. The `/api/admin/users` finding is different in kind: it discloses `role` labels for every account (including who holds admin privileges) to a non-admin user — information the admin page deliberately withholds from members, and which is not visible anywhere in the ordinary directory.

**Evidence still missing or uncertain.** Name a check that would settle it,
if there is one.
I did not test whether a POST, PATCH or DELETE request to either API endpoint would succeed for an unauthorised user — only GET requests were used, per the lab instructions. This means I have confirmed read-level authorisation failures (BOLA on the profile endpoint, BFLA on the admin endpoint) but have not established whether write operations carry the same gap. Confirming this would need a controlled test using a non-destructive field, with the application's data reset afterwards.

**Assistant or self-review.** State one claim you checked, how you checked it,
and whether the evidence supports it.

I asked an AI assistant to review my administration-request conclusion. It noted that I should check whether Morgan's `/admin/users` page itself issues a request to `/api/admin/users` internally, since this would show the page and API are meant to be treated as the same access boundary by the developers, strengthening the claim that the API's missing role check is a genuine inconsistency rather than two independently-designed routes. I checked this against the source code directly (`src/routes/api.js` and `src/routes/admin.js`): both API routes are guarded only by `requireAuth`, while the admin page route uses `requireAdmin`, which confirms the mismatch is a missing guard on one line of code rather than two deliberately separate designs.


## Optional, if you had time

- `GET /api/profile/4242` as Alice: status and body: status 404-style error, body: `{"error":"There is no colleague with that id."}`
- Which guard does each API route call in `src/routes/api.js`? Both `/api/profile/:id` and `/api/admin/users` call only `requireAuth` — neither calls `requireAdmin`, even though `/api/admin/users` mirrors a page that does require admin.
- Which guard does the administration page call in `src/routes/admin.js`? `/admin/users` calls `requireAdmin`, which itself calls `requireAuth` first, then additionally checks `req.currentUser.role === "admin"`.
- How does that source comparison explain, but not replace, your recorded
  responses? The code shows exactly why the page and the API disagree: the developer applied the stricter `requireAdmin` guard to the page route but left the matching API route on the weaker `requireAuth` guard — most likely an oversight when the API route was added, rather than an intentional design choice. For the profile endpoint, `requireAuth` only confirms a session exists and attaches `req.currentUser`; it performs no comparison between the requested `:id` and the signed-in user's own ID, confirming there is no object-level ownership check anywhere on that path. This explains the mechanism behind both findings, but it does not replace the actual request/response evidence recorded in Tasks 1–4 — the code shows what the server was written to do, while the captured responses show what it actually did when tested.
