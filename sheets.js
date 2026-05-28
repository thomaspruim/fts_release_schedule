import { SPREADSHEET_ID, COLUMN_ALIASES, SHEET_TABS } from "./config.js";

const GVIZ_BASE = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;

function parseGvizText(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error("Unexpected response from Google Sheets");
  return JSON.parse(match[1]);
}

function normalizeHeader(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findColumnIndex(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h === alias || h.startsWith(alias));
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < normalized.length; i++) {
    if (aliases.some((a) => normalized[i].includes(a))) return i;
  }
  return -1;
}

function cellValue(cell) {
  if (cell == null) return { raw: "", formatted: "" };
  const raw = cell.v ?? "";
  const formatted = cell.f != null ? String(cell.f) : String(raw ?? "");
  return { raw, formatted: formatted.trim() };
}

function stringCell({ raw, formatted }) {
  const s = formatted || (raw != null ? String(raw) : "");
  return s.trim();
}

/** Google Sheets Date(y,m,d), serial, or string → Date at local midnight */
export function parseReleaseDate(raw, formatted) {
  const rawStr = raw != null ? String(raw).trim() : "";

  const ctor = rawStr.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (ctor) {
    const y = Number(ctor[1]);
    const m = Number(ctor[2]);
    const day = Number(ctor[3]);
    return startOfDay(new Date(y, m, day));
  }

  if (formatted) {
    const fromFormatted = new Date(formatted);
    if (!Number.isNaN(fromFormatted.getTime())) return startOfDay(fromFormatted);
  }

  if (typeof raw === "number" && raw > 1000) {
    const ms = (raw - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return startOfDay(d);
  }

  if (rawStr) {
    const d = new Date(rawStr);
    if (!Number.isNaN(d.getTime())) return startOfDay(d);
  }

  return null;
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function looksLikeVersion(value) {
  return /^\d+(\.\d+)+/.test(value);
}

function isHeaderRow(version, summary) {
  const v = version.toLowerCase();
  const s = summary.toLowerCase();
  return v === "release" || s === "feature" || s === "key features" || v.includes("release date");
}

function resolveTable(table) {
  let headers = table.cols.map((c) => normalizeHeader(c.label));
  let rows = table.rows ?? [];

  const hasKnownHeader = headers.some(
    (h) => h.includes("feature") || h.includes("launch") || h.includes("summary") || h === "release"
  );

  if (!hasKnownHeader && rows.length > 0) {
    const firstCells = (rows[0].c ?? []).map((cell) => normalizeHeader(stringCell(cellValue(cell))));
    if (firstCells.some((h) => h === "release" || h.includes("feature") || h.includes("launch"))) {
      headers = firstCells;
      rows = rows.slice(1);
    }
  }

  return { headers, rows };
}

function buildColumnMap(headers) {
  let versionIdx = findColumnIndex(headers, COLUMN_ALIASES.version);
  const summaryIdx = findColumnIndex(headers, COLUMN_ALIASES.summary);
  const statusIdx = findColumnIndex(headers, COLUMN_ALIASES.status);
  let dateIdx = findColumnIndex(headers, COLUMN_ALIASES.date);

  // DeNiro: date is first column, version second
  if (dateIdx < 0 && normalizeHeader(headers[0] || "").includes("release date")) {
    dateIdx = 0;
  }
  if (versionIdx < 0 && findColumnIndex(headers, ["release version"]) >= 0) {
    versionIdx = findColumnIndex(headers, ["release version"]);
  }

  // tvOS / odd sheets: version in column A when header is not "release"
  if (versionIdx < 0 && headers.length > 0) versionIdx = 0;

  return { versionIdx, summaryIdx, statusIdx, dateIdx };
}

export async function fetchSheetTab(sheetName) {
  const url = `${GVIZ_BASE}?sheet=${encodeURIComponent(sheetName)}&headers=1&tqx=out:json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load sheet "${sheetName}" (${res.status})`);
  const data = parseGvizText(await res.text());

  if (data.status === "error") {
    throw new Error(data.errors?.[0]?.detailed_message ?? `Error loading "${sheetName}"`);
  }

  const table = data.table;
  if (!table?.rows?.length) return [];

  const { headers, rows } = resolveTable(table);
  const { versionIdx, summaryIdx, statusIdx, dateIdx } = buildColumnMap(headers);

  const releases = [];
  let currentVersion = "";
  let currentDate = null;

  for (const row of rows) {
    const cells = row.c ?? [];
    const get = (idx) => (idx >= 0 && idx < cells.length ? cellValue(cells[idx]) : { raw: "", formatted: "" });

    const versionCell = get(versionIdx);
    const summaryCell = summaryIdx >= 0 ? get(summaryIdx) : { raw: "", formatted: "" };
    const statusCell = statusIdx >= 0 ? get(statusIdx) : { raw: "", formatted: "" };
    const dateCell = dateIdx >= 0 ? get(dateIdx) : { raw: "", formatted: "" };

    let version = stringCell(versionCell);
    const summary = stringCell(summaryCell);
    const status = stringCell(statusCell) || "—";

    if (isHeaderRow(version, summary)) continue;

    if (version && looksLikeVersion(version)) {
      currentVersion = version;
    } else if (version && !summary) {
      currentVersion = version;
      version = "";
    }

    const rowDate = parseReleaseDate(dateCell.raw, dateCell.formatted);
    if (rowDate) currentDate = rowDate;

    const effectiveVersion = (version && looksLikeVersion(version) ? version : "") || currentVersion;
    if (!effectiveVersion && !summary) continue;

    const date = rowDate ?? currentDate;

    releases.push({
      id: `${sheetName}-${releases.length}`,
      service: sheetName,
      version: effectiveVersion || "—",
      summary: summary || "—",
      status,
      date,
      dateKey: date ? date.toISOString().slice(0, 10) : "",
    });
  }

  return releases;
}

export async function discoverSheetTabs(configuredTabs) {
  if (configuredTabs.length > 0) return configuredTabs;
  return SHEET_TABS;
}

export function sortReleases(releases) {
  return [...releases].sort((a, b) => {
    if (a.date && b.date) return a.date - b.date;
    if (a.date) return -1;
    if (b.date) return 1;
    return a.service.localeCompare(b.service) || a.version.localeCompare(b.version);
  });
}

/**
 * Fetch each tab independently; invokes callbacks as each completes.
 * @returns {string[]} tab names being loaded
 */
export function loadReleasesProgressive(tabNames, { onTabStart, onTabComplete, onTabError, onAllComplete }) {
  const tabs = tabNames.length ? tabNames : SHEET_TABS;
  let remaining = tabs.length;

  if (!remaining) {
    onAllComplete?.();
    return tabs;
  }

  for (const tab of tabs) {
    onTabStart?.(tab);
    fetchSheetTab(tab)
      .then((releases) => onTabComplete?.(tab, releases))
      .catch((err) => {
        console.warn(`Tab "${tab}":`, err);
        onTabError?.(tab, err);
      })
      .finally(() => {
        remaining -= 1;
        if (remaining === 0) onAllComplete?.();
      });
  }

  return tabs;
}

/** Load all tabs; waits until every request finishes. */
export async function loadAllReleases(tabNames) {
  const tabs = await discoverSheetTabs(tabNames);
  const collected = [];

  return new Promise((resolve, reject) => {
    loadReleasesProgressive(tabs, {
      onTabComplete: (_tab, releases) => collected.push(...releases),
      onTabError: () => {},
      onAllComplete: () => resolve(sortReleases(collected)),
    });
  });
}
