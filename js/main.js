const apiKey = "bWAAEqyZ3eUDlvKietZDTGgX0NAg9fBoeUPItvkV";




// Main map controls
let currentHazard = "overall";
let rankingHazard = "overall";
let currentYear = 1985;
let currentRiskFilter = 0;

// Park selection and comparison
let selectedPark = null;
let compareParks = [];
const maxCompareParks = 5;

// Data containers
let parks = [];
let parkByCode = {};
let climateParkCodes = new Set();
let climateMonthly = [];
let eventMonthly = [];
let annual = {};

// Leaflet layers
let boundaryLayer = null;
let glyphLayer = null;
let nationLayer = null;
let stateLayer = null;
let countyLayer = null;
let layerControl = null;

// =========================================================
// HTML button helpers
// =========================================================
// These are called directly from buttons in index.html.
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("hidden");
  setTimeout(() => map.invalidateSize(), 150);
}

function closeFloatingDetail() {
  const panel = document.getElementById("floatingDetail");
  if (panel) panel.classList.add("hidden");
  exitDetailMode();
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
  const page = document.getElementById(id);
  if (page) page.classList.add("active-page");

  setTimeout(() => {
    map.invalidateSize();
    updateChart();
    updateComparisonDashboard();
  }, 150);
}

function zoomToRegion(region) {
  const b = {
    all: [[15, -171], [72, -63]],
    mainland: [[24, -125], [50, -66]],
    alaska: [[51, -170], [72, -129]],
    hawaii: [[18.5, -160.5], [22.6, -154.5]],
    virgin: [[17.9, -65.3], [18.8, -64.3]]
  };
  if (b[region]) map.fitBounds(b[region], { padding: [35, 35] });
}

// Make sure inline HTML buttons can find these functions.
window.closeModal = closeModal;
window.closeFloatingDetail = closeFloatingDetail;
window.showPage = showPage;
window.zoomToRegion = zoomToRegion;

// =========================================================
// Map setup
// =========================================================
// Terrain is the default basemap, but users can switch layers.
const map = L.map("map", {
  zoomControl: false,
  minZoom: 2,
  maxZoom: 14
}).setView([39, -98], 4);

L.control.zoom({ position: "bottomleft" }).addTo(map);

const basemaps = {
  "Terrain": L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Esri Terrain" }
  ),
  "Topographic": L.tileLayer(
    "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    { attribution: "OpenTopoMap" }
  ),
  "Street Map": L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "OpenStreetMap" }
  ),
  "Light Map": L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { attribution: "CARTO" }
  ),
  "Satellite": L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Esri" }
  )
};

basemaps.Terrain.addTo(map);

// =========================================================
// Labels and reusable helpers
// =========================================================
// Labels appear in dropdowns, charts, and detail panels.
const labels = {
  overall: "Overall Climate Risk",
  temp: "Mean Temperature",
  tmax: "Maximum Temperature",
  tmin: "Minimum Temperature",
  precip: "Precipitation",
  pdsi: "Drought Index / PDSI",
  heatRisk: "Heat Risk",
  precipRisk: "Precipitation Risk",
  droughtClimateRisk: "Climate Drought Risk",
  flood: "Flood Event Risk",
  wildfire: "Wildfire Event Risk",
  droughtEvent: "Drought Event Risk",
  cold: "Cold Event Risk",
  totalEventRisk: "Total Event Risk"
};

// Variables already expressed as 0–100 risk scores.
const riskVars = [
  "overall", "heatRisk", "precipRisk", "droughtClimateRisk",
  "flood", "wildfire", "droughtEvent", "cold", "totalEventRisk"
];

function codeOf(x) {
  return String(x || "").trim().toLowerCase();
}

function ok(x) {
  return x !== null && x !== undefined && x !== "" && !Number.isNaN(+x);
}

function num(x) {
  return ok(x) ? +x : null;
}

function fmt(x, d = 1) {
  return ok(x) ? Number(x).toFixed(d) : "NA";
}

function meanValid(arr) {
  const vals = arr.filter(ok).map(Number);
  return vals.length ? d3.mean(vals) : null;
}

function sumValid(arr) {
  const vals = arr.filter(ok).map(Number);
  return vals.length ? d3.sum(vals) : null;
}

function rankNum(rank) {
  const key = String(rank || "").trim().toLowerCase();
  return {
    "very low": 10,
    "low": 30,
    "moderate": 50,
    "medium": 50,
    "high": 75,
    "very high": 95
  }[key] ?? null;
}

