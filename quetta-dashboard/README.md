# Quetta GIS Dashboard

A static Leaflet dashboard designed for GitHub Pages. It displays the Quetta district boundary, a population choropleth, local facilities, parks, nearby earthquakes, and live Open-Meteo weather/air-quality conditions.

The interface uses a charcoal-and-teal dark theme. The map basemap remains selectable, including a dark CartoDB option.

## Prepare data

The data preparation script scans `C:\webgis-data` and `C:\webgis-lab` for district/population and OSM-like vector files. It can also download the latest Pakistan OpenStreetMap extract from Geofabrik and clip healthcare, school, and park features to Quetta. From this machine's supplied files it selects:

- District name field: `adm2_name` in `districts_A.geojson`.
- Population field: `pop_2023` in `C:\webgis-lab\data\districts.geojson` (Quetta: 2,595,492).
- No OSM `fclass` facility layer or finer-scale population layer was supplied locally. The latest Geofabrik Pakistan OSM extract was downloaded and processed; it provides healthcare facilities, schools, and parks. The population polygon uses the district-level 2023 census total; no newer local population source or union-council/tehsil layer was found.

GIS packages (`geopandas`, `shapely`, and `pyproj`) are already installed in the QGIS Python runtime. On Windows, run the script using the QGIS environment launcher:

```powershell
Set-Location C:\webgis-lab\quetta-dashboard
& $env:ComSpec /c 'call "C:\Program Files\QGIS 3.40.6\bin\python-qgis-ltr.bat" prepare_data.py --download-osm'
```

The `--download-osm` option downloads the current 150+ MB Pakistan snapshot to a temporary folder, extracts features near Quetta, and removes the PBF afterward. To reuse a PBF already downloaded, pass `--osm-pbf C:\path\to\pakistan-latest.osm.pbf`. To use different district/population input folders, append `--data-root <path> --lab-root <path>`. The script downloads the USGS monthly earthquake GeoJSON; internet access is required for live-source refreshes.

## Run locally

```powershell
Set-Location C:\webgis-lab\quetta-dashboard
python -m http.server 8000
```

Open <http://localhost:8000>. The initial view is the Quetta district; panning stays near Quetta and can extend to nearby earthquake markers. The map cannot pan around all of Pakistan. A local HTTP server is required because browsers block `fetch()` from `file://` URLs. The map basemaps, live feeds, routing, and CDN libraries require an internet connection; cached earthquakes/weather and the local earthquake backup provide offline data where available. Click facility and earthquake markers (or an earthquake list entry) to open details.

## Update population / facility data

Replace the source files with data that intersects Quetta, then run `prepare_data.py` again. Population values are exported to `data/population.geojson` as an editable `population` property. Parks include `area_m2`, `area_ha`, and `area_acres`, computed in EPSG:32642. The USGS backup is limited to events within 500 km of Quetta. Generated GeoJSON files are simplified and checked to remain below 5 MB.

## GitHub Pages

This dashboard is published from the `quetta-dashboard` folder in the `webgis-lab-537383` repository. GitHub Pages serves the repository's `main` branch from its root, so the dashboard is available at <https://amjad0978.github.io/webgis-lab-537383/quetta-dashboard/> after the latest commit has deployed.
