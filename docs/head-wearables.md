# Head wearables

The lower-left set piece is a small wooden dressing table at
`x = -.155`, `z = .205`. Its tabletop, four legs, and apron use the same
procedural timber material graph as the swing frame. The visible table is
registered as a facility with one fitted oriented box spanning its complete
asset, so the soft-body surface is resolved out of the table after each
physics step before rendering.

The three table slots are equally spaced left-to-right: Floral Crown, Top Hat,
and Baseball Cap. Their geometry and TSL materials are direct ports of the
constructors in [`refs/hat_assets.html`](../refs/hat_assets.html). Each object
is uniformly scaled for the 7 cm jelly: the larger source top hat and crown
receive smaller scalar values so their fitted envelopes remain balanced on the
same head. The objects are reparented, rather than cloned, when worn; this
preserves their exact table position for taking them off again and keeps their
existing shadow registrations valid.

## Interaction state

The shared facility manager receives the nearest available slot when the
grounded, ungrabbed body enters the table's `.135 m` approach radius. The
desktop prompt is generated as `Press E to Wear <name>` and the touch button as
`Wear <name>`. Only one item can be worn at a time. Once worn, the table
facility becomes available for taking it off only when the grounded body has
left that approach radius; the corresponding `Take off <name>` wording then
replaces the wear wording. Taking the item off reparents it to its original
slot, so the next approach can select it again.

The head anchor is a rest-space surface vertex at the top of the supplied
jelly model, evaluated through its four cage bindings every frame. This makes
the accessory follow translation and soft deformation without adding another
rigid body or overwriting the soft-body positions. The cap's source tilt and
the top hat/crown silhouettes are retained; only the item root's yaw follows
the locomotion heading.

## Jump hop

`Locomotion.onJump` fires only when the ordinary grounded jump path applies its
Space impulse. It is not emitted by the swing, trampoline, grabs, or any other
facility. A worn item then enters a one-dimensional free-flight state relative
to the live head anchor with `PHYS.gravity` and an initial velocity calculated
for a `.025 m` apex. Semi-implicit fixed stepping brings it back to zero offset
on the next landing, while the baby itself continues through its normal
soft-body jump.

The item remains a normal opaque facility caster while held and while worn.
The table registers a fixed world envelope broad enough for the table and the
wearable to follow the baby across the authored play area, so ground masks and
raised-surface depth maps continue to support table-to-jelly, jelly-to-item,
and item-to-ground shadowing during the hop.
