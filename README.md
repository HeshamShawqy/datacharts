<p align="center">
  <img src="assets\logo.png" alt="Data Muncher" width="200"/>
</p>

# Data Muncher 

**Modern web data visualisation, live inside Rhino.**

Built at AEC Tech Hackathon 2026 by a ridiculously talented group of people from across the industry - architects, engineers, computational designers - who all shared the same frustration: Grasshopper gives you the data, but it's challenging to look at it.

---

## The idea

Existing GH plugins stop at panels and basic charts. Data Muncher goes further - it bridges your parametric geometry with D3.js, one of the most powerful data visualisation libraries on the web, and renders the result as a live dashboard directly inside Rhino's viewport.

Move a slider. Watch the treemap reflow. No tab switching. No spreadsheets. No server.

---

## How it works

```
Grasshopper
  └── GhPython component
        ├── receives names, values, parents from your definition
        ├── serialises to gh_dashboard.json
        └── fires up a local HTTP server (localhost:8080)
              └── serves index.html + data
                    └── Eto.WebView panel opens inside Rhino
                          └── D3.js renders live charts
                                └── auto-refreshes every 2s
```

The architecture is deliberately lightweight. No cloud. No external dependencies at runtime. The browser talks to `localhost` — everything stays on your machine.

---

## Chart types

- Treemap — space program breakdowns, area by zone
- Bar chart — comparative values
- Circle packing — hierarchical data
- Radial — proportional distribution
- Sankey — flow and allocation *(in progress)*

---

## How to test it

1. Clone the repo
2. Open the `.gh` file in Rhino 8 + Grasshopper
3. Connect your data (names, values, parents lists) to the GhPython component
4. **Update the file paths** inside `gh_component_viewport.py` — specifically `SERVE_DIR` to point to your local clone directory
5. Set `enable` to `True` and run

The Eto panel will open automatically and the dashboard will appear. If you just want to test with sample data, the repo includes `gh_dashboard.json` with a working dataset - open `index.html` directly in a browser to see it render.

> No internet required once D3.js is cached. For fully offline use, download `d3.min.js` locally and update the script src in `index.html`.

---

## Dependencies

- Rhino 8
- Grasshopper + GhPython
- Python standard library (`http.server`, `json`, `threading`)
- D3.js v7 via CDN - loaded once, cached by browser

---

## The team

Built in 24 hours at AEC Tech Hackathon 2026 by a team spanning Zaha Hadid Architects, Populous, KPF, Heatherwick Studio, Grimshaw Architects, AA DRL, and AA Emtech. Nine people. One shared frustration. One weekend.
- Hesham Shawqy
- Joanna Sabak 
- Michal Scigaj 
- Jonathan Wong 
- Matea Pinjušić 
- Naman Patel 
- Supreeth Vijayakumar 
- Zeynep Çolak 
- Maria Paula
---

## What's next

- Expanded chart library, parallel coordinates, force graph
- Publish to Food4Rhino as a proper GH plugin

---

*Data Muncher. Because your parametric data deserves better than a panel*
