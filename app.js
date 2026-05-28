import { SHEET_TABS, SERVICE_COLORS } from "./config.js";
import { loadReleasesProgressive, sortReleases } from "./sheets.js";

const state = {
  releases: [],
  calendarMonth: startOfMonth(new Date()),
  sortKey: "date",
  sortDir: "asc",
  filters: { service: "", status: "", version: "", dateFrom: "", dateTo: "" },
  loading: false,
  load: { total: 0, completed: 0, tabs: new Map() },
};

const serviceColorMap = new Map();

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function formatMonthYear(d) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDisplayDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function ensureServiceColor(service) {
  if (!serviceColorMap.has(service)) {
    serviceColorMap.set(service, SERVICE_COLORS[serviceColorMap.size % SERVICE_COLORS.length]);
  }
  return serviceColorMap.get(service);
}

function releasesForMonth(month, releases) {
  const y = month.getFullYear();
  const m = month.getMonth();
  return releases.filter((r) => r.date && r.date.getFullYear() === y && r.date.getMonth() === m);
}

function buildCalendarGrid(month) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDow = new Date(year, mon, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, mon + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push({ type: "pad" });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ type: "day", day, date: new Date(year, mon, day) });
  }
  while (cells.length % 7 !== 0) cells.push({ type: "pad" });
  return cells;
}

function renderLegend() {
  const el = document.getElementById("service-legend");
  const services = [...serviceColorMap.keys()].sort();
  el.innerHTML = services
    .map(
      (s) =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${ensureServiceColor(s)}"></span>${escapeHtml(s)}</span>`
    )
    .join("");
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("calendar-month-label");
  label.textContent = formatMonthYear(state.calendarMonth);

  const monthReleases = releasesForMonth(state.calendarMonth, state.releases);
  const byDate = new Map();
  for (const r of monthReleases) {
    const key = r.dateKey;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(r);
  }

  const cells = buildCalendarGrid(state.calendarMonth);
  const todayKey = new Date().toISOString().slice(0, 10);

  grid.innerHTML = cells
    .map((cell) => {
      if (cell.type === "pad") return `<div class="cal-cell cal-pad"></div>`;

      const key = cell.date.toISOString().slice(0, 10);
      const items = byDate.get(key) ?? [];
      const isToday = key === todayKey;

      const events = items
        .map((r) => {
          const color = ensureServiceColor(r.service);
          return `<button type="button" class="cal-event" style="--event-color:${color}" data-release-id="${escapeAttr(r.id)}" aria-label="${escapeAttr(
            `${r.service} ${r.version}: ${r.summary}`
          )}">
            <span class="cal-event-head">
              <span class="cal-event-service">${escapeHtml(r.service)}</span>
              <span class="cal-event-version">${escapeHtml(r.version)}</span>
            </span>
            <span class="cal-event-summary">${escapeHtml(r.summary)}</span>
          </button>`;
        })
        .join("");

      return `<div class="cal-cell${isToday ? " cal-today" : ""}">
        <div class="cal-day-num">${cell.day}</div>
        <div class="cal-events">${events}</div>
      </div>`;
    })
    .join("");
}

function getFilteredReleases() {
  let list = [...state.releases];
  const { service, status, version, dateFrom, dateTo } = state.filters;

  if (service) list = list.filter((r) => r.service === service);
  if (status) list = list.filter((r) => r.status === status);
  if (version) list = list.filter((r) => r.version.toLowerCase().includes(version.toLowerCase()));
  if (dateFrom) list = list.filter((r) => r.dateKey >= dateFrom);
  if (dateTo) list = list.filter((r) => r.dateKey <= dateTo);

  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    let cmp = 0;
    if (key === "date") {
      if (!a.date && !b.date) cmp = 0;
      else if (!a.date) cmp = 1;
      else if (!b.date) cmp = -1;
      else cmp = a.date - b.date;
    } else if (key === "service") cmp = a.service.localeCompare(b.service);
    else if (key === "version") cmp = a.version.localeCompare(b.version, undefined, { numeric: true });
    else if (key === "status") cmp = a.status.localeCompare(b.status);
    return cmp * dir;
  });
  return list;
}

