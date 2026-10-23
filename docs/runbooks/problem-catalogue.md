# Problem catalogue operations

Use the pinned Node/npm runtime and the application's existing database configuration. Run migrations before staff commands. No imported Python/reference program is executed by these commands.

`npm run content:pack -- validate content/problem-packs/two-sum/pack.draft.json` validates an offline draft without authentication or database access. A successful checksum is not human approval or publication. The supplied Two Sum draft remains unpublished until its author, independent reviewer and rights/content evidence are genuine.

Staff configuration uses `CONTENT_STAFF_GRANTS_JSON`, an array of exactly `{userId, permissions}` records, and `CONTENT_STAFF_CONFIG_REVISION`. Permissions are `review_content`, `publish_content`, `withdraw_content`. UUIDs use internal mapped identities; email/provider subjects do not grant access. Empty grants deny all actions and use revision `disabled-v1`. Nonempty grants require a nonempty revision. Invalid, duplicate or unknown entries stop startup. Replace the reviewed configuration and restart to change permissions; one process uses one immutable snapshot. Audit records retain its revision and semantic digest.

Review evidence is a JSON object with `decision` (`approved` or `rejected`) and `checklist`. The checklist contains booleans `statement`, `approaches`, `correctness`, `complexity`, `hints`, `tests`, `rights`, `followups`, `variants`, plus a bounded nonsecret `evidenceRef`. Approval requires every boolean true and finalized pack annotations. Rejection can retain false checklist results and pending content; it publishes nothing. The reviewer must be a verified, authorized user distinct from the existing active author. Evidence supplied as JSON cannot authenticate anyone or grant permissions.

Commands:

- `npm run content:pack -- review /absolute/pack.json /absolute/review-evidence.json`
- `npm run content:pack -- publish /absolute/pack.json REVIEW_UUID`
- `npm run content:pack -- withdraw PROBLEM_ID VERSION content_error`

Review/publish/withdraw read one ephemeral identity token followed by EOF from standard input, with an optional final newline. Use a secure credential provider that pipes directly into the command. Never put tokens in command arguments, shell history, tracked files, review evidence or logs. Do not paste tokens into chat. Commands have a 30-second cancellation deadline and release their runtime resources. Files and stdin are bounded before parsing. Validation errors contain safe codes and field paths; other failures expose safe codes only.

Withdrawal reasons are `content_error`, `rights_issue`, `security_issue`, `operator_withdrawal`. Withdrawing the current release clears the selection without choosing an older version. Existing session pins still read their exact immutable content. Repeating withdrawal preserves the first reason and audit. Corrections require a new content version and new independent review; there is no edit/delete/re-enable command.

If a publication response is lost, retry the exact same problem/version/content and review ID. A committed exact retry returns the original receipt and does not change current selection or withdrawal. Current publisher permission is always required. New publication also requires the recorded reviewer's current review permission. Historical retries preserve recorded approval even if reviewer permissions or author status later change. A different checksum for an existing version conflicts.

Publication writes the complete sealed release, ordered cases, availability, canonical publication event, audit and current pointer in one transaction. The event is durable evidence; no queue dispatcher is introduced here. Failed or cancelled writes roll back; unknown storage failures remain safe infrastructure errors. Do not manually repair immutable content or delete audit evidence through application credentials. Use forward migrations and a separately reviewed operational recovery procedure for exceptional database repair.
