# Drawing systems in 3D (spider, legs, plates)

The spider robot and its leg are not SVG files pasted on screen: they are **volumes computed on every frame** by the isometric engine [`iso3d.mts`](../../src/webview/composants/iso3d.mts). That is what lets a leg actually lift — a flat drawing produced the same picture whether you turned the hip or bent the knee.

The price was that shapes were **hard-coded**: the chassis was `regularPoly(8, 55)`, an octagon; the bones were boxes. Not a single pencil stroke in there. This guide describes the path opened in v2026.8.23: **you draw the outline of a part, the engine turns it into a volume**. The drawing stays yours; the kinematics, the shading and the depth sorting stay with the engine.

This guide is for people working on **the repository**. For a regular flat component (a diode, a sensor), the chain is different and described in [Creating a Kablix component](Creating-components.md).

In a hurry? Jump to [original drawing, and what comes out](#original-drawing-and-what-comes-out): three pictures are worth the page.

---

## What you need

- The repository cloned, `npm install` done, Node 20+.
- **Inkscape** (or any SVG editor) to draw in `Composants.svg`.
- **Chrome / Chromium** installed: outlines are read through a headless browser. Flattening Bézier curves and elliptical arcs by hand in Node would mean writing wrong code twice — `getPointAtLength` does it right, and for free.

---

## The chain at a glance

| # | Step | Command / file |
| --- | --- | --- |
| 1 | Draw the outline of the part | `Composants.svg`, group `<name>-profil` |
| 2 | Read it | `node scripts/_extract-profils.mjs <name>` → `src/webview/composants/profils.mts` |
| 3 | Look at it | `node scripts/_capture-profil.mjs <name>:plat` then `<name>:plaque` or `<name>:piece` |
| 4 | Turn it into a volume | nothing to do if the name is already expected (table below), otherwise the element |
| 5 | Check | `npm run verify:profils` |

Step 4 is empty in the common case: components **already look for** their profiles by name and fall back to the hard-coded shape as long as the drawing does not exist. Drawing `araignee-chassis` and extracting it is enough to change the robot's silhouette, without touching a line of TypeScript.

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

This is the one thing that cannot be guessed for you.

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
- **Red pads and text are ignored**: they are the usual sheet markers, they are not part of the piece.

> The classic trap is the **outline that walks backwards**. On the example chassis, the front notch was first drawn wider than the shoulders framing it: the path went back on itself and folded over. The edges of a notch sit **on** the body circle, never beyond it.

The names the code already looks for — drawing them is enough, there is nothing to wire:

| Group name | Part | Staging | Fallback without a drawing |
| --- | --- | --- | --- |
| `araignee-chassis` | spider robot plate | plate | eight-sided octagon |
| `araignee-picow` | Pico W board sitting on the robot's back | plate | 46 × 18 box |
| `patte-femur` | hip → knee bone | part | box |
| `patte-tibia` | knee → foot bone | part | box |

> Draw `araignee-picow` **seen from above, USB to the left**: the outline is scaled on its **length** (46 scene units), the radio shield and the USB socket are laid on top by the code.

---

## Reading it

```bash
node scripts/_extract-profils.mjs araignee-chassis patte-femur
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

## Cheat sheet

- A profile is **one closed outline** plus its holes, in a group named `<name>-profil`.
- Plate = seen from **above**, top of drawing = front. Part = seen from the **side**, left → right = first → second joint.
- **Proportions** matter, dimensions do not: everything is rescaled.
- A hole must be **entirely contained** in the part, otherwise it is ignored (with a warning).
- The outline must **never cross itself**: it is the only path the engine cannot turn into a volume.
- `profils.mts` is **generated**: read it, don't edit it.
- Extracting one profile does not lose the others.
- Look at the `:plat` mode **before** suspecting the engine.
