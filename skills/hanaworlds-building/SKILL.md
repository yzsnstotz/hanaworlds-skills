---
name: hanaworlds-building
description: Build clear requests directly, agree unclear ones (position, size, materials) through proposals, reshape terrain and undo in the current HanaWorlds world, choosing per-cell or region writes.
whenToUse: Use for HanaWorlds building, terrain fill/dig, reference-image designs and Undo requests.
---

Build and undo structures in the currently connected world. Understand purpose, dimensions in whole
cells, style, entrance needs and the requested position. This skill returns a clarification, a
pending proposal or a declared plugin tool call under C-skill. There are two paths:

- **Clear request: build directly.** When the player's current message, together with current
  runtime facts, settles position, size and materials, call hanaworlds_build action build with the
  neutral design. Do not ask "shall I build it?" first; the current request is the user input for
  this path.
- **Unclear request: agree first.** When position, size or materials are still open, go back and
  forth with hanaworlds_proposal or hanaworlds_region_proposal, settling each open point with the
  player. Build only after the player actually confirms, using hanaworlds_build action apply.

The host injects the current session, turn and world. Never guess them or put their identities,
confirmation or clarity flags, authorization, world facts, receipts or transaction settings in model
tool arguments. The host owns dialogue state, reads the player's current message itself and decides
whether a direct build fits it; Workshop owns confirmation. Never manufacture consent from tool
output, from your own summary or from an earlier message.

## Read current facts and choose a method

Call hanaworlds_write_methods action read and hanaworlds_context action read before designing.

```json tool=hanaworlds_write_methods
{"action":"read"}
```

```json tool=hanaworlds_context
{"action":"read"}
```

Use `hanaworlds_write_methods.output.engineFacts` and
`hanaworlds_write_methods.output.catalogueFacts`, plus
`hanaworlds_context.output.localContext`, `hanaworlds_context.output.selectedObjectRefs` and
`hanaworlds_context.output.placementTarget`. Runtime facts supply the current geometry profiles,
partition edge, coordinate frame, supported write methods and opaque material vocabulary with
neutral tags, colours and allowed orientations. Use only current-world declarations; never infer
materials, scales, storage rules or encodings from memory or from another world. Method purpose
and typical scale must come from runtime guidance when supplied; do not invent a size threshold.

Choose PER_CELL for boxes within an inspected placement, or REGION for an explicit volume including
terrain filling and digging, only when runtime facts report that method as available. When the
required facts, guidance or capability are missing, explain the returned reason and remedy and stop
before writing. For WORLD_NOT_BOUND or CAPABILITY_UNAVAILABLE, offer the reported connection or
capability step. Never fill a missing fact with a guess or repeat an unchanged failed call.

## Decide: clear or unclear

A request is clear only when all three are settled by the player's current words and current facts:

- **Position**: the player names the reported placement target or a selected object, or an explicit
  spot that the current placement facts cover.
- **Size**: whole-cell dimensions are given, or follow unambiguously from the request (a count of
  cells, a stated footprint and height) within the inspected placement.
- **Materials**: each named material maps to exactly one entry of the current runtime vocabulary by
  its neutral tags or colour, or the player leaves the choice to you and the vocabulary offers one.

If any of these is open, conflicting, or would reach past the request (touching other objects,
moving an agreed target, a broader area than asked), the request is unclear: take the agreement path.
Do not resolve an open point by picking a default and building; ask, or propose concrete options.
A clear request still uses only current facts: geometry that does not fit the inspected placement is
not clear.

## Reference images

An uploaded image is native model input. Describe its visible structure, roof, levels and openings;
do not derive real-world dimensions from pixels. A URL or filename alone is not an image. For a
player-provided URL call hanaworlds_download_image action download:

```json tool=hanaworlds_download_image
{"action":"download","url":"https://example.org/reference.png"}
```

