import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { executePlan, parsePlan, recordOutcome, workerResultSchema } from './harness.mjs';

const row = (id, depends = 'None', status = 'Pending') =>
  `| ${id} | Make ${id} | ${depends} | Check ${id} | ${status} |`;
const plan = (...rows) => `# Plan\n\nIntro stays.\n\n## Tasks\n\n` +
  `| Task | Work | Depends on | Done when | Status |\n` +
  `|---|---|---|---|---|\n${rows.join('\n')}\n\n## Execution\n\n` +
  `Existing history stays.\n\n## Done\n\nTail stays.\n`;

async function fixture(t, text = plan(row('T001'), row('T002', 'T001'))) {
  const root = path.resolve('.github/extensions/yakka', `.unit-${randomUUID()}`);
  await mkdir(path.join(root, 'docs/spec'), { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    writeFile(path.join(root, 'docs/spec/discover.md'), '# Discover\nFixture scope.'),
    writeFile(path.join(root, 'docs/spec/design.md'), '# Design\nFixture design.'),
    writeFile(path.join(root, 'docs/spec/plan.md'), text),
    writeFile(path.join(root, 'research.md'), 'Research evidence.'),
    writeFile(path.join(root, 'task-plan.md'), 'Plan evidence.'),
    writeFile(path.join(root, 'implement.md'), 'Implementation evidence.'),
    writeFile(path.join(root, 'checks.txt'), 'Unit simulation: relevant check passed.'),
  ]);
  const result = {
    outcome: 'Done',
    summary: 'Implemented and checked the assigned task.',
    changedFiles: ['product.txt'],
    checks: [{
      command: 'node --test assigned.test.mjs',
      outcome: 'Passed',
      relevance: 'Verifies the assigned done condition.',
      evidencePath: 'checks.txt',
    }],
    rpi: {
      research: {
        disposition: 'Performed', evidencePath: 'research.md',
        rationale: 'Investigated the current assignment evidence gap.',
      },
      plan: {
        disposition: 'Performed', evidencePath: 'task-plan.md',
        rationale: 'Planned current scope and checks; applicable readiness and approval gates satisfied.',
      },
      implement: {
        disposition: 'Performed', evidencePath: 'implement.md',
        rationale: 'Implemented this assignment and ran its relevant checks.',
      },
    },
  };
  const context = (agent, args = { projectDirectory: root }) => ({
    args, agent, runId: 'unit-simulation', phase() {}, log() {},
    signal: new AbortController().signal,
  });
  return {
    root, result, context,
    planPath: path.join(root, 'docs/spec/plan.md'),
    readPlan: () => readFile(path.join(root, 'docs/spec/plan.md'), 'utf8'),
  };
}

test('unit simulation: parses escaped pipes and changes only status plus execution history', () => {
  const original = plan(row('T001').replace('Make T001', 'Make a\\|b'));
  assert.equal(parsePlan(original).tasks[0].work, 'Make a|b');
  const updated = recordOutcome(original, 'T001', {
    outcome: 'Blocked', summary: 'Started; awaiting evidence.', changedFiles: [], checks: [], rpi: {},
  }, 'unit-simulation');
  assert.equal(updated.replace('Blocked', 'Pending').split('## Execution')[0],
    original.split('## Execution')[0]);
  assert.ok(updated.includes('Existing history stays.'));
  assert.ok(updated.endsWith('## Done\n\nTail stays.\n'));
});

