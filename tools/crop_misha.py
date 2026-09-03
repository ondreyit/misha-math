from PIL import Image

src = r"C:\Projects\Cursor\Misha\Math\_misha_orig.jpg"
im = Image.open(src)
w, h = im.size
# Tight smiling portrait: face fills the frame
cx, cy = int(w * 0.50), int(h * 0.27)
side = int(min(w, h) * 0.30)
left = max(0, cx - side // 2)
top = max(0, cy - int(side * 0.45))
if top + side > h:
    top = h - side
if left + side > w:
    left = w - side
crop = im.crop((left, top, left + side, top + side))
out = crop.resize((512, 512), Image.Resampling.LANCZOS)
out.save(r"C:\Projects\Cursor\Misha\Math\assets\misha.jpg", quality=93)
print("saved", out.size, "box", left, top, side)