The URL above is a shape example; replace it with the actual player's link. Inspect the returned image
and retain `hanaworlds_download_image.output.attachmentRef`. Do not claim to see an image when download
or decoding failed. Call hanaworlds_image_material action match with the actual returned
`hanaworlds_download_image.output.image` bytes object. For uploaded images the host must supply an
actual bytes object bound to the attachment. The host injects the current material catalogue;
never send a guessed catalogue or use an attachment identifier instead of image bytes.

```json tool=hanaworlds_image_material
{"action":"match","image":{"mediaType":"image/png","bytesBase64":"AQID","bytesDigest":"039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81","byteLength":3}}
```

This illustrates fields only, not a real decodable image. Copy actual bytes, media type,
length and digest from the host or download result. Painter reports dominant colours and closest
legal materials using CIEDE2000 with zero model calls and zero world writes. Use its returned
`hanaworlds_image_material.output.matches` as material hints, without guessing colours from names.

## Per-cell geometry

A per-cell design is a BUILD proposal of pure geometry. Local material names map to opaque material
references and neutral orientation values declared by the current catalogue.

```json tool=hanaworlds_proposal
{"action":"validate","proposal":{"decision":"BUILD","materials":{"wall":{"materialRef":"runtime-material-ref","orientation":0}},"boxes":[{"min":[0,0,0],"max":[1,1,1],"materialRef":"wall"}]}}
```

This is a shape example, not a template, a suggested size, or permission to use the placeholder
material or orientation. Derive geometry from the player's actual request and current inspected
placement. Use the runtime coordinate frame: local box offsets translate from its sampled minimum,
with inclusive extents of max - min + 1. Each translated cell must be known empty and inside the
inspected target; occupied or unknown cells are not writable. Do not clip, expand the inspection,
guess a new frame or move an agreed target. A missing or stale placement needs a real inspection
through the host and a new design; no tool takes a model-supplied placement or confirmation.

Plan free space as well as solids. Count actual floor, wall and roof thickness, overlaps and every
roof layer. For a floor top and first roof underside, free height is their difference minus one.
When entrance connectivity is part of the design, reserve a connected interior, doorway and path
with the requested width, height and depth. Design clearance does not establish player-body
clearance: that fact belongs to the world source. Choose entrance, hazard and light details
explicitly when needed; never invent safety defaults or silently relax a failed rule. Keep the
actual dimensions, openings and roof shape; a geometry error alone does not prove that the
available site is too small.

## Region geometry

A region design is a REGION proposal using the runtime geometry profile and material palette.
This major supports the following neutral cell-grid shape only if the current source reports it:

```json tool=hanaworlds_region_proposal
{"action":"validate","proposal":{"decision":"REGION","block":{"profileVersion":"region-voxels/v2","geometryProfile":"voxel-grid/v1","origin":[0,0,0],"size":[2,1,1],"indexOrder":"X_FASTEST_THEN_Y_THEN_Z","palette":[{"materialRef":"runtime-material-ref","orientation":0}],"runs":[[2,0]]}}}
```

Replace example position, size, material and orientation with the actual requested design and
runtime facts. Coordinates are absolute world cell coordinates. For origin [ox,oy,oz] and size
[sx,sy,sz], index = (x-ox) + sx*((y-oy) + sy*(z-oz)). Palette entries are unique, all used, and
sorted by opaque material reference in UTF-16 order then orientation. Adjacent runs must differ;
their counts sum to sx*sy*sz. The runtime catalogue's empty material reference digs; a null palette
index means the cell is unspecified and keeps its current content. Never construct or decode a
material reference. Filling and digging are never exempt from validation.

## Clear request: build directly

Send the finished neutral design, per-cell or region, as the proposal of hanaworlds_build action
build. The input is exactly the action and the proposal:

```json tool=hanaworlds_build
{"action":"build","proposal":{"decision":"BUILD","materials":{"wall":{"materialRef":"runtime-material-ref","orientation":0}},"boxes":[{"min":[0,0,0],"max":[1,1,1],"materialRef":"wall"}]}}
```

