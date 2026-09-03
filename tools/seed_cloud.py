import json
import subprocess
import urllib.request

APP = "lz51usfi"
payload = {"u": 1788500100000, "b": 8, "h": [], "q": 20, "m": 4, "w": []}
raw = json.dumps(payload, separators=(",", ":"))
hexv = raw.encode().hex()
url = f"https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/{APP}/family/{hexv}"
req = urllib.request.Request(url, data=b"", method="POST")
print("kv", urllib.request.urlopen(req).read())
got = urllib.request.urlopen(f"https://keyvalue.immanuel.co/api/KeyVal/GetValue/{APP}/family").read().decode().strip().strip('"')
print("kv get", bytes.fromhex(got).decode())

full = {
    "updatedAt": 1788500100000,
    "coins": {"balance": 8, "history": []},
    "settings": {"questionCount": 20, "tablesMax": 4, "wishlist": []},
}
open("family_sync.json", "w", encoding="utf-8").write(json.dumps(full, separators=(",", ":")))
body = {"files": {"family_sync.json": {"content": json.dumps(full, separators=(",", ":"))}}}
open("gist_patch.json", "w", encoding="utf-8").write(json.dumps(body))
token = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
req = urllib.request.Request(
    "https://api.github.com/gists/dac6ed7823e7e1b57af63278e31a2766",
    data=open("gist_patch.json", "rb").read(),
    method="PATCH",
    headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "misha-math",
    },
)
print("gist", json.load(urllib.request.urlopen(req))["files"]["family_sync.json"]["content"])