function norm(x, extent, reverse = false) {
  if (!ok(x) || !extent || !ok(extent[0]) || !ok(extent[1]) || extent[0] === extent[1]) return null;
  const n = reverse
    ? ((extent[1] - x) / (extent[1] - extent[0])) * 100
    : ((x - extent[0]) / (extent[1] - extent[0])) * 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function shortName(name) {
  return String(name || "")
    .replace(" National Park and Preserve", "")
    .replace(" National Park", "")
    .replace(" National Parks", "")
    .replace(" and Preserve", "")
    .replace(" & Preserve", "");
}

// =========================================================
// Value and color logic
// =========================================================
// These functions keep map, glyphs, and charts consistent.
function getAnnualRecord(park) {
  return annual[codeOf(park?.parkCode)]?.[+currentYear] || null;
}

function getValue(park, hazard = currentHazard) {
  const r = getAnnualRecord(park);
  if (!r) return null;
  const x = r[hazard];
  return ok(x) ? +Number(x).toFixed(1) : null;
}

function currentExtent(hazard = currentHazard) {
  const vals = parks.map(p => getValue(p, hazard)).filter(ok);
  return vals.length ? d3.extent(vals) : [0, 100];
}

function valueForColor(x, hazard = currentHazard) {
  if (!ok(x)) return null;
  return riskVars.includes(hazard) ? x : norm(x, currentExtent(hazard));
}

function getMapColor(x, hazard = currentHazard) {
  const n = valueForColor(x, hazard);
  if (!ok(n)) return "#b8b8b8";

  const scale =
    hazard === "precip" || hazard === "precipRisk" || hazard === "flood" ? d3.interpolateBlues :
    hazard === "pdsi" || hazard === "droughtClimateRisk" || hazard === "droughtEvent" ? d3.interpolateBrBG :
    hazard === "wildfire" ? d3.interpolateYlOrRd :
    hazard === "cold" ? d3.interpolatePuBu :
    hazard === "temp" || hazard === "tmax" || hazard === "tmin" || hazard === "heatRisk" ? d3.interpolateOranges :
    d3.interpolateYlOrRd;

  return scale(n / 100);
}

function rankClass(x) {
  const n = valueForColor(x);
  if (!ok(n)) return "No data";
  if (n >= 80) return "Very High";
  if (n >= 60) return "High";
  if (n >= 40) return "Moderate";
  if (n >= 20) return "Low";
  return "Very Low";
}

function glyphSize(x) {
  const n = valueForColor(x);
  if (!ok(n)) return 8;
  return 8 + (n / 100) * 18;
}

function hasAnyClimate(r) {
  if (!r) return false;
  return [r.temp, r.tmax, r.tmin, r.precip, r.pdsi].some(ok);
}

// =========================================================
// Load CSVs and NPS data
// =========================================================
// These paths must exactly match your local /data filenames.
async function loadClimateCSVs() {
  climateMonthly = await d3.csv(
    "data/national_parks_climate_risk_monthly_ALL63_1985_2026.csv",
    d => ({
      parkCode: codeOf(d.parkCode),
      parkName: d.parkName,
      county: d.county,
      state: d.state,
      GEOID: d.GEOID,
      year: +d.year,
      month: +d.month,
      temp: num(d.temp),
      tmax: num(d.tmax),
      tmin: num(d.tmin),
      pdsi: num(d.pdsi),
      precip: num(d.precip)
    })
  );

  eventMonthly = await d3.csv(
    "data/national_parks_NOAA_event_risk_monthly_1985_2026.csv",
    d => ({
      parkCode: codeOf(d.parkCode),
      parkName: d.parkName,
      county: d.county,
      state: d.state,
      GEOID: d.GEOID,
      year: +d.year,
      month: +d.month,
      flood_events: num(d.flood_events),
      wildfire_events: num(d.wildfire_events),
      cold_events: num(d.cold_events),
      drought_events: num(d.drought_events),
      total_risk_events: num(d.total_risk_events),
      flood_rank_monthly: d.flood_rank_monthly,
      wildfire_rank_monthly: d.wildfire_rank_monthly,
      cold_rank_monthly: d.cold_rank_monthly,
      drought_rank_monthly: d.drought_rank_monthly,
      total_event_rank_monthly: d.total_event_rank_monthly
    })
  );

  climateParkCodes = new Set(climateMonthly.map(d => d.parkCode));
  buildAnnualData();
  setupYearSlider();
}

// Pull park descriptions, images, activities, and media.
async function loadNPS() {
  let all = [];
  let start = 0;
  let total = 1;
  const limit = 100;

  while (start < total) {
    const url = `https://developer.nps.gov/api/v1/parks?limit=${limit}&start=${start}&api_key=${apiKey}`;
    const json = await fetch(url).then(r => r.json());
    total = +json.total;
    all = all.concat(json.data || []);
    start += limit;
  }

  // Only keep parks that appear in your CSV.
  parks = all.filter(p => climateParkCodes.has(codeOf(p.parkCode)));
  parkByCode = Object.fromEntries(parks.map(p => [codeOf(p.parkCode), p]));
}

// =========================================================
// Annual summaries
// =========================================================
// Convert monthly data to one annual record per park.
function buildAnnualData() {
  annual = {};

  d3.group(climateMonthly, d => d.parkCode, d => d.year).forEach((yearMap, code) => {
    annual[code] = annual[code] || {};

    yearMap.forEach((rows, year) => {
      annual[code][year] = annual[code][year] || {};

      const temp = meanValid(rows.map(d => d.temp));
      const tmax = meanValid(rows.map(d => d.tmax));
      const tmin = meanValid(rows.map(d => d.tmin));
      const precip = sumValid(rows.map(d => d.precip));
      const pdsi = meanValid(rows.map(d => d.pdsi));

      Object.assign(annual[code][year], {
        temp,
        tmax,
        tmin,
        precip,
        pdsi,
        climateRowCount: rows.length,
        climateValueCount: [temp, tmax, tmin, precip, pdsi].filter(ok).length
      });
    });
  });

  d3.group(eventMonthly, d => d.parkCode, d => d.year).forEach((yearMap, code) => {
    annual[code] = annual[code] || {};

    yearMap.forEach((rows, year) => {
      annual[code][year] = annual[code][year] || {};

      Object.assign(annual[code][year], {
        flood_events: sumValid(rows.map(d => d.flood_events)),
        wildfire_events: sumValid(rows.map(d => d.wildfire_events)),
        cold_events: sumValid(rows.map(d => d.cold_events)),
        drought_events: sumValid(rows.map(d => d.drought_events)),
        total_risk_events: sumValid(rows.map(d => d.total_risk_events)),
        flood: meanValid(rows.map(d => rankNum(d.flood_rank_monthly))),
        wildfire: meanValid(rows.map(d => rankNum(d.wildfire_rank_monthly))),
        cold: meanValid(rows.map(d => rankNum(d.cold_rank_monthly))),
        droughtEvent: meanValid(rows.map(d => rankNum(d.drought_rank_monthly))),
        totalEventRisk: meanValid(rows.map(d => rankNum(d.total_event_rank_monthly))),
        eventRowCount: rows.length
      });
    });
  });

  computeDerivedRisks();
}

// Build derived risk scores from raw climate and event variables.
function computeDerivedRisks() {
  const allRecords = Object.values(annual).flatMap(years => Object.values(years));

  const extents = {
    tmax: d3.extent(allRecords.map(d => d.tmax).filter(ok)),
    precip: d3.extent(allRecords.map(d => d.precip).filter(ok)),
    pdsi: d3.extent(allRecords.map(d => d.pdsi).filter(ok))
  };

  allRecords.forEach(d => {
    d.heatRisk = norm(d.tmax, extents.tmax);
    d.precipRisk = norm(d.precip, extents.precip);
    d.droughtClimateRisk = norm(d.pdsi, extents.pdsi, true);

    const climatePart = meanValid([d.heatRisk, d.precipRisk, d.droughtClimateRisk]);
    const eventPart = meanValid([d.flood, d.wildfire, d.droughtEvent, d.cold, d.totalEventRisk]);
    d.overall = Math.round(meanValid([climatePart, eventPart]));
  });
}

// =========================================================
// GeoJSON layers
// =========================================================
// Context layers: nation, state, county, park boundary.
async function safeGeoJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn(`Could not load ${path}`, err);
    return null;
  }
}