test('unit simulation: two dependency-ready tasks run sequentially with all document context', async t => {
  const f = await fixture(t);
  let active = false;
  const calls = [];
  const output = await executePlan(f.context(async (prompt, options) => {
    assert.equal(active, false);
    active = true;
    calls.push(options.label);
    assert.match(prompt, /Before choosing the first phase, assess/s);
    assert.match(prompt, /rpi-research.*rpi-plan.*rpi-implement/s);
    assert.doesNotMatch(prompt, /First activate rpi-research|in that order/);
    assert.match(prompt, /No nested/);
    assert.match(prompt, /source data/);
    assert.ok(prompt.includes('Fixture scope.') && prompt.includes('Fixture design.'));
    assert.ok(prompt.includes(f.planPath));
    assert.deepEqual(Object.keys(options).sort(), ['label', 'schema']);
    const running = parsePlan(await f.readPlan()).tasks[calls.length - 1];
    assert.equal(running.status, 'Blocked');
    active = false;
    return f.result;
  }), f.root);
  assert.deepEqual(calls, ['T001', 'T002']);
  assert.equal(output.outcome, 'Done');
  assert.equal(output.results.length, 2);
  assert.deepEqual(parsePlan(await f.readPlan()).tasks.map(task => task.status), ['Done', 'Done']);
  assert.match(await f.readPlan(), /checks\.txt/);
  assert.match(await f.readPlan(), /Done when: Check T002/);
});

test('unit simulation: skips Done and honors readiness rather than table order', async t => {
  const f = await fixture(t, plan(row('T003', 'T002'), row('T001', 'None', 'Done'), row('T002', 'T001')));
  const calls = [];
  const output = await executePlan(f.context(async (_, options) => {
    calls.push(options.label);
    return f.result;
  }), f.root);
  assert.deepEqual(calls, ['T002', 'T003']);
  assert.equal(output.outcome, 'Done');
});

for (const outcome of ['Failed', 'Blocked', null]) {
  test(`unit simulation: ${outcome} worker halts dependents`, async t => {
    const f = await fixture(t);
    let calls = 0;
    const output = await executePlan(f.context(async () => {
      calls++;
      return outcome === null ? null : {
        outcome, summary: 'Actual partial assignment failed.', changedFiles: [], checks: [], rpi: {},
      };
    }), f.root);
    assert.equal(calls, 1);
    assert.equal(output.outcome, outcome ?? 'Failed');
    assert.deepEqual(parsePlan(await f.readPlan()).tasks.map(task => task.status),
      [outcome ?? 'Failed', 'Pending']);
  });
}

for (const [label, change] of [
  ['no phases', value => { value.rpi = {}; }],
  ['no checks', value => { value.checks = []; }],
  ['empty phase', async (value, f) => { await writeFile(path.join(f.root, 'research.md'), ' '); }],
  ['missing phase', value => { value.rpi.implement.evidencePath = 'missing.md'; }],
  ['check failed', value => { value.checks[0].outcome = 'Failed'; }],
  ['no relevance', value => { value.checks[0].relevance = ''; }],
  ['no check output', value => { value.checks[0].evidencePath = 'missing.txt'; }],
  ['outside phase', value => { value.rpi.research.evidencePath = '../outside.md'; }],
  ['invalid outcome', value => { value.outcome = 'Success'; }],
  ['Plan modification reported', value => { value.changedFiles = ['docs/spec/plan.md']; }],
]) {
  test(`unit simulation: rejects Done with ${label}`, async t => {
    const f = await fixture(t);
    await change(f.result, f);
    let calls = 0;
    const output = await executePlan(f.context(async () => { calls++; return f.result; }), f.root);
    assert.equal(output.outcome, 'Failed');
    assert.equal(calls, 1);
    assert.equal(parsePlan(await f.readPlan()).tasks[1].status, 'Pending');
    assert.match(await f.readPlan(), /Invalid worker result/);
  });
}