function populateFilterOptions() {
  const serviceSel = document.getElementById("filter-service");
  const statusSel = document.getElementById("filter-status");
  const prevService = serviceSel.value;
  const prevStatus = statusSel.value;

  const services = [...new Set(state.releases.map((r) => r.service))].sort();
  const statuses = [...new Set(state.releases.map((r) => r.status))].sort();

  serviceSel.innerHTML =
    '<option value="">All services</option>' +
    services.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
  statusSel.innerHTML =
    '<option value="">All statuses</option>' +
    statuses.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");

  if (services.includes(prevService)) serviceSel.value = prevService;
  if (statuses.includes(prevStatus)) statusSel.value = prevStatus;
}

function renderTable() {
  const tbody = document.getElementById("releases-tbody");
  const count = document.getElementById("releases-count");
  const list = getFilteredReleases();
  const loaded = state.releases.length;

  if (state.loading) {
    count.textContent = `${loaded} loaded · ${state.load.completed} of ${state.load.total} services`;
  } else {
    count.textContent = `${list.length} release${list.length === 1 ? "" : "s"}`;
  }

  if (!list.length) {
    const msg = state.loading
      ? `Loading services… (${state.load.completed} of ${state.load.total} done)`
      : "No releases match the current filters.";
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((r) => {
      const color = ensureServiceColor(r.service);
      return `<tr>
        <td>${formatDisplayDate(r.date)}</td>
        <td><span class="service-badge" style="background:${color}">${escapeHtml(r.service)}</span></td>
        <td>${escapeHtml(r.version)}</td>
        <td>${escapeHtml(r.summary)}</td>
        <td><span class="status-pill">${escapeHtml(r.status)}</span></td>
      </tr>`;
    })
    .join("");

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.sort === state.sortKey) {
      th.classList.add(state.sortDir === "asc" ? "sorted-asc" : "sorted-desc");
    }
  });
}

function renderAll() {
  renderLegend();
  renderCalendar();
  populateFilterOptions();
  renderTable();
}

function appendReleases(batch) {
  if (!batch.length) return;
  state.releases = sortReleases([...state.releases, ...batch]);
  indexReleases(batch);
  for (const r of batch) ensureServiceColor(r.service);
  renderAll();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
}

const releaseById = new Map();

function indexReleases(releases) {
  for (const r of releases) releaseById.set(r.id, r);
}

function openReleaseModal(releaseId) {
  const release = releaseById.get(releaseId);
  if (!release) return;

  const modal = document.getElementById("release-modal");
  const badge = document.getElementById("modal-service-badge");
  const color = ensureServiceColor(release.service);

  badge.textContent = release.service;
  badge.style.background = color;
  document.getElementById("modal-title").textContent = release.version;
  document.getElementById("modal-meta").textContent = `${formatDisplayDate(release.date)} · ${release.status}`;
  document.getElementById("modal-description").textContent = release.summary;

  modal.hidden = false;
  document.body.classList.add("modal-open");
  modal.querySelector(".modal-close")?.focus();
}

