// Observer only: installs this package and the pinned peers into an isolated
// official DSH profile through the normal plugin manager, boots it, and records
// what the live catalog, live tool registry and published services report.
// It judges nothing; run.mjs asserts on evidence.json.
// No model, credentials, hand-made Session, Agent or ToolRunContext, and no
// guessed method names: a surface is called only once its provider published it.
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot';
import { INSTALL_ANCHOR, runProfile } from '@deepseek-ai/dsh/profile-boot';
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';

const [root, tarball] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(`./${name}`, import.meta.url), 'utf8'));
const { peers, worldSource } = await read('peers.json');
const corpus = (await read('creation-facts-corpus.json')).values;
const evidence = { gaps: [], installs: [], catalog: null, registry: null, services: {}, lifecycle: [], creationFacts: [], sessionEntry: null };
const save = () => writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');

// Independent observation of every durable and native effect inside the test root:
// files (world, journal and session persistence all live under it) and processes.
async function tree(dir, out = {}) {
  for (const item of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, item.name);
    if (item.name === 'node_modules' || path.endsWith('evidence.json') || path.endsWith('.log')) continue;
    if (item.isDirectory()) await tree(path, out);
    else if (item.isFile()) out[relative(root, path)] = createHash('sha256').update(await readFile(path)).digest('hex') + ':' + (await stat(path)).size;
  }
  return out;
}
const processes = () => spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout
  .split('\n').filter(line => line.includes(root) && !line.includes('host.mjs') && !line.includes(' ps ')).map(line => line.trim().replace(/^\d+\s+/, '')).sort();
const observe = async () => ({ files: await tree(root), processes: processes() });

const profileName = 'skills-source-product';
const profileDir = resolveProfileDir(profileName, process.env.DSH_HOME);
const pnpmBin = join(dirname(require.resolve('pnpm')), require('pnpm').bin.pnpm);
initProfile(profileDir, []);
const patch = ["- insert: [{ id: skills, name: '@deepseek-ai/dsh-skill' }]"];
if (worldSource?.entryId) {
  const materials = corpus.map((creationFacts, i) => ({ templateId: `skills-cf-${String(i).padStart(2, '0')}`,
    displayName: `skills cf ${i}`, description: 'skills-03 creationFacts fidelity corpus', creationFacts }));
  patch.push(`- ${JSON.stringify({ id: worldSource.entryId, config: { ...worldSource.baseConfig, localSourceCreationMaterials: materials } })}`);
} else evidence.gaps.push('world source: no engine-neutral supply handle and Loader entry id (requested from PM); creationFacts corpus cannot be configured');
await writeFile(join(profileDir, 'cordis.patch.yml'), patch.join('\n') + '\n');
for (const source of [tarball, ...peers.map(p => p.source), ...(worldSource?.source ? [worldSource.source] : [])]) {
  const installed = await runPluginCommand({ profile: profileName, dir: profileDir, installAnchor: INSTALL_ANCHOR,
    cwd: process.cwd(), home: process.env.DSH_HOME }, ['add', source], { command: process.execPath, args: [pnpmBin],
    env: process.env, execution: 'service', outputBytes: 65536, onOutput: text => process.stdout.write(text) });
  evidence.installs.push({ source, exitCode: installed.exitCode, timedOut: installed.timedOut ?? false, logPath: installed.logPath });
}
const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'));
evidence.bundles = manifest.dsh?.profile?.bundles ?? [];
// Which DSH package versions the assembled profile actually resolves (version skew is a real supply fault).
const profileRequire = createRequire(join(profileDir, 'package.json'));
evidence.resolved = Object.fromEntries(['@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-session'].map(name => {
  try { return [name, JSON.parse(readFileSync(profileRequire.resolve(`${name}/package.json`), 'utf8')).version]; } catch { return [name, null]; }
}));
evidence.host = require('@deepseek-ai/dsh/package.json').version;
await save();

const { ctx, shutdown } = await runProfile({ profile: profileName,
  environment: createLaunchEnvironmentSnapshot([]), patchFiles: [], args: [] });
try {
  const skills = ctx.get('skills');
  if (!skills) evidence.gaps.push('live skill registry (ctx.skills) did not activate in the assembled profile');
  const loaded = skills ? await skills.get('hanaworlds-building', { cwd: process.cwd() }) : null;
  evidence.catalog = loaded ? { provider: loaded.provider, path: loaded.path, content: loaded.content } : null;
  const tools = ctx.get('tools');
  const names = [...new Set((loaded?.content || '').match(/hanaworlds_[A-Za-z0-9_]+/g) || [])].sort();
  evidence.registry = tools ? Object.fromEntries(names.map(name => {
    const def = tools.get(name);
    return [name, def ? { parameters: def.parameters, output: def.output?.schema ?? null } : null];
  })) : null;
  if (!tools) evidence.gaps.push('live tool registry (ctx.tools) is not mounted by the installed peers');
  for (const key of ['hanaworldsWorldLifecycle']) evidence.services[key] = Boolean(ctx.get(key));
  await save();

  // World lifecycle v2: receiver-bound calls, full envelope, correlation checked, result unwrapped.
  const lifecycle = ctx.get('hanaworldsWorldLifecycle');
  let seq = 0;
  const lc = async (op, input) => {
    const request = { contractVersion: 'world-lifecycle/v2', requestId: `skills03-${op}-${++seq}`, ...input };
    const record = { op, request };
    try { record.response = await lifecycle[op](request); }
    catch (error) { record.rejected = { name: error?.name, contractVersion: error?.contractVersion, requestId: error?.requestId, publicError: error?.publicError ?? null }; }
    const r = record.response;
    record.correlated = Boolean(r && r.contractVersion === request.contractVersion && r.requestId === request.requestId);
    record.result = record.correlated && !r.error && !r.publicError ? r.result : null;
    evidence.lifecycle.push(record);
    return record.result;
  };
  if (lifecycle && worldSource?.entryId) {
    for (const [i, expected] of corpus.entries()) {
      const row = { templateId: `skills-cf-${String(i).padStart(2, '0')}`, expected };
      row.before = await observe();
      row.worldsBefore = (await lc('list', {}))?.worlds ?? null;
      row.created = await lc('create', { templateId: row.templateId, displayName: `skills cf ${i}` });
      row.worldsAfter = (await lc('list', {}))?.worlds ?? null;
      if (row.created?.worldId) {
        row.launched = await lc('launch', { worldId: row.created.worldId });
        row.afterLaunch = await observe();
        // The skill-boundary read (hanaworlds_context in a real Workshop session) runs here once
        // C-session publishes a session entry (R-5); until then nothing is called in its place.
        row.skillBoundary = null;
        row.afterSkillBoundary = await observe();
        if (row.launched?.connectionRef) row.stopped = await lc('stop', { connectionRef: row.launched.connectionRef });
      }
      evidence.creationFacts.push(row);
      await save();
    }
  }
  evidence.sessionEntry = null;
  evidence.gaps.push('C-session: no published real-session tool entry (R-5); tool and skill-sample scenarios are not executed');
} finally {
  await save();
  await shutdown.shutdown(0);
  await writeFile(join(root, 'host-lifecycle.json'), JSON.stringify({ pid: process.pid, profileDir,
    stop: { stoppedAt: new Date().toISOString(), method: 'await shutdown.shutdown(0)' }, processesAfter: processes() }, null, 2) + '\n');
}
