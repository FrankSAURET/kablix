# Drawing systems in 3D (spider, legs, plates)

The spider robot and its leg are not SVG files pasted on screen: they are **volumes computed on every frame** by the isometric engine [`iso3d.mts`](../../src/webview/composants/iso3d.mts). That is what lets a leg actually lift — a flat drawing produced the same picture whether you turned the hip or bent the knee.

The price was that shapes were **hard-coded**: the chassis was `regularPoly(8, 55)`, an octagon; the bones were boxes. Not a single pencil stroke in there. This guide describes the path opened in v2026.8.23: **you draw the outline of a part, the engine turns it into a volume**. The drawing stays yours; the kinematics, the shading and the depth sorting stay with the engine.

There are **two ways** to draw, and the guide covers them in order:

| | What you draw | What comes out | For |
| --- | --- | --- | --- |
| **Profile** | **one** flat part, at any scale | the part, scaled by the component | a silhouette: the robot chassis, a leg bone, a board |
| **Assembly** | **several** flat parts, **in millimetres**, each with its pose | the complete build, dimensions kept | a sandwich body: two 3 mm sides with the servos between them |

The difference fits in one sentence: in a profile only the **proportions** matter; in an assembly **the dimensions are the information** — between two sides, 3 mm of material and 25 mm of gap are not recomputed, they are measured.

This guide is for people working on **the repository**. For a regular flat component (a diode, a sensor), the chain is different and described in [Creating a Kablix component](Creating-components.md).

