# Week 9 verification record

Your name: Vandana Ramanjinappa
Date: 13th November 2026
Atrium copy used for the before result: my-work/week-08-remediation-record.md (Week 8 record, same local copy before the repair)
Atrium copy used for the after result: current local copy, with the Week 8 repair applied

Fill this in as you work. Keep passwords and session cookies out of the record. If a check cannot be run, name the missing evidence instead of writing that it passed.

## 1. The claim I am checking

What must always be true about the directory search text and the database instruction?

A signed-in user's search text may select a value to match in the directory (by name or department), but it must never change the structure of the SQL instruction sent to the database — whatever characters the text contains.

## 2. Original evidence and change

- Account and starting data: alice.nolan, seeded colleagues (Alice Nolan, Bob Keane, Morgan Doyle)
- Page or request: `GET /directory` (Staff directory, search by name or department)
- Exact original search text: `' OR '1'='1`
- Expected result for an ordinary search: an empty results table, since no colleague's name or department contains that text
- Original status and result-table rows: 200 OK, 3 colleagues shown (Alice Nolan, Bob Keane, Morgan Doyle) — everyone, because the injected text changed the query's logic
- Source file and lines changed in Week 8: `src/handlers/directory.js`, `searchDirectory` function (lines 8–13 originally)
- Source file and lines changed in Week 8: `src/handlers/directory.js`, `searchDirectory` function (lines 8–13 originally)
- How the change is meant to enforce the claim: the search value is now passed through `?` placeholders and bound separately via `.all(term, term)`, instead of being joined into the SQL string with `+`. The database receives a fixed instruction and treats the search text purely as data.


## 3. Original check repeated

- Same search text and account used? Yes — `' OR '1'='1`, signed in as alice.nolan
- Address or request: `/directory?q=%27+OR+%271%27%3D%271`
- Expected result after repair: an empty results table (nobody)
- Actual status and result-table rows: 200 OK, "No colleagues found" (0 rows)
- What changed from the original observation: before the repair, this input returned all 3 colleagues; after the repair, it returns none, matching the expected behaviour of a safe, literal-text search.

## 4. Targeted verification

Automated test file or repeatable manual procedure:

| Search text or empty search | Expected result-table rows or empty state | Actual result | Pass or fail |
|---|---|---|---|
| Original comparison input |(`' OR '1'='1`)| nobody|nobody| pass
| Name search (`Keane`)| Bob Keane |Bob Keane  | pass|
| Department search | (`Finance`)|Bob Keane | Bob Keane| pass
| No-match search | (`Morgan Doyle'`)|nobody |noboady | pass

Could this check fail on the original handler? How do you know? Yes. I ran `npm run check:versions`, which runs the same three searches (Keane, `Morgan Doyle'`, `' OR '1'='1`) against five different versions of the handler, including "A — As shipped" (the original, unrepaired code). That version returned "page breaks" for `Morgan Doyle'` and "everyone" for `' OR '1'='1`, both RED (failing) results — confirming this check can detect the original fault. Only version E ("`?` for both," matching my Week 8 repair) passed all three searches, shown as GREEN. The other three alternative repairs I did not choose (B: hide the error, C: remove the quotes, D: `?` for the name only) all failed at least one of the two security-relevant searches, confirming the check is sensitive to the specific property being protected, not just whether an error occurs.


## 5. Rescan

- Tool and command or scan settings:`npm run scan` (Semgrep, course rule `scan-rules.sql-built-by-joining-text`)
- Was the directory reached as a signed-in user, if using ZAP? Not applicable — static scan, no browser session involved
- Rule or alert, file or page, and result: Rule still reports `src/handlers/directory.js`, lines 8–10, flagging the two joined SQL text fragments (`"WHERE display_name LIKE ? OR department LIKE ?"`)
- Before and after difference: No change — the rule flagged this file both before and after the Week 8 repair
- What this tool result can and cannot establish: The rule matches the *pattern* of joining text with `+`, not whether the joined content includes untrusted input. My repaired line joins only fixed, developer-written SQL text with `?` placeholders; the actual search value `q` is bound separately via `.all(term, term)` and never appears in the joined string. The scanner's continued report here does not indicate a remaining problem — the behavioural evidence (sections 3 and 4) is what actually settles whether the database instruction is protected, not the scanner's silence or persistence.

