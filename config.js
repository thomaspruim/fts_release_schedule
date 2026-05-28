/** Spreadsheet ID from the Google Sheets URL */
export const SPREADSHEET_ID = "1eH2b1PJB19GoqPNCo2qyQUXS3TZGE93iQKUA0w1DuXE";

/** Each tab is one service/platform */
export const SHEET_TABS = [
  "KeplerCTV-Web",
  "React Web",
  "React Native",
  "Roku SmartTV",
  "Android/FireTV",
  "tvOS",
  "FLM",
  "DeNiro",
];

/** Header aliases (case-insensitive) for column detection */
export const COLUMN_ALIASES = {
  date: [
    "launch date",
    "release date or estimate",
    "release date",
    "date",
    "planned date",
    "target date",
    "go-live",
    "go live",
  ],
  version: ["release", "release version", "version"],
  summary: ["feature", "key features", "summary", "description", "notes", "release notes"],
  status: ["development status", "status", "state", "phase"],
};

/** Distinct colors per service (cycles if more services than colors) */
export const SERVICE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#ea580c",
  "#db2777",
  "#4f46e5",
  "#0d9488",
];