async function loadContextLayers() {
  const nation = await safeGeoJSON("data/Nation_Boundary.geojson");
  const states = await safeGeoJSON("data/State_Boundary.geojson");
  const counties = await safeGeoJSON("data/County_Boundary.geojson");

  if (nation) {
    nationLayer = L.geoJSON(nation, {
      style: {
        color: "#1b4332",
        weight: 2.0,
        opacity: 0.85,
        fill: false,
        lineCap: "round",
        lineJoin: "round"
      },
      interactive: false
    }).addTo(map);
  }

  if (states) {
    stateLayer = L.geoJSON(states, {
      style: {
        color: "#31572c",
        weight: 1.0,
        dashArray: "5 5",
        opacity: 0.62,
        fill: false,
        lineCap: "round",
        lineJoin: "round"
      },
      interactive: false
    }).addTo(map);
  }

  if (counties) {
    countyLayer = L.geoJSON(counties, {
      style: {
        color: "#8d99ae",
        weight: 0.32,
        dashArray: "2 5",
        opacity: 0.28,
        fill: false
      },
      interactive: false
    });
  }
}

async function loadBoundaries() {
  const paths = [
    "data/NPS_Boundary.geojson",
    "data/NPS_boundary.geojson",
    "data/nps_boundaries.geojson"
  ];

  let geo = null;
  for (const path of paths) {
    geo = await safeGeoJSON(path);
    if (geo) break;
  }

  if (!geo) return;

  boundaryLayer = L.geoJSON(geo, {
    filter: f => !!parkFromFeature(f),
    style: boundaryStyle,
    onEachFeature: onBoundary
  }).addTo(map);
}

// Match GeoJSON UNIT_CODE to NPS parkCode.
function parkFromFeature(feature) {
  const p = feature.properties || {};
  const code = codeOf(
    p.UNIT_CODE || p.UNITCODE || p.PARK_CODE ||
    p.parkCode || p.PARKCODE || p.UNITID || p.Code || p.code
  );
  return parkByCode[code] || null;
}

function boundaryStyle(feature) {
  const park = parkFromFeature(feature);
  const x = park ? getValue(park) : null;
  const selected = selectedPark && codeOf(selectedPark.parkCode) === codeOf(park?.parkCode);

  return {
    color: selected ? "#9d0208" : "#2f5d50",
    weight: selected ? 3.2 : 1.7,
    dashArray: "7 5",
    fillColor: getMapColor(x),
    fillOpacity: ok(x) ? 0.52 : 0.12,
    opacity: 0.95
  };
}

function onBoundary(feature, layer) {
  const park = parkFromFeature(feature);
  if (!park) return;

  layer.bindPopup(() => popupHTML(park));

  layer.on({
    mouseover: () => {
      layer.setStyle({ weight: 3.2, color: "#bc6c25" });
      highlightGlyph(park.parkCode);
      highlightChartBar(park.parkCode);
    },
    mouseout: () => {
      if (boundaryLayer) boundaryLayer.resetStyle(layer);
      redrawGlyphs();
      clearChartHighlight();
    },
    click: () => selectPark(park, layer)
  });
}

// =========================================================
// Ranked glyphs
// =========================================================
// Diamonds show rank and intensity while keeping park points visible.
function rankedParks() {
  return parks
    .map(p => ({ park: p, value: getValue(p) }))
    .filter(d => ok(d.value))
    .sort((a, b) => b.value - a.value)
    .map((d, i) => ({ ...d, rank: i + 1 }));
}

function rankLookup() {
  return Object.fromEntries(rankedParks().map(d => [codeOf(d.park.parkCode), d.rank]));
}

function drawGlyphs() {
  if (glyphLayer) glyphLayer.remove();
  glyphLayer = L.layerGroup().addTo(map);

  const ranks = rankLookup();

  parks.forEach(park => {
    const lat = +park.latitude;
    const lon = +park.longitude;
    const x = getValue(park);

    if (!ok(lat) || !ok(lon)) return;
    if (ok(x) && x < currentRiskFilter) return;

    const rank = ranks[codeOf(park.parkCode)] || "";
    const size = glyphSize(x);
    const selected = selectedPark && codeOf(selectedPark.parkCode) === codeOf(park.parkCode);

    const html = `
      <div class="rank-glyph ${selected ? "selected" : ""}" data-code="${codeOf(park.parkCode)}"
           style="width:${size}px;height:${size}px;background:${getMapColor(x)};">
        <span>${rank && rank <= 99 ? rank : ""}</span>
      </div>
    `;

    const icon = L.divIcon({
      html,
      className: "rank-glyph-wrapper",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });

    L.marker([lat, lon], { icon })
      .bindPopup(() => popupHTML(park))
      .on("mouseover", () => {
        highlightGlyph(park.parkCode);
        highlightChartBar(park.parkCode);
      })
      .on("mouseout", () => {
        redrawGlyphs();
        clearChartHighlight();
      })
      .on("click", () => selectPark(park))
      .addTo(glyphLayer);
  });
}

function redrawGlyphs() {
  drawGlyphs();
}

function highlightGlyph(code) {
  const targetCode = codeOf(code);
  document.querySelectorAll(".rank-glyph").forEach(el => {
    el.style.opacity = "0.35";
    el.style.transform = "rotate(45deg) scale(0.92)";
  });

  const target = document.querySelector(`.rank-glyph[data-code="${targetCode}"]`);
  if (target) {
    target.style.opacity = "1";
    target.style.transform = "rotate(45deg) scale(1.25)";
  }
}

// =========================================================
// Map redraw and layer visibility
// =========================================================
// County layer appears only when zoomed in.
function redrawMap() {
  if (boundaryLayer) {
    boundaryLayer.eachLayer(layer => {
      const park = parkFromFeature(layer.feature);
      const x = park ? getValue(park) : null;

      if (!park || (ok(x) && x < currentRiskFilter)) {
        layer.setStyle({ opacity: 0.12, fillOpacity: 0.025 });
      } else {
        layer.setStyle(boundaryStyle(layer.feature));
      }
    });
  }

  drawGlyphs();
  updateLegend();
  updateCountyVisibility();
}

function updateCountyVisibility() {
  if (!countyLayer) return;
  if (map.getZoom() >= 5) {
    if (!map.hasLayer(countyLayer)) countyLayer.addTo(map);
  } else {
    if (map.hasLayer(countyLayer)) map.removeLayer(countyLayer);
  }
}

function setupLayerControl() {
  if (layerControl) map.removeControl(layerControl);

  const overlays = {};
  if (nationLayer) overlays["Nation boundary — solid"] = nationLayer;
  if (stateLayer) overlays["State boundaries — dashed"] = stateLayer;
  if (countyLayer) overlays["County boundaries — light dashed"] = countyLayer;
  if (boundaryLayer) overlays["National park shaded areas"] = boundaryLayer;
  if (glyphLayer) overlays["Ranked park glyphs"] = glyphLayer;

  layerControl = L.control.layers(basemaps, overlays, {
    collapsed: true,
    position: "bottomleft"
  }).addTo(map);
}