In a hurry? Jump to [original drawing, and what comes out](#original-drawing-and-what-comes-out): three pictures are worth the page. Here for the sandwich body? That is [Assembling several parts](#assembling-several-parts). Stuck on a leg that will not mount the way you wanted? That is [Drawing a leg, from hip to foot](#drawing-a-leg-from-hip-to-foot), and its table of symptoms.

---

## What you need

- The repository cloned, `npm install` done, Node 20+.
- **Inkscape** (or any SVG editor) to draw in `Composants.svg`.
- **Chrome / Chromium** installed: outlines are read through a headless browser. Flattening Bézier curves and elliptical arcs by hand in Node would mean writing wrong code twice — `getPointAtLength` does it right, and for free.

---

## The chain at a glance

**A profile** — one part, at any scale:

| # | Step | Command / file |
| --- | --- | --- |
| 1 | Draw the outline of the part | `Composants.svg`, group `<name>-profil` |
| 2 | Read it | `npm run profil <name>` → `src/webview/composants/profils.mts` |
| 3 | Look at it | `node scripts/_capture-profil.mjs <name>:plat` then `<name>:plaque` or `<name>:piece` |
| 4 | Turn it into a volume | nothing to do if the name is already expected (table below), otherwise the element |
| 5 | Check | `npm run verify:profils` |

**An assembly** — several parts, in millimetres:

| # | Step | Command / file |
| --- | --- | --- |
| 1 | Draw the parts, each with its **pose label** | `Composants.svg`, groups `<assembly>-<part>` |
| 2 | Read it and **watch it turn** | `npm run montre <prefix>` |
| 3 | Store it only (no window) | `npm run assemblage <assembly>` → `src/webview/composants/assemblages.mts` |
| 4 | Produce the doc pictures | `node scripts/_capture-profil.mjs <assembly>:assemblage` and `:eclate` |
| 5 | Check | `npm run verify:assemblage` |

Step 4 of the profile chain is empty in the common case: components **already look for** their profiles by name and fall back to the hard-coded shape as long as the drawing does not exist. Drawing `araignee-chassis` and extracting it is enough to change the robot's silhouette, without touching a line of TypeScript.

On the assembly side, `npm run montre` does steps 1 to 3 in one go: it re-reads the drawing, stores it, and opens the scene in a window where you can turn it. That is **the** working loop — redraw in Inkscape, click **↻ recharger**, look. Give it a prefix and the whole robot comes up at once.

---

## What a profile is

A **profile** is the outline of a part, **flat**, like a laser-cutting plan: the silhouette, plus the holes. The engine turns it into a volume in two ways, and two only.

| Staging | The drawing is seen | The volume obtained | Function |
| --- | --- | --- | --- |
| **Plate** | from **above** | outline extruded **upwards**, by its thickness | `prismFaces` |
| **Part** | from the **side**, lying down | outline laid **between two points**, by its thickness | `extrudeProfile` |

A plate is the robot chassis, a board, a flat bracket. A part is a leg bone, a servo block, a linkage: something that goes **from one joint to the next** and follows the motion.

Holes are not actually carved into the material: they are laid as **dark decals** on the face you see (`decalFaces`). The picture is identical, and triangulating a polygon with holes — which would buy nothing here — is avoided.

---

## Orientation: where the top of the drawing goes

This is the one thing that cannot be guessed for you, and the first thing to look at when a drawing does not give what you expected.

### The world frame

**X to the right, Y towards the back, Z up.** That is the engine's frame, and it is the one drawn in a corner of **every** 3D picture in this guide, as well as in the viewer (**repère X Y Z** checkbox). It turns with the scene: when you swing the robot around, the frame swings too, and it says where the front is at all times.

![The world frame, and the x / y of each of the three planes](../img/systemes/repere.webp)

The same L-shaped part, laid in the three planes. The **purple** and **orange** arrows are the `x` and `y` **of your drawing sheet**; the grey one is the direction of the thickness.

| Plane | The drawing is seen | drawing `x` runs | drawing `y` runs | Thickness runs | Examples |
| --- | --- | --- | --- | --- | --- |
| `dessus` | from above, **front at the top** | to the right | towards the **back** | vertically | plates, decks, bridges |
| `flanc` | from the side, **front to the left** | towards the **back** | **downwards** | across the robot | the two sides, a servo lying down |
| `face` | from the front | to the right | **downwards** | front to back | bulkhead, spacer, front cover |

Two ways to remember it, and they are enough:

- **The top view keeps the sense of a plan view**: the top of the sheet is the front of the robot, as on any drawing seen from above.
- **The other two stand up as drawn**: the drawing is raised **exactly as you traced it**, top of the sheet upwards. What you draw at the top is at the top; what you draw on the left points forwards (`flanc`) or to the left (`face`).

An SVG `y` goes **down** — which explains the "downwards" column, and why a part drawn towards the bottom of the sheet ends up at the bottom of the robot.

### Top of the drawing, for a profile

- **Plate**: drawn **seen from above**, the **top of the drawing is the front** of the robot.
- **Part**: drawn **from the side, lying horizontally**. The **left edge** lands on the first joint, the **right edge** on the second. The top of the drawing stays up.

Two consequences that save a lot of surprises:

1. **The dimensions of the drawing do not matter, its proportions do.** A plate is scaled to the chassis diameter; a part is scaled **as a block** (length *and* height by the same factor) to reach from one joint to the other. The same femur therefore serves the standalone leg and the robot's longer legs without distorting. Draw at a comfortable size, not an "exact" one.
2. **Centring is automatic**, on the middle of the bounding box. No need to align your drawing on the origin of the sheet.

Stored coordinates are in **pixels of the 10 px grid** of the canvas. If your Inkscape sheet is in millimetres — which `Composants.svg` is — the conversion happens on the way in.

---

## Drawing the profile

In `Composants.svg`, the A3 sheet where all original drawings live:

- **A profile is a group (or a plain path) whose `id` is `<name>-profil`.** The bare name is accepted as a fallback, but the suffix avoids confusing a profile with the flat drawing of a component of the same name.
- **One closed outline for the part.** Outlines **entirely contained** in it are its **holes** (mounting holes, lightening cut-outs). An outline that is neither the part nor contained in it is reported and ignored — two parts in one group is a drawing to fix, not a guess to make.
- **The outline must not cross itself.** A figure-of-eight silhouette, an edge folded back on itself: triangulating that is meaningless, and `verify:profils` rejects it.
- **Curves are welcome**: Béziers, arcs, circles, rectangles, polygons. Everything is flattened then simplified — a sampled circle ends up with about thirty points, not two hundred.
- **The winding direction does not matter** (clockwise or counter-clockwise): it is normalised on read.
- **Red pads are not part of the outline** — but a **named** pad is stored with the piece: it is a joint (`hanche`, `genou`), and two pads sharing a prefix make a **rotation axis**. See [Axes](#axes): the convention is exactly the one used by assemblies. An unnamed pad and any text stay plain sheet markers, and are ignored.

> The classic trap is the **outline that walks backwards**. On the example chassis, the front notch was first drawn wider than the shoulders framing it: the path went back on itself and folded over. The edges of a notch sit **on** the body circle, never beyond it.

The names the code already looks for — drawing them is enough, there is nothing to wire:

| Group name | Part | Staging | Fallback without a drawing |
| --- | --- | --- | --- |
| `araignee-chassis` | spider robot plate | plate | eight-sided octagon |
| `araignee-picow` | Pico W board sitting on the robot's back | plate | 46 × 18 box |
| `araignee-pca9685` | 16-servo board, on the plate | plate | 40 × 24 box |
| `araignee-batterie` | battery pack, on the plate | plate | 34 × 18 box |
| `patte-femur` | hip → knee bone | part | box |
| `patte-tibia` | knee → foot bone | part | box |

> **The on-board electronics is redrawable like everything else** (v2026.8.26). Draw each board **seen from above, connector to the left**: the outline is scaled on its **length** (46, 40 or 34 scene units), its holes are laid as decals in a darkened shade of the board, and **its place on the plate does not change** — the code holds that, so nothing overlaps. On the Pico W, the radio shield and the USB socket are still laid on top by the code.

---

## Reading it

```bash
npm run profil araignee-chassis patte-femur     # = node scripts/_extract-profils.mjs
```

Output:

```text
  ✓ araignee-chassis : 24 points, 112.4×110.8 px, 5 trou(s)
  ✓ patte-femur : 30 points, 73.83×13.98 px, 2 trou(s)

  → src/webview/composants/profils.mts (3 profil(s))
```

| Option | Effect |
| --- | --- |
| `--list` | Shows what is already stored, without reading or writing anything. |
| `--source=file.svg` | Reads a file other than `Composants.svg` (the examples in this guide come from `docs/exemples/`). |
| `--step=0.35` | Curve sampling step, in drawing units. Finer than the eye by default. |
| `--tol=0.25` | Simplification tolerance, in grid pixels. Below that, a point no longer changes the silhouette and only weighs the render down. |

The generated module, `src/webview/composants/profils.mts`, **is its own archive**: the tool reads it back before rewriting it, so extracting a single profile does not make the others disappear. It reads well in a `git diff` — it is versioned drawing — but **is not edited by hand**: the next extraction would overwrite the change.

---

## Turning it into a volume

A component asks for its profile by name and falls back to its hard-coded shape if it does not exist yet. That is the whole wiring, and it fits in three lines. For a leg bone ([`patte-element.mts`](../../src/webview/composants/patte-element.mts)):

```ts
function bone(name: string, a: Vec3, b: Vec3, t: number): Face[] {
  if (!hasProfile(name)) return boxFaces(a, b, t, t, COLORS.bone);
  const p = profile(name);
  return extrudeProfile(p, a, b, t, COLORS.bone, p.holes);
}
```

For a plate ([`araignee-element.mts`](../../src/webview/composants/araignee-element.mts)), the outline is additionally scaled to the expected diameter and rotated by the presentation yaw, **so that the drawing decides the silhouette and not the dimensions**: hips, legs, boards and terminal block stay where the rest of the component expects them.

```ts
const plate = prismFaces(outline.poly, CHASSIS.height, CHASSIS.height + CHASSIS.thickness, COLORS.chassis);
const faces = [
  ...plate,
  ...outline.holes.flatMap((h) => decalFaces(h, CHASSIS.height + CHASSIS.thickness, '#8fb3c4', plate)),
];
```

Three details of the engine that explain the rest of the code:

1. **All faces of the scene are sorted together**, far to near (painter's algorithm). Sorting each part separately would break the illusion: the shared sort is what puts a rear leg behind the plate and the front leg in front of it.
2. **Large faces are subdivided** into pieces of comparable size. A face is sorted by its **average** depth: a whole plate in one piece would pass in front of — or behind — everything it carries, and the Pico sitting on its edge used to vanish under it.
3. **A decal is sorted just in front of the face carrying it**, not merely lifted by a few tenths: the plate is made of dozens of triangles, and those on the rear edge come in front of whatever is at the centre. Nothing else gets hidden — a leg flying over the plate is still far closer to the eye than any piece of it.

---

## Original drawing, and what comes out

Two complete examples, one of each kind. The drawings are in [`docs/exemples/`](../exemples/), the profiles stored under the names `chassis-demo` and `femur-demo`, and **the pictures on the right are produced by the real engine** — never by a screenshot.

### A plate: `chassis-demo`

| The drawing | What the reader understood | What the engine makes of it |
| --- | --- | --- |
| ![Original chassis drawing](../exemples/chassis-demo.svg) | ![Outline as read, on the 10 px grid](../img/systemes/chassis-demo-plat.webp) | ![The chassis as a volume](../img/systemes/chassis-demo.webp) |
| Seen from above: four arms at ±45°, a V notch at the front, five holes. Drawn in an SVG editor, `fill-rule: evenodd`. | 20 points (the red pads), 106×106 px. Curves were flattened then simplified; the five holes were recognised as such because they are **contained** in the part. | `prismFaces` extrudes the outline over 8 px of thickness, `decalFaces` lays the holes on top. The notch really is hollow: you can see the ground through it. |

### A part: `femur-demo`

| The drawing | What the reader understood | What the engine makes of it |
| --- | --- | --- |
| ![Original femur drawing](../exemples/femur-demo.svg) | ![Outline as read, on the 10 px grid](../img/systemes/femur-demo-plat.webp) | ![The femur as a volume](../img/systemes/femur-demo.webp) |
| From the side, part lying down: two round heads, a waisted body, two axle holes. The left edge will land on the first joint, the right one on the second. | 30 points, 73.83×13.98 px. The waisted body needs a handful of points, each round head about ten. | `extrudeProfile` lays the part between the two joints and thickens it by 10 px. The axle holes are laid on **both flanks**: the part reads as drilled right through. |

The middle render — the `:plat` mode — is the **first place to look** when a drawing yields an unexpected volume. It shows exactly what the reader kept: the outline, its holes, and one red dot per surviving vertex. A folded outline shows up there immediately.

---

## Looking and checking

The three stagings of the capture script:

```bash
node scripts/_capture-profil.mjs chassis-demo:plat     # the outline as read, on the grid
node scripts/_capture-profil.mjs chassis-demo:plaque   # extruded upwards
node scripts/_capture-profil.mjs femur-demo:piece      # laid between two joints
```

Images land in `docs/img/systemes/`, on a transparent background, in WebP. `--width=720` gives a larger image to inspect a doubtful render closely.

Then the bench:

```bash
npm run verify:profils
```

It is **pure computation** — no browser, under a second. It checks the engine (the triangulation covers the whole area, no triangle escapes the shape, no oversized face, a decal comes in front of its plate, a part really spans from one joint to the other) **then every stored profile**: usable outline, consistent dimensions, centring, complete and strictly interior triangulation, every hole inside the part. A counter-test closes the list: a self-crossing outline must **fail**, otherwise the bench would prove nothing.

---

## Assembling several parts

A profile says one thing only: a silhouette. It cannot say **where** a part sits relative to another, and that is exactly what a **sandwich body** needs: two 3 mm PMMA sides, the hip servos clamped between them, a spacer at the front. None of that shows on the flat sheet — and a still picture will not tell you whether the servos fit.

An **assembly** answers that. It is a set of flat parts, **in millimetres**, each carrying its **pose** written in plain words inside the drawing. The drawing stays what it must stay: a **laser-cutting plan**, with the parts laid side by side on the sheet. Where a part sits on the sheet does not matter; its label does.

### The drawing

In `Composants.svg` (or a separate sheet, see `--source=`):

- **One part = one group whose `id` starts with the assembly name**, followed by the part name: `araignee-corps-flanc`, `araignee-corps-servo`. The `-profil` suffix is still tolerated (`araignee-corps-flanc-profil`); the name kept is whatever follows the assembly name.
- **The sheet must be in millimetres.** `Composants.svg` already is (`width="…mm"` with a `viewBox` of the same number: 1 unit = 1 mm). A sheet in CSS pixels is converted, but you no longer know what you are dimensioning.
- **A text inside the group gives the pose**: `flanc pos=28,0,0 ep=12 mat=servo miroir=x`. It is a plain `<text>`, placed wherever you like in the group — under the part reads well.
- **Outline, holes and curves** follow exactly the rules of a profile (closed outline, holes contained inside, no self-crossing path).
- **A named red pad = an axis.** Its **Inkscape id** names it, failing that the text **above** it, and its centre becomes a 3D point of the assembly. Two pads sharing a prefix make a **rotation axis** ([details](#axes)).

### The pose label

One plane word, then `key=value` pairs in any order:

```text
flanc pos=28,0,0 ep=12 mat=servo miroir=x
```

| Word | Role | Default |
| --- | --- | --- |
| `dessus` / `flanc` / `face` | **mandatory, first**: how the drawing lies (top / side / front) | — |
| `pos=x,y,z` | centre of the part in the assembly frame, in mm | `0,0,0` |
| `ep=3` | thickness of the part, in mm | `3` |
| `mat=pmma` | material — **only for a part with no fill**: the colour of the drawing wins | `pmma` |
| `miroir=x` | the part is laid **twice**, mirrored | no mirror |

`miroir` alone (no `=`) means `miroir=y`. An unknown value (`mat=titane`, `pos=3,4`) is ignored and the default applies: the part then shows up visibly wrong, rather than silently.

#### The decimal separator is the DOT

This is the label's number-one trap, because it does not show on the picture: a French numeric keypad types a comma, and the comma already separates the three coordinates.

```text
dessus pos=24,501,-38,083,0 ep=21,5     ← five numbers instead of three: unreadable
dessus pos=24.501,-38.083,0 ep=21.5     ← right
```

An unreadable label is not an error: the part **falls back to the centre, 3 mm thick**. It is there all right, just not where you think. The read now says so in plain words:

```text
  ! araignee-patte-tibia-servo : « pos=24,501,-38,083,0 » illisible, pièce remise au centre
    — le séparateur décimal est le POINT : pos=24.501,-38.083,0
```

Same for an unknown word or an unknown material: each is reported on read. **Read the output of `npm run montre` before suspecting the drawing.**

The keywords stay in French, like the ids of the drawing: they are written in Inkscape next to `plaque` and `flanc`, and one language per sheet is one confusion less.

### The three planes

The table and the figure are further up, under [The world frame](#the-world-frame): these are exactly the same three planes, and the figure shows the sheet's `x` and `y` for each of them.

In two sentences: **`dessus` keeps the sense of a plan view** (top of the sheet = front of the robot); **`flanc` and `face` raise the drawing as traced** (top of the sheet = top of the robot).

**A part is placed by its CENTRE** (the middle of its bounding box): `pos` is the centre of the part, not its corner. That is what makes mirroring immediate — a side at `pos=0,-9,0` with `miroir=y` gives both sides, 18 mm apart.

### Colours: the drawing decides

**A part has, in 3D, the colour it has on the sheet** — transparency included. Fill a PMMA side with blue at 55 % and you see it blue and you see through it; paint a board dark green and it is dark green. Nothing to write in the label: the colour is already in the drawing, and that is the only thing the engine reads back.

A few details that avoid surprises:

- It is the **effective** fill, the one the browser computes: `fill`, `fill-opacity`, and the opacity of every group carrying the shape — Inkscape often puts transparency on the layer, not on the part.
- The colour kept is that of the **largest filled shape** in the group: the outline of the part. A hole, a marker or a text does not decide the colour of the whole.
- A part with **no fill** (a cutting outline, drawn as a stroke only) has no colour to give: `mat=` then answers, or PMMA by default.

`mat=` therefore remains useful for an unpainted part, or to force a shade without touching the cutting plan:

| `mat=` | Colour | For |
| --- | --- | --- |
| `pmma` | light blue | laser-cut PMMA — the default |
| `alu` | light grey | brackets, metal spacers |
| `servo` | black | a servo, a motor, a solid block |
| `carte` | green | a printed circuit board |
| `laiton` | gold | screws, threaded standoffs |
| `pile` | slate grey | cells, battery packs |

The word gives the colour, and nothing else: no simulation, no mass.

**A translucent material gets no seam stroke.** A plate is cut into dozens of triangles; on every inner edge the stroke that fills the seams overlaps itself. Opaque, that never shows; translucent, it would draw a cobweb over the whole part. The stroke is therefore dropped as soon as the colour is transparent.

### Axes

A **red pad** in a part's group marks a notable point: a hip axis, a knee, a pivot. Its coordinates are computed **in the assembly frame**, pose included.

Two ways to name it, in this order:

1. its **Inkscape id** — select the dot, `Object → Object Properties`, type `hanche-g-int`;
2. failing that, the **nearest free text**, the one above being preferred — exactly like a pin name on the component sheet.

The id comes first because it **sticks to the dot**: it survives a move, a text added next to it, and it does not clutter the sheet with four labels when the part carries four pads. An id Inkscape made up on its own (`circle91`, `path102`) names nothing: the pad is then **ignored**, with a warning on read.

That is the key point of the protocol: **the drawing says where the hip is**, not a constant in the code. Move the hole in Inkscape and the axis follows.

#### A pad name reads in two parts

It all fits in one sentence, and the rest of this section is only the detail:

> **`family - joint - end`** — the **first** segment is the **family** (it says *what it snaps onto*), everything but the **last** is the **prefix** (it says *which* joint), the last one only tells the **two ends** of the axis apart.

| Pad name | Prefix = the joint | Family = what it snaps onto |
| --- | --- | --- |
| `hanche-ag-h` | `hanche-ag` | `hanche` |
| `hanche-ag-b` | `hanche-ag` | `hanche` |
| `hanche-rd-h` | `hanche-rd` | `hanche` |
| `genou-h` | `genou` | `genou` |
| `pied` | `pied` | `pied` |

#### Two pads sharing a prefix = a rotation axis

A point does not say what you turn **around**. Two points do: **two pads whose names differ only by their last segment are the two ends of one axis.**

```text
hanche-ag-h  ─┐
               ├─ axis "hanche-ag"  (family "hanche")
hanche-ag-b  ─┘
```

The prefix (`hanche-ag`) names the axis; the last segment (`-h`, `-b`, `-ext`, `-int`…) only tells the two ends apart. The engine derives the **line** from it: its midpoint, its direction, the distance between the two pads. When more than two pads share a prefix, the **two furthest apart** carry the axis — and the read warns you, because that is almost always a naming mistake.

A **lone** pad stays a plain point: it marks a place (`pied`), it does not say what to turn around.

#### Four hips = four prefixes = eight pads

This is **the** trap, and it does not show on the picture: four legs end up stacked on each other at the middle of the body.

```text
hanche-ag   ─┐
hanche-ad    │
hanche-rg    ├─ SAME prefix "hanche": ONE joint, ONE leg
hanche-rd   ─┘
```

The four names differ **only by their last segment**: the rule therefore reads them as the four ends of a **single** axis. The robot has one hip, at the centre.

Four distinct hips want **four distinct prefixes**, hence **three**-segment names — and since each hip deserves an axis, that means **two pads each, eight in all**:

```text
hanche-ag-h / hanche-ag-b     front left
hanche-ad-h / hanche-ad-b     front right
hanche-rg-h / hanche-rg-b     rear left
hanche-rd-h / hanche-rd-b     rear right
```

All eight share the family `hanche`: that is what makes a femur naming `hanche` sit on them — **four times**, one per hip.

> The same trap exists in a quieter form. Four pads named `hanche-g-h`, `hanche-g-b`, `hanche-d-h`, `hanche-d-b` complain about nothing: they cleanly make **two** axes, `hanche-g` and `hanche-d`, each running through the body from front to back. Two axes, two legs. It only shows if you tick **axes dessinés** in the viewer: the two dashed red lines run the whole length of the body instead of being four short vertical segments.

#### A shared family = two drawings that snap together

Joints do not only make things turn: **they are how drawings mount onto each other**, without a single dimension to carry over.

The rule is short:

1. Two ensembles naming the **same family** snap together: the body has `hanche-…`, the femur too → the femur sits on the body.
2. **The one offering the most joints carries the other.** The body has four, the femur two: the body carries, and **four femurs** are born.
3. **Joints are superposed**, pad on pad. The position is not computed, it is read from the drawing.
4. When the family holds **several** joints (the four hips), each copy is **turned towards its own**: the legs splay out by themselves. When it holds only **one** (the femur's knee), the child keeps its parent's heading: the tibia carries on from the femur.

A complete chain therefore takes three drawings and six names:

```text
araignee-corps          hanche-ag-h/-b  hanche-ad-h/-b  hanche-rg-h/-b  hanche-rd-h/-b
araignee-patte-femur    hanche-h/-b     ← snaps onto the body (family "hanche")
                        genou-h/-b      ← offers a knee
araignee-patte-tibia    genou-h/-b      ← snaps onto the femur (family "genou")
                        pied
```

On screen: **one body, four femurs, four tibias**, each in its place, without a line of code. That is what `npm run montre araignee` does.

An ensemble sharing no family stays at **its own origin**: it is not guessed, it is simply laid out. And if no ensemble shares one with another, the viewer says so and falls back to the side-by-side display.

#### Profiles too

A part drawn on its own (a profile) follows the **same convention**: its named pads are stored with its outline, in the same centred frame. When the component lays it between two joints, `profileAxes` carries them along — to scale, in place. A knee drawn on the femur stays the femur's knee, whether you lengthen the leg or not.

### Watching it turn

```bash
npm run montre araignee            # EVERYTHING starting with “araignee”
npm run montre araignee-corps      # a single assembly
```

The argument is a **prefix**, not an exact name: the tool picks up **every assembly and every profile** on the sheet that starts with it, and shows them **together, at the same scale**. The sheet is read **once** for the whole prefix (reading goes through Chrome: that is the wait, so pay it once).

**Asking for the global prefix is asking for the whole robot.** `npm run montre araignee` does not lay three drawings side by side: it **mounts** them, each on the previous one's joints, joints superposed — one body, four femurs, four tibias. Three drawings on the sheet, one robot on screen. That is the **monté sur ses articulations** checkbox, ticked by default; untick it to get the separate drawings back.

A profile, drawn on its own and without dimensions, is treated as a one-part assembly: its 10 px grid becomes millimetres and it is laid flat, 3 mm thick, next to the real assemblies.

What is read is also **stored**: `assemblages.mts` and `profils.mts` are rewritten, exactly as `npm run assemblage` and `npm run profils` would.

| In the window | What it is for |
| --- | --- |
| **↻ recharger** button | re-read `Composants.svg` **without leaving the window**: touch up in Inkscape, click, look. Angle, zoom and ticked boxes are kept |
| **Drag in the view** (or the *lacet* slider) | turn around it: the angle where things clash is never the first one |
| **éclaté** slider | pull the parts apart along their thickness — the only way to see what sits between two sides 3 mm apart |
| **zoom** slider | inspect a detail |
| An ensemble's **title checkbox** | hide a whole assembly — look at the femur alone without relaunching the command |
| **×4** box next to the title | the ensemble was given four copies (four hips, four legs). Untick it to keep just **one**: four legs hide the body you wanted to see. Whatever it carries follows — one femur only holds one tibia |
| **pièces** checkboxes | hide one side to see inside |
| **axes dessinés** checkbox | show the named pads at their 3D place, and the **rotation axes** as a dashed red line |
| **repère X Y Z** checkbox | the world frame in a corner, turning with the scene: it says where the front is at all times |
| **monté sur ses articulations** checkbox | **the assembled robot**: each ensemble laid on the previous one's joints, joints superposed, one copy per joint. Unticked, you fall back to the separate drawings |
| **côte à côte** checkbox (unmounted only) | unticked, each ensemble goes back to its **own origin** — its own place, as drawn |

The panel shows the **overall size in millimetres** (`100 × 80 × 31 mm`): the figure you read on an assembly drawing, and the first sign that a part is laid the wrong way.

The options: `--source=docs/exemples/corps-demo.svg` to read another sheet, `--sans-lire` to reopen on what is already stored (when only the engine changed), `--sans-ranger` to look without rewriting the generated modules, `--sans-ouvrir` to serve the page without opening a window, `--port=8731` to pick the port.

### Original drawing, and what comes out

The complete example is in [`docs/exemples/corps-demo.svg`](../exemples/corps-demo.svg): a sandwich robot body, **three drawn parts** that become **five** once laid out.

| The drawing | Assembled | Exploded |
| --- | --- | --- |
| ![Cutting plan of the demo body](../exemples/corps-demo.svg) | ![The body assembled](../img/systemes/corps-demo.webp) | ![The same body, exploded](../img/systemes/corps-demo-eclate.webp) |
| Three groups side by side, like a cutting plan: the plate (`dessus pos=0,0,14 ep=3 miroir=z`), the servo (`flanc pos=28,0,0 ep=12 mat=servo miroir=x`), the spacer (`face pos=0,-36,0 ep=3`). | The two plates 14 mm either side of the mid-plane: 25 mm of air between them, just what a lying servo needs. Overall size: 100 × 80 × 31 mm. | Every part pulled apart along its thickness. The servos appear: this is the view that answers "does it fit?". |

The PMMA on the plan is filled **at 55 %**: the plates are translucent in 3D, and the servos show through without even exploding the body. The servo itself is painted dark grey on the sheet — its `mat=servo` is now useless, and rightly so: the cutting plan speaks for itself.

Both pictures on the right are produced by the real engine:

```bash
node scripts/_capture-profil.mjs corps-demo:assemblage corps-demo:eclate
```

### Storing and checking it

```bash
npm run assemblage araignee-corps      # reads and stores, no window
npm run assemblage -- --list           # what is already stored
npm run verify:assemblage              # the bench
```

Output of the read:

```text
  ✓ entretoise : 5 points, 40×25 mm, face ép.3 #bcdff08c
  ✓ plaque : 10 points, 100×80 mm, dessus ép.3 #bcdff08c miroir=z, 3 trou(s)
  ✓ servo : 5 points, 23×23 mm, flanc ép.12 #3f4750ff miroir=x, 1 trou(s)
  → corps-demo : 3 pièce(s), 4 axe(s), 100×80×31 mm
```

Four pads, two by two: `hanche-g-ext` / `hanche-g-int` and `hanche-d-int` / `hanche-d-ext`, that is the **two rotation axes** of the hips. An unnamed pad is reported on that very line (`! …-supports : pastille sans nom (id « circle91 »), ignorée`): time to give it an id in Inkscape.

The colour shown is the one **read from the drawing** (`#rrggbbaa`, transparency included) — the trailing `8c` is PMMA at 55 %. An unpainted part shows the word of its `mat=` instead.

`src/webview/composants/assemblages.mts` is **generated**, and it is **its own archive**: the tool reads it back before rewriting it, so extracting one assembly does not make the others disappear. Like `profils.mts`, it reads well in a `git diff` but is not edited by hand.

The `verify:assemblage` bench is pure computation, like the profile one. It exercises **label parsing** (a negative position must survive whole — `pos=0,-9,0` has already been read as three words), the **planes** (a 100 mm plate lying flat is 100 × 80 × 3, never 103 × 83 × 35), the **mirror**, the **exploded view** (each part moves to the side it already sits on, a central part does not move), then **every stored assembly**: known plane and material, centred outline, dimensions consistent, overall size consistent with the computation, axes inside the box. It also exercises the **colours read from the drawing** — the drawn shade wins over `mat=`, transparency survives the lighting, and a translucent face comes out without a seam stroke — and the **rotation axes**: the prefix rule, the two furthest pads when there are three, two coincident pads that make no line, and a profile's pads following the part when it is scaled up.

Finally it exercises the **mounting** on a test robot — a body with four hips, a femur, a tibia: the body carries (it offers the most joints), four femurs and four tibias are born, each on a different hip, hips and knees **superposed to the millimetre**, the four legs turned to four distinct headings, the tibia keeping its femur's heading. An ensemble sharing no family stays where it is, and two drawings with nothing in common mount nothing at all rather than inventing.

---

## Drawing a leg, from hip to foot

The complete case, the one that puts everything above end to end: a body, a femur, a tibia, and **four legs** at the end. Three drawings only — the four copies are not drawn, they are born from the four hips.

### 1. Three groups, three assemblies

```text
araignee-corps-…          the body: plates, boards, battery
araignee-patte-femur-…    the hip → knee bone, and the knee servo it carries
araignee-patte-tibia-…    the knee → foot bone
```

Each is drawn **wherever you like on the sheet**, side by side like a cutting plan. Where they sit on the sheet does not matter: their pose label and their pads do.

### 2. The body: eight pads, four hips

On the part that actually carries the hip servos (the sides, not the top plate), four pairs of red pads:

```text
hanche-ag-h  hanche-ag-b        front left
hanche-ad-h  hanche-ad-b        front right
hanche-rg-h  hanche-rg-b        rear left
hanche-rd-h  hanche-rd-b        rear right
```

The two pads of a pair are **the two ends of the servo's axis**: if the hip yaws (servo standing up), one sits above the other; if it rolls, they sit one behind the other. **Put them where the axis really runs** — that line is what the leg will follow.

Name them by their **Inkscape id** (`Object → Object Properties`): eight texts on the sheet would be unreadable.

### 3. The femur: two joints, not one

This is where it goes wrong most often. The femur carries **two** joints, and it needs both:

| Pads | What they are for |
| --- | --- |
| `hanche-h`, `hanche-b` | **where the femur hooks onto the body.** Family `hanche`: that is the word the body uses too, and it is all it takes for them to snap together |
| `genou-h`, `genou-b` | **the axis the femur offers the tibia.** Family `genou` |

A femur with only its hip does sit on the body — but the tibia has nothing left to hook onto, and it stays alone in its corner. **The knee is drawn on the femur**, not only on the tibia.

The femur is a `flanc`: drawn from the side, it stands up **as traced**. What you draw at the top ends up at the top of the robot. If the leg comes out upside down, it is the drawing that is flipped, not the engine — tick **repère X Y Z** and look at where Z points.

### 4. The tibia: the knee, and the foot

```text
genou-h  genou-b        same family "genou" as the femur: they superpose
pied                    a lone pad — a point, not an axis
```

The tibia's two `genou-…` pads must sit **at the same spot on the tibia** as the femur's do on the femur: that is the contact point, and that is what gets superposed.

The femur offers only **one** joint of family `genou`: the tibia therefore inherits the femur's heading and carries on from it, instead of splaying out the way the legs do around the body.

### 5. Look

```bash
npm run montre araignee
```

Tick **axes dessinés**, **repère X Y Z** and **monté sur ses articulations**. You should see one body, four femurs, four tibias. The **×4** boxes appear next to the femur and the tibia: untick one to keep a single leg and see the body.

Then touch up in Inkscape, click **↻ recharger**, look. Angle and checkboxes are kept.

### It does not come out like that — why

| What you see | The cause, almost always |
| --- | --- |
| **One leg only**, at the middle of the body | four hips under the **same prefix** (`hanche-ag`, `hanche-ad`… on their own). Four distinct ones are needed, hence three-segment names |
| **Two legs**, and two long red lines running through the body | `hanche-g-…` and `hanche-d-…`: two axes, not four. Rename to `hanche-ag`, `hanche-ad`, `hanche-rg`, `hanche-rd` |
| **The tibia stays on its own** | the femur has no `genou-…` pad. The knee is drawn on **both** parts |
| **Nothing mounts**, the viewer says so in yellow | no shared family: the two drawings do not use the same first word (`hanche` on one side, `epaule` on the other) |
| **The leg points the wrong way**, or askew | the hip axis is not where you think: tick **axes dessinés**, the dashed red line shows the real line |
| **A part sits at the centre of the body**, 3 mm thick | its label is unreadable — a decimal comma, almost always. Read the command's output, it says so |
| **A pad does not show up** | it has no name: its Inkscape id is still `circle97`. The read reports it |

---

## Cheat sheet

**Profiles** (one part):

- A profile is **one closed outline** plus its holes, in a group named `<name>-profil`.
- Plate = seen from **above**, top of drawing = front. Part = seen from the **side**, left → right = first → second joint.
- **Proportions** matter, dimensions do not: everything is rescaled.
- A hole must be **entirely contained** in the part, otherwise it is ignored (with a warning).
- The outline must **never cross itself**: it is the only path the engine cannot turn into a volume.
- A **named red pad** is stored with the part: it is a joint, and it follows the part when it is scaled.
- `profils.mts` is **generated**: read it, don't edit it.
- Extracting one profile does not lose the others.
- Look at the `:plat` mode **before** suspecting the engine.

**Assemblies** (several parts):

- One part = one group `<assembly>-<part>` plus **a pose label** in plain words.
- Everything is in **millimetres**, and dimensions are kept: it is a cutting plan, not a proportion.
- The label **always** starts with the plane: `dessus`, `flanc` or `face`.
- `pos` is the **centre** of the part, not its corner.
- `miroir` lays the part **twice**: one side drawing gives both sides.
- The decimal separator is the **dot**: `pos=24.501,-38.083,0 ep=21.5`. A comma makes the label unreadable and the part falls back to the centre — the read says so.
- A **named red pad** becomes an axis — the drawing says where the hip is. Name it by its **Inkscape id**; the text above still works.
- A pad name reads as **`family-joint-end`**: the **first** segment is the family (what it snaps onto), everything but the **last** is the prefix (which joint), the last one tells the two ends apart.
- **Two pads sharing a prefix** (`hanche-ag-h`, `hanche-ag-b`) make a **rotation axis**. Two distinct joints = two distinct prefixes.
- **Four hips = four prefixes = eight pads.** `hanche-ag`, `hanche-ad`, `hanche-rg`, `hanche-rd` **on their own** make one single joint, at the centre of the body.
- **Same family = the drawings snap together**, joints superposed: the one offering the most joints carries the other, and one copy is born per joint (four hips → four legs).
- The femur carries **two** families: `hanche-…` to hook onto the body, `genou-…` to carry the tibia.
- The **colour of the part is the colour of the drawing**, transparency included; `mat=` is only the fallback for an unpainted part.
- `npm run montre <prefix>` reads, stores and opens **everything starting with it**, at the same scale: that is the working loop. Touch up in Inkscape, click **↻ recharger**.
- The **éclaté** slider is the only way to see what sits between two sides.
- `assemblages.mts` is **generated**, and it is its own archive.
