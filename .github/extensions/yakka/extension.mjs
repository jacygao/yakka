import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension';
import { executePlan } from './harness.mjs';

const workflow = defineWorkflow({
  meta: {
    name: 'yakka-execute',
    description: 'Yakka: execute reviewed docs/spec Plan tasks sequentially through native RPI subagents in the current session project. Requires explicit user execution consent. args: { projectDirectory?: absolute path }.',
    phases: [{ title: 'Execute tasks' }],
    argsSchema: {
      type: 'object',
      properties: {
        projectDirectory: { type: 'string', description: 'Absolute project root; defaults to the current session working directory.' },
      },
    },
  },
  run: async ctx => {
    const { workingDirectory } = await ctx.session.rpc.metadata.snapshot();
    return executePlan(ctx, workingDirectory);
  },
});

await joinSession({ workflows: [workflow] });
