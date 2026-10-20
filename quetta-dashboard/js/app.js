(() => {
  "use strict";

  const QUETTA = [30.141413, 67.077434];
  const MAX_QUAKE_DISTANCE_KM = 500;
  const DATA_VERSION = "20261020";
  const DATA_FILES = {
    boundary: "data/quetta_district.geojson",
    population: "data/population.geojson",
    hospitals: "data/hospitals.geojson",
    schools: "data/schools.geojson",
    parks: "data/parks.geojson",
    earthquakes: "data/earthquakes_backup.geojson"
  };
  const COLORS = {
    hospitals: "#e45252",
    schools: "#3d82d5",
    parks: "#2d9a6e",
    earthquakes: "#e08a36"
  };

  const map = L.map("map", {
    zoomControl: true,
    maxZoom: 19,
    maxBoundsViscosity: 1
  }).setView(QUETTA, 10);
  const tileOptions = { maxZoom: 19, crossOrigin: true };
  const baseLayers = {
    "OpenStreetMap": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      ...tileOptions, attribution: "&copy; OpenStreetMap contributors"
    }),
    "Esri World Imagery": L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { ...tileOptions, attribution: "Tiles &copy; Esri" }
    ),
    "Esri imagery with labels": L.layerGroup([
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        ...tileOptions, attribution: "Tiles &copy; Esri"
      }),
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { ...tileOptions, attribution: "Labels &copy; Esri" }
      )
    ]),
    "CartoDB Dark": L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { ...tileOptions, subdomains: "abcd", attribution: "&copy; OpenStreetMap contributors &copy; CARTO" }
    )
  };
  baseLayers.OpenStreetMap.addTo(map);
  L.control.layers(baseLayers, {}, { position: "topright", collapsed: true }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);

  const layerGroups = {
    boundary: L.featureGroup().addTo(map),
    population: L.featureGroup().addTo(map),
    hospitals: L.featureGroup().addTo(map),
    schools: L.featureGroup().addTo(map),
    parks: L.featureGroup().addTo(map),
    earthquakes: L.featureGroup().addTo(map)
  };
  const state = {
    quettaFeature: null,
    quettaBounds: null,
    population: null,
    hospitals: [],
    schools: [],
    parks: [],
    earthquakes: [],
    searchItems: [],
    start: null,
    waitingForStart: false,
    clickedPoint: null,
    earthquakeLayer: null,
    routeControl: null,
    measurePoints: [],
    measureLine: null,
    userMarker: null,
    facilitiesChart: null,
    parksChart: null
  };

  const messageArea = document.getElementById("message-area");
  const htmlEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
  const numberFormat = (value, maximumFractionDigits = 0) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits });

  function showMessage(text, type = "warning") {
    const message = document.createElement("div");
    message.className = `message ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
    message.textContent = text;
    messageArea.appendChild(message);
  }

  async function loadJson(path) {
    const url = path.startsWith("data/") ? `${path}?v=${DATA_VERSION}` : path;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  function propertyValue(properties, names) {
    const keys = Object.keys(properties || {});
    const normalized = new Map(keys.map((key) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), key]));
    for (const name of names) {
      const found = normalized.get(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
      if (found && properties[found] !== null && properties[found] !== "") return properties[found];
    }
    return null;
  }

  function featureName(feature, fallback) {
    return propertyValue(feature.properties, ["name", "name_en", "name:en", "official_name", "operator"]) || fallback;
  }

  function routeButton(latlng) {
    return `<button class="popup-action" type="button" data-route-lat="${latlng.lat}" data-route-lng="${latlng.lng}">Get Directions</button>`;
  }

  function bindFeaturePopup(feature, layer, kind) {
    const props = feature.properties || {};
    let location;
    if (layer.getLatLng) location = layer.getLatLng();
    else if (layer.getBounds) location = layer.getBounds().getCenter();
    if (!location) return;
    const title = htmlEscape(featureName(feature, kind.slice(0, -1)));
    let details = "";
    if (kind === "parks") {
      const area = Number(props.area_m2 || 0);
      details = `<br>Area: ${numberFormat(area, 2)} m²<br>${numberFormat(props.area_ha, 4)} ha · ${numberFormat(props.area_acres, 4)} acres`;
    } else if (kind === "earthquakes") {
      details = `<br>Magnitude: ${numberFormat(props.mag, 1)}<br>${htmlEscape(props.place || "Location unavailable")}`;
    } else if (kind === "hospitals" || kind === "schools") {
      const category = propertyValue(props, ["fclass", "class"]);
      if (category) details = `<br>${htmlEscape(category)}`;
    } else if (kind === "population") {
      details = `<br>Population: ${numberFormat(props.population)}`;
    }
    layer.bindPopup(`<div class="popup-title">${title}</div>${details}${routeButton(location)}`);
    layer.on("click", () => {
      state.clickedPoint = location;
      if (state.waitingForStart) setStart(location);
      if (document.getElementById("measure").classList.contains("active")) addMeasurePoint(location);
    });
  }

  function populationColor(population) {
    const value = Number(population);
    if (!Number.isFinite(value) || value <= 0) return "#dbe7e5";
    if (value > 1_000_000) return "#187e75";
    if (value > 500_000) return "#42a995";
    if (value > 100_000) return "#83c8ad";
    return "#c4e5d5";
  }

  function makeFacilityLayer(features, kind) {
    const group = L.geoJSON(features, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: kind === "parks" ? 6 : 6,
        color: "#ffffff",
        weight: 1.3,
        fillColor: COLORS[kind],
        fillOpacity: 0.9
      }),
      style: { color: COLORS[kind], weight: 2, fillColor: COLORS[kind], fillOpacity: 0.24 },
      onEachFeature: (feature, layer) => bindFeaturePopup(feature, layer, kind)
    });
    group.eachLayer((layer) => {
      const feature = layer.feature;
      if (!feature) return;
      const item = { feature, layer, kind, name: featureName(feature, kind.slice(0, -1)) };
      if (kind !== "earthquakes") state.searchItems.push(item);
    });
    return group;
  }

  function makeBoundary(feature) {
    const boundary = L.geoJSON(feature, {
      style: { color: "#123e54", weight: 3, opacity: 0.95, fillColor: "#45b5a1", fillOpacity: 0.06 },
      onEachFeature: (item, layer) => bindFeaturePopup(item, layer, "boundary")
    });
    const districtBounds = boundary.getBounds();
    state.quettaBounds = districtBounds;
    map.setMaxBounds(districtBounds.pad(0.08));
    map.setMinZoom(map.getBoundsZoom(districtBounds));
    const population = L.geoJSON(state.population, {
      style: (item) => ({
        color: "#267b71", weight: 1.5,
        fillColor: populationColor(item.properties?.population),
        fillOpacity: 0.5
      }),
      onEachFeature: (item, layer) => bindFeaturePopup(item, layer, "population")
    });
    layerGroups.boundary.addLayer(boundary);
    layerGroups.population.addLayer(population);
    state.searchItems = [];
    if (state.population?.features) {
      state.population.features.forEach((item) => state.searchItems.push({
        feature: item, kind: "population", name: "Quetta population"
      }));
    }
  }

  function styleLayerCheckboxes() {
    Object.keys(layerGroups).forEach((key) => {
      const checkbox = document.getElementById(`layer-${key}`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) layerGroups[key].addTo(map);
        else map.removeLayer(layerGroups[key]);
      });
    });
  }

  function updateStats() {
    document.getElementById("stat-hospitals").textContent = numberFormat(state.hospitals.length);
    document.getElementById("stat-schools").textContent = numberFormat(state.schools.length);
    document.getElementById("stat-parks").textContent = numberFormat(state.parks.length);
    const parkArea = state.parks.reduce((sum, feature) => sum + Number(feature.properties.area_ha || 0), 0);
    document.getElementById("stat-park-area").textContent = numberFormat(parkArea, 2);
    const population = (state.population?.features || []).reduce(
      (sum, feature) => sum + Number(feature.properties?.population || 0), 0
    );
    document.getElementById("stat-population").textContent = population ? numberFormat(population) : "Edit data";
    document.getElementById("population-source").textContent = population
      ? "Quetta district census" : "editable in population.geojson";
  }

  function buildCharts() {
    if (typeof Chart === "undefined") {
      showMessage("Chart.js did not load. Check internet access or the Chart.js CDN URL in index.html.", "error");
      return;
    }
    if (state.facilitiesChart) state.facilitiesChart.destroy();
    if (state.parksChart) state.parksChart.destroy();
    state.facilitiesChart = new Chart(document.getElementById("facilities-chart"), {
      type: "bar",
      data: {
        labels: ["Hospitals", "Schools", "Parks"],
        datasets: [{
          data: [state.hospitals.length, state.schools.length, state.parks.length],
          backgroundColor: [COLORS.hospitals, COLORS.schools, COLORS.parks],
          borderRadius: 5,
          maxBarThickness: 30
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "#172832", titleColor: "#edf4f7", bodyColor: "#d6e2e8" }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#a4b5bf", font: { size: 9 } } },
          y: { beginAtZero: true, grid: { color: "#293a46" }, ticks: { precision: 0, color: "#a4b5bf", font: { size: 9 } } }
        }
      }
    });

    const topParks = [...state.parks].sort((a, b) =>
      Number(b.properties.area_m2 || 0) - Number(a.properties.area_m2 || 0)
    ).slice(0, 5);
    state.parksChart = new Chart(document.getElementById("parks-chart"), {
      type: "bar",
      data: {
        labels: topParks.map((feature) => featureName(feature, "Unnamed park")),
        datasets: [{
          data: topParks.map((feature) => Number(feature.properties.area_ha || 0)),
          backgroundColor: "#48a985",
          borderRadius: 4,
          maxBarThickness: 22
        }]
      },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#172832",
            titleColor: "#edf4f7",
            bodyColor: "#d6e2e8",
            callbacks: { label: (item) => `${numberFormat(item.raw, 2)} ha` }
          }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: "#293a46" }, ticks: { color: "#a4b5bf", font: { size: 8 } } },
          y: { grid: { display: false }, ticks: { color: "#b6c4cc", font: { size: 8 } } }
        }
      }
    });
  }

  function buildParksTable() {
    const body = document.getElementById("parks-table");
    const sorted = [...state.parks].sort((a, b) =>
      Number(b.properties.area_m2 || 0) - Number(a.properties.area_m2 || 0)
    );
    document.getElementById("park-count-label").textContent = `${sorted.length} parks`;
    if (!sorted.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-cell">No park features in the supplied data.</td></tr>';
      return;
    }
    body.innerHTML = sorted.map((feature, index) => {
      feature._dashboardIndex = index;
      return `<tr data-park-index="${index}"><td>${htmlEscape(featureName(feature, "Unnamed park"))}</td><td>${numberFormat(feature.properties.area_m2, 1)}</td><td>${numberFormat(feature.properties.area_ha, 3)}</td><td>${numberFormat(feature.properties.area_acres, 3)}</td></tr>`;
    }).join("");
    body.querySelectorAll("[data-park-index]").forEach((row) => {
      row.addEventListener("click", () => {
        const feature = sorted[Number(row.dataset.parkIndex)];
        const bounds = L.geoJSON(feature).getBounds();
        map.fitBounds(bounds, { maxZoom: 16, padding: [30, 30] });
        const match = layerGroups.parks.getLayers().find((layer) => layer.feature === feature);
        if (match?.openPopup) match.openPopup();
      });
    });
  }

  async function loadLocalData() {
    const outcomes = await Promise.all(Object.entries(DATA_FILES).map(async ([name, path]) => {
      try {
        return [name, await loadJson(path)];
      } catch (error) {
        showMessage(`Could not load ${path}: ${error.message}. Fix: restore the file in the data folder, then run prepare_data.py again.`, "error");
        return [name, null];
      }
    }));
    const data = Object.fromEntries(outcomes);
    if (data.boundary?.features?.length) {
      state.quettaFeature = data.boundary;
      state.population = data.population || { type: "FeatureCollection", features: [] };
      makeBoundary(data.boundary);
      map.fitBounds(state.quettaBounds, { padding: [18, 18] });
    } else {
      showMessage("Quetta boundary is unavailable. Fix: place a valid Quetta polygon at data/quetta_district.geojson and reload.", "error");
    }

    for (const kind of ["hospitals", "schools", "parks"]) {
      const features = data[kind]?.features || [];
      state[kind] = features;
      layerGroups[kind].addLayer(makeFacilityLayer(data[kind] || { type: "FeatureCollection", features: [] }, kind));
    }
    updateStats();
    buildCharts();
    buildParksTable();

    const totalFacilities = state.hospitals.length + state.schools.length + state.parks.length;
    if (totalFacilities === 0) {
      showMessage("No OSM facility extract was found during data preparation. Hospitals, schools, and parks remain empty. Add an OSM GeoJSON/shapefile with an fclass field under C:\\webgis-data, then run prepare_data.py again.", "warning");
    }
    await loadEarthquakes(data.earthquakes);
    document.getElementById("loading").classList.add("hidden");
  }

  function localCacheGet(key) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      showMessage(`Offline cache could not be read (${error.message}). Check browser storage permissions.`, "warning");
      return null;
    }
  }

  function localCacheSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: value }));
    } catch (error) {
      showMessage(`Offline cache could not be saved (${error.message}). Enable browser storage to retain live data offline.`, "warning");
    }
  }

  function cacheData(key) {
    const item = localCacheGet(key);
    return item?.data || null;
  }

  function quettaPoint() {
    return turf.point([QUETTA[1], QUETTA[0]]);
  }

  function earthquakeLayer(features) {
    const nearby = (features || []).filter((feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!coordinates || coordinates.length < 2) return false;
      return turf.distance(quettaPoint(), turf.point([coordinates[0], coordinates[1]]), { units: "kilometers" }) <= MAX_QUAKE_DISTANCE_KM;
    });
    const earthquakeBounds = state.quettaBounds?.pad(0.08) || L.latLngBounds(QUETTA, QUETTA);
    nearby.forEach((feature) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      earthquakeBounds.extend([latitude, longitude]);
    });
    map.setMaxBounds(earthquakeBounds.pad(0.05));
    state.earthquakes = nearby;
    const collection = { type: "FeatureCollection", features: nearby };
    const layer = L.geoJSON(collection, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: Math.max(4, Math.min(16, 3 + Number(feature.properties?.mag || 0) * 2)),
        color: "#fff",
        weight: 1,
        fillColor: COLORS.earthquakes,
        fillOpacity: 0.72
      }),
      onEachFeature: (feature, item) => bindFeaturePopup(feature, item, "earthquakes")
    });
    layerGroups.earthquakes.clearLayers();
    layerGroups.earthquakes.addLayer(layer);
    state.earthquakeLayer = layer;
    document.getElementById("quake-count").textContent = `${nearby.length} nearby`;
    document.getElementById("quake-message").textContent = nearby.length
      ? `Showing ${nearby.length} earthquake${nearby.length === 1 ? "" : "s"} within 500 km.`
      : "No earthquakes within 500 km in the available feed.";
    const quakeList = document.getElementById("quake-list");
    quakeList.innerHTML = nearby
      .slice().sort((a, b) => Number(b.properties?.mag || 0) - Number(a.properties?.mag || 0)).slice(0, 8)
      .map((feature) => `<li><button type="button" class="quake-item" data-quake-id="${htmlEscape(feature.id || feature.properties?.code || "")}"><span>${htmlEscape(feature.properties?.place || "Location unavailable")}</span><strong>M ${numberFormat(feature.properties?.mag, 1)}</strong></button></li>`).join("");
    quakeList.querySelectorAll("[data-quake-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const feature = nearby.find((item) =>
          String(item.id || item.properties?.code || "") === button.dataset.quakeId
        );
        if (!feature) return;
        const [longitude, latitude] = feature.geometry.coordinates;
        const point = L.latLng(latitude, longitude);
        map.setView(point, Math.max(map.getZoom(), 11));
        state.earthquakeLayer?.eachLayer((marker) => {
          if (marker.feature === feature) marker.openPopup();
        });
      });
    });
  }

  async function loadEarthquakes(backup) {
    const status = document.getElementById("quake-status");
    try {
      const live = await loadJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson");
      localCacheSet("quetta-earthquake-cache", live);
      earthquakeLayer(live.features || []);
      status.textContent = "Live feed";
      status.classList.add("live");
      return;
    } catch (liveError) {
      const cached = cacheData("quetta-earthquake-cache");
      if (cached?.features) {
        earthquakeLayer(cached.features);
        status.textContent = "Offline cache";
        status.classList.add("offline");
        showMessage(`Live earthquake feed unavailable (${liveError.message}); showing cached data.`, "warning");
        return;
      }
      if (backup?.features) {
        earthquakeLayer(backup.features);
        status.textContent = "Offline backup";
        status.classList.add("offline");
        showMessage(`Live earthquake feed and local cache unavailable; showing data/earthquakes_backup.geojson.`, "warning");
        return;
      }
      earthquakeLayer([]);
      status.textContent = "Unavailable";
      status.classList.add("offline");
      document.getElementById("quake-message").textContent = "No live, cached, or local earthquake data is available.";
      showMessage("Earthquake data failed. Fix: check connectivity, clear the invalid localStorage cache if needed, or restore data/earthquakes_backup.geojson.", "error");
    }
  }

  function formatWeather(values) {
    document.getElementById("weather-temp").textContent = `${numberFormat(values.temperature, 1)}°`;
    document.getElementById("weather-wind").textContent = numberFormat(values.wind, 1);
    document.getElementById("weather-aqi").textContent = values.aqi == null ? "—" : numberFormat(values.aqi);
  }

  async function loadWeather() {
    const status = document.getElementById("weather-status");
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${QUETTA[0]}&longitude=${QUETTA[1]}&current=temperature_2m,wind_speed_10m&wind_speed_unit=kmh`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${QUETTA[0]}&longitude=${QUETTA[1]}&current=european_aqi,pm2_5`;
    try {
      const [weatherResponse, airResponse] = await Promise.all([loadJson(weatherUrl), loadJson(airUrl)]);
      const values = {
        temperature: weatherResponse.current?.temperature_2m,
        wind: weatherResponse.current?.wind_speed_10m,
        aqi: airResponse.current?.european_aqi
      };
      formatWeather(values);
      localCacheSet("quetta-weather-cache", values);
      status.textContent = "Live";
      status.classList.add("live");
      document.getElementById("weather-note").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Open-Meteo`;
    } catch (error) {
      const cached = cacheData("quetta-weather-cache");
      status.textContent = cached ? "Offline cache" : "Offline";
      status.classList.add("offline");
      if (cached) {
        formatWeather(cached);
        document.getElementById("weather-note").textContent = `Live weather unavailable (${error.message}); showing cached conditions.`;
      } else {
        document.getElementById("weather-note").textContent = `Offline: weather could not load (${error.message}). Reconnect to refresh; the dashboard will retry on reload.`;
      }
    }
  }

  function setStart(latlng) {
    state.start = L.latLng(latlng.lat, latlng.lng);
    state.waitingForStart = false;
    document.getElementById("route-summary").textContent = `Start set: ${state.start.lat.toFixed(4)}, ${state.start.lng.toFixed(4)}`;
    document.getElementById("set-start").classList.remove("active");
    showMessage("Route start point set. Select Get Directions in a map popup.", "success");
  }

  function showRoute(destination) {
    if (!state.start) {
      showMessage("Choose a route start first: use From my location or Click map to set start.", "warning");
      return;
    }
    if (state.routeControl) map.removeControl(state.routeControl);
    if (!L.Routing) {
      showMessage("Leaflet Routing Machine did not load. Check the CDN connection and reload.", "error");
      return;
    }
    state.routeControl = L.Routing.control({
      waypoints: [state.start, L.latLng(destination.lat, destination.lng)],
      router: L.Routing.osrmv1({ serviceUrl: "https://router.project-osrm.org/route/v1" }),
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: false,
      routeWhileDragging: false,
      createMarker: () => null,
      lineOptions: { styles: [{ color: "#12a99a", opacity: 0.86, weight: 6 }] }
    }).addTo(map);
    state.routeControl.on("routesfound", (event) => {
      const route = event.routes[0];
      document.getElementById("route-summary").textContent =
        `${(route.summary.totalDistance / 1000).toFixed(1)} km · ${Math.round(route.summary.totalTime / 60)} min`;
    });
    state.routeControl.on("routingerror", (event) => {
      const detail = event.error?.message || "OSRM could not find a route.";
      showMessage(`Directions failed: ${detail}. Check internet access or select a routable destination.`, "error");
    });
  }

  function locateUser(onSuccess) {
    if (!navigator.geolocation) {
      showMessage("This browser does not support geolocation. Use Click map to set start instead.", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = L.latLng(position.coords.latitude, position.coords.longitude);
        if (state.userMarker) map.removeLayer(state.userMarker);
        state.userMarker = L.circleMarker(point, {
          radius: 7, color: "#fff", weight: 2, fillColor: "#1868a8", fillOpacity: 1
        }).addTo(map).bindTooltip("Your location");
        map.setView(point, 13);
        state.clickedPoint = point;
        if (onSuccess) onSuccess(point);
        else showMessage("Your location is shown on the map.", "success");
      },
      (error) => showMessage(`Could not get your location (${error.message}). Allow location access or click the map to set a point.`, "error"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function hospitalPoint(feature) {
    if (feature.geometry?.type === "Point") return feature;
    return turf.centroid(feature);
  }

  function findNearestHospital(origin) {
    if (!state.hospitals.length) {
      showMessage("No hospitals are in the current data. Add an OSM fclass hospital/clinic layer and rerun prepare_data.py.", "warning");
      return;
    }
    const originFeature = turf.point([origin.lng, origin.lat]);
    let nearest = null;
    for (const hospital of state.hospitals) {
      const candidate = hospitalPoint(hospital);
      const distance = turf.distance(originFeature, candidate, { units: "kilometers" });
      if (!nearest || distance < nearest.distance) nearest = { feature: hospital, point: candidate, distance };
    }
    const coordinates = nearest.point.geometry.coordinates;
    const target = L.latLng(coordinates[1], coordinates[0]);
    map.setView(target, Math.max(map.getZoom(), 14));
    const name = featureName(nearest.feature, "Hospital");
    L.popup().setLatLng(target).setContent(
      `<div class="popup-title">${htmlEscape(name)}</div>${nearest.distance.toFixed(2)} km away${routeButton(target)}`
    ).openOn(map);
    showMessage(`Nearest hospital: ${name}, ${nearest.distance.toFixed(2)} km away.`, "success");
  }

  function activateMeasure() {
    map.getContainer().classList.add("measuring");
    document.getElementById("measure").classList.add("active");
    document.getElementById("measure-summary").textContent = "Click map to add distance points.";
  }

  function clearMeasure() {
    state.measurePoints = [];
    if (state.measureLine) map.removeLayer(state.measureLine);
    state.measureLine = null;
    document.getElementById("measure-summary").textContent = "Distance: —";
    document.getElementById("measure").classList.remove("active");
  }

  function addMeasurePoint(latlng) {
    state.measurePoints.push(latlng);
    if (state.measureLine) map.removeLayer(state.measureLine);
    state.measureLine = L.polyline(state.measurePoints, { color: "#8d52bd", weight: 3, dashArray: "6 6" }).addTo(map);
    let distance = 0;
    for (let i = 1; i < state.measurePoints.length; i++) distance += state.measurePoints[i - 1].distanceTo(state.measurePoints[i]);
    document.getElementById("measure-summary").textContent = state.measurePoints.length < 2
      ? "1 point — click again to measure." : `Distance: ${distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`}`;
  }

  function installSearch() {
    const input = document.getElementById("search");
    const results = document.getElementById("search-results");
    input.addEventListener("input", () => {
      const query = input.value.trim().toLocaleLowerCase();
      if (!query) { results.hidden = true; results.innerHTML = ""; return; }
      const matches = state.searchItems.filter((item) =>
        item.kind !== "population" && item.name.toLocaleLowerCase().includes(query)
      ).slice(0, 8);
      results.innerHTML = matches.length
        ? matches.map((item, index) => `<button type="button" class="search-result" data-result="${index}">${htmlEscape(item.name)}<small>${htmlEscape(item.kind.slice(0, -1))}</small></button>`).join("")
        : '<div class="search-result">No matching facility found</div>';
      results.hidden = false;
      results.querySelectorAll("[data-result]").forEach((button, index) => {
        button.addEventListener("click", () => {
          const item = matches[index];
          const bounds = item.layer?.getBounds?.();
          const point = item.layer?.getLatLng?.();
          if (bounds?.isValid()) map.fitBounds(bounds, { maxZoom: 16, padding: [25, 25] });
          else if (point) map.setView(point, 16);
          if (item.layer?.openPopup) item.layer.openPopup();
          results.hidden = true;
          input.value = item.name;
        });
      });
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search-wrap")) results.hidden = true;
    });
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".popup-action[data-route-lat]");
    if (button) showRoute({ lat: Number(button.dataset.routeLat), lng: Number(button.dataset.routeLng) });
  });
  map.on("click", (event) => {
    state.clickedPoint = event.latlng;
    document.getElementById("map-coordinates").textContent =
      `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`;
    if (state.waitingForStart) setStart(event.latlng);
    if (document.getElementById("measure").classList.contains("active")) addMeasurePoint(event.latlng);
  });

  document.getElementById("zoom-quetta").addEventListener("click", () => {
    if (layerGroups.boundary.getLayers().length) map.fitBounds(layerGroups.boundary.getBounds(), { padding: [18, 18] });
    else map.setView(QUETTA, 10);
  });
  document.getElementById("reset-view").addEventListener("click", () => {
    clearMeasure();
    if (state.routeControl) { map.removeControl(state.routeControl); state.routeControl = null; }
    if (layerGroups.boundary.getLayers().length) map.fitBounds(layerGroups.boundary.getBounds(), { padding: [18, 18] });
    else map.setView(QUETTA, 10);
  });
  document.getElementById("locate").addEventListener("click", () => locateUser());
  document.getElementById("from-location").addEventListener("click", () => locateUser(setStart));
  document.getElementById("set-start").addEventListener("click", () => {
    state.waitingForStart = true;
    document.getElementById("set-start").classList.add("active");
    document.getElementById("route-summary").textContent = "Click a point on the map to set your route start.";
  });
  document.getElementById("clear-route").addEventListener("click", () => {
    if (state.routeControl) map.removeControl(state.routeControl);
    state.routeControl = null;
    state.start = null;
    document.getElementById("route-summary").textContent = "Route cleared. Choose a start point to get directions.";
  });
  document.getElementById("nearest-hospital").addEventListener("click", () => {
    if (state.clickedPoint) findNearestHospital(state.clickedPoint);
    else locateUser((point) => findNearestHospital(point));
  });
  document.getElementById("measure").addEventListener("click", () => {
    if (document.getElementById("measure").classList.contains("active")) clearMeasure();
    else activateMeasure();
  });
  document.getElementById("measure-clear").addEventListener("click", clearMeasure);
  document.getElementById("fullscreen").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.getElementById("map").requestFullscreen();
      else await document.exitFullscreen();
      setTimeout(() => map.invalidateSize(), 150);
    } catch (error) {
      showMessage(`Fullscreen failed (${error.message}). Use the browser's fullscreen controls instead.`, "error");
    }
  });
  document.getElementById("export-map").addEventListener("click", () => {
    if (typeof leafletImage !== "function") {
      showMessage("Map export plugin did not load. Check the leaflet-image CDN URL in index.html and reload.", "error");
      return;
    }
    leafletImage(map, (error, canvas) => {
      if (error || !canvas) {
        showMessage(`Map PNG export failed (${error?.message || "canvas was not created"}). Try OpenStreetMap or check tile-server CORS support.`, "error");
        return;
      }
      const link = document.createElement("a");
      link.download = "quetta-map.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  });

  styleLayerCheckboxes();
  installSearch();
  loadLocalData().catch((error) => {
    showMessage(`Dashboard initialization failed: ${error.message}. Check the data files and reload.`, "error");
    document.getElementById("loading").classList.add("hidden");
  });
  loadWeather();
})();
