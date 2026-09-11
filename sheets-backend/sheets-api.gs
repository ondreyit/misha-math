/**
 * Mishcoin family database API — bound to
 * https://docs.google.com/spreadsheets/d/18wtrSQB-zNPjPr7ZqmZkjy5pz35ZRN1gBGzxjaNsos8/
 *
 * Deploy (first time, in this Google account):
 *  1. Open the spreadsheet → Extensions → Apps Script
 *  2. Confirm this file is the bound project "Mishcoin DB API"
 *  3. Deploy → New deployment → Type: Web app
 *  4. Execute as: Me · Who has access: Anyone
 *  5. The live /exec URL is already in index.html (CLOUD_SHEETS_URL).
 *     First owner visit must click Allow (Workspace authorization).
 *
 * Anyone-with-the-link can read/write. Optional family token lives in config.family_token.
 * Set config.require_token=1 to enforce it. Do not commit the token.
 */
var SHEET_ID = "18wtrSQB-zNPjPr7ZqmZkjy5pz35ZRN1gBGzxjaNsos8";
var FAMILY_TOKEN = "kaa-mishcoin-2026";

var HEADERS = {
  profiles: ["id", "name_ru", "name_en", "question_count", "tables_max", "updated_at"],
  balances: ["profile_id", "stars", "spend", "updated_at"],
  days: ["profile_id", "date", "status", "examples_correct", "examples_fails", "examples_answered", "coins", "total_coins", "runs", "completed_at", "payload"],
  history: ["id", "profile_id", "at", "delta", "kind", "note", "date_key", "payload"],
  purchases: ["id", "profile_id", "at", "prize_id", "title_ru", "title_en", "cost", "payload"],
  claims: ["id", "profile_id", "kind_id", "status", "at", "decided_at", "coins", "paid", "reason", "title_ru", "title_en", "payload"],
  claim_kinds: ["id", "title_ru", "title_en", "coins", "archived", "updated_at"],
  catalog: ["id", "title_ru", "title_en", "cost", "updated_at"],
  config: ["key", "value"],
  photos: ["profile_id", "updated_at", "data_url"],
};

var SHEET_ALIASES = {
  profiles: ["profiles", "Profiles", "Профили", "профили"],
  balances: ["balances", "Balances", "Баланс", "Балансы", "баланс"],
  days: ["days", "Days", "Дни", "дни", "Календарь"],
  history: ["history", "History", "История", "история"],
  purchases: ["purchases", "Purchases", "Покупки", "покупки"],
  claims: ["claims", "Claims", "Заявки", "заявки"],
  claim_kinds: ["claim_kinds", "kinds", "Kinds", "Типы", "типы"],
  catalog: ["catalog", "Catalog", "Каталог", "каталог"],
  config: ["config", "Config", "Настройки", "настройки"],
  photos: ["photos", "Photos", "Фото", "фото"],
};

function ss() {
  try {
    var active = SpreadsheetApp.getActive();
    if (active && active.getId() === SHEET_ID) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(SHEET_ID);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function listSheetNames() {
  return ss().getSheets().map(function (sh) { return sh.getName(); });
}

function resolveSheetName(logical) {
  var names = listSheetNames();
  var aliases = SHEET_ALIASES[logical] || [logical];
  for (var i = 0; i < aliases.length; i++) {
    for (var j = 0; j < names.length; j++) {
      if (String(names[j]).toLowerCase() === String(aliases[i]).toLowerCase()) return names[j];
    }
  }
  return null;
}

function ensureSheet(logical) {
  var name = resolveSheetName(logical) || logical;
  var book = ss();
  var sh = book.getSheetByName(name);
  if (!sh) sh = book.insertSheet(logical);
  var headers = HEADERS[logical];
  if (headers && headers.length) {
    var last = sh.getLastColumn();
    var row1 = last ? sh.getRange(1, 1, 1, Math.max(last, headers.length)).getDisplayValues()[0] : [];
    var same = headers.every(function (h, i) { return String(row1[i] || "") === h; });
    if (!same) {
      var hasData = sh.getLastRow() > 1;
      if (!hasData) sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    }
  }
  return sh;
}

function authOk(token) {
  var expected = String(configValue("family_token") || FAMILY_TOKEN);
  if (token && String(token) === expected) return true;
  return String(configValue("require_token") || "0") !== "1";
}

function configValue(key) {
  try {
    var rows = readTable("config");
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].key) === key) return rows[i].value;
    }
  } catch (e) {}
  return "";
}

function rowToObj(headers, row) {
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = row[i] == null ? "" : row[i]; });
  return obj;
}

function objToRow(headers, obj) {
  return headers.map(function (h) { return obj[h] == null ? "" : obj[h]; });
}