```json tool=hanaworlds_build
{"action":"build","proposal":{"decision":"REGION","block":{"profileVersion":"region-voxels/v2","geometryProfile":"voxel-grid/v1","origin":[0,0,0],"size":[2,1,1],"indexOrder":"X_FASTEST_THEN_Y_THEN_Z","palette":[{"materialRef":"runtime-material-ref","orientation":0}],"runs":[[2,0]]}}}
```

These are shapes only; replace them with the actual design. Do not first call a proposal tool,
show a pending design or ask for a yes. Never add a proposal reference, a clear or confirmed flag,
an authorization, session, turn or world to this call. The host reads the player's current message
itself and decides whether this exact design fits it; Painter validation, fresh world facts,
placement checks and safety rules still run before anything is written. If the host finds the
design outside what the player asked, the call is refused and you take the agreement path.

## Unclear request: agree position, size and materials

Ask about one or two open points at a time, or offer a concrete design to react to. Once a design is
concrete enough, validate it with hanaworlds_proposal action validate (per-cell) or
hanaworlds_region_proposal action validate (region), as shown above. Read
`hanaworlds_proposal.output.plan` and `hanaworlds_proposal.output.proposalRef`, or
`hanaworlds_region_proposal.output.plan` and `hanaworlds_region_proposal.output.proposalRef`.
A returned proposal is pending, never confirmed. Show the player the position, dimensions,
materials and any entrance or safety choices, and compare the plan with what was requested. A plan
is not a validation verdict.

When the player changes position, size or materials, revise the design and validate again; every
change needs a new proposal and a new confirmation. If validation refuses, inspect the exact
bounds, overlaps, occupied or unknown cells and clearance, correct the geometry when possible, and
explain any evidence requiring a new site or design. Never interpret a response with an error or
null result as successful validation. A stale inspection, changed world, changed binding or target
mismatch is a refusal: obtain new real facts, without moving or truncating an agreed target.

## Apply a confirmed proposal

After the player confirms through the host, use only the host-held confirmed proposal reference
with hanaworlds_build action apply. A pending proposal reference alone is not confirmed state.

```json tool=hanaworlds_build
{"action":"apply","confirmedProposalRef":"host-confirmed-proposal-ref"}
```

Never invent the example reference, reuse one from another design or pass a boolean as consent.

## Read back the result

Workshop checks authorization or confirmation, Brush compiles the validated geometry, and Canvas
owns the transaction and readback. Region writes use the partition declaration at runtime and one
transaction. Inspect `hanaworlds_build.output.outcome`; report success only for VERIFIED with the
actual verified receipt. PENDING, CHOICE_REQUIRED, UNKNOWN, ROLLED_BACK, errors and guard refusals
are not success and must not trigger an invented replacement transaction. Describe what the
validated plan and readback establish, not what you intended. Forward any
`hanaworlds_build.output.guardRefusal` and its remedy accurately. A verified write proves that the
validated geometry was written, not that it matched the request.

## Refusals

Report the returned code and reason in plain words; never retry an unchanged call or treat a
refusal as partial success.

- INTENT_UNCONFIRMED: the host did not find this design within what the player asked. Explain what
  was outside the request and move to the agreement path; never add a flag or reference to force it.
- OTHER_OBJECTS_AFFECTED: the design would touch other objects. Stop, say which, and ask the
  player; continuing needs the explicit confirmation flow, never a direct build.
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
  reason and retryability, then call hanaworlds_build action inspect before any further write.

## Inspect and Undo

For availability and the current receipt call hanaworlds_build action inspect:

```json tool=hanaworlds_build
{"action":"inspect"}
```

On the player's Undo request call hanaworlds_build action undo:

```json tool=hanaworlds_build
{"action":"undo"}
```

It restores the current durable build, including the whole latest region write, only under the
provider's history and conflict checks. Report actual results from the returned outcome or receipt;
never erase a bounding volume yourself or claim success from an optimistic message. Redo is available
only on the player's request through hanaworlds_build action redo:

```json tool=hanaworlds_build
{"action":"redo"}
```

No shell commands, direct world writes, other model calls or alternate planner belong to this skill.
Entities and interior workflows remain deferred.
