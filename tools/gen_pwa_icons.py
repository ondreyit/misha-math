from PIL import Image
import os

root = os.path.join(os.path.dirname(__file__), "..", "assets")
out = os.path.join(root, "pwa")
os.makedirs(out, exist_ok=True)
coin = Image.open(os.path.join(root, "apple-touch-icon.png")).convert("RGBA")
BG = (47, 111, 237, 255)


def fit_icon(size, pad_ratio=0.12, bg=BG):
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - 2 * pad_ratio))
    icon = coin.resize((inner, inner), Image.Resampling.LANCZOS)
    x = (size - inner) // 2
    canvas.paste(icon, (x, x), icon)
    return canvas


def save(im, name):
    path = os.path.join(out, name)
    im.save(path, "PNG", optimize=True)
    print(name, os.path.getsize(path))


for size in (192, 512):
    save(fit_icon(size, 0.08), f"icon-{size}.png")
save(fit_icon(512, 0.22), "icon-512-maskable.png")

splashes = [
    (640, 1136, 320, 568, 2),
    (750, 1334, 375, 667, 2),
    (828, 1792, 414, 896, 2),
    (1125, 2436, 375, 812, 3),
    (1170, 2532, 390, 844, 3),
    (1179, 2556, 393, 852, 3),
    (1206, 2622, 402, 874, 3),
    (1284, 2778, 428, 926, 3),
    (1290, 2796, 430, 932, 3),
    (1320, 2868, 440, 956, 3),
    (1536, 2048, 768, 1024, 2),
    (1640, 2360, 820, 1180, 2),
    (1668, 2388, 834, 1194, 2),
    (2048, 2732, 1024, 1366, 2),
]
links = []
for w, h, dw, dh, ratio in splashes:
    img = Image.new("RGBA", (w, h), BG)
    icon_size = min(w, h) // 4
    icon = coin.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    img.paste(icon, ((w - icon_size) // 2, (h - icon_size) // 2 - h // 18), icon)
    name = f"splash-{w}x{h}.png"
    save(img, name)
    media = (
        f"(device-width: {dw}px) and (device-height: {dh}px) "
        f"and (-webkit-device-pixel-ratio: {ratio}) and (orientation: portrait)"
    )
    links.append(
        f'  <link rel="apple-touch-startup-image" media="{media}" href="assets/pwa/{name}" />'
    )
    img_l = Image.new("RGBA", (h, w), BG)
    img_l.paste(icon, ((h - icon_size) // 2, (w - icon_size) // 2), icon)
    name_l = f"splash-{h}x{w}.png"
    save(img_l, name_l)
    media_l = (
        f"(device-width: {dw}px) and (device-height: {dh}px) "
        f"and (-webkit-device-pixel-ratio: {ratio}) and (orientation: landscape)"
    )
    links.append(
        f'  <link rel="apple-touch-startup-image" media="{media_l}" href="assets/pwa/{name_l}" />'
    )

print("---LINKS---")
print("\n".join(links))