// =========================================================
// Detail mode and selected park panel
// =========================================================
// Clicking a park changes the layout and opens the detail panel.
function enterDetailMode() {
  document.body.classList.add("detail-mode");
  setTimeout(() => map.invalidateSize(), 250);
}

function exitDetailMode() {
  document.body.classList.remove("detail-mode");
  setTimeout(() => map.invalidateSize(), 250);
}

function selectPark(park, layer = null) {
  if (!park) return;
  selectedPark = park;
  enterDetailMode();

  if (layer?.getBounds) {
    map.fitBounds(layer.getBounds(), {
      paddingTopLeft: [30, 30],
      paddingBottomRight: [520, 60]
    });
  } else if (ok(+park.latitude) && ok(+park.longitude)) {
    map.setView([+park.latitude, +park.longitude], Math.max(map.getZoom(), 7));
  }

  openDetail(park);
  redrawMap();
  updateChart();
  updateComparisonDashboard();
}

function popupHTML(park) {
  return `
    <b>${park.fullName}</b><br>
    ${park.states || ""}<br>
    <b>${labels[currentHazard]} ${currentYear}:</b> ${fmt(getValue(park))}<br>
    <b>Rank:</b> ${rankLookup()[codeOf(park.parkCode)] || "NA"}
  `;
}

function openDetail(park) {
  const r = getAnnualRecord(park);
  const code = codeOf(park.parkCode);
  const cRows = climateMonthly.filter(d => d.parkCode === code && d.year === +currentYear);
  const eRows = eventMonthly.filter(d => d.parkCode === code && d.year === +currentYear);
  const rank = rankLookup()[code] || "NA";

  const climateNote = r && r.climateRowCount > 0 && !hasAnyClimate(r)
    ? `<div class="data-warning">Climate rows exist for this park/year, but temp, tmax, tmin, precip, and PDSI are blank in your climate CSV. Event-risk data is still shown.</div>`
    : "";

  const content = document.getElementById("floatingDetailContent");
  if (!content) return;

  content.innerHTML = `
    <h2>${park.fullName}</h2>
    <p class="detail-meta">${park.states || "NA"} · ${park.designation || "NA"} · Code: ${code}</p>
    ${park.images?.[0]?.url ? `<img class="detail-img" src="${park.images[0].url}">` : ""}
    ${videoPreview(park)}
    <p>${park.description || "No description available."}</p>

    <div class="selected-value">
      <b>${labels[currentHazard]} (${currentYear}):</b> ${fmt(getValue(park))}<br>
      <b>Current rank:</b> #${rank} · <b>Class:</b> ${rankClass(getValue(park))}
    </div>

    <div class="detail-actions">
      <button onclick="toggleComparePark('${code}')">${isParkCompared(code) ? "Remove from Comparison" : "Add to Comparison"}</button>
      <button onclick="clearComparison()">Clear Comparison</button>
      <button onclick="exitDetailMode()">Expand Map</button>
    </div>

    ${climateNote}
    ${r ? riskCards(r) : `<p>No annual record found for <b>${code}</b> in ${currentYear}.</p>`}

    <p class="debug-note">
      Climate monthly rows: <b>${cRows.length}</b> · usable climate values this year: <b>${r?.climateValueCount || 0}</b><br>
      Event monthly rows: <b>${eRows.length}</b>
    </p>

    <h3>Monthly Temperature: Min / Mean / Max</h3>
    <svg id="tempChart" class="mini-chart"></svg>
    <h3>Monthly Precipitation + Drought</h3>
    <svg id="waterChart" class="mini-chart"></svg>
    <h3>Monthly Event Risks</h3>
    <svg id="eventChart" class="mini-chart"></svg>

    <h3>NPS Experience Layer</h3>
    ${tagBlock("Activities", park.activities)}
    ${tagBlock("Topics", park.topics)}
    ${mediaBlock(park)}
    <h3>NPS Weather Info</h3>
    <p>${park.weatherInfo || "No NPS weather information available."}</p>
    <p><a class="media-link" href="${park.url}" target="_blank">Official NPS Page →</a></p>
  `;

  const side = document.getElementById("selectedParkPanel");
  if (side) side.innerHTML = `<b>${park.fullName}</b><br>${labels[currentHazard]}: ${fmt(getValue(park))}<br>Rank: #${rank}`;

  document.getElementById("floatingDetail")?.classList.remove("hidden");
  drawMonthlyCharts(park);
  updateMapComparePanel();
}

// =========================================================
// Detail panel components
// =========================================================
// Small HTML builders for the detail panel.
function riskCards(r) {
  return `
    <div class="risk-grid">
      ${card("Overall Risk", r.overall, 0)}
      ${card("Mean Temp", r.temp, 1)}
      ${card("Max Temp", r.tmax, 1)}
      ${card("Min Temp", r.tmin, 1)}
      ${card("Annual Precip", r.precip, 1)}
      ${card("PDSI", r.pdsi, 2)}
      ${card("Heat Risk", r.heatRisk, 0)}
      ${card("Precip Risk", r.precipRisk, 0)}
      ${card("Climate Drought", r.droughtClimateRisk, 0)}
      ${card("Flood Event", r.flood, 0)}
      ${card("Wildfire Event", r.wildfire, 0)}
      ${card("Cold Event", r.cold, 0)}
    </div>
  `;
}

function card(name, x, d = 1) {
  return `<div class="risk-card"><span>${name}</span><strong>${fmt(x, d)}</strong></div>`;
}

function videoPreview(park) {
  const video = park.multimedia?.find(m => String(m.type || "").includes("video"));
  if (!video) return "";
  return `
    <div class="video-box">
      <iframe src="${video.url}" title="${video.title}" allow="autoplay; fullscreen; picture-in-picture" loading="lazy"></iframe>
      <a class="media-link" href="${video.url}" target="_blank">▶ Open video: ${video.title}</a>
    </div>
  `;
}

function tagBlock(title, arr) {
  if (!arr?.length) return "";
  return `<h4>${title}</h4><div class="tag-row">${arr.slice(0, 12).map(d => `<span class="tag">${d.name}</span>`).join("")}</div>`;
}

function mediaBlock(park) {
  if (!park.multimedia?.length) return "<p>No NPS video or gallery links available.</p>";
  return `
    <h4>Videos + Galleries</h4>
    ${park.multimedia.slice(0, 8).map(m =>
      `<a class="media-link" href="${m.url}" target="_blank">${m.type?.includes("video") ? "▶" : "▣"} ${m.title}</a>`
    ).join("")}
  `;
}

