"""Apply schema.sql and load supabase/snapshot.json into a new Supabase project.

Env:
  SUPABASE_URL              https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY service_role JWT
  SUPABASE_DB_PASSWORD      database password (for DDL)
"""
import json
import os
import ssl
import urllib.parse
import urllib.request

ROOT = r"C:\Projects\Cursor\Misha\Math"
SCHEMA = os.path.join(ROOT, "supabase", "schema.sql")
SNAP = os.path.join(ROOT, "supabase", "snapshot.json")
PROFILES = [
    ("misha", "Миша", "Misha", 20, 0),
    ("papa", "Папа", "Dad", 5, 4),
    ("mama", "Мама", "Mom", 20, 0),
    ("lika", "Лика", "Lika", 20, 0),
    ("lucy", "Люся", "Lucy", 20, 0),
    ("rostik", "Ростик", "Rostik", 20, 0),
    ("paulina", "Паулина", "Paulina", 20, 6),
]


def load_env():
    path = os.path.join(ROOT, "supabase", ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def require(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing {name}")
    return value


def rest(url, key, path, method="GET", body=None, prefer="return=representation"):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/{path}",
        data=data,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=60, context=ctx) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else []


def apply_sql(project_ref, db_password, sql):
    try:
        import psycopg
    except ImportError:
        os.system("python -m pip install psycopg[binary] -q")
        import psycopg
    attempts = [
        {"host": "aws-0-us-east-1.pooler.supabase.com", "port": 5432, "user": f"postgres.{project_ref}"},
        {"host": "aws-0-us-east-1.pooler.supabase.com", "port": 6543, "user": f"postgres.{project_ref}"},
        {"host": f"db.{project_ref}.supabase.co", "port": 5432, "user": "postgres"},
    ]
    last = None
    for spec in attempts:
        try:
            conn = psycopg.connect(
                dbname="postgres",
                password=db_password,
                sslmode="require",
                connect_timeout=15,
                **spec,
            )
            with conn:
                with conn.cursor() as cur:
                    for stmt in [part.strip() for part in sql.split(";")]:
                        if stmt:
                            cur.execute(stmt)
                    cur.execute("notify pgrst, 'reload schema'")
            conn.close()
            print("schema applied via", spec["host"], flush=True)
            return
        except Exception as exc:
            last = exc
            print("try", spec["host"], type(exc).__name__, flush=True)
    raise SystemExit(f"Could not connect to Postgres: {last}")


def connect_pg(project_ref, db_password):
    import psycopg
    return psycopg.connect(
        host="aws-0-us-east-1.pooler.supabase.com",
        port=5432,
        dbname="postgres",
        user=f"postgres.{project_ref}",
        password=db_password,
        sslmode="require",
        connect_timeout=20,
    )


def iso(sec):
    if not sec:
        return None
    n = int(sec)
    if n < 1e11:
        n *= 1000
    import datetime
    return datetime.datetime.fromtimestamp(n / 1000, datetime.timezone.utc).isoformat()


def main():
    load_env()
    url = require("SUPABASE_URL")
    key = require("SUPABASE_SERVICE_ROLE_KEY")
    password = require("SUPABASE_DB_PASSWORD")
    project_ref = urllib.parse.urlparse(url).hostname.split(".")[0]
    apply_sql(project_ref, password, open(SCHEMA, encoding="utf-8").read())
    snap = json.load(open(SNAP, encoding="utf-8"))
    conn = connect_pg(project_ref, password)

    def upsert(sql, rows):
        if not rows:
            return
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()

    upsert(
        """insert into profiles (id, name_ru, name_en, question_count, tables_max)
           values (%s,%s,%s,%s,%s)
           on conflict (id) do update set
             name_ru=excluded.name_ru, name_en=excluded.name_en,
             question_count=excluded.question_count, tables_max=excluded.tables_max""",
        [
            (
                pid, ru, en,
                (snap.get(f"p_{pid}") or {}).get("q") or q,
                (snap.get(f"p_{pid}") or {}).get("m") if (snap.get(f"p_{pid}") or {}).get("m") is not None else m,
            )
            for pid, ru, en, q, m in PROFILES
        ],
    )

    bals = []
    for pid, *_ in PROFILES:
        raw = snap.get(f"b_{pid}")
        if isinstance(raw, (int, float)):
            bals.append((pid, int(raw), 0))
        elif raw:
            bals.append((pid, int(raw.get("b") or 0), int(raw.get("s") or 0)))
    upsert(
        """insert into balances (profile_id, stars, spend)
           values (%s,%s,%s)
           on conflict (profile_id) do update set stars=excluded.stars, spend=excluded.spend""",
        bals,
    )

    catalog = (snap.get("catalog") or {}).get("p") or []
    upsert(
        """insert into catalog (id, title_ru, title_en, cost)
           values (%s,%s,%s,%s)
           on conflict (id) do update set title_ru=excluded.title_ru, title_en=excluded.title_en, cost=excluded.cost""",
        [
            (
                p[0],
                "нет лимита в любое время (5 мин)" if p[0] == "1789090061026-a462d4" else p[1],
                p[2],
                p[3],
            )
            for p in catalog if p
        ],
    )

    kinds = snap.get("kinds") or {}
    kind_rows = []
    for row in kinds.get("k") or []:
        kind_rows.append((row[0], row[1], row[2], row[3], False))
    for row in kinds.get("x") or []:
        kind_rows.append((row[0], row[1], row[2], row[3], True))
    have = {row[0] for row in kind_rows}
    for row in [
        ("morning", "Утренний график", "Morning schedule", 4, False),
        ("morningOnTime", "Утренний график вовремя", "Morning schedule on time", 6, False),
        ("day", "Дневной график", "Daytime schedule", 4, False),
        ("dayOnTime", "Дневной график вовремя", "Daytime schedule on time", 6, False),
        ("evening", "Вечерний график", "Evening schedule", 4, False),
        ("eveningOnTime", "Вечерний график вовремя", "Evening schedule on time", 6, False),
        ("1789087011732-835f58", "Домашнее по математике без ошибок", "Math homework with no errors", 4, False),
    ]:
        if row[0] not in have:
            kind_rows.append(row)
    upsert(
        """insert into claim_kinds (id, title_ru, title_en, coins, archived)
           values (%s,%s,%s,%s,%s)
           on conflict (id) do update set title_ru=excluded.title_ru, title_en=excluded.title_en, coins=excluded.coins, archived=excluded.archived""",
        kind_rows,
    )

    cfg = snap.get("cfg") or {}
    upsert(
        """insert into config (key, value) values (%s,%s)
           on conflict (key) do update set value=excluded.value""",
        [("fail_extra", str(cfg.get("f", 1))), ("migrated_from", "sheets")],
    )

    status_name = ["new", "approved", "rejected"]

    def claim_tuple(row, fallback=""):
        if not row or not isinstance(row[1], int):
            return None
        pid = PROFILES[row[1]][0] if 0 <= row[1] < len(PROFILES) else fallback
        return (
            row[0], pid, str(row[2]),
            status_name[row[3]] if row[3] < 3 else "new",
            iso(row[4]), iso(row[5]), bool(row[6]),
            row[7] if len(row) > 7 else "",
            row[8] if len(row) > 8 else "",
            row[9] if len(row) > 9 else "",
            row[10] if len(row) > 10 and row[10] else (4 if row[3] == 1 else 0),
        )

    claims = []
    for row in (snap.get("claims") or {}).get("r") or []:
        item = claim_tuple(row)
        if item:
            claims.append(item)
    for pid, *_ in PROFILES:
        for row in (snap.get(f"r_{pid}") or {}).get("r") or []:
            item = claim_tuple(row, pid)
            if item:
                claims.append(item)
    uniq = {c[0]: c for c in claims}
    upsert(
        """insert into claims (id, profile_id, kind_id, status, at, decided_at, paid, reason, title_ru, title_en, coins)
           values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           on conflict (id) do update set
             profile_id=excluded.profile_id, kind_id=excluded.kind_id,
             status=excluded.status, paid=excluded.paid, coins=excluded.coins,
             title_ru=excluded.title_ru, title_en=excluded.title_en""",
        list(uniq.values()),
    )

    start = __import__("datetime").date(2026, 9, 3)
    for pid, *_ in PROFILES:
        days = (snap.get(f"d_{pid}") or {}).get("d") or []
        rows = []
        for row in days:
            if not row:
                continue
            rows.append((
                pid, row[0], "done" if row[1] else "open",
                row[2] if len(row) > 2 else 0,
                row[3] if len(row) > 3 else 0,
                row[4] if len(row) > 4 else 0,
                row[5] if len(row) > 5 else 0,
                row[6] if len(row) > 6 else 0,
                iso(row[7]) if len(row) > 7 else None,
                row[8] if len(row) > 8 else (row[5] if len(row) > 5 else 0),
            ))
        extra = str((snap.get(f"d_{pid}") or {}).get("c") or "").split(",")
        seen = {r[1] for r in rows}
        for part in extra:
            if part.strip().isdigit():
                key = (start + __import__("datetime").timedelta(days=int(part))).isoformat()
                if key not in seen:
                    rows.append((pid, key, "done", 0, 0, 0, 0, 1, None, 0))
                    seen.add(key)
        upsert(
            """insert into days (profile_id, date, status, examples_correct, examples_fails, examples_answered, coins, runs, completed_at, total_coins)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               on conflict (profile_id, date) do update set status=excluded.status, total_coins=excluded.total_coins""",
            rows,
        )

        hist = (snap.get(f"h_{pid}") or {}).get("h") or []
        hrows = []
        for item in hist:
            if item and isinstance(item[0], (int, float)):
                hrows.append((f"h-{item[0]}-{item[1]}", pid, iso(item[0]), item[1], "lesson", str(item[2]) if item[2] != "" else ""))
        upsert(
            """insert into history (id, profile_id, at, delta, kind, date_key)
               values (%s,%s,%s,%s,%s,%s)
               on conflict (id) do update set delta=excluded.delta""",
            hrows,
        )

        buys = (snap.get(f"y_{pid}") or {}).get("y") or []
        yrows = []
        for item in buys:
            if not item:
                continue
            named = len(item) >= 6 and (isinstance(item[4], str) or isinstance(item[5], str))
            if named:
                yrows.append((
                    str(item[0] or f"y-{pid}"),
                    pid,
                    str(item[1] or ""),
                    int(item[2] or 0),
                    iso(item[3]),
                    item[4] or "",
                    item[5] or "",
                ))
            else:
                yrows.append((
                    str(item[3] if len(item) > 3 else item[0] or f"y-{pid}"),
                    pid,
                    str(item[0] or "") if len(item) >= 4 else "",
                    int(item[1] or 0) if len(item) >= 2 and str(item[1]).lstrip("-").isdigit() else 0,
                    iso(item[2] if len(item) >= 3 else 0),
                    "",
                    "",
                ))
        upsert(
            """insert into purchases (id, profile_id, prize_id, cost, at, title_ru, title_en)
               values (%s,%s,%s,%s,%s,%s,%s)
               on conflict (id) do update set cost=excluded.cost""",
            yrows,
        )

    conn.close()
    print("migrated", flush=True)


if __name__ == "__main__":
    main()
