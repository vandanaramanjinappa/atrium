# Week 6 evidence record

Your name: Vandana Ramanjinappa
Date: 12th November 2026
Atrium version or date of local copy: 
v0.1.0 (package.json, local copy)
Keep this file in `my-work/week-06-write-up.md`. Record what you observed,
including an unexpected result. Do not paste a password or full session cookie.

## 1. Evidence audit

| Item | Scanner claim, observed evidence, background or missing evidence? | Where I can find it |
|---|---|---|
| Static alert and rule | Scanner claim. `npm run scan` reported rule `scan-rules.sql-built-by-joining-text` as Blocking severity, stating the SQL statement is built by joining pieces of text together, and that if any of those pieces came from outside the application, the database will read it as part of the command rather than as a value. | Terminal output of `npm run scan`, flagged at `src/handlers/directory.js` |
| Static code excerpt | Observed evidence. The scanner's own excerpt shows lines 8–11, where the SQL string is built using `+` to join fixed text with the `q` variable, with no placeholder or bound parameter. | `src/handlers/directory.js`, lines 8–11 |
| Dynamic alert and risk label | Observed evidence (confirmed via OWASP ZAP this session). ZAP's Active Scan raised alert rule 40012 (Cross Site Scripting Reflected), High risk, Medium confidence, on the `q` parameter of the directory route. | ZAP Alerts tab, this session, 12 November 2026.
| Dynamic request and response | Observed evidence. ZAP's exact attack request, response status and evidence string were captured directly from the ZAP Alerts panel, and the mechanism was independently confirmed with a manual browser test.
| Signed-in coverage check | Observed evidence. All requests in this session were made while signed in as `alice.nolan`, confirmed both in the browser (account name shown top-right) and in ZAP's own History (POST /login → 302, GET /dashboard → 200). | Browser session and ZAP History, signed in as alice.nolan throughout |
| Ordinary comparison | Observed evidence. `GET /directory?q=Alice` was captured as the baseline for both findings, status 200, returning exactly 1 colleague (Alice Nolan).

What is the most important missing artefact for each alert?

- Static: Before this session, there was no runtime evidence showing the scanner's claim actually had an effect when tested. This gap is now closed: both ZAP's own Active Scan payload and my own manually chosen payload confirmed the vulnerability is real and exploitable.
- Dynamic: Before this session, there was no artefact showing whether the unescaped output in `views/directory/index.ejs` actually rendered submitted markup as HTML, rather than displaying it as plain text. This gap is now closed, using both ZAP's own alert evidence and a manual confirmation test.


## 2. Static finding

**Title:** 
SQL injection in directory search via unparameterised `q` parameter
**Affected route, file and lines:** `GET /directory`, handled in `src/handlers/directory.js`, lines 8–11 (query construction) and line 18 (source of the `q` value). The route itself is protected by `requireAuth` middleware, declared in `src/routes/directory.js`, line 8.

**Account and conditions tested:** Signed in as `alice.nolan`, standard member role.


**Tool output used:** - `npm run scan` (Semgrep): rule `scan-rules.sql-built-by-joining-text`, Blocking severity, flagged at `src/handlers/directory.js`, lines 8–11.
- OWASP ZAP 2.17.0 Active Scan (rule 40018 – SQL Injection), run against `GET:directory(q)` while authenticated as `alice.nolan` via Manual Explore.
  - **URL:** `http://localhost:9090/directory?q=Alice%27`
  - **Risk:** High
  - **Confidence:** Low
  - **Parameter:** `q`
  - **Attack payload:** `Alice'`
  - **Evidence:** `HTTP/1.1 500 Internal Server Error`
  - **CWE ID:** 89 (SQL Injection)
  - **WASC ID:** 19

**Code trace:** Where does `q` enter, where is it used, and what control is on
that path? Give file and line references.
The search value `q` enters the application at line 18, read directly from `req.query.q`. The only check applied is `typeof req.query.q === "string"`, which confirms the value is text but does not sanitise or restrict its contents — this is not a security control. If `q` is non-empty, it is passed into `searchDirectory(db, q)`. Inside that function, at lines 9–11, `q` is concatenated directly into the SQL string using the `+` operator, in two separate places (the `display_name LIKE` clause and the `department LIKE` clause). The finished string is executed as-is at line 13 via `db.prepare(sql).all()`. No bound parameter or `?` placeholder is used anywhere on this path, meaning the value supplied by the user becomes part of the SQL command text itself, rather than being passed to the database separately as data.

**Ordinary request and result:** Give the URL or exact search value, status and
short response excerpt.
`GET http://localhost:9090/directory?q=Alice`. Status: 200 OK. The response showed "1 colleague shown across Atrium" and displayed exactly one row: Alice Nolan, Operations department, her email, and role "member" — correctly matching the search term.