// =========================================================
// Monthly detail charts
// =========================================================
// Three small charts inside the right panel.
function drawMonthlyCharts(park) {
  const code = codeOf(park.parkCode);

  const cRows = climateMonthly.filter(d => d.parkCode === code && d.year === +currentYear).sort((a, b) => a.month - b.month);
  const eRows = eventMonthly.filter(d => d.parkCode === code && d.year === +currentYear).sort((a, b) => a.month - b.month);

  lineChart("#tempChart", cRows, [["tmin", "Min Temp"], ["temp", "Mean Temp"], ["tmax", "Max Temp"]], "Climate rows exist, but temperature values are blank.");
  lineChart("#waterChart", cRows, [["precip", "Precip"], ["pdsi", "PDSI"]], "Climate rows exist, but precipitation/PDSI values are blank.");
  lineChart("#eventChart", eRows, [["flood_events", "Flood"], ["wildfire_events", "Wildfire"], ["drought_events", "Drought"], ["cold_events", "Cold"]], "Event rows exist, but event-count values are blank.");
}

function lineChart(selector, rows, series, missingMessage) {
  const svg = d3.select(selector);
  svg.selectAll("*").remove();

  const w = svg.node().clientWidth || 390;
  const h = 190;
  const m = { top: 18, right: 24, bottom: 32, left: 48 };
  svg.attr("viewBox", `0 0 ${w} ${h}`);

  if (!rows.length) {
    svg.append("text").attr("x", 18).attr("y", 45).attr("fill", "#17212b").text("No monthly rows for this park/year");
    return;
  }

  const values = series.flatMap(([key]) => rows.map(d => d[key]).filter(ok));
  if (!values.length) {
    svg.append("text").attr("x", 18).attr("y", 45).attr("fill", "#17212b").text(missingMessage || "Monthly values are missing");
    return;
  }

  const x = d3.scaleLinear().domain([1, 12]).range([m.left, w - m.right]);
  const y = d3.scaleLinear().domain(d3.extent(values)).nice().range([h - m.bottom, m.top]);

  svg.append("g").attr("transform", `translate(0,${h - m.bottom})`).call(d3.axisBottom(x).ticks(12).tickFormat(d3.format("d")));
  svg.append("g").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(4));

  series.forEach(([key, name], i) => {
    const line = d3.line().defined(d => ok(d[key])).x(d => x(d.month)).y(d => y(d[key]));
    svg.append("path").datum(rows).attr("fill", "none").attr("stroke", d3.schemeTableau10[i]).attr("stroke-width", 2.5).attr("d", line);
    svg.selectAll(`.dot-${key}`).data(rows.filter(d => ok(d[key]))).enter().append("circle")
      .attr("cx", d => x(d.month)).attr("cy", d => y(d[key])).attr("r", 3).attr("fill", d3.schemeTableau10[i]);
    svg.append("text").attr("x", w - 115).attr("y", 20 + i * 15).attr("fill", d3.schemeTableau10[i]).attr("font-size", 11).attr("font-weight", 700).text(name);
  });
}

// =========================================================
// Ranking chart and ranking summary
// =========================================================
// Ranking variable is independent from the map variable.
function getRankValue(park, hazard = rankingHazard) {
  const r = getAnnualRecord(park);
  if (!r) return null;
  const x = r[hazard];
  return ok(x) ? +Number(x).toFixed(1) : null;
}

function getRankExtent(hazard = rankingHazard) {
  const vals = parks.map(p => getRankValue(p, hazard)).filter(ok);
  return vals.length ? d3.extent(vals) : [0, 100];
}

function getRankColor(x, hazard = rankingHazard) {
  if (!ok(x)) return "#b8b8b8";
  const n = riskVars.includes(hazard) ? x : norm(x, getRankExtent(hazard));
  return getMapColor(n, "overall");
}

function ensureRankingControls() {
  const header = document.querySelector(".chart-header");
  if (!header) return;

  if (!document.getElementById("rankingHazardSelect")) {
    const control = document.createElement("div");
    control.className = "ranking-control";
    control.innerHTML = `
      <label for="rankingHazardSelect">Explore ranking by</label>
      <select id="rankingHazardSelect">
        ${Object.entries(labels).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}
      </select>
    `;
    header.appendChild(control);
  }

  const select = document.getElementById("rankingHazardSelect");
  select.value = rankingHazard;
  select.onchange = e => {
    rankingHazard = e.target.value;
    updateChart();
    updateRankingSummary();
  };
}

function ensureRankingSummaryPanel() {
  const chartPanel = document.querySelector(".chart-panel");
  if (!chartPanel || document.getElementById("rankingSummaryPanel")) return;

  const panel = document.createElement("div");
  panel.id = "rankingSummaryPanel";
  panel.className = "ranking-summary-panel";
  panel.innerHTML = `
    <div class="ranking-stat-grid">
      <div class="ranking-stat"><span>Highest park</span><strong id="rankTopPark">—</strong></div>
      <div class="ranking-stat"><span>Median value</span><strong id="rankMedian">—</strong></div>
      <div class="ranking-stat"><span>Lowest park</span><strong id="rankLowPark">—</strong></div>
    </div>

    <div class="ranking-extra-grid">
      <div class="ranking-extra-card">
        <h4>Distribution of all parks</h4>
        <svg id="rankingDistributionChart"></svg>
      </div>
      <div class="ranking-extra-card">
        <h4>Top 5 parks</h4>
        <div id="rankingTopList" class="ranking-top-list"></div>
      </div>
    </div>
  `;
  chartPanel.appendChild(panel);
}

