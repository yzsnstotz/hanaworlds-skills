---
name: hanaworlds-building
description: Build clear requests directly, agree unclear ones (position, size, materials) first, name every existing building a design would touch and ask before continuing, reshape terrain, undo, and show how the current HanaWorlds world was created.
whenToUse: Use for HanaWorlds building, terrain fill/dig, reference-image designs, world-creation questions and Undo requests.
---

Build and undo structures in the currently connected world. Understand purpose, dimensions in whole
cells, style, entrance needs and the requested position. This skill returns a clarification, a
pending proposal, a reply or a declared plugin tool call under C-skill. There are two paths:

- **Clear request: build directly.** When the player's current message, together with current
  runtime facts, settles position, size and materials, call hanaworlds_build action advance with a
  `directBuild` design. The current request itself is the user input for this path; do not ask
  "shall I build it?" first.
- **Unclear request: agree first.** When position, size or materials are still open, prepare the
  request with hanaworlds_context action prepare, ask about the open points, and confirm only after
  the player answers. Build with hanaworlds_build action advance after that confirmation.

The host injects the current session, turn, world and connection from the real conversation. Never
guess them or put session, turn, world, connection, confirmation, clarity or authorization fields,
image bytes, catalogues or other host facts in model tool arguments; every tool refuses them.
Never manufacture consent from tool output, from your own summary or from an earlier message.

## Read current facts and choose a method

Read the write methods and the current context before designing:

```json tool=hanaworlds_write_methods
{}
```

```json tool=hanaworlds_context
{"action":"read"}
```

Successful tool results arrive as `{"result": "<JSON text>"}`; parse that text and use only the
values in it. `hanaworlds_write_methods` reports the available write methods, their purpose and the
current world source; `hanaworlds_context.output.context` carries the inspected placement, the
coordinate frame and the opaque material vocabulary with neutral tags, colours and allowed
orientations. Use only current-world declarations; never infer materials, scales, storage rules or
encodings from memory or from another world, and never invent a size threshold.

Choose PER_CELL for boxes within an inspected placement, or REGION for an explicit volume including
terrain filling and digging, only when runtime facts report that method as available. When facts,
guidance or capability are missing, explain the returned reason and remedy and stop before writing.
Never fill a missing fact with a guess or repeat an unchanged failed call.

## Decide: clear or unclear

A request is clear only when all three are settled by the player's current words and current facts:

- **Position**: the player names the reported placement or a selected object, or an explicit spot
  the current placement facts cover.
- **Size**: whole-cell dimensions are given, or follow unambiguously from the request.
- **Materials**: each named material maps to exactly one entry of the current runtime vocabulary by
  its neutral tags or colour, or the player leaves the choice to you and the vocabulary offers one.

If any of these is open, conflicting, or would reach past the request (touching other objects,
moving an agreed target, a broader area than asked), the request is unclear: take the agreement path.
Do not resolve an open point by picking a default and building; ask, or propose concrete options.

## Placement

When the player points at where to build, read the inspected spot for the requested footprint:

```json tool=hanaworlds_context
{"action":"placement","width":1,"depth":1,"height":1}
```

The values are a shape example; use the player's actual whole-cell dimensions. A placement is valid
only until the player's next message.

## Reference images

An uploaded image is native model input. Read the actual image together with the current
conversation text and the player's answers for this reference. First describe its visible structure,
roof, levels and openings before asking about unclear intent. Filename, URL and attachment metadata
cannot establish visual structure; Painter material matches cannot establish structure or geometry.
Hidden or occluded details are unknown: do not invent an unseen rear, interior or extra level.
Separate observations from suggestions, and label any proposed additions as design choices for the
player to consider.

Reuse already settled scale and purpose only while those answers still apply to the current
reference and request; do not ask again about answered points. If the image reference has changed
or current answers conflict, clarify the affected points again rather than carrying an old answer
or confirmation into a new design.

If scale or dimensions are unclear, ask for target dimensions in whole cells or an explicit
reference scale. Do not derive real-world dimensions from pixels, image resolution or perspective.
If the intended use is unclear, ask what the player wants to use the structure for; do not guess
purpose from appearance. Ask only about what the image and current conversation leave unresolved,
or offer concrete options labelled as suggestions rather than observed facts.