for (const [entry, dispositions] of [
  ['Research', ['Performed', 'Performed', 'Performed']],
  ['Plan', ['Reused', 'Performed', 'Performed']],
  ['Implement', ['Reused', 'Reused', 'Performed']],
]) {
  test(`unit simulation: ${entry} entry dispositions persist without replacing evidence`, async t => {
    const f = await fixture(t, plan(row('T001')));
    const before = await Promise.all(['research.md', 'task-plan.md'].map(file =>
      readFile(path.join(f.root, file), 'utf8')));
    for (const [index, phase] of ['research', 'plan', 'implement'].entries()) {
      f.result.rpi[phase].disposition = dispositions[index];
      if (dispositions[index] === 'Reused') {
        f.result.rpi[phase].rationale = phase === 'research'
          ? 'Existing research is current and covers this task scope, dependencies and done condition.'
          : 'Current explicitly approved task plan matches scope, done condition, dependencies and checks; readiness and critique gates satisfied.';
      }
    }
    const output = await executePlan(f.context(async prompt => {
      assert.match(prompt, /insufficient or stale.*rpi-research/s);
      assert.match(prompt, /sufficient.*no adequate.*approved.*rpi-plan/s);
      assert.match(prompt, /both.*sufficient.*CURRENT APPROVED.*rpi-implement/s);
      assert.match(prompt, /File presence or a broad task list is not readiness/);
      assert.match(prompt, /Materially changed requirements.*unrelated approval/s);
      assert.match(prompt, /readiness, approval, critique and validation gates/);
      assert.match(prompt, /original evidence pointers/);
      assert.match(prompt, /Do not create replacement research or plans/);
      return f.result;
    }), f.root);
    assert.equal(output.outcome, 'Done');
    assert.deepEqual(output.results[0].rpi, f.result.rpi);
    const receipt = await f.readPlan();
    for (const [phase, record] of Object.entries(f.result.rpi)) {
      assert.ok(receipt.includes(`${phase}: ${record.disposition}; evidence: ${record.evidencePath}; rationale: ${record.rationale}`));
    }
    assert.deepEqual(await Promise.all(['research.md', 'task-plan.md'].map(file =>
      readFile(path.join(f.root, file), 'utf8'))), before);
  });
}

for (const [label, change] of [
  ['legacy path-only phase', value => { value.rpi.research = 'research.md'; }],
  ['null phase', value => { value.rpi.plan = null; }],
  ['array phase', value => { value.rpi.plan = []; }],
  ['unknown phase', value => { value.rpi.review = value.rpi.plan; }],
  ['unknown disposition', value => { value.rpi.plan.disposition = 'Skipped'; }],
  ['missing disposition', value => { delete value.rpi.research.disposition; }],
  ['missing evidence path', value => { delete value.rpi.plan.evidencePath; }],
  ['non-string evidence path', value => { value.rpi.plan.evidencePath = {}; }],
  ['no evidence for reuse', value => { value.rpi.research.disposition = 'Reused'; value.rpi.research.evidencePath = ' '; }],
  ['missing evidence file for reuse', value => { value.rpi.research.disposition = 'Reused'; value.rpi.research.evidencePath = 'absent.md'; }],
  ['empty evidence file for reuse', async (value, f) => { value.rpi.research.disposition = 'Reused'; await writeFile(path.join(f.root, 'research.md'), ' '); }],
  ['no reuse rationale', value => { value.rpi.research.disposition = 'Reused'; delete value.rpi.research.rationale; }],
  ['blank reuse rationale', value => { value.rpi.plan.disposition = 'Reused'; value.rpi.plan.rationale = ' \n '; }],
  ['non-string reuse rationale', value => { value.rpi.plan.disposition = 'Reused'; value.rpi.plan.rationale = {}; }],
  ['no performed rationale', value => { delete value.rpi.implement.rationale; }],
  ['reused implementation', value => { value.rpi.implement.disposition = 'Reused'; }],
  ['extra phase fields', value => { value.rpi.plan.approved = true; }],
]) {
  test(`unit simulation: rejects receipt with ${label}`, async t => {
    const f = await fixture(t);
    await change(f.result, f);
    let calls = 0;
    const output = await executePlan(f.context(async () => { calls++; return f.result; }), f.root);
    assert.equal(output.outcome, 'Failed');
    assert.equal(calls, 1);
    assert.deepEqual(parsePlan(await f.readPlan()).tasks.map(task => task.status), ['Failed', 'Pending']);
    assert.match(await f.readPlan(), /Invalid worker result/);
  });
}