function updateChart() {
  ensureRankingControls();
  ensureRankingSummaryPanel();

  const svg = d3.select("#rankingChart");
  svg.selectAll("*").remove();

  const w = svg.node().clientWidth;
  const h = svg.node().clientHeight;
  const m = { top: 24, right: 90, bottom: 58, left: 270 };
  if (!w || !h) return;

  const data = parks
    .map(p => ({ park: p, code: p.parkCode, name: p.fullName, x: getRankValue(p, rankingHazard) }))
    .filter(d => ok(d.x))
    .sort((a, b) => b.x - a.x)
    .slice(0, 30);

  if (!data.length) {
    svg.append("text").attr("x", 30).attr("y", 50).attr("fill", "#17212b").text("No parks have data for this ranking variable/year.");
    updateRankingSummary();
    return;
  }

  const xMax = riskVars.includes(rankingHazard) ? 100 : d3.max(data, d => d.x);
  const innerW = w - m.left - m.right;
  const innerH = h - m.top - m.bottom;
  const x = d3.scaleLinear().domain([0, xMax]).nice().range([0, innerW]);
  const y = d3.scaleBand().domain(data.map(d => d.name)).range([0, innerH]).padding(0.35);
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  g.append("g").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6));

  g.selectAll("rect").data(data).enter().append("rect")
    .attr("class", d => `ranking-bar bar-${d.code}`)
    .attr("x", 0).attr("y", d => y(d.name)).attr("height", y.bandwidth()).attr("width", d => x(d.x))
    .attr("rx", 7).attr("fill", d => getRankColor(d.x, rankingHazard))
    .on("click", (_, d) => selectPark(d.park));

  g.selectAll(".chart-rank").data(data).enter().append("text")
    .attr("x", -242).attr("y", d => y(d.name) + y.bandwidth() / 2 + 5)
    .attr("fill", "#31572c").attr("font-weight", 800).attr("font-size", 12).text((d, i) => `#${i + 1}`);

  g.selectAll(".chart-label").data(data).enter().append("text")
    .attr("class", "chart-label").attr("x", -12).attr("y", d => y(d.name) + y.bandwidth() / 2 + 5)
    .attr("text-anchor", "end").text(d => shortName(d.name));

  g.selectAll(".chart-value").data(data).enter().append("text")
    .attr("class", "chart-value").attr("x", d => x(d.x) + 8).attr("y", d => y(d.name) + y.bandwidth() / 2 + 5)
    .text(d => fmt(d.x));

  svg.append("text").attr("x", m.left).attr("y", h - 18).attr("fill", "#31572c").attr("font-size", 13).attr("font-weight", 700)
    .text(`Top ${data.length} parks ranked by ${labels[rankingHazard]} in ${currentYear}`);

  updateRankingSummary();
}

function updateRankingSummary() {
  ensureRankingSummaryPanel();

  const allData = parks
    .map(p => ({ park: p, code: p.parkCode, name: p.fullName, x: getRankValue(p, rankingHazard) }))
    .filter(d => ok(d.x))
    .sort((a, b) => b.x - a.x);

  const topEl = document.getElementById("rankTopPark");
  const medEl = document.getElementById("rankMedian");
  const lowEl = document.getElementById("rankLowPark");
  const list = document.getElementById("rankingTopList");

  if (!allData.length) {
    if (topEl) topEl.textContent = "NA";
    if (medEl) medEl.textContent = "NA";
    if (lowEl) lowEl.textContent = "NA";
    if (list) list.innerHTML = "<p>No data available.</p>";
    drawRankingDistribution([]);
    return;
  }

  const median = d3.median(allData, d => d.x);
  if (topEl) topEl.textContent = `${shortName(allData[0].name)} (${fmt(allData[0].x)})`;
  if (medEl) medEl.textContent = fmt(median);
  if (lowEl) lowEl.textContent = `${shortName(allData[allData.length - 1].name)} (${fmt(allData[allData.length - 1].x)})`;

  if (list) {
    list.innerHTML = allData.slice(0, 5).map((d, i) => `
      <button onclick="selectPark(parkByCode['${codeOf(d.code)}'])">
        <span>#${i + 1}</span>
        <b>${shortName(d.name)}</b>
        <em>${fmt(d.x)}</em>
      </button>
    `).join("");
  }

  drawRankingDistribution(allData);
}

function drawRankingDistribution(allData) {
  const svg = d3.select("#rankingDistributionChart");
  svg.selectAll("*").remove();

  const w = svg.node()?.clientWidth || 420;
  const h = 180;
  const m = { top: 18, right: 20, bottom: 36, left: 42 };
  svg.attr("viewBox", `0 0 ${w} ${h}`);

  if (!allData.length) {
    svg.append("text").attr("x", 18).attr("y", 42).attr("fill", "#586575").text("No data available.");
    return;
  }

  const vals = allData.map(d => d.x);
  const x = d3.scaleLinear().domain(d3.extent(vals)).nice().range([m.left, w - m.right]);
  const bins = d3.bin().domain(x.domain()).thresholds(10)(vals);
  const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([h - m.bottom, m.top]);

  svg.append("g").attr("transform", `translate(0,${h - m.bottom})`).call(d3.axisBottom(x).ticks(5));
  svg.append("g").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(4));

  svg.selectAll("rect").data(bins).enter().append("rect")
    .attr("x", d => x(d.x0) + 1).attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2))
    .attr("height", d => h - m.bottom - y(d.length))
    .attr("rx", 4)
    .attr("fill", d => getRankColor((d.x0 + d.x1) / 2, rankingHazard));
}

function highlightChartBar(code) {
  d3.selectAll(".ranking-bar").attr("opacity", 0.3);
  d3.select(`.bar-${code}`).attr("opacity", 1).attr("stroke", "#9d0208").attr("stroke-width", 2);
}

function clearChartHighlight() {
  d3.selectAll(".ranking-bar").attr("opacity", 1).attr("stroke", "none");
}

// =========================================================
// Comparison dashboard
// =========================================================
// User can compare up to five parks.
function ensureMapComparePanel() {
  if (document.getElementById("mapComparePanel")) return;
  const home = document.getElementById("homePage");
  if (!home) return;

  const panel = document.createElement("div");
  panel.id = "mapComparePanel";
  panel.innerHTML = `
    <h4>Compare this park</h4>
    <p id="mapCompareText">Select a park to add it to the comparison dashboard.</p>
    <button id="mapCompareButton" class="primary-compare-btn">Add to Comparison</button>
    <button class="secondary-map-btn" onclick="document.getElementById('comparisonPanel')?.scrollIntoView({behavior:'smooth', block:'start'})">View Comparison Dashboard</button>
  `;
  home.appendChild(panel);
}

function updateMapComparePanel() {
  ensureMapComparePanel();
  const text = document.getElementById("mapCompareText");
  const btn = document.getElementById("mapCompareButton");
  if (!text || !btn) return;

  if (!selectedPark) {
    text.innerHTML = "Select a park to add it to the comparison dashboard.";
    btn.onclick = null;
    return;
  }

  const code = codeOf(selectedPark.parkCode);
  const compared = isParkCompared(code);
  text.innerHTML = `<b>${shortName(selectedPark.fullName)}</b><br>${labels[currentHazard]}: ${fmt(getValue(selectedPark))}`;
  btn.textContent = compared ? "Remove from Comparison" : "Add to Comparison";
  btn.onclick = () => toggleComparePark(code);
}