function readTable(logical) {
  var sh = ensureSheet(logical);
  var headers = HEADERS[logical];
  var lastRow = sh.getLastRow();
  var lastCol = Math.max(sh.getLastColumn(), headers.length);
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  return values
    .map(function (row) { return rowToObj(headers, row); })
    .filter(function (obj) { return headers.some(function (h) { return String(obj[h] || "") !== ""; }); });
}

function writeAllRows(logical, rows) {
  var sh = ensureSheet(logical);
  var headers = HEADERS[logical];
  var last = Math.max(sh.getLastRow(), 1);
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), headers.length)).clearContent();
  if (!rows || !rows.length) return;
  var body = rows.map(function (obj) { return objToRow(headers, obj); });
  sh.getRange(2, 1, body.length, headers.length).setValues(body);
}

function upsertRows(logical, rows, keyFields) {
  keyFields = keyFields || defaultKeys(logical);
  var current = readTable(logical);
  var index = {};
  current.forEach(function (row, i) { index[rowKey(row, keyFields)] = i; });
  (rows || []).forEach(function (incoming) {
    var k = rowKey(incoming, keyFields);
    if (!k) return;
    if (index[k] >= 0) current[index[k]] = Object.assign({}, current[index[k]], incoming);
    else {
      index[k] = current.length;
      current.push(incoming);
    }
  });
  writeAllRows(logical, current);
}

function replaceProfileRows(logical, profileId, rows) {
  var kept = readTable(logical).filter(function (row) { return String(row.profile_id) !== String(profileId); });
  writeAllRows(logical, kept.concat(rows || []));
}

function defaultKeys(logical) {
  if (logical === "profiles" || logical === "catalog" || logical === "claim_kinds") return ["id"];
  if (logical === "balances" || logical === "photos") return ["profile_id"];
  if (logical === "days") return ["profile_id", "date"];
  if (logical === "config") return ["key"];
  return ["id"];
}

function rowKey(row, fields) {
  return (fields || []).map(function (f) { return String(row[f] == null ? "" : row[f]); }).join("|");
}

function readAll() {
  var tables = {};
  Object.keys(HEADERS).forEach(function (name) { tables[name] = readTable(name); });
  return tables;
}

function applyWrite(write) {
  if (!write || !write.table) return;
  if (write.mode === "replace") writeAllRows(write.table, write.rows || []);
  else if (write.mode === "replaceProfile") replaceProfileRows(write.table, write.profile_id, write.rows || []);
  else upsertRows(write.table, write.rows || [], write.keys);
}

function applyBuy(body) {
  var profileId = body.profile_id;
  var cost = Math.max(0, Number(body.cost) || 0);
  var balances = readTable("balances");
  var row = null;
  balances.forEach(function (b) { if (b.profile_id === profileId) row = b; });
  var stars = row ? Number(row.stars) || 0 : 0;
  var spend = row ? Number(row.spend) || 0 : 0;
  if (stars < cost) throw new Error("not_enough");
  upsertRows("balances", [{
    profile_id: profileId,
    stars: stars - cost,
    spend: spend + cost,
    updated_at: body.at || new Date().toISOString(),
  }]);
  upsertRows("purchases", [{
    id: body.purchase_id || Utilities.getUuid(),
    profile_id: profileId,
    at: body.at || new Date().toISOString(),
    prize_id: body.prize_id || "",
    title_ru: body.title_ru || "",
    title_en: body.title_en || "",
    cost: cost,
    payload: body.payload || "",
  }]);
}

function getBalance(profileId) {
  var rows = readTable("balances");
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].profile_id === profileId) return Number(rows[i].stars) || 0;
  }
  return 0;
}

function ensureDb() {
  Object.keys(HEADERS).forEach(ensureSheet);
  hideDefaultSheet();
  seedIfEmpty();
}

function onOpen() {
  try { ensureDb(); } catch (e) {}
  try {
    SpreadsheetApp.getUi()
      .createMenu("Mishcoin")
      .addItem("Создать / обновить таблицы", "ensureDb")
      .addToUi();
  } catch (e) {}
}

function hideDefaultSheet() {
  var book = ss();
  ["Sheet1", "Лист1"].forEach(function (name) {
    var sh = book.getSheetByName(name);
    if (sh && book.getSheets().length > 1 && sh.getLastRow() <= 1) {
      try { sh.hideSheet(); } catch (e) {}
    }
  });
}

