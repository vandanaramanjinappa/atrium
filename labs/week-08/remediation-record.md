# Week 8 remediation record

Your name: Vandana Ramanjinappa
Date: 12th November 2026
Atrium version or copy used: v0.1.0 (package.json, local copy)

Fill this in as you work. Keep exact inputs and observed results. If you have not checked something, say so.

## 1. Original finding and before evidence

- Page and route: Staff directory, `GET /directory`
- Account used: alice.nolan
- Earlier finding or source I started from: My own Week 6 static finding (SQL injection in `searchDirectory`, confirmed via `npm run scan` rule `sql-built-by-joining-text` and manual testing) and Week 5 cross-tool triage entry S1/Z1
- Ordinary search text, URL, status and results-table rows: `Keane` — `/directory?q=Keane` — 200 OK — 1 colleague: Bob Keane, Finance, member
- No-match search text, URL, status and results-table rows: `Zawadzki` — `/directory?q=Zawadzki` — 200 OK — 0 colleagues, "No colleagues found"
- Comparison search text, URL, status and results-table rows: `' OR '1'='1` — `/directory?q=%27+OR+%271%27%3D%271` — 200 OK — 3 colleagues shown: Alice Nolan, Bob Keane, Morgan Doyle (everyone)
- What the comparison shows, and what it does not show: The search text `' OR '1'='1` returned every colleague in the system, despite not being a real name or department. This shows the typed search text can change the logic of the database query itself: the quote character ended the intended value early, and `OR '1'='1'` added a condition that is always true, overriding the search filter entirely. It does not show that data can be modified or deleted, or that this is reachable without signing in — this test was done only as a signed-in member, using a read-only `GET` request.

## 2. Root cause

- Source of the search text, with file and line: `req.query.q`, read at line 18 in `showDirectory`, `src/handlers/directory.js`
- Path through the handler: If `q` is non-empty, it is passed to `searchDirectory(db, q)` at line 20
- Database operation, with file and line: `db.prepare(sql).all()` at line 13, inside `searchDirectory`, `src/handlers/directory.js`
- Control missing on that path: At lines 9–11 (original code), `q` was concatenated directly into the SQL string using `+`, with no placeholder (`?`) and no bound parameter. The database received one finished piece of text with no way to tell which part was written by the developer and which part was typed by a visitor.
- Difference between the visible result and the root cause: The visible result (all 3 colleagues returned for a nonsense search) is the symptom. The root cause is that `searchDirectory` built its SQL by string concatenation instead of keeping the search value separate from the instruction — this is true regardless of which specific input is tested.

## 3. Security property and useful behaviour

- One sentence stating the property the repair must enforce: Search text entered by a user may select which rows are returned as values to compare, but it must never change the structure of the database instruction itself — whatever characters it contains.
- Ordinary behaviour that must remain, including name and department search: Searching by part of a name must still work (e.g. `Keane` finds Bob Keane); searching by department must still work (e.g. `Finance` finds Bob Keane through his department); an empty search must still list every colleague, and a search matching nobody must still say "No colleagues found".


## 4. Candidate fixes

