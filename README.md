# Release Schedule

A single-page dashboard that reads your [Google Spreadsheet](https://docs.google.com/spreadsheets/d/1eH2b1PJB19GoqPNCo2qyQUXS3TZGE93iQKUA0w1DuXE/edit) and shows:

1. **Release calendar** — releases on their dates, labeled with **Service**, **Version**, and **Summary** (each service/tab has its own color).
2. **All releases** — combined list with sort (date, service, version, status) and filters.

Each **tab** is one **service** (KeplerCTV-Web, React Web, React Native, Roku SmartTV, Android/FireTV, tvOS, FLM, DeNiro).

## Spreadsheet setup

The page loads data via Google’s **gviz** API. The sheet must be **Anyone with the link → Viewer**.

### Column layouts (auto-detected)

Most tabs use:

| Release | Feature | Development Status | Launch Date | Notes |

Some tabs differ (e.g. **DeNiro** uses Release Date, Release Version, Summary, Status; **Android/FireTV** uses Release, Key Features, Launch Date). The parser maps these automatically.

- **Release** version carries down to following rows until the next version.
- **Launch Date** on a version row applies to features below it until the next dated row.
- Rows **without** a launch date still appear in the **All releases** table (date shows as —).
- Only rows **with** a date appear on the **calendar**.

## Run locally

ES modules need a local server (not `file://`):

```bash
cd "/Users/thomas.pruim/Release Schedule"
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Configuration

Edit `config.js`:

- `SPREADSHEET_ID` — from the sheet URL
- `SHEET_TABS` — list of tab names (services)
- `COLUMN_ALIASES` — extra header names if yours differ
- `SERVICE_COLORS` — palette for the calendar and table badges

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Sign-in / access error | Share sheet as **Anyone with the link** (Viewer) |
| Missing services | Add every tab name to `SHEET_TABS` |
| Empty calendar | Ensure a **date** column exists and dates are valid |
| CORS / failed fetch | Serve over `http://localhost`, not `file://` |