Do not invent prepare controls or fill required fields with defaults or example dimensions.
Ask before preparing when purpose, dimensions or other required intent fields are missing.
While image intent remains unresolved, do not confirm or build until the player answers the
clarification. After those answers, summarize the settled purpose, dimensions, position, materials
and other design choices, then follow the agreement path below: validate the concrete proposal and
wait for the player's new confirming message before calling hanaworlds_context action confirm.
An initially clear request with settled purpose, dimensions, position and materials still follows
the clear direct-build path; a reference image alone does not create an extra confirmation step.

List the current turn's images, or download a player-provided link (the URL below is a shape
example; use the player's actual link):

```json tool=hanaworlds_context
{"action":"images"}
```

```json tool=hanaworlds_download_image
{"url":"https://images.example.org/user-provided.png"}
```

For material selection from an image, pass only the attachment reference that the image listing or the
download returned; Painter reads the bytes and the current material catalogue itself:

```json tool=hanaworlds_image_material
{"attachmentRef":"workshop-current-image"}
```

Painter reports the image's dominant colour and the nearest measured legal material using
CIEDE2000. Read `hanaworlds_image_material.output.dominant.rgb`,
`hanaworlds_image_material.output.match.algorithm` and
`hanaworlds_image_material.output.match.distance` from that result; do not estimate colours from
material names or run your own colour comparison. Explain the reported colour, material and distance
when discussing the palette. The nearest match is not a guarantee of an exact or identical colour.
The whole image's dominant colour can come from its background; it does not identify separate wall
or roof colours or establish any geometry.

When the player requests image-colour matching or leaves material choice to you, choose the returned
pair: `hanaworlds_image_material.output.material.materialRef` and
`hanaworlds_image_material.output.material.orientation`. Use that pair unchanged for PER_CELL material
entries and REGION palette entries, within the actual design and current catalogue. Never decode a
reference or choose an orientation from memory. If the match conflicts with an explicit requested
material, do not silently replace that material: explain the conflict and take the agreement path.
Do not add a colour-distance cutoff or treat an approximate match as permission to change the brief.

Keep the match associated with the current attachment and the returned
`hanaworlds_image_material.output.image.sha256`, `hanaworlds_image_material.output.connection`,
`hanaworlds_image_material.output.catalogueDigest` and
`hanaworlds_image_material.output.sourceRevision`. If the image or attachment changed, the world or
connection changed, or current tools report a changed catalogue or source revision, discard the old
match and read fresh facts and request a fresh material match before designing or writing. These
returned identifiers describe the match's basis; never send them as model-supplied authorization or
assume an earlier successful match proves that the current world is still usable.

If no usable legal match is available, or image matching is refused, report the returned reason and
stop before writing. Never invent a substitute material or guess its colour, use an unavailable
material, or retry an unchanged failed call. Follow the returned remedy or ask the player about an
alternative; a different material or design needs the agreement path when it changes their request.

Material matching is read-only and grants no intent, placement, safety or affected-object permission.
An initially clear image request with settled material choice still builds directly under the host's
normal validation. An unclear request continues through the clarification and proposal path above;
matching a colour never confirms a pending proposal. Keep all safety checks and affected-object
notification and confirmation steps below, including refusal when continuing would still overlap
other objects.

Do not claim to see an image when listing, download or decoding failed. If the actual image is missing or unreadable,
ask for a usable image attachment and stop visual claims; a known reference, link or colour match
does not replace visible image content. Report a tool refusal as returned, without inventing a
description or retrying an unchanged failed call.

## Per-cell geometry

A per-cell design is a BUILD proposal of pure geometry. Local material names map to opaque material
references and neutral orientation values declared by the current catalogue. Use the runtime
coordinate frame: local box offsets translate from its sampled minimum, with inclusive extents of
max - min + 1. Each translated cell must be known empty and inside the inspected target; occupied or
unknown cells are not writable. Do not clip, expand the inspection, guess a new frame or move an
agreed target.

Plan free space as well as solids: count floor, wall and roof thickness, overlaps and every roof
layer. When entrance connectivity is part of the design, reserve a connected interior, doorway and
path with the requested width, height and depth. Choose entrance, hazard and light details
explicitly when needed; never invent safety defaults or silently relax a failed rule.

