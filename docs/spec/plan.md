# Plan: Yakka

Status: Draft implementation plan. Sources: [Discover](discover.md), [Design](design.md).

## Goal

Build Yakka as the smallest local workflow that creates the three documents and executes their tasks through RPI subagents.

## Tasks

| Task | Work | Depends on | Done when | Status |
|------|------|------------|-----------|--------|
| T001 | Add the local document-authoring workflow and small reusable templates based on these documents. | None | A sample brief creates all three files, and a scope change updates them without adding competing documents. | Done |
| T002 | Add the thin harness that dispatches one eligible task per RPI subagent and records results in Plan. | T001 | Subagents receive all three documents and follow RPI; status reflects actual results, and failed or blocked prerequisites prevent dependent execution. | Done |
| T003 | Dogfood the complete workflow on a small local example. | T002 | The example creates three documents and completes at least two tasks through RPI subagents; a failure case demonstrates that dependent work does not start. | Done |
| T004 | Start RPI workers at the earliest unsatisfied phase, reusing sufficient research and adequate approved task plans. | T002 | Research/Plan/Implement entry paths are covered; current task applicability and required gates are preserved; reused evidence and reasons are recorded without regenerating satisfied phases; relevant checks and a native approved-plan reuse example pass. | Done |
| T005 | Rename the skill and registered workflow to Yakka without changing execution behavior. | T004 | Yakka create/refine/execute requests, package references, and native workflow registration use the new name; checks pass and existing history and interruption guards remain intact. | Done |
| T006 | Package Yakka as an install-once plugin with an optional marketplace catalog. | T005 | Native installation discovers the skill and workflow in projects without local copies; default execution targets the current session project and an absolute override is honored; existing guards and history remain intact. | Done |

## Execution

The user starts execution after reviewing the documents. Each task above is one bounded subagent assignment following the [harness behavior](design.md#harness).

Work sequentially. For each task, record its outcome, changed files, checks, and any blocker below; update its status to Done, Failed, or Blocked.

Earlier completion records retain the original names; the current name is Yakka.

### T001

Done: added `.github/skills/local-workflow/SKILL.md` and its three templates.
An isolated native CLI create/refine run produced exactly the three documents,
preserved task IDs and Pending statuses, and did not execute implementation work.
Template, link, and format checks passed.

### T002

Done: added the native `local-workflow-execute` extension and wired the skill's
execute route. All 27 harness unit checks passed. A native run automatically
dispatched two sequential calculator tasks with RPI phase and check evidence,
recording both Done. T003 still owns the independent end-to-end assertions and
native blocked-prerequisite case.

### T003

Done: native create/refine and automatic dispatch were dogfooded in isolated
fixtures. Two calculator workers completed their tasks with inspectable RPI
artifacts and check output; independent public-export checks passed 28 tests.
A missing-input case returned Blocked after a real ENOENT failure: its dependent
stayed Pending and was not dispatched. No example code was added to this project.
Raw worker IDs/activation traces were unavailable; native runtime counts,
distinct task results, and saved artifacts establish the observed execution.

### T004

Done: updated the harness, its tests, and the local skill to assess readiness
and record Performed/Reused phases with evidence and reasons. All 51 targeted
checks passed. One native worker completed the approved-plan reuse example:
Research Reused, Plan Reused, Implement Performed. Independent checks passed
all three consumer tests and confirmed unchanged research, approved context,
critique, and tests, with no regenerated phases. T001-T003 remain unchanged.

### T005

Done: renamed the skill and extension directories to `yakka`, registered
`yakka-execute`, and updated active references and request examples. All 52
checks passed, including preservation of a pre-rename execution lock.
Native CLI discovery lists `yakka`; the reloaded runtime lists only
`yakka-execute`. This existing session needs a skill-list refresh before
activation. Earlier task records and internal interruption-guard filenames
remain unchanged.

### T006

Done: added the plugin manifest and marketplace catalog, with installation
instructions in README. Execution now reads the current session directory at
run time and requires absolute overrides. All 57 checks passed. Native local
marketplace installation discovered the skill and workflow in two projects
without copied packages; their Done/Blocked outcomes, an explicit override,
and a missing-document failure all matched their actual inputs. No workers
were dispatched for these packaging-only cases. T001-T005 remain unchanged.

## Done

The authoring workflow and local harness work together on the example. Nothing beyond the MVP scope in Discover is required.
