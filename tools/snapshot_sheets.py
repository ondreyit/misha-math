"""Save current workbook data so the Supabase migrate has a local copy."""
import json
import urllib.parse
import urllib.request

URL = "https://script.google.com/macros/s/AKfycbxplXT57c9vgEIWdJ6DZH2-gUBnDDlOaq-X8kpGgw-ij7Hk-udqYg7zH7eyr_ePs_nd/exec"
TOKEN = "kaa-mishcoin-2026"
PROFILES = ["misha", "papa", "mama", "lika", "lucy", "rostik", "paulina"]
OUT = r"C:\Projects\Cursor\Misha\Math\supabase\snapshot.json"


def get(key):
    q = urllib.parse.urlencode({"a": "get", "k": key, "t": TOKEN})
    with urllib.request.urlopen(URL + "?" + q, timeout=60) as res:
        data = json.loads(res.read().decode("utf-8"))
    return data.get("v") if data.get("ok") else None


keys = ["catalog", "kinds", "cfg", "claims"]
for pid in PROFILES:
    keys += [f"b_{pid}", f"p_{pid}", f"d_{pid}", f"h_{pid}", f"y_{pid}", f"r_{pid}"]

snap = {}
for key in keys:
    snap[key] = get(key)
    print("ok", key, flush=True)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(snap, f, ensure_ascii=False, indent=2)
print("wrote", OUT, "keys", len(snap), flush=True)
