"""Bake isolated facial details from the approved original Lumi illustration.

Run with a Python environment that provides Pillow and NumPy.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public/art"
SOURCE = Image.open(ROOT / "docs/lumi-gothic-face-concept.png").convert("RGB")


def matte(polygons, feather):
    alpha = Image.new("L", SOURCE.size)
    draw = ImageDraw.Draw(alpha)
    for points in polygons:
        draw.polygon(points, fill=255)
    return alpha.filter(ImageFilter.GaussianBlur(feather))


def crop_detail(alpha, size, center, span, shear):
    width, height = size
    cx, cy = center
    sx, sy = span[0] / width, span[1] / height
    matrix = (sx, 0, cx - sx * width / 2, shear * sx, sy, cy - sy * height / 2 - shear * sx * width / 2)
    rgb = SOURCE.transform(size, Image.Transform.AFFINE, matrix, Image.Resampling.BICUBIC)
    mask = alpha.transform(size, Image.Transform.AFFINE, matrix, Image.Resampling.BICUBIC)
    return rgb, mask


eye_matte = matte([
    [
        (478, 469), (483, 459), (491, 451), (502, 444), (517, 438), (533, 434),
        (548, 435), (557, 439), (569, 439), (580, 445), (591, 450), (597, 455),
        (598, 465), (597, 474), (591, 486), (581, 495), (571, 502), (558, 510),
        (542, 512), (527, 508), (512, 503), (500, 497), (490, 488), (482, 479),
    ],
    [(545, 438), (553, 429), (557, 427), (555, 439)],
    [(476, 443), (500, 431), (520, 427), (542, 426), (554, 430), (545, 433), (513, 431), (491, 437)],
], 1.8)
eye, eye_alpha = crop_detail(eye_matte, (384, 384), (542, 468), (151, 138), .045)

# Keep the lashes and sclera from the same artwork, and shift only the iris for fire.
warm = np.array(eye.convert("HSV"))
hue, saturation = warm[:, :, 0], warm[:, :, 1]
iris = (hue > 118) & (hue < 221) & (saturation > 23)
hue[iris] = np.clip(20 + (176 - hue[iris].astype(int)) * .25, 7, 40)
saturation[iris] = np.clip(saturation[iris].astype(float) * .86 + 6, 0, 250)
warm_eye = Image.fromarray(warm, mode="HSV").convert("RGB")

mouth_matte = matte([
    [
        (378, 593), (388, 592), (408, 593), (432, 596), (452, 598), (462, 598),
        (464, 601), (451, 605), (433, 609), (418, 611), (403, 610), (390, 604), (381, 598),
    ],
], 1.35)
mouth, mouth_alpha = crop_detail(mouth_matte, (256, 128), (421, 601), (108, 31), .053)

ART.mkdir(exist_ok=True)
for name, image, mask in (
    ("lumi-eye-ice.png", eye, eye_alpha),
    ("lumi-eye-fire.png", warm_eye, eye_alpha),
    ("lumi-mouth.png", mouth, mouth_alpha),
):
    texture = image.convert("RGBA")
    texture.putalpha(mask)
    texture.save(ART / name, optimize=True)
