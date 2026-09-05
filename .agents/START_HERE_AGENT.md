# START HERE — Coding Agent

If you are an AI coding agent working on InGames, do **not** begin by rereading the whole repository.

Read in this order:
1. `AGENTS.md`
2. `.agent/PROJECT_CONTEXT.md`
3. `docs/00_MASTER_REMEDIATION.md`
4. The workstream doc for the task
5. `docs/07_DEFINITION_OF_DONE.md`

Then inspect only the implementation files listed in `docs/agent/FILE_MAP.md` that are relevant to the current workstream.

## Rule
Before changing behavior, compare the current code against the documented contract. If the code and docs disagree, update the implementation and the relevant doc together.

## Never
- invent a fake payment success
- trust client wallet values
- trust client user IDs for authorization
- trust client dice results
- add another parallel API/service layer
- silently keep legacy behavior because it is easier
