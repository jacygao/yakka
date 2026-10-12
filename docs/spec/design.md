# Design: Yakka

Status: Draft MVP design. Source: [Discover](discover.md).

## Approach

Use the `yakka` skill for document authoring and the `yakka-execute` registered workflow for execution. Keep the harness as a small wrapper around existing subagent dispatch and HVE RPI skills, not a separate application or backend.

The root `plugin.json` bundles the existing packages without moving them.
`.github/plugin/marketplace.json` catalogs this same plugin. HVE Core remains
an independently installed prerequisite; no SDK or package installation is needed.

## Document Format

Use these three documents as the examples for future output. Keep their headings stable, but write only the detail needed to understand or execute the work.

| Document | Headings |
|----------|----------|
| Discover | Purpose; User Scenarios and Testing; Requirements; Scope; Success Criteria; Open Questions |
| Design | Approach; Document Format; Workflow; Harness; Task Quality |
| Plan | Goal; Tasks; Execution; Done |

Borrow the requirements/scenario structure from [Spec Kit's specification template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md) and the technical-approach separation from [its plan template](https://github.com/github/spec-kit/blob/main/templates/plan-template.md). Do not recreate the earlier versioned schemas, identifier catalogs, or traceability matrices.

## Workflow

1. Collaborate with the user to create or update Discover.
2. Describe the minimum solution in Design.
3. Turn the solution into bounded tasks in Plan.
4. Let the user review the documents and explicitly start execution.

## Harness

* Read all three documents and select a pending task whose prerequisites are done.
* Run tasks sequentially for the MVP; no parallel scheduler or component-stream plans.
* Launch one subagent with the task, scope, completion condition, and document paths.
* Start at the earliest unsatisfied phase: `rpi-research` for evidence gaps, `rpi-plan` when research is sufficient but the task plan is not ready, or `rpi-implement` when an adequate approved task plan is available.
* Reuse task-relevant, current evidence and preserve applicable readiness, approval, and validation gates. File existence or a general task list alone does not establish implementation readiness.
* Record its result in Plan. Mark done only when its completion condition is met; stop and report failed or blocked work.
* Keep state in the local documents. No database, background service, or custom execution engine.

The persistent entrypoint is `.github/extensions/yakka/extension.mjs`,
registering `yakka-execute` with the native Copilot SDK. After reviewing
the documents, request `Use yakka execute` for the project, or explicitly
name an isolated fixture directory. The skill invokes
`run_dynamic_workflow(name: "yakka-execute", args: {projectDirectory})`;
the directory defaults to the current session's working directory, read at run
time through `ctx.session.rpc.metadata.snapshot()`. Start Copilot at the target
project's root. An explicit `projectDirectory` must be absolute and takes
precedence; never infer the project from the plugin path or process directory.

Tasks use T001-style IDs, comma-separated prerequisites or `None`, and
Pending/Done/Failed/Blocked statuses; escape cell-text pipes as `\|`.
Workers return outcome, summary, changed files, relevant checks with output
evidence, and RPI evidence paths with truthful performed/reused dispositions and
reuse rationale. Evidence can reference existing adequate artifacts; do not
create replacement research or plans just to populate result fields. Done still
requires applicable evidence and passing checks, not a bare assertion.
Each phase record is `{disposition, evidencePath, rationale}`: Research/Plan may
be Performed or Reused; Implementation must be Performed for the assignment.
Started tasks remain Blocked on interruption. A small exclusive Plan lock stops
overlapping runs; inspect interrupted work before explicitly resetting status
or removing a stale lock. Unexpected Plan edits stop writes. This local guard
is not transactional protection against uncooperative external writers.
Existing `.local-workflow-lock` and `.local-workflow-write` suffixes are retained
across the rename so interrupted-work guards remain effective.

Inspect the native run and its returned outcome: a completed workflow may still
report Failed/Blocked tasks. Runtime unavailability is a blocker, not successful
dispatch.

## Task Quality

Keep checks proportional to the task. Behavioral changes use test-first red-green-refactor; document-only changes use content and link checks. Report unavailable checks honestly.

The workflow does not require production-readiness assessments, CI gates, or separate governance reports.
`node --test .github/extensions/yakka/harness.test.mjs` exercises the
harness with fake native-agent results. These are unit simulations; native
registry verification and end-to-end execution are separate checks.