## 6. Ordinary behaviour and related path

- Empty search result: `/directory?q=`, status 200, all 3 colleagues listed
- Name search result: `/directory?q=Keane`, status 200, 1 colleague (Bob Keane)
- Department search result: `/directory?q=Finance`, status 200, 1 colleague (Bob Keane)
- No-match result: `/directory?q=Zawadzki`, status 200, "No colleagues found"
- `npm test` result, including failing test names if any: 23 of 23 tests pass, 0 failures. Includes "directory search treats SQL syntax as a literal search term," which specifically tests this security property and passes.
- Related input or route chosen and why: I entered the exact comparison payload (`' OR '1'='1`) directly into the browser's address bar as `http://localhost:9090/directory?q=%27%20OR%20%271%27%3D%271`, bypassing the search form entirely. I chose this because the lab reading notes that a request can reach the server directly without going through the form, so the repair must hold at the server boundary, not merely at the form's behaviour.
- Expected and actual result for that variation: Expected nobody (same as the form-submitted version); actual result was 200 OK, "No colleagues found" — matching the expected result exactly.
- Expected and actual result for that variation: Expected nobody (same as the form-submitted version); actual result was 200 OK, "No colleagues found" — matching the expected result exactly.
- Code path it reached: The same route (`GET /directory`) and the same `showDirectory` → `searchDirectory` path in `src/handlers/directory.js`, confirmed because a direct address with a non-empty `q` takes the identical branch as a form submission — both are ordinary GET requests to the same URL pattern, differing only in how the URL was typed rather than in any code path.


## 7. Final judgement

Choose one: **Repaired for the checked property / Not repaired / Not yet settled**.
The original comparison input, which previously returned every colleague, now correctly returns none, both through the search form and through a direct address. The targeted automated check (`npm run check`) confirms this alongside two ordinary searches that still work correctly. Running the same three searches against five different versions of the handler (`npm run check:versions`) confirms that only the chosen repair (binding both the name and department values via `?` placeholders) satisfies the property, while four plausible alternatives do not. The regression suite (`npm test`) passes in full, with no ordinary directory behaviour broken by the change. The static scanner continues to flag the repaired line, but this is explained by the rule's design (it matches joined-text patterns, not data origin) and does not contradict the behavioural evidence.

This judgement is bounded to the directory's database query (`GET /directory`, the `q` parameter, reaching `searchDirectory` in `src/handlers/directory.js`). It does not extend to any other route, output, or input in Atrium.

Explain your answer using the original comparison, targeted check, rescan and ordinary search results. State how far the answer reaches.

## 8. Residual risk and limits

- One issue outside this repair: The directory page prints the search text back into a result summary (`"Showing colleagues matching..."`) without escaping it. Confirmed by `npm run check`, which reported this as the one RED line: searching for `<u>W9</u>` caused the browser to render it as an actual underline tag rather than showing it as text. This is a separate output boundary (page rendering, not the database) and was deliberately left unaddressed — Week 8 escaped the equivalent issue on the Documents pages.
- One check not run or uncertainty remaining: I did not run an authenticated ZAP active scan against the repaired directory this week (used instead the automated `npm run check` script and manual browser checks). A dynamic scan might surface additional input variations I have not tried.
- What another engineer should check next: Repeat this verification using ZAP's authenticated active scan against `GET /directory?q=...`, signed in as Alice, to add independent tool-based evidence alongside the behavioural checks already recorded here; and address the unescaped result-summary output as its own repair, following the same process used in Week 8 for the Documents views.