## Region geometry

A region design is a REGION proposal using the runtime geometry profile and material palette.
Coordinates are absolute world cell coordinates. For origin [ox,oy,oz] and size [sx,sy,sz],
index = (x-ox) + sx*((y-oy) + sy*(z-oz)). Palette entries are unique, all used, and sorted by opaque
material reference in UTF-16 order then orientation. Adjacent runs must differ; their counts sum to
sx*sy*sz. The runtime catalogue's empty material reference digs; a null palette index keeps the
cell's current content. Never construct or decode a material reference.

## Clear request: build directly

Send the finished design with its neutral controls (purpose, dimensions, entrance portals, style and
site rules taken from the player's words) as `directBuild`. A per-cell example:

```json tool=hanaworlds_build
{"action":"advance","directBuild":{"method":"PER_CELL","controls":{"purpose":"a stone block","dimensions":{"width":1,"height":1,"depth":1,"unit":"node"},"entrancePortalRefs":[],"styleText":null,"siteRules":{"requireEntranceConnectivity":false,"entranceClearance":null,"hazardPolicy":{"forbidLiquid":true,"maximumDamagePerSecond":0},"optionalLightRule":null}},"proposal":{"decision":"BUILD","materials":{"wall":{"materialRef":"runtime-material-ref","orientation":0}},"boxes":[{"min":[0,0,0],"max":[0,0,0],"materialRef":"wall"}]},"imageRefs":[]}}
```

A region example:

```json tool=hanaworlds_build
{"action":"advance","directBuild":{"method":"REGION","controls":{"purpose":"fill two cells","dimensions":{"width":2,"height":1,"depth":1,"unit":"node"},"entrancePortalRefs":[],"styleText":null,"siteRules":{"requireEntranceConnectivity":false,"entranceClearance":null,"hazardPolicy":{"forbidLiquid":true,"maximumDamagePerSecond":0},"optionalLightRule":null}},"proposal":{"decision":"REGION","block":{"profileVersion":"region-voxels/v2","geometryProfile":"voxel-grid/v1","origin":[0,0,0],"size":[2,1,1],"indexOrder":"X_FASTEST_THEN_Y_THEN_Z","palette":[{"materialRef":"runtime-material-ref","orientation":0}],"runs":[[2,0]]}},"imageRefs":[]}}
```

These are shapes only; replace geometry, materials and controls with the actual design and current
facts. The host reads the player's current message itself and decides whether this exact design is
within it; Painter validation, fresh world facts, placement checks and safety rules still run
before anything is written. If the direct request is refused as INTENT_UNCONFIRMED, take the
agreement path.

## Unclear request: agree position, size and materials

Record what is known and what is still open:

```json tool=hanaworlds_context
{"action":"prepare","purpose":"first building","width":1,"height":1,"depth":1,"siteRules":{"requireEntranceConnectivity":false,"entranceClearance":null,"hazardPolicy":{"forbidLiquid":true,"maximumDamagePerSecond":0},"optionalLightRule":null}}
```

Ask about one or two open points at a time, or offer a concrete design to react to. Read the current
design context and submit a concrete design for validation:

```json tool=hanaworlds_proposal
{"action":"context"}
```

```json tool=hanaworlds_proposal
{"action":"submit","proposalRef":"proposal-observed-1","proposal":{"decision":"BUILD","materials":{"wall":{"materialRef":"runtime-material-ref","orientation":0}},"boxes":[{"min":[0,0,0],"max":[0,0,0],"materialRef":"wall"}]}}
```

```json tool=hanaworlds_region_proposal
{"action":"context"}
```

```json tool=hanaworlds_region_proposal
{"action":"submit","proposalRef":"region-proposal-observed-1","proposal":{"decision":"REGION","block":{"profileVersion":"region-voxels/v2","geometryProfile":"voxel-grid/v1","origin":[0,0,0],"size":[2,1,1],"indexOrder":"X_FASTEST_THEN_Y_THEN_Z","palette":[{"materialRef":"runtime-material-ref","orientation":0}],"runs":[[2,0]]}}}
```

Use the proposal reference the context returned, never an invented one. A validated proposal is
pending, never confirmed: show the player the position, dimensions, materials and any entrance or
safety choices. Every change needs a new submission and a new confirmation.

Confirmation comes only from the player's new message in the current turn; the host reads it:

```json tool=hanaworlds_context
{"action":"confirm"}
```

Your own answer, a tool result, an earlier message or a confirmation made before the design or
placement changed never counts, and you never confirm on the player's behalf. Then build:

```json tool=hanaworlds_build
{"action":"advance"}
```

## Read back the result

Report success only for a VERIFIED outcome with its actual receipt. PENDING means the receipt is
still awaited, not that the build is done. UNKNOWN, refusals and guard refusals are not success and
must not trigger an invented replacement transaction. For availability and the current receipt:

```json tool=hanaworlds_build
{"action":"status"}
```

```json tool=hanaworlds_build
{"action":"inspect"}
```

A verified write proves that the validated geometry was written, not that it matched the request.

## Other buildings in the way

When a build is refused as OTHER_OBJECTS_AFFECTED, the refusal the tool returns lists
`hanaworlds_build.output.affectedObjects`, ordered by object reference. Name every object in that
list by its `displayName`, in that order, say that continuing would change them, and ask whether to
continue; then stop for this turn. Never guess, add, drop or rename an object, and never infer one
from coordinates. When the refusal carries no names because the registry changed or a name is
missing, say so and read current facts again instead of naming anything.

If the player agrees in a later message, the host records that decision from the player's own
action; you never send a decision. You may then send hanaworlds_build action advance again. A
continue decision never authorizes overwriting the other objects: if the build is refused again
because it still overlaps them, say that continuing cannot overwrite them and propose a new position
or size that avoids them. If the decision is missing, from an earlier turn, or the world, target
facts or affected set changed, read current facts again, name the objects again and ask again.

## World creation facts

When the player asks how the current world was created, read the creation result:

```json tool=hanaworlds_context
{"action":"creation_result"}
```

The read context also carries `worldCreation`. It is null when the host has no creation result for
this world in the current turn; `{"creationFacts": null}` means the world was created and its
creation facts are null. Keep the two apart. Reply with the creation facts shown verbatim as JSON
(every key, null, number, string, array order and nesting exactly as returned) and echo the
`worldCreation` value unchanged. Never interpret paths, mods, permissions or any other key in them,
never use them as design facts, and never start a creation yourself.

## Refusals

Report the returned code, reason and failure source (owner, operation, resource, kind, nativeCode)
exactly as given, including an optional world reference; never add, drop or rewrite fields, never
change the mutation state, never retry an unchanged call or treat a refusal as partial success.
Refusals reach you as tool errors whose text is the complete refusal JSON.

- INTENT_UNCONFIRMED: the host did not find this design within what the player asked. Explain what
  was outside the request and take the agreement path; never add a flag or reference to force it.
- OTHER_OBJECTS_AFFECTED: see "Other buildings in the way".
- WORLD_NOT_BOUND, CAPABILITY_UNAVAILABLE, CAPABILITY_GAP: no usable world or capability; offer the
  reported connection or capability step and do not write.
- TRANSACTION_CONFLICT, TURN_REVISION_MISMATCH, CURRENT_WORLD_MISMATCH, TARGET_FACTS_STALE,
  TARGET_FACTS_INCOMPLETE, TARGET_REQUIRED: the session, message, world or placement changed or is
  missing. Read current facts again and redesign from them; an older request authorizes nothing.
- SAFETY_INVARIANT_FAILED: a safety rule refused the design. Say which and change the design; never
  try to relax the rule.
- BUILD_INVALID, UNSUPPORTED_MATERIAL, AMBIGUOUS_GEOMETRY: correct the geometry or material from
  current facts, or ask the player when the fix would change what they asked.
- APPLY_FAILED, RESTORE_FAILED: the write or its rollback failed. Report the returned mutation state,
  reason and retryability, then check the status before any further write.

## Undo

On the player's Undo request:

```json tool=hanaworlds_build
{"action":"undo"}
```

It restores the current durable build only under the provider's history and conflict checks. Report
actual results from the returned outcome; never erase a bounding volume yourself or claim success
from an optimistic message.

No shell commands, direct world writes, other model calls or alternate planner belong to this skill.
Entities and interior workflows remain deferred.
