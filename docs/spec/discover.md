# Discover: Yakka

Status: Draft MVP scope.

## Purpose

Yakka helps a developer turn an idea into three useful documents, then execute the work locally through subagents that follow the existing HVE RPI workflow.

## User Scenarios and Testing

* Create: given an idea, when the user runs the workflow, it helps create `discover.md`, `design.md`, and `plan.md` in `docs/spec/`.
* Refine: given existing documents, when the user changes scope, it updates those documents instead of creating competing specifications.
* Execute: given reviewed documents, when the user starts execution, the harness assigns Plan tasks to subagents, each starting at its earliest unsatisfied RPI phase.
* Install once: given the Yakka plugin, use it in another project without copying its packages into that project.

## Requirements

* Discover describes the goal, user scenarios, MVP requirements, and what counts as done.
* Design describes the simplest local solution and how the workflow and harness fit together.
* Plan lists actionable tasks, dependencies, and completion conditions.
* The harness gives each subagent one bounded task and all three documents as context.
* Reuse existing HVE RPI capabilities. Each subagent returns its outcome, changed files, and relevant checks or blockers.
* Reuse sufficient, current research and adequate approved task-level plans instead of repeating those phases. Verify applicability to the assignment, preserve required gates, and record what was reused and why.
* Update task status in Plan from actual results. Do not run dependent work after a failed or blocked prerequisite.
* Package the skill and native extension as one installable plugin with an optional marketplace catalog. Execution targets the active project's root or an explicitly supplied absolute project directory, never the plugin's installation location.

## Scope

In scope: a local document-authoring workflow, a thin execution harness, and RPI subagents.

Out of scope: production deployment, services, databases, dashboards, a new agent framework, multi-stream milestone orchestration, mandatory C4 diagrams, and elaborate document schemas or approval machinery.

This MVP replaces the earlier expanded proposal and its format contracts. Spec Kit remains a lightweight writing guide, not a requirement to adopt its whole toolkit.

## Success Criteria

* One small example produces all three documents using their agreed headings.
* The same example executes at least two bounded Plan tasks through RPI subagents.
* Task results and status distinguish done, failed, and blocked work.
* A failed prerequisite prevents its dependent task from starting.
* Workers start at Research, Planning, or Implementation according to the available evidence, without regenerating already-satisfied research or planning.

## Open Questions

None blocking. Install-once packaging is implemented as T006 in [Plan](plan.md).