function seedIfEmpty() {
  if (readTable("profiles").length) return;
  var now = new Date().toISOString();
  writeAllRows("profiles", [
    { id: "misha", name_ru: "Миша", name_en: "Misha", question_count: 20, tables_max: 0, updated_at: now },
    { id: "papa", name_ru: "Папа", name_en: "Dad", question_count: 5, tables_max: 4, updated_at: now },
    { id: "mama", name_ru: "Мама", name_en: "Mom", question_count: 20, tables_max: 0, updated_at: now },
    { id: "lika", name_ru: "Лика", name_en: "Lika", question_count: 20, tables_max: 0, updated_at: now },
    { id: "lucy", name_ru: "Люся", name_en: "Lucy", question_count: 20, tables_max: 0, updated_at: now },
    { id: "rostik", name_ru: "Ростик", name_en: "Rostik", question_count: 20, tables_max: 0, updated_at: now },
    { id: "paulina", name_ru: "Паулина", name_en: "Paulina", question_count: 20, tables_max: 6, updated_at: now },
  ]);
  writeAllRows("balances", [
    { profile_id: "misha", stars: 42, spend: 0, updated_at: now },
    { profile_id: "papa", stars: 54, spend: 0, updated_at: now },
    { profile_id: "mama", stars: 1, spend: 0, updated_at: now },
    { profile_id: "lika", stars: 0, spend: 0, updated_at: now },
    { profile_id: "lucy", stars: 7, spend: 5, updated_at: now },
    { profile_id: "rostik", stars: 1, spend: 0, updated_at: now },
    { profile_id: "paulina", stars: 0, spend: 0, updated_at: now },
  ]);
  writeAllRows("days", [
    dayRow("misha", "2026-09-03", "done", 0, 0, 0, 3, 3, 1, "2026-09-08T00:48:41.000Z"),
    dayRow("misha", "2026-09-05", "done", 21, 1, 22, 4, 4, 1, "2026-09-05T23:00:00.000Z"),
    dayRow("misha", "2026-09-06", "done", 20, 0, 20, 4, 8, 2, "2026-09-06T23:00:00.000Z"),
    dayRow("misha", "2026-09-07", "done", 0, 0, 0, 3, 3, 1, "2026-09-08T00:48:41.000Z"),
    dayRow("misha", "2026-09-08", "done", 0, 0, 0, 4, 4, 1, "2026-09-09T00:05:50.000Z"),
    dayRow("misha", "2026-09-09", "done", 0, 0, 0, 1, 1, 1, "2026-09-10T03:41:42.000Z"),
    dayRow("papa", "2026-09-04", "done", 0, 0, 0, 3, 3, 1, isoFromUnix(1789029758)),
    dayRow("papa", "2026-09-08", "done", 0, 0, 0, 3, 3, 1, isoFromUnix(1789029679)),
    dayRow("papa", "2026-09-09", "done", 5, 0, 5, 4, 17, 5, isoFromUnix(1788928813)),
  ]);
  writeAllRows("history", [
    histRow("h-1788649200-4", "misha", isoFromUnix(1788649200), 4, "lesson", "урок 5 сентября", "2026-09-05"),
    histRow("h-1788735600-8", "misha", isoFromUnix(1788735600), 8, "lesson", "урок 6 сентября", "2026-09-06"),
    histRow("day-2026-09-03-1", "misha", "2026-09-08T00:48:41.000Z", 3, "lesson", "урок 3 сентября", "2026-09-03"),
    histRow("day-2026-09-07-1", "misha", "2026-09-08T00:48:41.000Z", 3, "lesson", "урок 7 сентября", "2026-09-07"),
    histRow("day-2026-09-08-1", "misha", "2026-09-09T00:05:50.000Z", 4, "lesson", "урок 8 сентября", "2026-09-08"),
    histRow("day-2026-09-09-1", "misha", "2026-09-10T03:41:42.000Z", 1, "lesson", "урок 9 сентября", "2026-09-09"),
    histRow("claim-1789088361398-65f82f", "misha", isoFromUnix(1789088417), 4, "claim", "Домашнее по математике без ошибок", ""),
    histRow("h-1789029758-3", "papa", isoFromUnix(1789029758), 3, "lesson", "урок 4 сентября", "2026-09-04"),
    histRow("h-1789029679-3", "papa", isoFromUnix(1789029679), 3, "lesson", "урок 8 сентября", "2026-09-08"),
    histRow("h-1789010050-4", "papa", isoFromUnix(1789010050), 4, "lesson", "урок 9 сентября", "2026-09-09"),
    histRow("claim-1789094571649-1a264d", "lucy", isoFromUnix(1789094599), 4, "claim", "Домашнее по математике без ошибок", ""),
  ]);
  writeAllRows("purchases", [{
    id: "y-lucy-5min-kv",
    profile_id: "lucy",
    at: isoFromUnix(1789097400),
    prize_id: "1789090061026-a462d4",
    title_ru: "нет лимита в любое время (5 мин)",
    title_en: "No limit at any time (5 min)",
    cost: 5,
    payload: "",
  }]);
  writeAllRows("claims", [
    claimRow("1789088361398-65f82f", "misha", "1789087011732-835f58", "approved", 1789088361, 1789088417, 4, 1, "", "Домашнее по математике без ошибок", "Math homework with no errors"),
    claimRow("1789094571649-1a264d", "lucy", "1789087011732-835f58", "approved", 1789094571, 1789094599, 4, 1, "", "Домашнее по математике без ошибок", "Math homework with no errors"),
  ]);
  writeAllRows("claim_kinds", [
    { id: "morning", title_ru: "Утренний график", title_en: "Morning schedule", coins: 4, archived: 0, updated_at: now },
    { id: "morningOnTime", title_ru: "Утренний график вовремя", title_en: "Morning schedule on time", coins: 6, archived: 0, updated_at: now },
    { id: "day", title_ru: "Дневной график", title_en: "Daytime schedule", coins: 4, archived: 0, updated_at: now },
    { id: "dayOnTime", title_ru: "Дневной график вовремя", title_en: "Daytime schedule on time", coins: 6, archived: 0, updated_at: now },
    { id: "evening", title_ru: "Вечерний график", title_en: "Evening schedule", coins: 4, archived: 0, updated_at: now },
    { id: "eveningOnTime", title_ru: "Вечерний график вовремя", title_en: "Evening schedule on time", coins: 6, archived: 0, updated_at: now },
    { id: "1789087011732-835f58", title_ru: "Домашнее по математике без ошибок", title_en: "Math homework with no errors", coins: 4, archived: 0, updated_at: now },
  ]);
  writeAllRows("catalog", [
    { id: "1788663954626-368e69", title_ru: "Minecraft PC", title_en: "Minecraft PC", cost: 80, updated_at: now },
    { id: "1788925667104-3926d6", title_ru: "Пицца в любое время", title_en: "Pizza at any time", cost: 50, updated_at: now },
    { id: "1788926206112-1800a8", title_ru: "Без лимита в любое время (30)", title_en: "No limit at any time (30 min)", cost: 30, updated_at: now },
    { id: "1789090061026-a462d4", title_ru: "нет лимита в любое время (5 мин)", title_en: "No limit at any time (5 min)", cost: 5, updated_at: now },
  ]);
  writeAllRows("config", [
    { key: "fail_extra", value: "1" },
    { key: "family_token", value: "kaa-mishcoin-2026" },
    { key: "require_token", value: "0" },
    { key: "migrated_from", value: "keyvalue.immanuel.co/lz51usfi" },
    { key: "program_start", value: "2026-09-03" },
    { key: "updated_at", value: now },
  ]);
}