**Test request and result:** Give the exact value, status and short response
excerpt. Say how it differs from the ordinary result.
Two tests were performed against this parameter.
1. ZAP's own Active Scan payload, `GET http://localhost:9090/directory?q=Alice'`, returned `500 Internal Server Error`. The response body contained an SQLite syntax error and a stack trace referencing `src/handlers/directory.js`, confirming the malformed query reached the database layer directly.
2. I additionally tested `GET http://localhost:9090/directory?q=zzz' OR 1=1 --`, which returned status 200 with "3 colleagues shown across Atrium" — every seeded colleague (Alice Nolan, Bob Keane, Morgan Doyle) — despite "zzz" matching no real name or department. This differs sharply from the ordinary result because the injected text closed the quoted string early, added a condition (`1=1`) that is always true, and commented out the remainder of the query using `--`, bypassing the WHERE clause's filtering entirely.


**My conclusion:** What did I establish, and what remains untested?
ZAP's automated scan and my own manual test both confirm the same underlying flaw from two different angles: ZAP's payload demonstrates the query can be broken (causing a database error), and my own payload demonstrates the query's logic can be manipulated to return unauthorised data (bypassing the search filter entirely). Together these move the finding from a theoretical code pattern to a proven, repeatable true positive. I did not test whether this could be extended to read data from other tables, modify or delete data, or whether the same flaw is reachable by an unauthenticated user (the route is protected by `requireAuth`, so I have only tested it as a signed-in member).

**Impact within this scope:** As a standard member, the SQL injection allowed me to bypass the search filter and retrieve the full directory in one request, including the `role` and `email` columns already selected by this query. I have not tested whether this could be extended to read data beyond the `users` table (for example via `UNION SELECT`), so any such impact remains untested and unconfirmed.

**Repair and how I would check it:** Replace the string concatenation with a parameterised query, using `?` placeholders for the search term and passing `q` as a bound parameter to `db.prepare(sql).all(param)`, instead of joining it into the SQL string directly. I would check the fix by repeating both test payloads (`Alice'` and `zzz' OR 1=1 --`) and confirming the first returns 200 without a server error, and the second returns 0 colleagues, since "zzz" genuinely matches nothing once the value is handled as literal data rather than command text.

**One other static match:** The same scan also flagged `src/handlers/resources.js` under the identical rule (`sql-built-by-joining-text`), at lines 1–5. However, that query uses a bound placeholder (`WHERE resources.id = ?`), with the actual value supplied separately through `.get()`, rather than being joined into the query string. Matching the same scanner rule does not mean the same risk exists: the directory query lets outside input directly shape the command text, while the resources query keeps the outside value separate from the command at all times. This is a likely false positive for that specific concern.

**One other static match:** Why does the same rule not settle its status?

## 3. Dynamic finding

**Title:** Reflected cross-site scripting (XSS) — unescaped search term in directory result summary


**Affected URL and output location:** `GET /directory?q=...`, rendered by the template `views/directory/index.ejs`. The page outputs the `q` value in two separate places: the search input field (line 13, escaped output) and the "Showing colleagues matching..." result summary text (line 20, unescaped output).

**Account and conditions tested:** Signed in as `alice.nolan`, standard member role.

**ZAP alert, risk and confidence:** Give the ZAP version and when you ran the
scan.
OWASP ZAP 2.17.0 Active Scan (rule 40012 – Cross Site Scripting (Reflected)), run against `GET:directory(q)` while authenticated as `alice.nolan` via Manual Explore.
- **URL:** `http://localhost:9090/directory?q=</strong><scrIpt>alert(1);</scRipt><strong>`
- **Risk:** High
- **Confidence:** Medium
- **Parameter:** `q`
- **Attack payload:** `</strong><scrIpt>alert(1);</scRipt><strong>`
- **Evidence:** `</strong><scrIpt>alert(1);</scRipt><strong>` (the exact payload reflected unchanged in the response body)
- **CWE ID:** 79 (Cross-site Scripting)
- **WASC ID:** 8
- **Response:** `HTTP/1.1 200 OK`

**Ordinary request and result:** Give the URL, status, response excerpt and
what the browser displayed. `GET http://localhost:9090/directory?q=Alice`. Status: 200 OK. The response showed "1 colleague shown across Atrium" with the result summary reading: "Showing colleagues matching **Alice**."