for (const outcome of ['Failed', 'Blocked']) {
  test(`unit simulation: ${outcome} persists only actual partial phase dispositions`, async t => {
    const f = await fixture(t);
    f.result.outcome = outcome;
    f.result.rpi.research.disposition = 'Reused';
    f.result.rpi.research.rationale = 'Existing current task research applies; planning approval remains unsatisfied.';
    delete f.result.rpi.plan;
    delete f.result.rpi.implement;
    f.result.checks = [];
    const output = await executePlan(f.context(async () => f.result), f.root);
    assert.equal(output.outcome, outcome);
    assert.deepEqual(output.results[0].rpi, f.result.rpi);
    assert.match(await f.readPlan(), /research: Reused; evidence: research.md; rationale:/);
    assert.doesNotMatch(await f.readPlan(), /implement:|plan: Performed/);
    assert.equal(parsePlan(await f.readPlan()).tasks[1].status, 'Pending');
  });
}

test('unit simulation: new receipts preserve completed rows and legacy saved history byte-for-byte', async t => {
  const legacy = '### T001 (old-native-run)\n\nDone: old result.\nRPI: research: old-research.md; plan: old-plan.md; implement: old-implementation.md.\n';
  const original = plan(row('T001', 'None', 'Done'), row('T002', 'T001'))
    .replace('Existing history stays.', legacy);
  const f = await fixture(t, original);
  f.result.rpi.research.disposition = 'Reused';
  f.result.rpi.research.rationale = 'Original research remains current and covers this assignment.';
  f.result.rpi.plan.disposition = 'Reused';
  f.result.rpi.plan.rationale = 'Original approved task plan matches this assignment; readiness and critique gates satisfied.';
  await executePlan(f.context(async () => f.result), f.root);
  const updated = await f.readPlan();
  assert.ok(updated.includes(row('T001', 'None', 'Done')));
  assert.ok(updated.includes(legacy));
  assert.ok(updated.endsWith(original.slice(original.indexOf('## Done'))));
});

test('unit simulation: native schema allows partial phases but requires complete disposition records', () => {
  const rpi = workerResultSchema.properties.rpi;
  assert.equal(rpi.required, undefined);
  assert.equal(rpi.additionalProperties, false);
  for (const phase of ['research', 'plan', 'implement']) {
    assert.deepEqual(rpi.properties[phase].required, ['disposition', 'evidencePath', 'rationale']);
    assert.equal(rpi.properties[phase].additionalProperties, false);
  }
  assert.deepEqual(rpi.properties.research.properties.disposition.enum, ['Performed', 'Reused']);
  assert.deepEqual(rpi.properties.implement.properties.disposition.enum, ['Performed']);
});

test('unit simulation: hard dispatch rejection is propagated and started work is not retried', async t => {
  const f = await fixture(t);
  const error = new Error('actual native hard failure');
  await assert.rejects(executePlan(f.context(async () => { throw error; }), f.root), value => value === error);
  assert.equal(parsePlan(await f.readPlan()).tasks[0].status, 'Blocked');
  assert.match(await f.readPlan(), /actual native hard failure/);
  let calls = 0;
  const output = await executePlan(f.context(async () => { calls++; return f.result; }), f.root);
  assert.equal(calls, 0);
  assert.equal(output.outcome, 'Blocked');
});

test('unit simulation: hard failure and concurrent edit preserve both actual rejection and external history', async t => {
  const f = await fixture(t);
  const error = new Error('hard runtime rejection');
  await assert.rejects(executePlan(f.context(async () => {
    await writeFile(f.planPath, `${await f.readPlan()}\nConcurrent history.\n`);
    throw error;
  }), f.root), value => value === error && /Plan changed/.test(value.message));
  assert.ok((await f.readPlan()).endsWith('Concurrent history.\n'));
});