function dayRow(profileId, date, status, ok, bad, ans, coins, total, runs, at) {
  return {
    profile_id: profileId,
    date: date,
    status: status,
    examples_correct: ok,
    examples_fails: bad,
    examples_answered: ans,
    coins: coins,
    total_coins: total,
    runs: runs,
    completed_at: at,
    payload: "",
  };
}

function histRow(id, profileId, at, delta, kind, note, dateKey) {
  return {
    id: id,
    profile_id: profileId,
    at: at,
    delta: delta,
    kind: kind,
    note: note,
    date_key: dateKey,
    payload: "",
  };
}

function claimRow(id, profileId, kindId, status, created, decided, coins, paid, reason, ru, en) {
  return {
    id: id,
    profile_id: profileId,
    kind_id: kindId,
    status: status,
    at: isoFromUnix(created),
    decided_at: isoFromUnix(decided),
    coins: coins,
    paid: paid,
    reason: reason,
    title_ru: ru,
    title_en: en,
    payload: "",
  };
}

function isoFromUnix(sec) {
  var n = Number(sec) || 0;
  if (!n) return "";
  if (n > 1e12) return new Date(n).toISOString();
  return new Date(n * 1000).toISOString();
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); }
  finally { lock.releaseLock(); }
}

var PHOTO_CHUNKS = {};
var PROFILES = ["misha", "papa", "mama", "lika", "lucy", "rostik", "paulina"];

function num(v) { return Number(v) || 0; }
function unixOf(iso) {
  var n = Date.parse(String(iso || ""));
  return isNaN(n) ? 0 : Math.floor(n / 1000);
}
function isoOf(sec) {
  var n = Number(sec) || 0;
  if (!n) return "";
  return n > 1e12 ? new Date(n).toISOString() : new Date(n * 1000).toISOString();
}
function profileIndex(id) {
  var i = PROFILES.indexOf(id);
  return i < 0 ? 0 : i;
}
function dateOffset(key) {
  if (!key) return -1;
  var start = new Date(2026, 8, 3);
  var parts = String(key).split("-");
  if (parts.length < 3) return -1;
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var n = Math.round((d - start) / 86400000);
  return n >= 0 && n < 400 ? n : -1;
}

