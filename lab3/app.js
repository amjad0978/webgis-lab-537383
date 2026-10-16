// ---------- PART 3: MAP ----------
const map = L.map('map', {
  center: [30.3753, 69.3451],
  zoom: 5,
  minZoom: 5,
  maxZoom: 14,
  maxBounds: [[21.5, 58.5], [39.0, 80.5]],
  maxBoundsViscosity: 1.0
});

// ---------- BASEMAPS ----------
const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

const positron = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  subdomains: 'abcd',
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
});

const imagery = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri'
});

positron.addTo(map);

const layerControl = L.control.layers(
  {
    'Light (Carto Positron)': positron,
    'OpenStreetMap': osm,
    'Satellite (Esri)': imagery
  },
  {},
  { collapsed: false }
).addTo(map);

L.control.scale({ imperial: false }).addTo(map);

// ---------- PART 4: DENSITY STYLE ----------
function show(value) {
  if (value === null || value === undefined || value === '') {
    return 'not recorded';
  }
  return typeof value === 'number' ? value.toLocaleString() : value;
}

function densityOf(p) {
  if (p.pop_2023 === null || p.pop_2023 === undefined) return null;
  return p.pop_2023 / p.area_km2;
}

function colourFor(density) {
  if (density === null) return '#c9cfd1';
  if (density > 1000) return '#08306b';
  if (density > 400) return '#2171b5';
  if (density > 150) return '#4292c6';
  if (density > 50) return '#9ecae1';
  return '#deebf7';
}

function styleFor(feature) {
  return {
    color: '#ffffff',
    weight: 1,
    fillColor: colourFor(densityOf(feature.properties)),
    fillOpacity: 0.8
  };
}

// ---------- GROUPS FOR THE LAYER CONTROL ----------
const districtGroup = L.featureGroup().addTo(map);
layerControl.addOverlay(districtGroup, 'Population density');

// ---------- PART 6: PANE AND CIRCLES ----------
map.createPane('symbols');
map.getPane('symbols').style.zIndex = 450;

const circleGroup = L.featureGroup().addTo(map);
layerControl.addOverlay(circleGroup, 'Population');

function radiusFor(population) {
  return Math.sqrt(population) / 160;
}

function circleFor(feature, latlng) {
  return L.circleMarker(latlng, {
    pane: 'symbols',
    radius: radiusFor(feature.properties.pop_2023),
    color: '#7c2d12',
    weight: 1,
    fillColor: '#f97316',
    fillOpacity: 0.7
  }).bindTooltip(
    feature.properties.district + ': ' +
    feature.properties.pop_2023.toLocaleString()
  );
}

function hasPopulation(feature) {
  return feature.properties.pop_2023 !== null;
}

// ---------- PART 5: INFO PANEL ----------
const info = L.control({ position: 'topright' });

info.onAdd = function () {
  this._div = L.DomUtil.create('div', 'info');
  L.DomEvent.disableClickPropagation(this._div);
  L.DomEvent.disableScrollPropagation(this._div);
  this.update();
  return this._div;
};

info.update = function (p) {
  const zoom = '<div class="muted">Zoom level ' + map.getZoom() + '</div>';
  if (!p) {
    this._div.innerHTML = '<h4>District</h4>' +
      '<div class="muted">Hover over a district</div>' + zoom;
    return;
  }
  const d = densityOf(p);
  this._div.innerHTML =
    '<h4>' + p.district + '</h4>' +
    p.province + '<br>' +
    'Population: ' + show(p.pop_2023) + '<br>' +
    'Area: ' + show(p.area_km2) + ' km<sup>2</sup><br>' +
    'Density: ' + (d === null ? 'not recorded'
      : Math.round(d).toLocaleString() + ' per km<sup>2</sup>') +
    zoom;
};

info.addTo(map);

// ---------- HIGHLIGHT ----------
let allDistricts = null;
let allPoints = null;
let districts = null;

function highlight(e) {
  e.target.setStyle({ weight: 3, color: '#1a202c', fillOpacity: 0.95 });
  e.target.bringToFront();
  info.update(e.target.feature.properties);
}

function unhighlight(e) {
  districts.resetStyle(e.target);
  info.update();
}

function zoomToDistrict(e) {
  map.fitBounds(e.target.getBounds(), { padding: [20, 20] });
}

function bindDistrict(feature, layer) {
  layer.bindTooltip(feature.properties.district, { sticky: true });
  layer.on({
    mouseover: highlight,
    mouseout: unhighlight,
    click: zoomToDistrict
  });
}