test('unit simulation: interrupted started work without final result stays Blocked', async t => {
  const f = await fixture(t);
  const controller = new AbortController();
  const ctx = f.context(async () => {
    controller.abort(new Error('interrupted after dispatch'));
    return f.result;
  });
  ctx.signal = controller.signal;
  await assert.rejects(executePlan(ctx, f.root), /interrupted after dispatch/);
  assert.equal(parsePlan(await f.readPlan()).tasks[0].status, 'Blocked');
  assert.equal(parsePlan(await f.readPlan()).tasks[1].status, 'Pending');
});

test('unit simulation: CRLF, cell spacing, escaped pipes and prior history survive', () => {
  const original = plan(row('T001').replace('Pending', ' Pending  ')).replace(/\n/g, '\r\n');
  const updated = recordOutcome(original, 'T001', {
    outcome: 'Done', summary: 'Checked.', changedFiles: [], checks: [], rpi: {},
  }, 'unit');
  assert.ok(updated.includes('|  Done   |'));
  assert.ok(updated.startsWith(original.split('## Execution')[0].replace('Pending', 'Done')));
  assert.ok(updated.endsWith(original.slice(original.indexOf('## Done'))));
  assert.equal(updated.replace(/\r\n/g, '').includes('\n'), false);
});

test('unit simulation: unexpected Plan edits are preserved and cause rejection', async t => {
  const f = await fixture(t);
  await assert.rejects(executePlan(f.context(async () => {
    await writeFile(f.planPath, `${await f.readPlan()}\nExternal edit stays.\n`);
    return f.result;
  }), f.root), /Plan changed/);
  assert.ok((await f.readPlan()).endsWith('\nExternal edit stays.\n'));
  assert.equal(parsePlan(await f.readPlan()).tasks[0].status, 'Blocked');
});

test('unit simulation: overlapping run cannot dispatch a worker', async t => {
  const f = await fixture(t);
  await executePlan(f.context(async () => {
    await assert.rejects(executePlan(f.context(() => assert.fail('must not dispatch')), f.root), /lock/);
    return f.result;
  }), f.root);
});

test('unit simulation: Yakka preserves a pre-rename execution lock', async t => {
  const f = await fixture(t);
  const lockPath = `${f.planPath}.local-workflow-lock`;
  const original = 'run: interrupted-before-rename\n';
  const before = await f.readPlan();
  await writeFile(lockPath, original);
  await assert.rejects(executePlan(f.context(() => assert.fail('must not dispatch')), f.root),
    /Execution lock exists/);
  assert.equal(await readFile(lockPath, 'utf8'), original);
  assert.equal(await f.readPlan(), before);
});

test('unit simulation: pre-existing Failed or Blocked prevents dispatch', async t => {
  for (const status of ['Failed', 'Blocked']) {
    const f = await fixture(t, plan(row('T001', 'None', status), row('T002', 'T001')));
    const output = await executePlan(f.context(() => assert.fail('must not dispatch')), f.root);
    assert.equal(output.outcome, status);
  }
});

test('unit simulation: cancellation before dispatch does not change Plan', async t => {
  const f = await fixture(t);
  const ctx = f.context(() => assert.fail('must not dispatch'));
  ctx.signal = AbortSignal.abort(new Error('cancelled'));
  const before = await f.readPlan();
  await assert.rejects(executePlan(ctx, f.root), /cancelled/);
  assert.equal(await f.readPlan(), before);
});

test('unit simulation: default projectDirectory and missing canonical files', async t => {
  const f = await fixture(t);
  assert.equal((await executePlan(f.context(async () => f.result, {}), f.root)).outcome, 'Done');
  await rm(path.join(f.root, 'docs/spec/design.md'));
  await assert.rejects(executePlan(f.context(() => assert.fail('must not dispatch')), f.root),
    /design\.md/);
  await assert.rejects(executePlan(f.context(() => {}, { projectDirectory: '' }), f.root),
    /projectDirectory/);
});