function kvGet(key) {
  if (key === "cfg") return { u: Date.now(), f: num(configValue("fail_extra") || 1) };
  if (key === "catalog") return catalogKv();
  if (/^c\d+$/.test(key)) return catalogItem(Number(key.slice(1)));
  if (key === "kinds") return kindsKv();
  if (/^k\d+r$/.test(key)) return kindField(Number(key.slice(1, -1)), "title_ru");
  if (/^k\d+e$/.test(key)) return kindField(Number(key.slice(1, -1)), "title_en");
  if (/^x\d+r$/.test(key)) return archiveField(Number(key.slice(1, -1)), "title_ru");
  if (/^x\d+e$/.test(key)) return archiveField(Number(key.slice(1, -1)), "title_en");
  if (/^k\d+$/.test(key)) return kindItem(Number(key.slice(1)), false);
  if (/^x\d+$/.test(key)) return kindItem(Number(key.slice(1)), true);
  if (key === "claims" || key === "family") return key === "family" ? profileKv("misha") : claimsKv("");
  var m = String(key || "").match(/^([bphdyr])_(.+)$/);
  if (m) {
    if (m[1] === "b") return balanceKv(m[2]);
    if (m[1] === "p") return profileKv(m[2]);
    if (m[1] === "h") return historyKv(m[2]);
    if (m[1] === "d") return daysKv(m[2]);
    if (m[1] === "y") return purchasesKv(m[2]);
    if (m[1] === "r") return claimsKv(m[2]);
  }
  if (/^a_[a-z]+$/.test(key)) return photoMeta(key.slice(2));
  return null;
}

function kvGetHex(key) {
  var photo = String(key || "").match(/^a_([a-z]+)_(\d+)$/);
  if (photo) return photoChunkHex(photo[1], Number(photo[2]));
  var v = kvGet(key);
  return v == null ? "" : toHex_(JSON.stringify(v));
}

function liveKinds_() {
  return readTable("claim_kinds").filter(function (r) { return String(r.archived) !== "1" && r.id; });
}
function archiveKinds_() {
  return readTable("claim_kinds").filter(function (r) { return String(r.archived) === "1" && r.id; });
}
function catalogKv() {
  var rows = readTable("catalog");
  return {
    u: Date.now(),
    n: rows.length,
    p: rows.map(function (r) { return [r.id, r.title_ru, r.title_en, num(r.cost)]; }),
  };
}
function catalogItem(i) {
  var rows = readTable("catalog");
  return rows[i] ? [rows[i].id, rows[i].title_ru, rows[i].title_en, num(rows[i].cost)] : null;
}
function kindsKv() {
  var live = liveKinds_();
  var arch = archiveKinds_();
  return {
    u: Date.now(),
    n: live.length,
    xn: arch.length,
    k: live.map(function (r) { return [r.id, r.title_ru, r.title_en, num(r.coins)]; }),
    x: arch.map(function (r) { return [r.id, r.title_ru, r.title_en, num(r.coins)]; }),
  };
}
function kindItem(i, archived) {
  var rows = archived ? archiveKinds_() : liveKinds_();
  return rows[i] ? [rows[i].id, rows[i].title_ru, rows[i].title_en, num(rows[i].coins)] : null;
}
function kindField(i, field) {
  var rows = liveKinds_();
  return rows[i] ? String(rows[i][field] || "") : "";
}
function archiveField(i, field) {
  var rows = archiveKinds_();
  return rows[i] ? String(rows[i][field] || "") : "";
}
function balanceKv(id) {
  var rows = readTable("balances");
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].profile_id === id) return { b: num(rows[i].stars), s: num(rows[i].spend) };
  }
  return { b: 0, s: 0 };
}
function profileKv(id) {
  var q = 20;
  var m = 0;
  var u = Date.now();
  readTable("profiles").forEach(function (r) {
    if (r.id === id) {
      q = num(r.question_count) || 20;
      m = num(r.tables_max);
      u = Date.parse(r.updated_at) || u;
    }
  });
  return { u: u, b: balanceKv(id).b, q: q, m: m };
}
function historyKv(id) {
  var h = readTable("history").filter(function (r) { return r.profile_id === id; }).map(function (r) {
    var off = dateOffset(r.date_key);
    return [unixOf(r.at), num(r.delta), off >= 0 ? off : (r.date_key || "")];
  });
  return { u: Date.now(), h: h };
}
function daysKv(id) {
  var rows = readTable("days").filter(function (r) { return r.profile_id === id; });
  var c = [];
  var d = rows.map(function (r) {
    var off = dateOffset(r.date);
    if (String(r.status) === "done" && off >= 0) c.push(off);
    return [
      r.date,
      String(r.status) === "done" ? 1 : 0,
      num(r.examples_correct),
      num(r.examples_fails),
      num(r.examples_answered),
      num(r.coins),
      num(r.runs),
      unixOf(r.completed_at),
      num(r.total_coins),
    ];
  });
  return { u: Date.now(), c: c.sort(function (a, b) { return a - b; }).join(","), d: d };
}
function purchasesKv(id) {
  var y = readTable("purchases").filter(function (r) { return r.profile_id === id; }).map(function (r) {
    return [r.id, r.prize_id, num(r.cost), unixOf(r.at), r.title_ru, r.title_en];
  });
  return { u: Date.now(), y: y };
}
function claimsKv(id) {
  var rows = readTable("claims");
  if (id) rows = rows.filter(function (r) { return r.profile_id === id; });
  var statusIdx = { new: 0, approved: 1, rejected: 2 };
  return {
    u: Date.now(),
    r: rows.map(function (r) {
      return [
        r.id,
        profileIndex(r.profile_id),
        r.kind_id,
        statusIdx[r.status] == null ? 0 : statusIdx[r.status],
        unixOf(r.at),
        unixOf(r.decided_at),
        String(r.paid) === "1" || r.paid === true || String(r.paid) === "TRUE" ? 1 : 0,
        r.reason || "",
        r.title_ru || "",
        r.title_en || "",
        num(r.coins),
      ];
    }),
  };
}
function photoMeta(id) {
  var rows = readTable("photos");
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].profile_id === id && String(rows[i].data_url || "").indexOf("data:image") === 0) {
      return { u: Date.parse(rows[i].updated_at) || Date.now(), n: 1 };
    }
  }
  return { u: Date.now(), n: 0 };
}
function photoChunkHex(id, idx) {
  if (idx !== 0) return "";
  var rows = readTable("photos");
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].profile_id === id) return dataUrlToJpegHex_(rows[i].data_url);
  }
  return "";
}