**Alert request repeated and result:** Give the URL or exact decoded input,
status, response excerpt and what the browser did. If it did not repeat, say so. I repeated ZAP's exact payload manually in the browser: `GET http://localhost:9090/directory?q=</strong><scrIpt>alert(1);</scRipt><strong>`. Status: 200 OK. I additionally tested a simpler, harmless payload, `<b>Alice</b>`, to directly observe the mechanism:
- The search input field displayed the literal text `<b>Alice</b>`, with the angle brackets visible as plain text — correctly escaped.
- The result summary line displayed "Alice" rendered in bold — not because of normal page styling, but because the `<b>` and `</b>` tags were interpreted as real HTML markup.
ZAP's evidence confirms its own payload was reflected unchanged into the response, meaning the full `<scrIpt>` tag it submitted reached the page without being neutralised, matching the same unescaped output path my harmless test demonstrated.

**Code that explains the result:** Give file and line references. In `views/directory/index.ejs`, line 13 uses escaped EJS output (`<%= q %>`) for the search input field, which is why submitted tags appear as plain text there. Line 20 uses unescaped EJS output (`<%- q %>`) for the result summary, which is why the same submitted value is instead interpreted as HTML and rendered as markup.

**My conclusion:** What did I establish, and what remains untested? ZAP's scan and my own manual test confirm the same finding from two angles: ZAP's automated payload was reflected unchanged in the response (confirming the output is not being escaped), and my manual test showed directly what this means visually — injected markup renders as live HTML rather than being displayed as text. This resolves my earlier Week 5 note (queue entry Z2) from "script execution unverified" to confirmed: injected markup does render on this page, through this specific unescaped output point. I have not independently triggered a browser alert dialog from ZAP's exact `<script>` payload in a live browser session, so full script execution in a real browser is supported by ZAP's evidence but not separately re-confirmed by me beyond the markup-rendering demonstration above.


**Impact within this scope:** As demonstrated, a signed-in user's submitted search text can be rendered as live HTML in the result summary of the directory page. If an attacker could get another signed-in user to visit a crafted link containing a malicious `q` value — such as the one ZAP generated — arbitrary HTML, including a working `<script>` tag, could be rendered in that victim's authenticated session. This could potentially extend to running JavaScript in the victim's browser within their session, for example to access cookies or perform actions as that user. This wider impact is supported by ZAP's reflected-payload evidence but has not been independently tested by me beyond markup rendering.


**Repair and how I would check it:** Change line 20 of `views/directory/index.ejs` from unescaped output (`<%- q %>`) to escaped output (`<%= q %>`), matching the safe pattern already used for the search input field on line 13. I would check the fix by repeating both ZAP's payload and my own `<b>Alice</b>` test, confirming the result summary now displays the literal tags as plain text in both cases, the same way the search input field already does.

## 4. Cross-check and review

What did runtime evidence add to the static finding?
The code trace alone showed that `q` could reach the SQL string without being sanitised, but it did not show that this was ever actually exploitable in practice. ZAP's automated Active Scan and my own manual test — searching `zzz' OR 1=1 --` and getting all 3 colleagues back instead of 0 — confirmed the vulnerability genuinely changes the application's behaviour, moving the finding from a theoretical code pattern match to a proven, repeatable true positive, confirmed from two independent angles.

What did code evidence add to the dynamic finding?
ZAP's alert and the runtime test showed that submitted markup renders as HTML in one part of the page, but on its own this did not explain why. Reading `views/directory/index.ejs` explained the exact mechanism: the same `q` value is output twice on the page, using two different EJS output methods — escaped at line 13, unescaped at line 20 — which is exactly why the same input produced two different results in the same response.

Who or what reviewed my drafts?
An AI assistant reviewed both findings and their supporting evidence.

One specific criticism:
The static finding's impact section originally speculated that a more advanced attack (such as `UNION SELECT`) "could potentially extract additional columns or data from other tables," without this ever being tested, and without confirming that such tables exist or would be reachable through this specific query's structure.

What I changed, or why I did not change it:
I tightened the impact statement in the static finding. I reworded it to state plainly that I have not tested beyond the `users` table already targeted by this query, rather than naming a specific untested attack technique as a possibility. This keeps the impact section limited to what my evidence actually supports, with any further possibility clearly marked as untested rather than implied as likely.

## 5. CA1 set-up

| Check | What I recorded |
|---|---|
| Folder name (`procrastimate-` and my student number) | `procrastimate-20076862` |
| Port from `.env` (1 and the last four digits) | `16862` (the CA1 brief specifies the port is literally the digit `1` followed by the last four digits of the student number, `6862`) |
| `npm run doctor` result | Passed with no reported problems. Environment: Node v24.21.0, Windows PowerShell |
| Signed in as `maya` at my port | Confirmed — signed in successfully at `http://127.0.0.1:16862` |
| Anything that failed, with the exact message | None — setup completed without errors |