function closeReleaseModal() {
  const modal = document.getElementById("release-modal");
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function setError(message) {
  const el = document.getElementById("error-banner");
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function setMainLoading(loading) {
  document.querySelector(".main")?.classList.toggle("is-initial-load", loading);
}

function setRetryEnabled(enabled) {
  document.getElementById("retry-load").disabled = !enabled;
}

function initLoadStatus(tabs) {
  state.load = { total: tabs.length, completed: 0, tabs: new Map() };
  for (const tab of tabs) {
    state.load.tabs.set(tab, { status: "loading", count: 0, error: null });
  }

  const statusEl = document.getElementById("load-status");
  const tabsEl = document.getElementById("load-tabs");
  statusEl.hidden = false;
  tabsEl.innerHTML = tabs
    .map(
      (tab) =>
        `<li class="load-tab is-loading" data-tab="${escapeAttr(tab)}" id="load-tab-${tabId(tab)}">
          <span class="load-tab-dot" aria-hidden="true"></span>
          <span class="load-tab-name">${escapeHtml(tab)}</span>
        </li>`
    )
    .join("");

  updateLoadUI();
}

function tabId(tab) {
  return tab.replace(/[^\w-]/g, "-");
}

function setTabLoadStatus(tab, status, detail = "") {
  const entry = state.load.tabs.get(tab);
  if (!entry) return;
  entry.status = status;
  if (status === "done") entry.count = detail;
  if (status === "error") entry.error = detail;

  const el = document.getElementById(`load-tab-${tabId(tab)}`);
  if (!el) return;

  el.classList.remove("is-loading", "is-done", "is-error");
  if (status === "loading") el.classList.add("is-loading");
  if (status === "done") el.classList.add("is-done");
  if (status === "error") el.classList.add("is-error");

  const nameEl = el.querySelector(".load-tab-name");
  if (status === "done" && typeof detail === "number") {
    nameEl.textContent = `${tab} (${detail})`;
  } else if (status === "error") {
    nameEl.textContent = `${tab} — failed`;
    el.title = detail;
  } else {
    nameEl.textContent = tab;
  }
}

function updateLoadUI() {
  const { total, completed } = state.load;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  document.getElementById("load-progress").style.width = `${pct}%`;
  document.getElementById("load-message").textContent =
    completed < total
      ? `Loading from Google Sheets (${completed} of ${total} services)…`
      : `Finished loading ${total} services.`;
}

function finishLoadStatus() {
  updateLoadUI();
  const statusEl = document.getElementById("load-status");
  setTimeout(() => {
    statusEl.hidden = true;
  }, 2000);
}

function init() {
  if (state.loading) return;

  state.loading = true;
  state.releases = [];
  releaseById.clear();
  serviceColorMap.clear();
  setError(null);
  setMainLoading(true);
  setRetryEnabled(false);

  initLoadStatus(SHEET_TABS);
  renderCalendar();
  renderTable();

  loadReleasesProgressive(SHEET_TABS, {
    onTabStart(tab) {
      setTabLoadStatus(tab, "loading");
    },
    onTabComplete(tab, releases) {
      state.load.completed += 1;
      setTabLoadStatus(tab, "done", releases.length);
      updateLoadUI();
      appendReleases(releases);
    },
    onTabError(tab, err) {
      state.load.completed += 1;
      setTabLoadStatus(tab, "error", err.message || "Failed to load");
      updateLoadUI();
    },
    onAllComplete() {
      state.loading = false;
      setMainLoading(false);
      setRetryEnabled(true);
      finishLoadStatus();

      const errors = [...state.load.tabs.values()].filter((t) => t.status === "error").length;
      if (!state.releases.length) {
        setError(
          errors
            ? "No releases loaded. Some services failed — check sharing and tab names in config.js."
            : "No releases found. Check spreadsheet sharing and SHEET_TABS in config.js."
        );
      } else if (errors) {
        setError(`${errors} service tab(s) failed to load. Showing partial data.`);
      }

      renderTable();
    },
  });
}

function bindEvents() {
  document.getElementById("cal-prev").addEventListener("click", () => {
    state.calendarMonth = addMonths(state.calendarMonth, -1);
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    state.calendarMonth = addMonths(state.calendarMonth, 1);
    renderCalendar();
  });
  document.getElementById("cal-today").addEventListener("click", () => {
    state.calendarMonth = startOfMonth(new Date());
    renderCalendar();
  });

  document.getElementById("calendar-grid").addEventListener("click", (e) => {
    const eventEl = e.target.closest(".cal-event");
    if (!eventEl?.dataset.releaseId) return;
    openReleaseModal(eventEl.dataset.releaseId);
  });

  const modal = document.getElementById("release-modal");
  modal.querySelectorAll("[data-modal-close]").forEach((el) => {
    el.addEventListener("click", closeReleaseModal);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeReleaseModal();
  });

  document.getElementById("filter-service").addEventListener("change", (e) => {
    state.filters.service = e.target.value;
    renderTable();
  });
  document.getElementById("filter-status").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    renderTable();
  });
  document.getElementById("filter-version").addEventListener("input", (e) => {
    state.filters.version = e.target.value;
    renderTable();
  });
  document.getElementById("filter-date-from").addEventListener("change", (e) => {
    state.filters.dateFrom = e.target.value;
    renderTable();
  });
  document.getElementById("filter-date-to").addEventListener("change", (e) => {
    state.filters.dateTo = e.target.value;
    renderTable();
  });
  document.getElementById("clear-filters").addEventListener("click", () => {
    state.filters = { service: "", status: "", version: "", dateFrom: "", dateTo: "" };
    document.getElementById("filter-service").value = "";
    document.getElementById("filter-status").value = "";
    document.getElementById("filter-version").value = "";
    document.getElementById("filter-date-from").value = "";
    document.getElementById("filter-date-to").value = "";
    renderTable();
  });

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      renderTable();
    });
  });

  document.getElementById("retry-load").addEventListener("click", init);
}

bindEvents();
init();
