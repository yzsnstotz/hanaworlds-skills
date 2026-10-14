# hanaworlds-skills

HanaWorlds domain skill source (D-13). The installed bundle contains Markdown,
its Cordis patch and package metadata; it registers no tools or runtime plugin code.
Workshop owns six model tools and Painter owns `hanaworlds_image_material`, as
published in the C-session (versions 1–3) and C-painter (version 5) contract
documents. Their model-facing structures are compiled into `tools/structures.json`
with the documents' SHA-256; there is no contract package dependency.

Install this package as a DSH profile bundle using the host's package manager.
The one-line `cordis.patch.yml` inserts the unchanged upstream
`@deepseek-ai/dsh-skill-filesystem` provider with a unique provider name and
`customSkillDirs` pointing at this installed package's `skills/` directory.
The expression uses the loader's `baseUrl` and `createRequire(...).resolve(...)`
to find `hanaworlds-skills/package.json`, then supplies an absolute directory.
The upstream provider resolves relative custom roots against process cwd;
`./skills` would therefore be unsuitable. No home configuration changes are needed
for an isolated installation test.

Host compatibility is limited to the two verified upstream supplies:
`@deepseek-ai/dsh-skill-filesystem` **0.2.0-rc.2** (official npm DSH
0.2.0-rc.2) and **0.2.1-alpha.2** (Desktop's fixed upstream commit
`d743267388641bc76f17c45ce8b4c231aed1d32c`). The peer declaration lists
these exact prereleases; other versions require fresh verification. Development
checks pin filesystem 0.2.1-alpha.2 and its official alpha Cordis loader/include
supply. The installed bundle uses the host-supplied
provider and contains no provider implementation.

For an independent official-host check, set `DSH_HOME` to a disposable directory,
then run `dsh plugin --profile skills-compat add /absolute/hanaworlds-skills-0.1.1.tgz`.
The normal manager enables the bundle in `dsh.profile.bundles`; boot that profile
through DSH. Its real `ctx.skills.list()` / `get('hanaworlds-building')` must
return provider `hanaworlds-skills` and the installed package's absolute skill
path. The manager's pnpm subprocess may report a missing filesystem peer because
it is supplied by the host installation. DSH's runtime resolution must resolve
that peer to the matching host package; this warning alone proves neither a
failure nor successful mounting. Do not install an extra provider or grant a
version exemption to silence it.

The compatibility repair was checked through normal plugin-manager installation
and real DSH profile boot on both supplies, with the upstream filesystem and
registry enabled, from a cwd outside the source package. This verifies installation,
activation and skill loading; it does not verify model execution or world behavior.

The skill follows C-skill `skill/v1`: current turn text and image attachment
references, with session/turn/world injected only by the host. A clear request
(position, size and materials settled by the current message and runtime facts)
is built directly with `hanaworlds_build` action `advance` carrying a neutral
`directBuild` (PER_CELL or REGION); the host reads the current message and
authorizes it. An unclear request is prepared with `hanaworlds_context` action
`prepare`, clarified, confirmed only by the player's new message
(`hanaworlds_context` action `confirm`) and then advanced. When a build is refused
as OTHER_OBJECTS_AFFECTED the skill names every object in the refusal's
`affectedObjects`, in order, and asks; continuing is recorded by the host from the
player's own action, and a continue decision never authorizes overwriting the
objects. Image material hints pass only an `attachmentRef`; world creation facts
from `creation_result` are shown verbatim, keeping `worldCreation: null` and
`{"creationFacts": null}` distinct. Geometry and material vocabulary come from
current runtime facts; other plugins are consumed only through the published
contract documents, never through their implementations.

`test/skill-source-product/run.mjs` (run by the card command
`npm run lint:skills && node test/skill-source-product/run.mjs`) packs and
installs this bundle through the official plugin manager, checks the live body,
observes files (digest and inode identity) and processes before and after loading,
and checks every C-skill sample value by value against the published C-session and
C-painter cases compiled into its fixtures. It is source/document evidence, not a
running Workshop, model, world or UI.

For source checks (Node.js 24 or newer):

```sh
npm ci --ignore-scripts
npm run lint:skills
npm test
```

Run `npm ci --ignore-scripts` again after updating the checkout's dependency
lock; an older `node_modules` tree does not exercise the pinned Host supply.
The repository's `.npmrc` selects a writable global cache under the current
user's home for these commands without changing user-level npm configuration.

`npm test` also includes `test/official-host.mjs`, a mandatory alpha.2 source
mount gate. It packs this bundle, installs it through the published official
plugin-manager operation into an independent temporary profile, and boots that
profile with the official `@deepseek-ai/dsh/profile-boot` API. The profile mounts
the official skill registry and this bundle only. The gate requires the same live
registry's `snapshot`, `list` and `get` to discover the installed skill, report
complete discovery and load exactly the shipped Markdown body. It does not mount
a model, credentials service, world or application entry. An empty launch
snapshot from the public `createLaunchEnvironmentSnapshot([])` factory avoids
the CLI's layered environment loading. Separate empty user/global npmrc files
isolate package configuration. Child processes use the current supported Node
executable and an explicit writable global npm cache; paths and versions are
recorded in `runtime.json` and the Host evidence. DSH and pnpm are pinned
development dependencies used only by this regression, not runtime bundle content.
Set `HANA_SKILLS_TEST_DIR` to choose the temporary parent, and
`HANA_SKILLS_KEEP_TEST_ROOT=1` to retain the profile, logs and live-catalog evidence.

The linter reads `tools/structures.json` (the published model-facing structures),
checks every named tool, prose action, annotated output field path and JSON input
example against the closed nested schemas with `tools/schema.mjs`. It also rejects prohibited engine vocabulary.
Examples show data shapes, not live references, placement facts or image content.
The linter does not prove semantic intent, material membership or live world safety;
those checks belong to the runtime providers.

To verify the installation independently, pack and install the tarball in a
separate consumer directory alongside filesystem 0.2.1-alpha.2, then run the source test with
`HANA_SKILLS_INSTALL_ROOT=/absolute/consumer/root node --test test/installed-mount.mjs`.
That test runs upstream patch insertion, loader expression interpolation and the
installed filesystem provider's discovery/body loading from a different cwd.
Its host registry is simulated and watching is disabled. It proves installed
skill discovery, not a running DSH/model/world/UI acceptance.

Sources and licences: upstream filesystem providers 0.2.0-rc.2 and 0.2.1-alpha.2 (MIT),
Cordis loader 1.0.6-alpha.1 and include 1.0.10-alpha.1 (MIT), official DSH,
app boot, plugin manager and launch environment 0.2.1-alpha.2 (MIT), pnpm 10.23.0 (MIT),
YAML 2.9.1 (ISC). Skill prose derives from Workshop main `0fb3fef83abd0177b13af4a881fcdb6ac0b6b159`
`src/building-skill.mjs` (MIT), revised to the published C-session and C-painter model inputs.

Upstream: https://github.com/deepseek-ai/deepseek-harness