function kvPut(key, value, hex) {
  var now = new Date().toISOString();
  if (key === "cfg") {
    upsertRows("config", [{ key: "fail_extra", value: String(num(value && value.f)) }, { key: "updated_at", value: now }]);
    return;
  }
  if (key === "catalog") {
    var prizes = (value && (value.p || value.prizes)) || [];
    writeAllRows("catalog", prizes.map(function (p) {
      if (Object.prototype.toString.call(p) === "[object Array]") {
        return { id: p[0], title_ru: p[1], title_en: p[2], cost: num(p[3]), updated_at: now };
      }
      return { id: p.id, title_ru: p.titleRu || p.title_ru, title_en: p.titleEn || p.title_en, cost: num(p.cost), updated_at: now };
    }).filter(function (p) { return p.id; }));
    return;
  }
  if (/^c\d+$/.test(key) && value) {
    var row = Object.prototype.toString.call(value) === "[object Array]"
      ? { id: value[0], title_ru: value[1], title_en: value[2], cost: num(value[3]), updated_at: now }
      : { id: value.id, title_ru: value.titleRu, title_en: value.titleEn, cost: num(value.cost), updated_at: now };
    if (row.id) upsertRows("catalog", [row]);
    return;
  }
  if (key === "kinds") {
    var live = (value && (value.k || value.kinds)) || [];
    var arch = (value && (value.x || value.archive)) || [];
    var rows = live.map(function (k) { return kindFromRaw_(k, 0, now); }).concat(arch.map(function (k) { return kindFromRaw_(k, 1, now); }));
    writeAllRows("claim_kinds", rows.filter(function (k) { return k.id; }));
    return;
  }
  if (/^[kx]\d+$/.test(key) && value) {
    upsertRows("claim_kinds", [kindFromRaw_(value, key.charAt(0) === "x" ? 1 : 0, now)]);
    return;
  }
  if (key === "claims") {
    writeAllRows("claims", expandClaimsPut_(value && (value.r || value.claims) || [], ""));
    return;
  }
  var m = String(key || "").match(/^([bphdyr])_(.+)$/);
  if (m) {
    var id = m[2];
    if (m[1] === "b") {
      upsertRows("balances", [{ profile_id: id, stars: num(value && value.b), spend: num(value && value.s), updated_at: now }]);
      return;
    }
    if (m[1] === "p") {
      upsertRows("profiles", [{
        id: id,
        question_count: num(value && value.q) || 20,
        tables_max: num(value && value.m),
        updated_at: now,
      }]);
      if (value && value.b != null) upsertRows("balances", [{ profile_id: id, stars: num(value.b), updated_at: now }]);
      return;
    }
    if (m[1] === "h") {
      replaceProfileRows("history", id, expandHistoryPut_(value && (value.h || value.history) || [], id));
      return;
    }
    if (m[1] === "d") {
      replaceProfileRows("days", id, expandDaysPut_(value, id));
      return;
    }
    if (m[1] === "y") {
      replaceProfileRows("purchases", id, expandPurchasesPut_(value && (value.y || value.purchases) || [], id));
      return;
    }
    if (m[1] === "r") {
      var incoming = expandClaimsPut_(value && (value.r || value.claims) || [], id);
      var kept = readTable("claims").filter(function (r) { return r.profile_id !== id; });
      writeAllRows("claims", kept.concat(incoming));
      return;
    }
  }
  if (/^a_([a-z]+)_(\d+)$/.test(key) && hex) {
    var pm = key.match(/^a_([a-z]+)_(\d+)$/);
    PHOTO_CHUNKS[pm[1]] = PHOTO_CHUNKS[pm[1]] || [];
    PHOTO_CHUNKS[pm[1]][Number(pm[2])] = hex;
    return;
  }
  if (/^a_([a-z]+)$/.test(key)) {
    var pid = key.slice(2);
    var n = num(value && value.n);
    if (!n) {
      upsertRows("photos", [{ profile_id: pid, updated_at: now, data_url: "" }]);
      return;
    }
    var parts = PHOTO_CHUNKS[pid] || [];
    var joined = parts.join("");
    var url = jpegHexToDataUrl_(joined);
    if (url && url.length < 45000) upsertRows("photos", [{ profile_id: pid, updated_at: now, data_url: url }]);
  }
}

