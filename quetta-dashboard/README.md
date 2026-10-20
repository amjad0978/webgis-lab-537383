# Quetta Disaster Response Map

A static Leaflet dashboard for disaster situational awareness in Quetta, Balochistan. It maps hospitals and clinics, fire and police stations, emergency shelters or assembly points, and recent USGS earthquakes within 500 km. It also shows current weather and air-quality conditions as context.

**This map is not an emergency dispatch system or an official warning service.** OpenStreetMap facility coverage may be incomplete or outdated. Verify locations, earthquake reports, weather alerts, and response instructions with official authorities before acting.

## Data and sources

- Quetta district boundary from the supplied district vector data.
- Emergency facilities from OpenStreetMap via the Geofabrik Pakistan extract: hospitals/clinics, fire stations, police stations, and shelters/assembly points. The facilities are clipped to the district boundary; names, categories, OSM IDs, and source attribution are included where available.
- Recent earthquakes from the USGS past-month GeoJSON feed, filtered to 500 km of Quetta. The dashboard falls back to browser cache and then `data/earthquakes_backup.geojson`.
- Current weather and air-quality context from Open-Meteo.

Facility counts reflect mapped OSM features, not a verified or complete register. Earthquake data is informational and should not be interpreted as a prediction or an official alert.

The included October 18, 2026 OSM snapshot contains 26 hospital/clinic features, 1 fire-station feature, 21 police features, and 3 shelter/assembly-point features. Counts represent mapped OSM objects, not necessarily unique or currently operating facilities.

## Prepare data

The preparation script scans `C:\webgis-data` and `C:\webgis-lab` for the Quetta district boundary and OSM-like vector sources. It can download and process the current Pakistan OpenStreetMap extract for emergency facilities. GIS packages (`geopandas`, `shapely`, and `pyproj`) are available in the QGIS Python runtime. On Windows:

```powershell
Set-Location C:\webgis-lab\quetta-dashboard
& $env:ComSpec /c 'call "C:\Program Files\QGIS 3.40.6\bin\python-qgis-ltr.bat" prepare_data.py --download-osm'
```

The download option fetches the current 150+ MB Pakistan OSM snapshot, extracts the four response-facility categories for Quetta, and removes the temporary PBF afterward. To reuse an existing extract, pass `--osm-pbf C:\path\to\pakistan-latest.osm.pbf`. To use different input folders, append `--data-root <path> --lab-root <path>`. The script downloads a USGS earthquake backup; internet access is required unless `--reuse-earthquake-backup` is used.

Outputs are written to `data/`: the district boundary, the four emergency-facility GeoJSON files, and the USGS earthquake backup. Generated GeoJSON files are checked to remain below 5 MB.

## Run locally

```powershell
Set-Location C:\webgis-lab\quetta-dashboard
python -m http.server 8000
```

Open <http://localhost:8000>. A local HTTP server is required because browsers block `fetch()` from `file://` URLs. Basemaps, live feeds, routing, and CDN libraries require internet access; cached earthquakes are available offline where possible. Click hospital or emergency-facility markers to view details and route there; click an earthquake marker or list entry to inspect the USGS event.

## Publish

The dashboard is published from the `quetta-dashboard` folder in the `webgis-lab-537383` repository. GitHub Pages serves the repository's `main` branch from its root: <https://amjad0978.github.io/webgis-lab-537383/quetta-dashboard/>.
