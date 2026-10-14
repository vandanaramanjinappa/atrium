# Week 5 cross-tool triage

Your name: Vandana Ramanjinappa
Date: 14th october 2026
Atrium address and port: http://localhost:9090
Atrium version or date of local copy:v0.1.0 (package.json, local copy)

Fill this in as you work. If a check could not be completed, record what stopped you and what evidence you used instead. Do not paste a full session cookie value.

## 1. Scan coverage and sources

- Static evidence: my `npm run scan` output:My npm run scan output reported three findings under sql-built-by-joining-text in src/handlers/directory.js (lines 8–11), src/handlers/resources.js (lines 1–5), and src/db/reset.js (lines 12–13).
- Runtime evidence: my ZAP run, Week 4 record, or direct browser checks:I used OWASP ZAP History and manual browser checks. GET /dashboard returned 200 OK. A modified directory search returned 500 Internal Server Error with a SQLite syntax error. I also ran a ZAP Active Scan from a directory-search request.
- Signed-in account used for protected routes:Alice Nolan (alice.nolan).
- Evidence that a protected route returned its page rather than `/login`:ZAP History showed GET /dashboard returning 200 OK while signed in.
- Active scan target and how login and logout stayed outside it, if I used ZAP:I started the Active Scan by right-clicking a directory-search request in ZAP History and selecting Attack → Active Scan. I did not configure or verify exclusions for login and logout, so their exclusion from the scan is not confirmed.
- An entry my scan did not reproduce, and how I checked it instead:I checked the session-cookie settings by inspecting src/config/session.js and comparing them with the POST /login response. The response did not include the HttpOnly, Secure, or SameSite attributes.

## 2. The queue

For each entry, use **supported**, **ruled out**, or **needs review**. Keep overlap separate from status. Name a file and line, or a request and response, in the evidence column. If evidence is missing, say what check would settle it.

| ID | Status | Evidence or missing check | Overlap with another ID? | Investigate now, later, or close? |
|---|---|---|---|---|
| S1 | Supported |src/handlers/directory.js, lines 8–11: the search value q is concatenated directly into the SQL query rather than passed as a bound parameter. |Z1 — same directory-search code path; S1 is static evidence. |Now, alongside Z1. |
| S2 | Ruled out| src/handlers/resources.js, lines 1–5: RESOURCE_QUERY uses WHERE resources.id = ?, with the ID supplied separately using .get(req.params.id). This rules out the identified SQL-concatenation concern in this query.| None identified for this specific concern.| Close this specific concern.|
| S3 |Ruled out | src/db/reset.js, lines 12–13: the INSERT statements use placeholders, with seed values supplied separately through .run(...). This rules out the identified SQL-concatenation concern in these INSERT statements.| None identified for this specific concern.|Close this specific concern. |
| Z1 | Supported|ZAP History and a manual replay of the modified directory search showed 500 Internal Server Error with a SQLite syntax error near “Nolan.” This demonstrates query failure from modified input, but not successful data access or modification. | S1 — same underlying directory-search issue; Z1 is runtime evidence.|Now, alongside S1. |
| Z2 | Supported, script execution unverified|views/directory/index.ejs: the result summary uses unescaped <%- q %>. ZAP reported a reflected XSS alert, but opening the supplied payload URL did not display a JavaScript alert. The exact browser execution remains unverified. |Z3 — same page and input, but a different output location. | Now — verify the response HTML and safely confirm whether the payload executes.|
| Z3 | Ruled out for the input-field location| views/directory/index.ejs: the search input uses escaped <%= q %> output. This rules out the identified unescaped-output concern at that particular location, not elsewhere on the page.| Z2 — same page and input, different output context.|Close |
| Z4 | Supported| ZAP History showed GET /dashboard returning 200 OK without a Content-Security-Policy header in the observed response.| No direct overlap identified with the other queue entries.|Later — review and define a suitable CSP policy. |
| Z5 | Supported|src/config/session.js sets httpOnly: false, sameSite: false, and secure: false. The observed POST /login response returned 302 Found and did not include these cookie attributes. | No direct overlap with the directory-search SQL injection issue; the cookie settings may increase session exposure.| Now — review session-cookie protections and the hardcoded session secret.|

## 3. First three matters to investigate

Rank the matters. Combine entries only when they concern one underlying path. For each, record the relevant account, route or file, possible consequence, uncertainty and next check.