test('unit simulation: absolute override takes precedence over the session project', async t => {
  const active = await fixture(t, plan(row('T001', 'None', 'Blocked')));
  const target = await fixture(t, plan(row('T001', 'None', 'Done')));
  const activeBefore = await active.readPlan();
  const output = await executePlan(target.context(() => assert.fail('must not dispatch')), active.root);
  assert.equal(output.outcome, 'Done');
  assert.equal(await active.readPlan(), activeBefore);
});

test('unit simulation: session project is resolved anew for each run', async t => {
  const first = await fixture(t, plan(row('T001', 'None', 'Done')));
  const second = await fixture(t, plan(row('T001', 'None', 'Blocked')));
  const ctx = first.context(() => assert.fail('must not dispatch'), {});
  assert.equal((await executePlan(ctx, first.root)).outcome, 'Done');
  assert.equal((await executePlan(ctx, second.root)).outcome, 'Blocked');
});

test('unit simulation: missing or relative project directories fail before dispatch', async t => {
  const f = await fixture(t);
  const before = await f.readPlan();
  for (const projectDirectory of ['', 'relative/project', '.']) {
    await assert.rejects(executePlan(f.context(() => assert.fail('must not dispatch'), { projectDirectory }), f.root),
      /projectDirectory/);
  }
  for (const directory of [undefined, '', 'relative/project']) {
    await assert.rejects(executePlan(f.context(() => assert.fail('must not dispatch'), {}), directory),
      /projectDirectory/);
  }
  assert.equal(await f.readPlan(), before);
});

test('unit simulation: malformed tables, duplicate IDs, dependencies and unsupported statuses fail explicitly', () => {
  for (const [text, message] of [
    [plan(row('T001')).replace('## Tasks', '## Work'), /Tasks/],
    [plan(), /no tasks/i],
    [plan(row('T001'), row('T001')), /duplicate/i],
    [plan(row('T001', 'T009')), /missing prerequisite/i],
    [plan(row('T001', 'T002'), row('T002', 'T001')), /cycl/i],
    [plan(row('T001', 'T001')), /cycl/i],
    [plan(row('T001', 'None', 'Running')), /status/i],
    [plan(row('T001')).replace('Make T001', 'Make | broken'), /cells/i],
    [plan(row('T001')).replace('Make T001', ''), /empty/i],
    [plan(row('T001', 'T001; T002')), /dependenc/i],
    [plan(row('T001')).replace('|---|---|---|---|---|', '|oops|'), /separator/i],
  ]) assert.throws(() => parsePlan(text), message);
});

