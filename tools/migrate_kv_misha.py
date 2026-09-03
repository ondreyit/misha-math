import urllib.request

APP = "lz51usfi"


def get(key: str) -> str:
    try:
        raw = urllib.request.urlopen(
            f"https://keyvalue.immanuel.co/api/KeyVal/GetValue/{APP}/{key}"
        ).read().decode().strip().strip('"')
        return raw
    except Exception:
        return ""


def put(key: str, hexv: str) -> bytes:
    req = urllib.request.Request(
        f"https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/{APP}/{key}/{hexv}",
        data=b"",
        method="POST",
    )
    return urllib.request.urlopen(req).read()


family = get("family")
pmisha = get("p_misha")
print("family", family[:100] if family else None)
print("p_misha", pmisha[:100] if pmisha else None)
if family and not pmisha:
    print("copied", put("p_misha", family))
    print("now", bytes.fromhex(get("p_misha")).decode())
elif family and pmisha:
    print("p_misha already set")
else:
    print("nothing to migrate")