| Candidate | Where the control acts | Effect on the property and ordinary search | Decision |
|---|---|---|---|
| Catch the database error, return `[]` | After the query runs | Hides the 500 error, but the query is still built the same way — `' OR '1'='1` still returns everyone. Does not fix the property. | Rejected |
| Reject input containing SQL keywords/quotes | Before the query runs, in the handler | Blocks some attacks, but real names with apostrophes (e.g. O'Neil) would also be blocked or mishandled. Tries to predict every dangerous input rather than removing the risk. | Rejected |
| Check input in the browser (JavaScript) before sending | Client-side only | Does nothing for a direct request to `/directory?q=...` sent without going through the browser form. The server still builds the same unsafe query. | Rejected |
| Keep search text separate from the command (parameterised query, using `?` placeholders) | At the point the query is prepared, in `searchDirectory` | The database treats the value as literal data, never as part of the instruction — regardless of what characters it contains. Name and department search both still work, since the value is still compared with `LIKE`. | Chosen |

- Assistant used, if any: Copilot (AI assistant), reviewing the four candidates against the stated security property and ordinary behaviours
- One suggestion I changed or rejected, and why: Rejected "catch the error and return no results" because, although it removes the visible 500 error, the query is still assembled by joining text — the `' OR '1'='1` input still returns every colleague, the symptom is hidden but the cause remains
- Reason for my choice: Only the parameterised approach acts at the actual boundary (where the value enters the SQL instruction) rather than trying to guess or filter risky input beforehand. It satisfies the property for every possible input, not just the ones tested.

## 5. Change made

- File and function changed: `searchDirectory`, `src/handlers/directory.js`
- Changed lines or a short before and after code extract:
Before:
javascript
export function searchDirectory(db, q) {
  const sql =
    "SELECT id, display_name, email, department, role FROM users " +
    "WHERE display_name LIKE '%" + q + "%' " +
    "OR department LIKE '%" + q + "%'";

  return db.prepare(sql).all();
}

After:
javascript
export function searchDirectory(db, q) {
  const sql =
    "SELECT id, display_name, email, department, role FROM users " +
    "WHERE display_name LIKE ? OR department LIKE ?";

  const term = "%" + q + "%";
  return db.prepare(sql).all(term, term);
}

- How the change keeps search text separate from the database instruction: The SQL text now contains only fixed, developer-written characters, with `?` placeholders marking where values belong. The search term (`%q%`) is passed separately through `.all(term, term)` rather than being joined into the SQL string. The database treats the value as literal data to compare, even if it contains characters (like a quote) that would otherwise have special meaning in SQL.
- What I left outside this repair: The directory page also echoes the search text `q` back into the page itself (in the "Showing colleagues matching..." summary). That is a separate output boundary (page rendering, not the database) and is addressed in Task 6/section 8 of this record, not by this change.


## 6. First checks after the change

- Same ordinary search: input, status and results-table rows: `Keane` — `/directory?q=Keane` — 200 OK — 1 colleague: Bob Keane (unchanged from before)
- Same no-match search: input, status and results-table rows: `Zawadzki` — `/directory?q=Zawadzki` — 200 OK — 0 colleagues, "No colleagues found" (unchanged)
- Same comparison search: input, status and results-table rows: `' OR '1'='1` — same URL as before — 200 OK — 0 colleagues, "No colleagues found" (changed from returning all 3 colleagues before the repair)
- Empty search result: `/directory?q=` — 200 OK — 3 colleagues shown (full list, unchanged)
- `npm test` result and any failing test: 23 of 23 tests pass, 0 failures. The previously-failing test, "directory search treats SQL syntax as a literal search term", now passes. No other test regressed.
- `npm run scan` result, if available: `src/handlers/directory.js` is still flagged under `sql-built-by-joining-text`. This is expected and does not indicate a remaining problem: the flagged lines now join only fixed, developer-written SQL text with `?` placeholders — the search value `q` is bound separately via `.all(term, term)` and no longer appears in the joined string. The rule detects the pattern of joining text, not whether the joined content originated from user input, so it cannot distinguish this safe query from the original unsafe one. The same scan also flags `src/db/reset.js` and `src/handlers/resources.js`, both of which also only join fixed text with `?` placeholders — further confirming the rule matches shape, not origin of data.

## 7. Handoff to Week 9

- What this evidence supports: The directory search no longer lets typed search text change the structure of the SQL instruction. This is supported by a direct behavioural test (the `' OR '1'='1` comparison now returns zero rows instead of all colleagues) and by an automated regression test that passed after the change.
- Cases or related paths still to check: I have not tested inputs beyond the ones used here (e.g. very long search strings, Unicode characters, or a literal `%` typed by a user, which has special meaning in a `LIKE` pattern). I also have not re-tested whether this repair holds under an authenticated ZAP active scan, which Weeks 6/7 used for the original finding.
- A focused automated test I would add: A test asserting that a real name containing a SQL special character (e.g. an apostrophe, like O'Neil) is still found correctly by name search — this checks that the repair doesn't silently break legitimate names, not just that it blocks attacks.
- Any known regression or remaining risk: No regression detected — all 22 pre-existing tests plus the new one pass. A remaining, separate risk on the same page: the directory still echoes the search text (`q`) back into the page; that is a different boundary (page output, not the database) and is not addressed by this SQL repair.

## 8. Document description output

- Resource changed for the temporary check: Resource ID 1, "Expense claim form" — description temporarily changed in `src/db/seed-data.js` to `Before <b>bold</b> after`
- List and detail page before the repair: Both `/resources` (list) and `/resources/1` (detail) rendered "bold" as actual bold HTML text, confirming the submitted markup was being executed rather than displayed as text
- Rule for printing a description as page content: A description must be shown to the reader exactly as typed, including any characters that would otherwise be read as HTML — it must never be interpreted as markup by the browser.
- Two view files and lines changed:
  - `views/resources/index.ejs`: `<span class="resource-description"><%- item.description %></span>` → `<span class="resource-description"><%= item.description %></span>`
  - `views/resources/show.ejs`: `<div class="document-body"><p><%- resource.description %></p></div>` → `<div class="document-body"><p><%= resource.description %></p></div>`
- List and detail page after the repair: Both pages now display the literal text `Before <b>bold</b> after`, with the tags visible as plain text rather than rendered as bold formatting
- Ordinary description checked after restoring the seed data: After restoring the original description and running `npm run reset`, "Expense claim form" on both the list and detail page correctly shows: "Current form for travel and subsistence claims. Submit to Finance by month end." — confirming the repair does not affect normal, non-markup descriptions
- What this check does not establish: This test used a harmless `<b>` tag only. It does not establish whether a more dangerous payload (e.g. a `<script>` tag) would behave identically, though the same escaping mechanism applies uniformly to all characters with special meaning in HTML, so the same protection should extend to any markup, not just bold tags. It also does not test whether any other page in Atrium prints `description` or similar fields without escaping.