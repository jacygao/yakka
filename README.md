# Yakka

Yakka is a small, local GitHub Copilot workflow that turns an idea into three
documents, then executes their tasks through subagents using existing HVE
Research, Plan, and Implement (RPI) skills.

- **Discover:** the goal, scope, requirements, and success criteria.
- **Design:** the simplest technical approach.
- **Plan:** bounded tasks, dependencies, completion conditions, and results.

The `yakka` skill handles document creation and refinement. The `yakka-execute`
extension runs eligible tasks sequentially, one per subagent, and records their
outcomes in Plan. Workers can reuse adequate research and approved task plans.
Execution stops on failed or blocked work.

Yakka is a local harness, not a service or an agent framework. Scheduling and
result validation are code-controlled; authoring and RPI judgments remain
agent-driven.

## Prerequisites

- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
  with extension and dynamic-workflow support, plus an account with Copilot
  access. Tested with CLI 1.0.95; these extension APIs are experimental.
- Git and the [HVE Core plugin](https://github.com/microsoft/hve-core) installed
  and enabled, providing the RPI skills.
- Permission to read, edit, and run checks in the target project, plus any tools
  that project's implementation requires.
- Node.js 20 or later if you want to run this repository's harness tests.

Install HVE Core if it is not already available:

```sh
copilot plugin marketplace add microsoft/hve-core
copilot plugin install hve-core@hve-core
```

Yakka needs no `npm install`, separate SDK installation, database, or server.
Copilot CLI supplies the extension SDK.

## Getting started

Install Yakka once through its marketplace:

```sh
copilot plugin marketplace add jacygao/yakka
copilot plugin install yakka@yakka
```

The plugin is available across your projects. No files need to be copied into
each code repo; project documents and execution evidence stay in that project.
For local development before publication, use `/path/to/yakka` instead of
`jacygao/yakka` in the marketplace command. Local marketplace installs load live
from the checkout, so keep it available.

Start Copilot from the target project:

```sh
cd /path/to/project
copilot
```

Sign in with `/login` if needed. Use `/skills` to confirm `yakka` is available;
use `/restart` if you installed the plugin after starting the session.

**Create the documents** by entering this request in Copilot:

```text
Use yakka create: a local checklist that saves items to a text file.
```

Review `docs/spec/discover.md`, `design.md`, and `plan.md`. The agent clarifies
important unknowns and stops for review without implementing anything.

**Refine those same documents** when the scope changes:

```text
Use yakka refine: remove persistence; keep the checklist in memory.
```

**Execute after review:**

```text
Use yakka execute
```

The agent launches the registered workflow. You do not manually dispatch each
worker. Done tasks are skipped, dependencies are respected, and results are
recorded in `docs/spec/plan.md`. Inspect the run's outcome, not just whether it
finished. After an interruption, inspect the run, Plan, and execution lock
before resetting or retrying.

Alternatively, explicitly launch execution from the project's root without a
parent-agent startup step:

```sh
copilot workflow run yakka-execute
```

This is an execution request, not document authoring; review the documents first.
The default target is the current session working directory, not the plugin's
installation location. To select another reviewed project, supply an absolute
path:

```sh
copilot workflow run yakka-execute --args '{"projectDirectory":"/path/to/project"}'
```

This repository's existing specification describes Yakka itself, and its current
tasks are already Done. Executing that Plan has no pending work.

## Repository layout

- [plugin.json](plugin.json): skill and extension packaging.
- [.github/plugin/marketplace.json](.github/plugin/marketplace.json): installation catalog.
- [.github/skills/yakka/](.github/skills/yakka/): authoring instructions and templates.
- [.github/extensions/yakka/](.github/extensions/yakka/): native workflow and harness.
- [docs/spec/](docs/spec/): Yakka's own Discover, Design, and Plan.

Run the harness checks from this repository's root:

```sh
node --test .github/extensions/yakka/harness.test.mjs
```

These checks simulate worker results; they are not native end-to-end RPI runs.

Update a hosted installation with `copilot plugin update yakka@yakka`, then
restart Copilot.
