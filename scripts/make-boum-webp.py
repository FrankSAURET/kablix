# Génère src/webview/composants/utils/boum.webp — le feu des composants grillés.
#
#   python scripts/make-boum-webp.py
#
# Source : Archives/images/boum.gif (256×256, 48 images, fond NOIR, 875 Ko).
# Sortie : boucle de 10 images, 128 px, alpha, ~21 Ko.
#
# Trois traitements, chacun pour une raison précise :
#
# 1. DÉTOURAGE. Le feu est un dessin ADDITIF sur fond noir : sa luminosité EST son
#    opacité. D'où alpha = max(R,V,B) et couleur dé-prémultipliée (rgb × 255/alpha).
#    Un simple « noir → transparent » laisserait une frange noire sur tout le halo.
#
# 2. BOUCLE. L'explosion source s'éteint en fondu ; on ne garde que le feu établi
#    (images 8→17) et on le rend bouclable par fondu croisé circulaire (méthode
#    « video texture ») : out[k] = (1−k/L)·B[k] + (k/L)·A[k], avec A = a[i..i+L−1]
#    et B = a[i+L..i+2L−1]. La dernière et la première image de sortie sont alors
#    consécutives dans la source → raccord aussi doux qu'un pas normal (mesuré :
#    7,2 contre 5,6 pour un pas moyen). Le jaillissement, lui, reste fait en CSS
#    (`boum-pop` dans boum.mts).
#
# 3. POIDS. L'alpha d'un WebP est stocké SANS perte : le bruit de tramage du GIF
#    y coûtait 45 Ko à lui seul. On le lisse (flou 1 px) puis on l'écrase en
#    paliers. Les paliers seuls font apparaître des anneaux dans le halo diffus,
#    d'où le gamma 1,8 qui resserre ce halo avant quantification — anneaux plus
#    visibles ET fichier deux fois plus léger (45 → 21 Ko).
import os

import numpy as np
from PIL import Image, ImageFilter, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Archives", "images", "boum.gif")
DST = os.path.join(ROOT, "src", "webview", "composants", "utils", "boum.webp")

FLOOR = 6        # alpha en deçà duquel on force 0 (bruit de tramage du GIF)
START, LOOP = 8, 10   # 1re image du cycle, longueur du cycle (×2 images lues)
SIZE = 128       # côté de sortie (affiché de 50 à 110 px, marge pour le HiDPI)
GAMMA = 1.8      # > 1 : resserre le halo diffus
LEVELS = 14      # paliers d'alpha
ABLUR = 1.0      # flou de l'alpha, en pixels de sortie
DURATION = 100   # ms par image (cadence du GIF source)


def dematte(rgb: Image.Image) -> Image.Image:
    """Fond noir → alpha, pour un dessin additif (voir traitement 1)."""
    src = np.asarray(rgb, dtype=np.float64)
    a = src.max(axis=2)
    k = np.divide(255.0, a, out=np.zeros_like(a), where=a > FLOOR)
    rgba = np.zeros((*a.shape, 4), dtype=np.float64)
    rgba[:, :, :3] = np.clip(src * k[:, :, None], 0, 255)
    rgba[:, :, 3] = np.where(a > FLOOR, a, 0)
    return rgba


def read_frames() -> list[np.ndarray]:
    gif = Image.open(SRC)
    frames = [dematte(f.convert("RGB")) for f in ImageSequence.Iterator(gif)]
    # Recadrage carré centré sur la zone effectivement dessinée (bbox de l'alpha).
    h, w = frames[0].shape[:2]
    ys, xs = np.nonzero(np.max([f[:, :, 3] for f in frames], axis=0) > FLOOR)
    half = min(max(xs.max() - w / 2, w / 2 - xs.min(),
                   ys.max() - h / 2, h / 2 - ys.min()), w / 2, h / 2)
    x0, y0 = int(w / 2 - half), int(h / 2 - half)
    x1, y1 = int(w / 2 + half), int(h / 2 + half)
    return [f[y0:y1, x0:x1] for f in frames]


def resized(frame: np.ndarray) -> np.ndarray:
    img = Image.fromarray(frame.astype(np.uint8), "RGBA")
    return np.asarray(img.resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float64)


def crossfade(frames: list[np.ndarray]) -> list[np.ndarray]:
    """Cycle bouclable par fondu croisé circulaire (voir traitement 2)."""
    out = []
    for k in range(LOOP):
        a, b = resized(frames[START + k]), resized(frames[START + LOOP + k])
        w = k / LOOP
        # Mélange en couleurs prémultipliées : sinon les zones quasi transparentes
        # de l'une teintent les zones opaques de l'autre.
        pa = a[:, :, :3] * a[:, :, 3:4] / 255.0
        pb = b[:, :, :3] * b[:, :, 3:4] / 255.0
        mix = (1 - w) * pb + w * pa
        alpha = (1 - w) * b[:, :, 3] + w * a[:, :, 3]
        rgb = np.divide(mix * 255.0, alpha[:, :, None],
                        out=np.zeros_like(mix), where=alpha[:, :, None] > 1)
        out.append(np.dstack([np.clip(rgb, 0, 255), alpha]))
    return out


def to_image(frame: np.ndarray) -> Image.Image:
    """Lissage + gamma + paliers sur l'alpha (voir traitement 3)."""
    rgb = Image.fromarray(frame[:, :, :3].astype(np.uint8), "RGB")
    alpha = Image.fromarray(frame[:, :, 3].astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(ABLUR))
    x = (np.asarray(alpha, dtype=np.float64) / 255.0) ** GAMMA
    q = np.clip(np.round(x * LEVELS) / LEVELS, 0, 1) * 255.0
    r, g, b = rgb.split()
    return Image.merge("RGBA", (r, g, b, Image.fromarray(q.astype(np.uint8), "L")))


def main() -> None:
    frames = [to_image(f) for f in crossfade(read_frames())]
    frames[0].save(DST, save_all=True, append_images=frames[1:], duration=DURATION,
                   loop=0, quality=50, method=6,
                   # Une seule image clé : le cycle est court et très redondant.
                   kmin=len(frames) - 1, kmax=len(frames))
    print(f"écrit : {os.path.relpath(DST, ROOT)} — {len(frames)} images, "
          f"{SIZE}×{SIZE}, {os.path.getsize(DST) / 1024:.1f} Ko "
          f"(source {os.path.getsize(SRC) / 1024:.0f} Ko)")


main()