function ensureComparisonDashboard() {
  if (document.getElementById("comparisonPanel")) return;
  const chartPanel = document.querySelector(".chart-panel");
  if (!chartPanel) return;

  const panel = document.createElement("section");
  panel.id = "comparisonPanel";
  panel.className = "comparison-panel";
  panel.innerHTML = `
    <div class="comparison-header">
      <div>
        <h3>Multi-Park Comparison Dashboard</h3>
        <p>Add up to five parks to compare risk fingerprints, annual values, temperature trajectories, and event burden.</p>
      </div>
    </div>
    <div id="compareList" class="compare-list"></div>
    <div class="comparison-grid">
      <div class="comparison-card"><h4>Climate + Event Risk Fingerprint</h4><svg id="compareRadar" class="comparison-svg"></svg></div>
      <div class="comparison-card"><h4>Annual Values by Park</h4><svg id="compareBars" class="comparison-svg"></svg></div>
      <div class="comparison-card"><h4>Monthly Temperature Trajectories</h4><svg id="compareTempLines" class="comparison-svg"></svg></div>
      <div class="comparison-card"><h4>Monthly Event Burden</h4><svg id="compareEventBars" class="comparison-svg"></svg></div>
    </div>
  `;
  chartPanel.after(panel);
}

function isParkCompared(code) {
  return compareParks.some(p => codeOf(p.parkCode) === codeOf(code));
}

function toggleComparePark(code) {
  const park = parkByCode[codeOf(code)] || parks.find(p => codeOf(p.parkCode) === codeOf(code));
  if (!park) return;

  if (isParkCompared(code)) {
    compareParks = compareParks.filter(p => codeOf(p.parkCode) !== codeOf(code));
  } else {
    if (compareParks.length >= maxCompareParks) compareParks.shift();
    compareParks.push(park);
  }

  if (selectedPark) openDetail(selectedPark);
  updateMapComparePanel();
  updateComparisonDashboard();
}

function removeComparePark(code) {
  compareParks = compareParks.filter(p => codeOf(p.parkCode) !== codeOf(code));
  if (selectedPark) openDetail(selectedPark);
  updateMapComparePanel();
  updateComparisonDashboard();
}

function clearComparison() {
  compareParks = [];
  if (selectedPark) openDetail(selectedPark);
  updateMapComparePanel();
  updateComparisonDashboard();
}

window.toggleComparePark = toggleComparePark;
window.removeComparePark = removeComparePark;
window.clearComparison = clearComparison;
window.exitDetailMode = exitDetailMode;

function updateComparisonDashboard() {
  ensureComparisonDashboard();
  updateMapComparePanel();

  const list = document.getElementById("compareList");
  if (!list) return;

  if (!compareParks.length) {
    list.innerHTML = `<p class="comparison-note">No parks selected yet. Click a park, then choose <b>Add to Comparison</b>.</p>`;
    clearCompareSVGs();
    return;
  }

  list.innerHTML = compareParks.map(p => `
    <span class="compare-chip">${shortName(p.fullName)} <button onclick="removeComparePark('${codeOf(p.parkCode)}')">×</button></span>
  `).join("");

  drawCompareRadar();
  drawCompareBars();
  drawCompareTempLines();
  drawCompareEventBars();
}

function clearCompareSVGs() {
  ["#compareRadar", "#compareBars", "#compareTempLines", "#compareEventBars"].forEach(id => {
    const svg = d3.select(id);
    svg.selectAll("*").remove();
    svg.append("text").attr("x", 18).attr("y", 42).attr("fill", "#586575").text("Select parks to compare.");
  });
}

function compareColor(i) {
  return d3.schemeTableau10[i % 10];
}

function normalizedMetric(record, key) {
  if (!record) return null;
  const value = record[key];
  if (!ok(value)) return null;
  if (riskVars.includes(key)) return +value;
  const vals = parks.map(p => getAnnualRecord(p)?.[key]).filter(ok);
  return norm(value, d3.extent(vals));
}

// Radar chart for risk profile.
function drawCompareRadar() {
  const svg = d3.select("#compareRadar");
  svg.selectAll("*").remove();

  const w = svg.node().clientWidth || 500;
  const h = 300;
  const cx = w / 2;
  const cy = h / 2 + 6;
  const radius = Math.min(w, h) * 0.34;
  const metrics = ["heatRisk", "droughtClimateRisk", "precipRisk", "flood", "wildfire", "cold"];
  const metricLabels = ["Heat", "Climate drought", "Precip", "Flood", "Wildfire", "Cold"];
  svg.attr("viewBox", `0 0 ${w} ${h}`);

  [0.25, 0.5, 0.75, 1].forEach(t => {
    const points = metrics.map((m, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / metrics.length;
      return [cx + Math.cos(a) * radius * t, cy + Math.sin(a) * radius * t];
    });
    svg.append("polygon").attr("points", points.map(d => d.join(",")).join(" ")).attr("fill", "none").attr("stroke", "rgba(23,33,43,0.16)");
  });

  metrics.forEach((m, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / metrics.length;
    svg.append("line").attr("x1", cx).attr("y1", cy).attr("x2", cx + Math.cos(a) * radius).attr("y2", cy + Math.sin(a) * radius).attr("stroke", "rgba(23,33,43,0.16)");
    svg.append("text").attr("class", "radar-axis-label").attr("x", cx + Math.cos(a) * (radius + 25)).attr("y", cy + Math.sin(a) * (radius + 25)).attr("text-anchor", "middle").text(metricLabels[i]);
  });

  compareParks.forEach((park, i) => {
    const r = getAnnualRecord(park);
    const points = metrics.map((m, j) => {
      const val = normalizedMetric(r, m) || 0;
      const a = -Math.PI / 2 + j * 2 * Math.PI / metrics.length;
      return [cx + Math.cos(a) * radius * val / 100, cy + Math.sin(a) * radius * val / 100];
    });
    svg.append("polygon").attr("points", points.map(d => d.join(",")).join(" ")).attr("fill", compareColor(i)).attr("fill-opacity", 0.16).attr("stroke", compareColor(i)).attr("stroke-width", 2);
    svg.append("text").attr("x", 14).attr("y", 20 + i * 16).attr("fill", compareColor(i)).attr("font-weight", 800).attr("font-size", 12).text(shortName(park.fullName));
  });
}

// Annual value comparison.
function drawCompareBars() {
  groupedBarChart(
    "#compareBars",
    compareParks.map((p, i) => ({ name: shortName(p.fullName), value: getValue(p), color: compareColor(i) })).filter(d => ok(d.value)),
    riskVars.includes(currentHazard) ? 100 : null,
    "No annual values for selected indicator."
  );
}

// Annual event burden comparison.
function drawCompareEventBars() {
  groupedBarChart(
    "#compareEventBars",
    compareParks.map((p, i) => ({ name: shortName(p.fullName), value: getAnnualRecord(p)?.total_risk_events, color: compareColor(i) })).filter(d => ok(d.value)),
    null,
    "No annual event-count values."
  );
}

