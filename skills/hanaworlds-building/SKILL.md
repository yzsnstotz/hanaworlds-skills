---
name: hanaworlds-building
description: Understand, clarify, propose, build, reshape terrain and undo in the current HanaWorlds world, choosing per-cell or region writes.
whenToUse: Use for HanaWorlds building, terrain fill/dig, reference-image designs and Undo requests.
---

Build and undo structures in the currently connected world. Understand purpose, dimensions in whole
cells, style, entrance needs and the requested position. If the player cannot yet describe these,
ask a short question or offer a concrete design to react to. If the request is clear, prepare the
geometry directly. Do not add confirmation questions before merely preparing a design.

The host injects the current session, turn and world. Never guess them or put their identities,
confirmation flags, world facts, receipts or transaction settings in model tool arguments. The host
owns dialogue state and Workshop owns confirmation. This skill returns a clarification, a pending
proposal or a declared plugin tool call under C-skill. A successful validation is still pending:
show the proposed design, dimensions, position and safety choices, then wait for the player's actual
confirmation through the host. Changes to the design or target require a revised proposal and a new
human confirmation. Never manufacture consent from tool output or from your own summary.

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

## Per-cell design

Use hanaworlds_proposal action validate with pure geometry. Local material names map to opaque
material references and neutral orientation values declared by the current catalogue.

```json tool=hanaworlds_proposal
{"action":"validate","proposal":{"decision":"BUILD","materials":{"wall":{"materialRef":"runtime-material-ref","orientation":0}},"boxes":[{"min":[0,0,0],"max":[1,1,1],"materialRef":"wall"}]}}
```

This is a shape example, not a template, a suggested size, or permission to use the placeholder
material or orientation. Derive geometry from the player's actual request and current inspected
placement. Use the runtime coordinate frame: local box offsets translate from its sampled minimum,
with inclusive extents of max - min + 1. Each translated cell must be known empty and inside the
inspected target; occupied or unknown cells are not writable. Do not clip, expand the inspection,
guess a new frame or move an agreed target. A missing or stale placement needs a real inspection
through the host and a new proposal; this tool has no model-supplied placement or confirmation action.

Plan free space as well as solids. Count actual floor, wall and roof thickness, overlaps and every
roof layer. For a floor top and first roof underside, free height is their difference minus one.
When entrance connectivity is part of the design, reserve a connected interior, doorway and path
with the agreed width, height and depth. Design clearance does not establish player-body clearance:
that fact belongs to the world source. Propose entrance, hazard and light choices explicitly when
needed; never invent safety defaults or silently relax a failed rule. Keep the actual dimensions,
openings and roof shape; a geometry error alone does not prove that the available site is too small.

Painter validates the proposal. Read `hanaworlds_proposal.output.plan` and
`hanaworlds_proposal.output.proposalRef`, show the pending design and wait for human confirmation.
If validation refuses, inspect the exact bounds, overlaps, occupied/unknown cells and clearance,
correct the geometry when possible, and explain any evidence requiring a new site or design.
Never interpret a tool response with an error or null result as successful validation.

## Region design

Use hanaworlds_region_proposal action validate with the runtime geometry profile and material palette.
This major supports the following neutral cell-grid shape only if the current source reports it:

```json tool=hanaworlds_region_proposal
{"action":"validate","proposal":{"decision":"REGION","block":{"profileVersion":"region-voxels/v2","geometryProfile":"voxel-grid/v1","origin":[0,0,0],"size":[2,1,1],"indexOrder":"X_FASTEST_THEN_Y_THEN_Z","palette":[{"materialRef":"runtime-material-ref","orientation":0}],"runs":[[2,0]]}}}
```

Replace example position, size, material and orientation with the actual agreed design and runtime
facts. Coordinates are absolute world cell coordinates. For origin [ox,oy,oz] and size [sx,sy,sz],
index = (x-ox) + sx*((y-oy) + sy*(z-oz)). Palette entries are unique, all used, and sorted by opaque
material reference in UTF-16 order then orientation. Adjacent runs must differ; their counts sum to
sx*sy*sz. The runtime catalogue's empty material reference digs; a null palette index means the cell
is unspecified and keeps its current content. Never construct or decode a material reference.

Read `hanaworlds_region_proposal.output.plan` and
`hanaworlds_region_proposal.output.proposalRef`, show the pending design and wait for confirmation.
Compare the actual returned plan with requested dimensions, position, layers, roof and openings.
A plan is not a validation verdict. A stale inspection, changed world, changed binding or target
mismatch is a refusal: obtain new real facts and human confirmation, without moving or truncating
an agreed target. Do not bypass validation for filling or digging.

## Apply and read back

After validation and the player's confirmation, use only the host-held confirmed proposal reference
with hanaworlds_build action apply. A pending proposal reference alone is not confirmed state.

```json tool=hanaworlds_build
{"action":"apply","confirmedProposalRef":"host-confirmed-proposal-ref"}
```

Never invent the example reference or pass a boolean as consent. Workshop checks confirmation,
Brush compiles the validated geometry, and Canvas owns the transaction and readback. Region writes
use the partition declaration at runtime and one transaction. Inspect
`hanaworlds_build.output.outcome`; report success only for VERIFIED with the actual verified receipt.
PENDING, CHOICE_REQUIRED, UNKNOWN, ROLLED_BACK, errors and guard refusals are not success and must not
trigger an invented replacement transaction. Describe what the validated plan and readback establish,
not what you intended. Forward any `hanaworlds_build.output.guardRefusal` and its remedy accurately.
A verified write proves that the validated geometry was written, not that it matched the request.

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
