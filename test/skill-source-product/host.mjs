// Observer only: installs this package and the declared product peers into an
// isolated official DSH profile through the normal plugin manager, boots it,
// and records what the live catalog, live tool registry and the peers' public
// entries report. It judges nothing; run.mjs asserts on the recorded evidence.
// No model, credentials, hand-made Session, Agent or ToolRunContext.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot';
import { INSTALL_ANCHOR, runProfile } from '@deepseek-ai/dsh/profile-boot';
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';

const [root, tarball, peersFile] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const evidence = { peers: null, gaps: [], installs: [], catalog: null, registry: null, creationFacts: [], affected: null };
const save = () => writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
const corpus = JSON.parse(await readFile(new URL('./creation-facts-corpus.json', import.meta.url), 'utf8')).values;

// Peer install sources and public entry names are published by each provider
// (C-skill skills-03 §5 R-5) and pinned in the repository's product-peers.json.
const ENTRY = {
  'C-session': ['openSession', 'appendUserTurn', 'executeTool', 'confirmProposal', 'setPlacement',
    'recordContinueDecision', 'listSessions', 'readUndoStatus', 'listObjects'],
  'C-world-lifecycle': ['create', 'list', 'launch', 'stop'],
};
let peers = {};
try { peers = JSON.parse(await readFile(peersFile, 'utf8')); evidence.peers = peers; }
catch (error) { evidence.gaps.push(`product-peers.json unreadable: ${error.code || error.message}`); }
for (const contract of ['C-session', 'C-painter', 'C-world-lifecycle', 'C-local-worlds']) {
  if (!peers[contract]?.install) evidence.gaps.push(`${contract}: provider has not published an install source`);
  for (const name of ENTRY[contract] || []) {
    if (!peers[contract]?.entry?.service || !peers[contract]?.entry?.[name]) evidence.gaps.push(`${contract}: public entry ${name} not published`);
  }
}
if (!peers['C-local-worlds']?.entryId) evidence.gaps.push('C-local-worlds: Loader entry id for localSourceCreationMaterials not published');

const profileName = 'skills-source-product';
const profileDir = resolveProfileDir(profileName, process.env.DSH_HOME);
const pnpmBin = join(dirname(require.resolve('pnpm')), require('pnpm').bin.pnpm);
initProfile(profileDir, []);
// World-source creation materials are trusted profile configuration (C-local-worlds
// localSourceCreationMaterials), never a create argument or user input.
const materials = corpus.map((creationFacts, i) => ({ templateId: `skills-cf-${String(i).padStart(2, '0')}`,
  displayName: `skills cf ${i}`, description: 'skills-03 creationFacts fidelity corpus', creationFacts }));
const patch = ["- insert: [{ id: skills, name: '@deepseek-ai/dsh-skill' }]"];
if (peers['C-local-worlds']?.entryId) {
  const base = JSON.parse(JSON.stringify(peers['C-local-worlds'].baseConfig || {}).replaceAll('${TEST_ROOT}', root));
  patch.push(`- ${JSON.stringify({ id: peers['C-local-worlds'].entryId, config: { ...base, localSourceCreationMaterials: materials } })}`);
}
await writeFile(join(profileDir, 'cordis.patch.yml'), patch.join('\n') + '\n');
const sources = [tarball, ...['C-session', 'C-painter', 'C-world-lifecycle', 'C-local-worlds']
  .map(k => peers[k]?.install).filter(Boolean)];
for (const source of [...new Set(sources)]) {
  const installed = await runPluginCommand({ profile: profileName, dir: profileDir, installAnchor: INSTALL_ANCHOR,
    cwd: process.cwd(), home: process.env.DSH_HOME }, ['add', source], { command: process.execPath, args: [pnpmBin],
    env: process.env, execution: 'service', outputBytes: 65536, onOutput: text => process.stdout.write(text) });
  evidence.installs.push({ source, exitCode: installed.exitCode, timedOut: installed.timedOut ?? false, logPath: installed.logPath });
}
await save();

const { ctx, shutdown } = await runProfile({ profile: profileName,
  environment: createLaunchEnvironmentSnapshot([]), patchFiles: [], args: [] });
