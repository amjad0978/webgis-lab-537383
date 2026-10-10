const pakistanLimits = L.latLngBounds([21.5, 58.5], [39.0, 80.5]);

const map = L.map('map', {
  maxBounds: pakistanLimits,
  maxBoundsViscosity: 1.0,
  minZoom: 5
}).setView([30.3753, 69.3451], 5);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let districts = null;
let layer = null;

function show(value) {
  if (value === null || value === undefined || value === '') {
    return 'not recorded';
  }
  return typeof value === 'number' ? value.toLocaleString() : value;
}

function colourFor(population) {
  if (population === null || population === undefined) return '#c9cfd1';
  if (population > 3000000) return '#7f2704';
  if (population > 1500000) return '#d94801';
  if (population > 750000) return '#f16913';
  if (population > 300000) return '#fd8d3c';
  return '#fdd0a2';
}

function styleFor(feature) {
  return {
    color: '#ffffff',
    weight: 1,
    fillColor: colourFor(feature.properties.pop_2023),
    fillOpacity: 0.8
  };
}

function draw(features) {
  if (layer) {
    map.removeLayer(layer);
  }

  layer = L.geoJSON(
    { type: 'FeatureCollection', features: features },
    {
      style: styleFor,
      onEachFeature: function (feature, featureLayer) {
        const p = feature.properties;
        featureLayer.bindPopup(
          '<strong>' + show(p.district) + '</strong><br>' +
          'Province: ' + show(p.province) + '<br>' +
          'Population: ' + show(p.pop_2023) + '<br>' +
          'Area: ' + show(p.area_km2) + ' km<sup>2</sup>'
        );
      }
    }
  ).addTo(map);

  if (features.length > 0) {
    map.fitBounds(layer.getBounds());
  }

  document.getElementById('count').textContent =
    features.length + ' districts';
}

function fillProvinceList() {
  const select = document.getElementById('province');
  const provinces = [...new Set(
    districts.features.map(f => f.properties.province)
  )].sort();

  for (const name of provinces) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
}

async function loadData() {
  const response = await fetch('data/districts.geojson');
  if (!response.ok) {
    console.error('Request failed with status', response.status);
    return;
  }
  districts = await response.json();
  console.log('features:', districts.features.length);
  console.log('first feature:', districts.features[0]);
  console.log('properties:', districts.features[0].properties);

  fillProvinceList();
  draw(districts.features);
}

loadData();

document.getElementById('province')
  .addEventListener('change', function (event) {
    const chosen = event.target.value;

    const subset = chosen === 'all'
      ? districts.features
      : districts.features.filter(
          f => f.properties.province === chosen
        );

    draw(subset);
  });

const legend = L.control({ position: 'bottomright' });

legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  const breaks = [0, 300000, 750000, 1500000, 3000000];
  const labels = ['under 300k', '300k to 750k', '750k to 1.5m',
                  '1.5m to 3m', 'over 3m'];

  for (let i = 0; i < breaks.length; i++) {
    div.innerHTML +=
      '<i style="background:' + colourFor(breaks[i] + 1) + '"></i> ' +
      labels[i] + '<br>';
  }
  div.innerHTML +=
    '<i style="background:' + colourFor(null) + '"></i> no census data';
  return div;
};

legend.addTo(map);