// ---------- DRAW ----------
function draw(province) {
  const keep = function (feature) {
    return province === 'all' || feature.properties.province === province;
  };

  districtGroup.clearLayers();
  circleGroup.clearLayers();

  districts = L.geoJSON(allDistricts, {
    filter: keep,
    style: styleFor,
    onEachFeature: bindDistrict
  });
  districtGroup.addLayer(districts);

  circleGroup.addLayer(L.geoJSON(allPoints, {
    filter: function (f) { return keep(f) && hasPopulation(f); },
    pointToLayer: circleFor
  }));

  const n = districts.getLayers().length;
  if (n > 0) {
    map.fitBounds(districts.getBounds());
  }
  document.getElementById('count').textContent = n + ' districts';
}

// ---------- LEGEND ----------
const legend = L.control({ position: 'bottomright' });

legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  const breaks = [0, 50, 150, 400, 1000];
  const labels = ['under 50', '50 to 150', '150 to 400',
                  '400 to 1,000', 'over 1,000'];

  div.innerHTML = '<strong>People per km<sup>2</sup></strong><br>';
  for (let i = 0; i < breaks.length; i++) {
    div.innerHTML +=
      '<i style="background:' + colourFor(breaks[i] + 1) + '"></i> ' +
      labels[i] + '<br>';
  }
  div.innerHTML +=
    '<i style="background:' + colourFor(null) + '"></i> no census data';

  // circle sizes (same radiusFor as the map)
  const sizes = [10000000, 4000000, 1000000];
  const rMax = radiusFor(sizes[0]);
  const pad = 6;
  const base = pad + 2 * rMax;
  let svg = '<svg width="' + (2 * rMax + 75) +
            '" height="' + (base + 2) + '">';
  for (const s of sizes) {
    const r = radiusFor(s);
    const top = base - 2 * r;
    svg += '<circle cx="' + (rMax + 1) + '" cy="' + (base - r) +
           '" r="' + r + '" fill="#f97316" fill-opacity=".2"' +
           ' stroke="#7c2d12"/>' +
           '<line x1="' + (rMax + 1) + '" y1="' + top +
           '" x2="' + (2 * rMax + 14) + '" y2="' + top +
           '" stroke="#7c2d12" stroke-width=".6"/>' +
           '<text x="' + (2 * rMax + 17) + '" y="' + (top + 3.5) +
           '" font-size="10">' + (s / 1000000) + ' million</text>';
  }
  svg += '</svg>';
  div.innerHTML +=
    '<div class="circles"><strong>Population</strong>' + svg + '</div>';

  L.DomEvent.disableClickPropagation(div);
  return div;
};

legend.addTo(map);

// ---------- PART 6.5: NUST OVERLAY ----------
const nust = [33.6423, 72.9906];
const nustGroup = L.featureGroup([
  L.circle(nust, { radius: 25000, color: '#0f766e', weight: 2,
                   fillOpacity: 0.08 }),
  L.circleMarker(nust, { radius: 6, color: '#0f766e',
                         fillColor: '#0f766e', fillOpacity: 1 })
]).bindTooltip('NUST H-12: a 25 km circle and a 6 pixel circleMarker');
layerControl.addOverlay(nustGroup, 'NUST, 25 km');

// ---------- PART 7: EVENTS ----------
function showCoordinates(e) {
  L.popup()
    .setLatLng(e.latlng)
    .setContent(e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4))
    .openOn(map);
}

document.getElementById('coords')
  .addEventListener('change', function (event) {
    if (event.target.checked) {
      map.on('click', showCoordinates);
    } else {
      map.off('click', showCoordinates);
    }
  });

map.on('zoomend', function () {
  info.update();
});

// ---------- PART 8: PROVINCE FILTER ----------
function fillProvinceList() {
  const select = document.getElementById('province');
  const provinces = [...new Set(
    allDistricts.features.map(f => f.properties.province)
  )].sort();
  for (const name of provinces) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
}

document.getElementById('province')
  .addEventListener('change', function (event) {
    draw(event.target.value);
  });

// ---------- LOAD DATA (keep this at the very bottom) ----------
async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(path + ': status ' + response.status);
  }
  return response.json();
}

async function loadData() {
  try {
    [allDistricts, allPoints] = await Promise.all([
      loadJSON('data/districts.geojson'),
      loadJSON('data/district_points.geojson')
    ]);
  } catch (err) {
    console.error('Could not load the data.', err);
    document.getElementById('count').textContent = 'data failed to load';
    return;
  }
  fillProvinceList();
  draw('all');
}

loadData();