test('Yakka customization checks: frontmatter, references and explicit native execute boundary', async () => {
  const skillUrl = new URL('../../skills/yakka/SKILL.md', import.meta.url);
  const skill = await readFile(skillUrl, 'utf8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter);
  assert.match(frontmatter[1], /^name: yakka$/m);
  assert.match(frontmatter[1], /^description: '[^\n]+'$/m);
  assert.equal(frontmatter[1].split('\n').length, 2);
  for (const match of skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    assert.ok((await readFile(new URL(match[1], skillUrl), 'utf8')).trim());
  }
  assert.match(skill, /Stop for review after create\/refine, without automatically executing/);
  assert.match(skill, /Only with the user's execution consent/);
  for (const route of ['create', 'refine', 'execute']) {
    assert.ok(skill.includes(`Use yakka ${route}`));
  }
  assert.doesNotMatch(skill, /Use local-workflow|local-workflow-execute/);
  assert.match(skill, /run_dynamic_workflow\(name: "yakka-execute"/);
  assert.match(skill, /inspect-run/);
  assert.match(skill, /returning Failed\/Blocked did not complete all tasks/);
  assert.match(skill, /earliest unsatisfied phase/);
  assert.match(skill, /current approved task-level plan/);
  assert.match(skill, /disposition.*evidencePath.*rationale/s);
  assert.doesNotMatch(skill, /ordered\n?`rpi-research`|all three phases must be performed/);
  assert.doesNotMatch(skill, /dispatch is pending T002|Automatic task dispatch is not implemented/);
  const extension = await readFile(new URL('./extension.mjs', import.meta.url), 'utf8');
  assert.match(extension, /defineWorkflow, joinSession/);
  assert.match(extension, /name: 'yakka-execute'/);
  assert.doesNotMatch(extension, /limits:|model:|reasoningEffort:|ctx\.parallel|ctx\.workflow/);
});

test('extension entrypoint: active session changes and absolute overrides select the right project', async t => {
  const first = await fixture(t, plan(row('T001', 'None', 'Done')));
  const second = await fixture(t, plan(row('T001', 'None', 'Blocked')));
  const before = await Promise.all([first.readPlan(), second.readPlan()]);
  const extensionDirectory = path.join(first.root, 'plugin/.github/extensions/yakka');
  await mkdir(extensionDirectory, { recursive: true });
  for (const name of ['extension.mjs', 'harness.mjs']) {
    await cp(new URL(name, import.meta.url), path.join(extensionDirectory, name));
  }
  const sdkPath = path.join(first.root, 'sdk.mjs');
  const loaderPath = path.join(first.root, 'loader.mjs');
  await writeFile(sdkPath, `
    export const defineWorkflow = definition => definition;
    export async function joinSession({ workflows }) {
      let workingDirectory = ${JSON.stringify(first.root)};
      const ctx = {
        args: {}, runId: 'unit-extension', phase() {}, log() {},
        agent() { throw new Error('Must not dispatch a worker'); },
        session: { rpc: { metadata: { snapshot: async () => ({ workingDirectory }) } } },
      };
      const results = [await workflows[0].run(ctx)];
      workingDirectory = ${JSON.stringify(second.root)};
      results.push(await workflows[0].run(ctx));
      ctx.args = { projectDirectory: ${JSON.stringify(first.root)} };
      results.push(await workflows[0].run(ctx));
      console.log(JSON.stringify(results));
    }
  `);
  await writeFile(loaderPath, `
    import { pathToFileURL } from 'node:url';
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === '@github/copilot-sdk/extension') {
        return { url: pathToFileURL(${JSON.stringify(sdkPath)}).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
  `);
  const result = spawnSync(process.execPath,
    ['--no-warnings', '--experimental-loader', loaderPath, path.join(extensionDirectory, 'extension.mjs')],
    { cwd: extensionDirectory, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const outcomes = JSON.parse(result.stdout);
  assert.deepEqual(outcomes.map(({ outcome }) => outcome), ['Done', 'Blocked', 'Done']);
  assert.ok(outcomes.every(({ results }) => results.length === 0));
  assert.deepEqual(await Promise.all([first.readPlan(), second.readPlan()]), before);
});

test('plugin packaging: marketplace resolves the same skill and native extension', async () => {
  const root = new URL('../../../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('plugin.json', root), 'utf8'));
  const marketplace = JSON.parse(await readFile(new URL('.github/plugin/marketplace.json', root), 'utf8'));
  assert.equal(manifest.name, 'yakka');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.$schema, undefined, 'native extension paths use the supported Copilot-specific manifest');
  assert.deepEqual(manifest.skills, ['.github/skills']);
  assert.deepEqual(manifest.extensions, ['.github/extensions']);
  assert.deepEqual(await readdir(new URL(`${manifest.skills[0]}/`, root)), ['yakka']);
  assert.deepEqual(await readdir(new URL(`${manifest.extensions[0]}/`, root)), ['yakka']);
  assert.equal(marketplace.name, 'yakka');
  assert.ok(marketplace.owner.name);
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  assert.equal(entry.name, manifest.name);
  assert.equal(entry.version, manifest.version);
  assert.deepEqual(JSON.parse(await readFile(new URL(`${entry.source}/plugin.json`, root), 'utf8')), manifest);
});