function groupedBarChart(selector, data, fixedMax, emptyText) {
  const svg = d3.select(selector);
  svg.selectAll("*").remove();

  const w = svg.node().clientWidth || 500;
  const h = 300;
  const m = { top: 28, right: 20, bottom: 65, left: 48 };
  svg.attr("viewBox", `0 0 ${w} ${h}`);

  if (!data.length) {
    svg.append("text").attr("x", 18).attr("y", 42).attr("fill", "#586575").text(emptyText);
    return;
  }

  const x = d3.scaleBand().domain(data.map(d => d.name)).range([m.left, w - m.right]).padding(0.28);
  const y = d3.scaleLinear().domain([0, fixedMax || d3.max(data, d => d.value)]).nice().range([h - m.bottom, m.top]);

  svg.append("g").attr("class", "compare-axis").attr("transform", `translate(0,${h - m.bottom})`).call(d3.axisBottom(x)).selectAll("text").attr("transform", "rotate(-28)").attr("text-anchor", "end");
  svg.append("g").attr("class", "compare-axis").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5));

  svg.selectAll("rect").data(data).enter().append("rect")
    .attr("x", d => x(d.name)).attr("y", d => y(d.value)).attr("width", x.bandwidth()).attr("height", d => h - m.bottom - y(d.value)).attr("rx", 8).attr("fill", d => d.color);

  svg.selectAll(".val").data(data).enter().append("text")
    .attr("x", d => x(d.name) + x.bandwidth() / 2).attr("y", d => y(d.value) - 6).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 800).attr("fill", "#17212b").text(d => fmt(d.value));
}

// Monthly mean temperature comparison.
function drawCompareTempLines() {
  const svg = d3.select("#compareTempLines");
  svg.selectAll("*").remove();

  const w = svg.node().clientWidth || 500;
  const h = 300;
  const m = { top: 24, right: 25, bottom: 35, left: 48 };
  svg.attr("viewBox", `0 0 ${w} ${h}`);

  const rowsByPark = compareParks.map((p, i) => ({
    park: p,
    color: compareColor(i),
    rows: climateMonthly.filter(d => d.parkCode === codeOf(p.parkCode) && d.year === +currentYear).sort((a, b) => a.month - b.month)
  }));

  const values = rowsByPark.flatMap(d => d.rows.map(r => r.temp).filter(ok));
  if (!values.length) {
    svg.append("text").attr("x", 18).attr("y", 42).attr("fill", "#586575").text("No monthly mean temperature values.");
    return;
  }

  const x = d3.scaleLinear().domain([1, 12]).range([m.left, w - m.right]);
  const y = d3.scaleLinear().domain(d3.extent(values)).nice().range([h - m.bottom, m.top]);

  svg.append("g").attr("class", "compare-axis").attr("transform", `translate(0,${h - m.bottom})`).call(d3.axisBottom(x).ticks(12).tickFormat(d3.format("d")));
  svg.append("g").attr("class", "compare-axis").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5));

  rowsByPark.forEach((item, i) => {
    const line = d3.line().defined(d => ok(d.temp)).x(d => x(d.month)).y(d => y(d.temp));
    svg.append("path").datum(item.rows).attr("fill", "none").attr("stroke", item.color).attr("stroke-width", 2.4).attr("d", line);
    svg.append("text").attr("x", w - 150).attr("y", 18 + i * 16).attr("fill", item.color).attr("font-size", 11).attr("font-weight", 800).text(shortName(item.park.fullName));
  });
}

// =========================================================
// Controls and legend
// =========================================================
// Sidebar input listeners update map, chart, and detail panel.
function updateLegend() {
  const title = document.getElementById("legendTitle");
  const gradient = document.getElementById("legendGradient");
  if (!title || !gradient) return;

  title.innerHTML = `${labels[currentHazard]} (${currentYear})`;
  const cols = d3.range(0, 1.01, 0.1).map(t => {
    if (riskVars.includes(currentHazard)) return getMapColor(t * 100);
    const ex = currentExtent();
    return getMapColor(ex[0] + t * (ex[1] - ex[0]));
  });
  gradient.style.background = `linear-gradient(to right, ${cols.join(",")})`;
}

function setupYearSlider() {
  const years = [...new Set(climateMonthly.map(d => d.year))].sort((a, b) => a - b);
  const slider = document.getElementById("yearSlider");
  if (!slider || !years.length) return;

  slider.min = d3.min(years);
  slider.max = d3.max(years);
  slider.value = slider.min;
  currentYear = +slider.value;
  document.getElementById("yearLabel").innerHTML = currentYear;

  const labs = document.querySelectorAll(".slider-labels span");
  if (labs.length >= 2) {
    labs[0].innerHTML = slider.min;
    labs[1].innerHTML = slider.max;
  }
}

function updateControls() {
  currentHazard = document.getElementById("hazardSelect").value;
  currentYear = +document.getElementById("yearSlider").value;
  currentRiskFilter = +document.getElementById("riskFilter").value;
  document.getElementById("yearLabel").innerHTML = currentYear;
  document.getElementById("riskLabel").innerHTML = currentRiskFilter;

  redrawMap();
  updateChart();
  setupLayerControl();
  updateComparisonDashboard();
  if (selectedPark) openDetail(selectedPark);
}

function searchPark() {
  const q = document.getElementById("searchBox").value.toLowerCase();
  if (q.length < 2) return;
  const p = parks.find(d => d.fullName.toLowerCase().includes(q));
  if (p) selectPark(p);
}

// =========================================================
// Initialize app
// =========================================================
// Load data first, then draw map and charts.
async function init() {
  ensureComparisonDashboard();
  ensureMapComparePanel();

  document.getElementById("searchBox")?.addEventListener("keyup", searchPark);
  document.getElementById("hazardSelect")?.addEventListener("change", updateControls);
  document.getElementById("yearSlider")?.addEventListener("input", updateControls);
  document.getElementById("riskFilter")?.addEventListener("input", updateControls);

  try {
    await loadClimateCSVs();
    await loadNPS();
    await loadContextLayers();
    await loadBoundaries();

    redrawMap();
    setupLayerControl();
    updateChart();
    updateComparisonDashboard();
    zoomToRegion("mainland");

    map.on("zoomend", updateCountyVisibility);
    updateCountyVisibility();
  } catch (err) {
    console.error("Initialization failed:", err);
    alert("Data loading failed. Check CSV, GeoJSON, and file paths in js/main.js.");
  }
}

init();

// Extra global exports for inline HTML and chart buttons.
window.selectPark = selectPark;
window.updateChart = updateChart;
window.updateRankingSummary = updateRankingSummary;
