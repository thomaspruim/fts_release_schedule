#!/usr/bin/env python3
import json, re, urllib.parse, urllib.request

SPREADSHEET_ID = "1eH2b1PJB19GoqPNCo2qyQUXS3TZGE93iQKUA0w1DuXE"
TABS = [
    "KeplerCTV-Web",
    "React Web",
    "React Native",
    "Roku SmartTV",
    "Android/FireTV",
    "tvOS",
    "FLM",
    "DeNiro",
]

def fetch(tab):
    q = urllib.parse.urlencode({"sheet": tab, "headers": "1", "tqx": "out:json"})
    url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?{q}"
    text = urllib.request.urlopen(url).read().decode()
    m = re.search(r"setResponse\((.*)\);?\s*$", text, re.S)
    return json.loads(m.group(1))

for tab in TABS:
    d = fetch(tab)
    cols = [c.get("label", "") for c in d["table"]["cols"]]
    rows = d["table"]["rows"]
    dated = 0
    for row in rows:
        c = row.get("c") or []
        for cell in c:
            if cell and cell.get("v") and str(cell.get("v", "")).startswith("Date("):
                dated += 1
                break
    print(f"{tab}: cols={cols[:5]} rows={len(rows)} dated_rows={dated}")