function kindFromRaw_(raw, archived, now) {
  if (Object.prototype.toString.call(raw) === "[object Array]") {
    return { id: raw[0], title_ru: raw[1], title_en: raw[2], coins: num(raw[3]), archived: archived, updated_at: now };
  }
  return { id: raw.id, title_ru: raw.titleRu || raw.title_ru, title_en: raw.titleEn || raw.title_en, coins: num(raw.amount || raw.coins), archived: archived, updated_at: now };
}
function expandHistoryPut_(list, id) {
  return (list || []).map(function (item) {
    if (Object.prototype.toString.call(item) === "[object Array]") {
      if (typeof item[0] === "number") {
        var dayRef = item[2];
        var dateKey = typeof dayRef === "number" ? offsetToDate_(dayRef) : (dayRef || "");
        return { id: "h-" + item[0] + "-" + item[1], profile_id: id, at: isoOf(item[0]), delta: num(item[1]), kind: num(item[1]) < 0 ? "prize" : "lesson", note: "", date_key: dateKey, payload: "" };
      }
      return { id: item[0] || ("h-" + item[1]), profile_id: id, at: isoOf(item[1]), delta: num(item[3]), kind: "lesson", note: "", date_key: item[2] || "", payload: "" };
    }
    return { id: item.id, profile_id: id, at: item.at, delta: num(item.amount || item.delta), kind: item.kind || "lesson", note: "", date_key: item.dateKey || item.date_key || "", payload: "" };
  }).filter(function (r) { return r.id; });
}
function expandDaysPut_(value, id) {
  var rows = (value && (value.d || value.days)) || [];
  var extra = String((value && (value.c || value.completed)) || "").split(",");
  var seen = {};
  var out = rows.map(function (row) {
    if (Object.prototype.toString.call(row) === "[object Array]") {
      seen[row[0]] = true;
      return {
        profile_id: id, date: row[0], status: row[1] ? "done" : "open",
        examples_correct: num(row[2]), examples_fails: num(row[3]), examples_answered: num(row[4]),
        coins: num(row[5]), total_coins: num(row[8] || row[5]), runs: num(row[6]),
        completed_at: isoOf(row[7]), payload: "",
      };
    }
    seen[row.date] = true;
    return {
      profile_id: id, date: row.date, status: row.completed || row.status === "done" ? "done" : "open",
      examples_correct: num(row.correct), examples_fails: num(row.fails), examples_answered: num(row.answered),
      coins: num(row.coinsAwarded || row.coins), total_coins: num(row.totalCoins || row.total_coins),
      runs: num(row.runsCompleted || row.runs), completed_at: row.completedAt || row.completed_at || "", payload: "",
    };
  });
  extra.forEach(function (part) {
    if (!/^\d+$/.test(part.trim())) return;
    var date = offsetToDate_(Number(part));
    if (date && !seen[date]) out.push(dayRow(id, date, "done", 0, 0, 0, 0, 0, 1, ""));
  });
  return out.filter(function (r) { return r.date; });
}
function expandPurchasesPut_(list, id) {
  return (list || []).map(function (p) {
    if (Object.prototype.toString.call(p) === "[object Array]") {
      if (p.length >= 6) return { id: p[0], profile_id: id, prize_id: p[1], cost: num(p[2]), at: isoOf(p[3]), title_ru: p[4], title_en: p[5], payload: "" };
      return { id: p[3] || ("y-" + p[0] + "-" + p[2]), profile_id: id, prize_id: p[0], cost: num(p[1]), at: isoOf(p[2]), title_ru: "", title_en: "", payload: "" };
    }
    return { id: p.id, profile_id: id, prize_id: p.prizeId || p.prize_id, cost: num(p.cost), at: p.at, title_ru: p.titleRu || p.title_ru, title_en: p.titleEn || p.title_en, payload: "" };
  }).filter(function (r) { return r.id; });
}
function expandClaimsPut_(list, fallbackId) {
  var statuses = ["new", "approved", "rejected"];
  return (list || []).map(function (c) {
    if (Object.prototype.toString.call(c) === "[object Array]") {
      return {
        id: c[0],
        profile_id: PROFILES[c[1]] || fallbackId,
        kind_id: c[2],
        status: statuses[c[3]] || "new",
        at: isoOf(c[4]),
        decided_at: isoOf(c[5]),
        coins: num(c[10]),
        paid: c[6] ? 1 : 0,
        reason: c[7] || "",
        title_ru: c[8] || "",
        title_en: c[9] || "",
        payload: "",
      };
    }
    return {
      id: c.id, profile_id: c.profileId || c.profile_id || fallbackId, kind_id: c.kind || c.kind_id,
      status: c.status || "new", at: c.createdAt || c.at, decided_at: c.decidedAt || c.decided_at,
      coins: num(c.amount || c.coins), paid: c.paid ? 1 : 0, reason: c.reason || "",
      title_ru: c.titleRu || c.title_ru, title_en: c.titleEn || c.title_en, payload: "",
    };
  }).filter(function (r) { return r.id; });
}
function offsetToDate_(n) {
  var d = new Date(2026, 8, 3);
  d.setDate(d.getDate() + Number(n));
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}
function toHex_(str) {
  var bytes = Utilities.newBlob(String(str || ""), "text/plain").getBytes();
  return bytes.map(function (b) {
    var v = (b + 256) % 256;
    return (v < 16 ? "0" : "") + v.toString(16);
  }).join("");
}
function dataUrlToJpegHex_(dataUrl) {
  var s = String(dataUrl || "");
  var idx = s.indexOf("base64,");
  if (idx < 0) return "";
  var bytes = Utilities.base64Decode(s.slice(idx + 7));
  return bytes.map(function (b) {
    var v = (b + 256) % 256;
    return (v < 16 ? "0" : "") + v.toString(16);
  }).join("");
}
function jpegHexToDataUrl_(hex) {
  var clean = String(hex || "").replace(/[^0-9a-f]/gi, "");
  if (!clean || clean.length % 2) return "";
  var bytes = [];
  for (var i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  return "data:image/jpeg;base64," + Utilities.base64Encode(bytes);
}

function kvPull(id) {
  var keys = {};
  ["cfg", "catalog", "kinds", "claims"].forEach(function (k) { keys[k] = kvGet(k); });
  var cat = keys.catalog;
  for (var i = 0; i < ((cat && cat.n) || 0); i++) keys["c" + i] = kvGet("c" + i);
  var kinds = keys.kinds;
  for (var j = 0; j < ((kinds && kinds.n) || 0); j++) keys["k" + j] = kvGet("k" + j);
  var ids = id ? [id] : PROFILES;
  ids.forEach(function (pid) {
    ["b", "p", "h", "d", "y", "r", "a"].forEach(function (p) { keys[p + "_" + pid] = kvGet(p + "_" + pid); });
  });
  if (!id) {
    PROFILES.forEach(function (pid) { keys["b_" + pid] = kvGet("b_" + pid); });
  }
  return keys;
}

function handleAction(a, token, key, value, hex, id, keysCsv) {
  ensureDb();
  if (!authOk(token)) return { ok: false, error: "token" };
  a = a || "dump";
  if (a === "ping") return { ok: true, sheets: listSheetNames(), title: ss().getName() };
  if (a === "dump" || a === "opdump") return { ok: true, sheets: listSheetNames(), tables: readAll() };
  if (a === "get") return { ok: true, v: kvGet(key) };
  if (a === "getHex") return { ok: true, hex: kvGetHex(key) };
  if (a === "getMany") {
    var out = {};
    String(keysCsv || key || "").split(",").forEach(function (k) {
      k = k.trim();
      if (k) out[k] = kvGet(k);
    });
    return { ok: true, keys: out };
  }
  if (a === "pull") return { ok: true, keys: kvPull(id) };
  if (a === "put") {
    kvPut(key, value, hex);
    return { ok: true };
  }
  if (a === "upsert") {
    upsertRows(key, value || [], id);
    return { ok: true };
  }
  if (a === "buy") {
    applyBuy(value || {});
    return { ok: true, balance: getBalance((value || {}).profile_id) };
  }
  return { ok: false, error: "unknown_op" };
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    return withLock(function () {
      return jsonOut(handleAction(p.a || p.op, p.t || p.token, p.k || p.table, null, "", p.id, p.k));
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || "{}");
    return withLock(function () {
      return jsonOut(handleAction(body.a || body.op, body.t || body.token, body.k || body.table, body.v || body.rows || body, body.hex, body.id || body.profile_id, body.keys));
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