1. **First:**
   - Queue ID or IDs:S1 and Z1.
   - Account and place:Alice Nolan (alice.nolan); GET /directory?q=...; src/handlers/directory.js.
   - Why first:The source directly concatenates user input into SQL, and the modified search produced a SQLite syntax error and HTTP 500. Depending on the database query and attacker-controlled input, this could expose or affect data.
   - Next check:Replace the concatenated query with a parameterized query using bound values for the search terms. Retest normal searches and safely chosen special-character inputs, confirming that errors are not exposed and the search still works.
2. **Second:**
   - Queue ID or IDs:Z2 and Z3.
   - Account and place:Alice Nolan (alice.nolan); GET /directory?q=...; views/directory/index.ejs.
   - Why second:The result summary renders q without escaping. If attacker-controlled markup or script executes in another user's browser, it could perform actions in that user's session or expose information accessible to that session. Actual execution has not been confirmed.
   - Next check:Inspect the exact ZAP alert response and test safely in the lab. Replace unescaped output with context-appropriate escaped output, then verify that the payload is displayed as text and does not execute.
3. **Third:**
   - Queue ID or IDs:Z5.
   - Account and place:Alice Nolan (alice.nolan); POST /login; src/config/session.js.
   - Why third:The observed cookie lacks HttpOnly, Secure, and SameSite attributes. This may increase exposure to script-based cookie theft or cross-site request risks, depending on the deployment and application behaviour.
   - Next check:Configure httpOnly: true, sameSite to an appropriate protective setting, and secure: true when served over HTTPS. Replace the hardcoded session secret with a securely managed secret, then inspect a fresh login response to confirm the changes.

## 4. One exclusion or combination

- Entry ID:S1 and Z1.
- Close, exclude from active work, or combine with another entry?Combine with another entry.
- Evidence for this decision:S1 identifies unsafe SQL construction in src/handlers/directory.js; Z1 demonstrates a related runtime failure through the directory-search request. They concern the same underlying path but provide different kinds of evidence.
- What change would make me reopen it:Reopen the issue if the query is changed but source inspection or retesting still shows unsafe SQL construction, SQL errors, or unexpected results from search input.

## 5. One static and runtime comparison

- Semgrep entry and ZAP entry:S1 and Z1.
- What the code observation shows:src/handlers/directory.js concatenates the search value q into a SQL string instead of binding it as a parameter.
- What the request and response show:A modified GET /directory search returned 500 Internal Server Error with a SQLite syntax error near Nolan.
- Do they concern the same underlying matter? Why?Yes. Both concern the directory-search query: Semgrep identified the unsafe construction, and ZAP/manual testing showed that modified input could cause a database query error.
- One claim they do not yet prove:They do not prove that an attacker can successfully retrieve, modify, or delete database records.

## 6. One finding for a colleague

Write a short paragraph. Include what and where, the account and condition, possible impact, evidence references and a repair direction. Keep untested impact conditional.

**Finding:**
The directory-search handler in src/handlers/directory.js builds an SQL query by concatenating the user-supplied search value q directly into the query string. While signed in as Alice Nolan, a modified request to GET /directory returned 500 Internal Server Error with a SQLite syntax error. This is consistent with unsafe SQL construction and could create a SQL injection risk, although successful data access or modification has not been demonstrated. The recommended repair is to use a parameterized query with bound search values, followed by regression testing with normal and special-character inputs.

**Evidence references:**
Semgrep npm run scan: src/handlers/directory.js, lines 8–11; finding category sql-built-by-joining-text.

ZAP History: modified GET /directory?q=... request returning 500 Internal Server Error with a SQLite syntax error.

Signed-in route check: GET /dashboard returned 200 OK.
---

## Optional, if you had time

What does `src/config/session.js` show about the session that the Z5 response cannot? What does the response confirm that source inspection alone cannot?

src/config/session.js shows the configured session-cookie options and the hardcoded session secret. In particular, it sets httpOnly: false, sameSite: false, and secure: false. Source inspection shows the intended configuration, but it does not by itself prove the exact attributes sent to the browser.

The observed POST /login response returned 302 Found and its session cookie lacked the HttpOnly, Secure, and SameSite attributes. This confirms the attributes were absent from that observed response, but it does not establish every detail of session exposure or prove that an attacker can steal or misuse the session.