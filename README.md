# hanaworlds-skills

HanaWorlds domain skill source (D-13). The installed bundle contains Markdown,
its Cordis patch and package metadata; it registers no tools or runtime plugin code.
Workshop and Painter own the seven tools declared by `hanaworlds-contracts@2.4.0`.
The source dependency pins the published Git tag `v2.4.0` exactly.

Install this package as a DSH profile bundle using the host's package manager.
The one-line `cordis.patch.yml` inserts the unchanged upstream
`@deepseek-ai/dsh-skill-filesystem` provider with a unique provider name and
`customSkillDirs` pointing at this installed package's `skills/` directory.
The expression uses the loader's `baseUrl` and `createRequire(...).resolve(...)`
to find `hanaworlds-skills/package.json`, then supplies an absolute directory.
The upstream provider resolves relative custom roots against process cwd;
`./skills` would therefore be unsuitable. No home configuration changes are needed
for an isolated installation test.

The skill follows C-skill `skill/v1`: current turn text and image attachment
references, with session/turn/world injected only by the host. It clarifies unclear
requests, prepares clear designs, chooses declared write methods and awaits actual
human confirmation before applying a host-held confirmed proposal. Geometry and
material vocabulary come from current runtime facts. C-session and C-painter are
consumed through published contracts, never through other plugin implementations.
The authoritative examples and fixture-only mock are available from
`hanaworlds-contracts/fixtures/skill-tools` and its root `createSkillToolsMock` export.

For source checks (Node.js 24 or newer):

```sh
npm ci --ignore-scripts
npm run lint:skills
npm test
```

The linter reads `hanaworlds-contracts/tools` and `hanaworlds-contracts/skill`,
checks every named tool, prose action, annotated input/output field path and JSON
input example, and invokes the published strict validator for nested fields.
There is no local tool allowlist. It also rejects prohibited engine vocabulary.
Examples show data shapes, not live references, placement facts or image content.
The linter does not prove semantic intent, material membership or live world safety;
those checks belong to the runtime providers.

To verify the installation independently, pack and install the tarball in a
separate consumer directory, then run the source test with
`HANA_SKILLS_INSTALL_ROOT=/absolute/consumer/root node --test test/installed-mount.mjs`.
That test runs upstream patch insertion, loader expression interpolation and the
installed filesystem provider's discovery/body loading from a different cwd.
Its host registry is simulated and watching is disabled. It proves installed
skill discovery, not a running DSH/model/world/UI acceptance.

Sources and licences: upstream filesystem provider 0.0.1-rc.3 (BSD-3-Clause),
Cordis loader 1.0.5 and include 1.0.9 (MIT), YAML 2.9.1 (ISC), contracts 2.4.0
(MIT). Skill prose derives from Workshop main `0fb3fef83abd0177b13af4a881fcdb6ac0b6b159`
`src/building-skill.mjs` (MIT), revised to the published neutral tool contracts.

Upstream: https://github.com/deepseek-ai/deepseek-harness

Contracts: https://github.com/yzsnstotz/hanaworlds-contracts/tree/v2.4.0