try {
  const loaded = await ctx.skills.get('hanaworlds-building', { cwd: process.cwd() });
  evidence.catalog = loaded ? { provider: loaded.provider, path: loaded.path, content: loaded.content } : null;
  const names = [...new Set((loaded?.content || '').match(/hanaworlds_[A-Za-z0-9_]+/g) || [])].sort();
  // The live registry is the provider's own published shape, not a contracts package copy.
  const tools = ctx.get('tools');
  if (!tools) evidence.gaps.push('live tool registry (ctx.tools) is not mounted by any installed peer');
  evidence.registry = tools && Object.fromEntries(names.map(name => {
    const def = tools.get(name);
    return [name, def ? { parameters: def.parameters, output: def.output?.schema ?? null } : null];
  }));
  await save();

  const session = peers['C-session']?.entry, life = peers['C-world-lifecycle']?.entry;
  const missing = evidence.gaps.length > 0;
  if (!missing) {
    const S = ctx.get(session.service), L = ctx.get(life.service);
    const call = (svc, entry, name, input) => svc[entry[name]](input);
    const settle = async fn => { try { return { value: await fn() }; } catch (error) { return { thrown: { name: error.name, code: error.code ?? null, message: String(error.message) } }; } };
    const tool = async (sessionRef, name, args) => {
      const result = await call(S, session, 'executeTool', { sessionRef, name, arguments: args });
      return result.isError ? { isError: true, error: result.error } : { isError: false, value: result.value };
    };
    const observe = async sessionRef => ({ sessions: await call(S, session, 'listSessions', {}),
      worlds: await call(L, life, 'list', {}), undo: sessionRef ? await call(S, session, 'readUndoStatus', { sessionRef }) : null });

    for (const [i, expected] of corpus.entries()) {
      const templateId = materials[i].templateId;
      const row = { templateId, expected, steps: {} };
      row.steps.worldsBefore = await settle(() => call(L, life, 'list', {}));
      row.steps.create = await settle(() => call(L, life, 'create', { templateId, displayName: materials[i].displayName }));
      const worldRef = row.steps.create.value?.worldRef;
      if (worldRef) {
        row.steps.launch = await settle(() => call(L, life, 'launch', { worldRef }));
        row.steps.open = await settle(() => call(S, session, 'openSession', { worldRef }));
        const sessionRef = row.steps.open.value?.sessionRef;
        if (sessionRef) {
          row.steps.before = await settle(() => observe(sessionRef));
          row.steps.context = await settle(() => tool(sessionRef, 'hanaworlds_context', { action: 'read' }));
          row.steps.after = await settle(() => observe(sessionRef));
        }
        row.steps.stop = await settle(() => call(L, life, 'stop', { worldRef }));
      }
      evidence.creationFacts.push(row);
      await save();
    }

    // Affected objects: A is built through the agreement path; B digs A's cell.
    const a = evidence.affected = { steps: {} };
    a.steps.create = await settle(() => call(L, life, 'create', { templateId: 'flat', displayName: 'skills affected' }));
    const worldRef = a.steps.create.value?.worldRef;
    if (worldRef) {
      a.steps.launch = await settle(() => call(L, life, 'launch', { worldRef }));
      a.steps.open = await settle(() => call(S, session, 'openSession', { worldRef }));
      const sessionRef = a.steps.open.value?.sessionRef;
      if (sessionRef) {
        const turn = text => settle(() => call(S, session, 'appendUserTurn', { sessionRef, text }));
        a.steps.placementTurn = await turn('在我选中的这一格放一块，叫小塔');
        a.steps.placement = await settle(() => call(S, session, 'setPlacement', { sessionRef, cells: 1 }));
        a.steps.context = await settle(() => tool(sessionRef, 'hanaworlds_context', { action: 'read' }));
        const facts = a.steps.context.value?.value;
        const min = facts?.placementTarget?.bounds?.min ?? facts?.placementTarget?.cells?.[0];
        const emptyRef = facts?.catalogueFacts?.catalogue?.emptyMaterialRef;
        const solid = Object.keys(facts?.catalogueFacts?.presentation || {}).sort().find(ref => ref !== emptyRef);
        const region = materialRef => ({ decision: 'REGION', block: { profileVersion: 'region-voxels/v2', geometryProfile: 'voxel-grid/v1',
          origin: min, size: [1, 1, 1], indexOrder: 'X_FASTEST_THEN_Y_THEN_Z', palette: [{ materialRef, orientation: 0 }], runs: [[1, 0]] } });
        a.steps.objectsBefore = await settle(() => call(S, session, 'listObjects', { sessionRef }));
        a.steps.proposeA = await settle(() => tool(sessionRef, 'hanaworlds_region_proposal', { action: 'validate', proposal: region(solid) }));
        const refA = a.steps.proposeA.value?.value?.proposalRef;
        a.steps.confirmA = await settle(() => call(S, session, 'confirmProposal', { sessionRef, proposalRef: refA }));
        a.steps.applyA = await settle(() => tool(sessionRef, 'hanaworlds_build', { action: 'apply', confirmedProposalRef: a.steps.confirmA.value?.confirmedProposalRef }));
        a.steps.objectsWithA = await settle(() => call(S, session, 'listObjects', { sessionRef }));
        a.steps.digTurn = await turn('把那一格挖掉');
        a.steps.beforeDig = await settle(() => observe(sessionRef));
        a.steps.directDig = await settle(() => tool(sessionRef, 'hanaworlds_build', { action: 'build', proposal: region(emptyRef) }));
        a.steps.afterDirectDig = await settle(() => observe(sessionRef));
        a.steps.proposeDig = await settle(() => tool(sessionRef, 'hanaworlds_region_proposal', { action: 'validate', proposal: region(emptyRef) }));
        a.steps.confirmDig = await settle(() => call(S, session, 'confirmProposal', { sessionRef, proposalRef: a.steps.proposeDig.value?.value?.proposalRef }));
        a.steps.applyDig = await settle(() => tool(sessionRef, 'hanaworlds_build', { action: 'apply', confirmedProposalRef: a.steps.confirmDig.value?.confirmedProposalRef }));
        a.steps.afterApplyDig = await settle(() => observe(sessionRef));
        // Continue without any current-turn decision: refused, nothing written.
        a.steps.continueUndecided = await settle(() => tool(sessionRef, 'hanaworlds_build', { action: 'continue' }));
        // Model-forged consent fields: the live schema and the executor must both refuse.
        a.steps.continueForged = await settle(() => tool(sessionRef, 'hanaworlds_build', { action: 'continue', confirmed: true, affectedObjectRefs: ['forged'] }));
        a.steps.afterRefusals = await settle(() => observe(sessionRef));
        // A decision recorded in an earlier turn does not cover a newer turn.
        a.steps.staleTurn = await turn('继续，可以改动小塔');
        a.steps.staleDecision = await settle(() => call(S, session, 'recordContinueDecision', { sessionRef }));
        a.steps.newerTurn = await turn('等一下，先别动');
        a.steps.continueStale = await settle(() => tool(sessionRef, 'hanaworlds_build', { action: 'continue' }));
        a.steps.afterStale = await settle(() => observe(sessionRef));
        // The player's current action authorizes exactly the reported objects.
        a.steps.currentTurn = await turn('继续，可以改动小塔');
        a.steps.currentDecision = await settle(() => call(S, session, 'recordContinueDecision', { sessionRef }));
        a.steps.continueCurrent = await settle(() => tool(sessionRef, 'hanaworlds_build', { action: 'continue' }));
        a.steps.afterContinue = await settle(() => observe(sessionRef));
        a.steps.objectsAfter = await settle(() => call(S, session, 'listObjects', { sessionRef }));
      }
      a.steps.stop = await settle(() => call(L, life, 'stop', { worldRef }));
    }
    await save();
  }
} finally {
  await save();
  await shutdown.shutdown(0);
  await writeFile(join(root, 'host-lifecycle.json'), JSON.stringify({ pid: process.pid, profileDir,
    stop: { stoppedAt: new Date().toISOString(), method: 'await shutdown.shutdown(0)' } }, null, 2) + '\n');
}
