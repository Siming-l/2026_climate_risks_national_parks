

// NPS API key used to request official park information.
const apiKey = "bWAAEqyZ3eUDlvKietZDTGgX0NAg9fBoeUPItvkV";

// Current variable used to color the map and show values in the detail panel.
let currentHazard = "multi_risk";

// Current variable used by the ranking bar chart.
let rankingHazard = "multi_risk";

// The active year shown by the year slider.
let currentYear = 1985;

// Controls whether the app shows one selected year or the all-year average.
let yearMode = "current";

// Stores the park currently clicked by the user.
let selectedPark = null;

// Stores parks added into the multi-park comparison dashboard.
let compareParks = [];

// Main park list returned from the NPS API after matching with climate data.
let parks = [];


// Fast lookup table so the app can find a park by its park code.
let parkByCode = {};


// Monthly climate-risk rows loaded from the local CSV file.
let climateMonthly = [];


// Annual summaries built from the monthly climate data.
let annual = {};


// Set of park codes that exist in the climate dataset.
let climateParkCodes = new Set();

// Main National Park polygon layer.
let boundaryLayer = null;
// Layer for rank glyph markers and clusters.
let glyphLayer = null;
// Marker cluster layer for park glyphs at small scales.
let clusterLayer = null;
// U.S. national boundary reference layer.
let nationLayer = null;
// State boundary reference layer.
let stateLayer = null;
// County boundary reference layer, shown only at closer zoom levels.
let countyLayer = null;
// Leaflet layer control for basemaps and overlays.
let layerControl = null;







// Human-readable labels for dropdowns, legends, popups, and charts.
const labels = {
  multi_risk: "Overall Climate Risk",
  heat_risk: "Heat Risk",
  flood_risk: "Flood / Wetness Risk",
  drought_risk: "Drought Risk",
  cold_risk: "Cold Risk",
  temp: "Mean Temperature",
  tmax: "Maximum Temperature",
  tmin: "Minimum Temperature",
  precip: "Precipitation",
  pdsi: "PDSI"
};





// Clean a park code or text value so different datasets can match correctly.
function codeOf(x) {
  return String(x || "").trim().toLowerCase();
}

// Check whether a value is real numeric data instead of blank, null, or NaN.
function ok(x) {
  return x !== null && x !== undefined && x !== "" && !Number.isNaN(+x);
}

// Convert a value to a number, while keeping missing values as null.
function num(x) {
  return ok(x) ? +x : null;
}

// Format values for display; missing values appear as NA.
function fmt(x, d = 1) {
  return ok(x) ? Number(x).toFixed(d) : "NA";
}

// Calculate the mean after removing missing values.
function meanValid(arr) {
  const vals = arr.filter(ok).map(Number);
  return vals.length ? d3.mean(vals) : null;
}

// Calculate the sum after removing missing values.
function sumValid(arr) {
  const vals = arr.filter(ok).map(Number);
  return vals.length ? d3.sum(vals) : null;
}

// Shorten long National Park names so labels fit better in charts.
function shortName(name) {
  return String(name || "")
    .replace(" National Park and Preserve", "")
    .replace(" National Park", "")
    .replace(" National Parks", "")
    .replace(" and Preserve", "")
    .replace(" & Preserve", "");
}





/* ================= Modal ================= */
// Close the intro modal and refresh the map size afterward.
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.remove();
  document.body.classList.remove("modal-open");

  setTimeout(() => {
    if (typeof map !== "undefined") map.invalidateSize();
  }, 200);
}

// Expose modal close function so HTML buttons can call it.
window.closeModal = closeModal;

// Wait until the page is loaded before connecting modal buttons.
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startExploring");
  const closeBtn = document.querySelector(".modal-close");
  const modal = document.getElementById("introModal");

  // Shared click handler for closing the intro modal.
  const removeModal = e => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (modal) modal.remove();
    document.body.classList.remove("modal-open");

    setTimeout(() => {
      if (typeof map !== "undefined") map.invalidateSize();
    }, 250);
  };

  if (startBtn) startBtn.onmousedown = removeModal;
  if (closeBtn) closeBtn.onmousedown = removeModal;
});

/* ================= Layout + Style Fixes ================= */

// Inject final CSS fixes directly from JavaScript so the layout stays consistent.
function injectLayoutFixes() {
  const old = document.getElementById("finalPanelStyles");
  if (old) old.remove();

  const style = document.createElement("style");
  style.id = "finalPanelStyles";

  style.innerHTML = `
    #riskFilter,
    #riskLabel {
      display: none !important;
    }

    .panel-section:has(#riskFilter) {
      display: none !important;
    }

    .top-nav {
      min-height: 72px !important;
      height: auto !important;
      padding: 12px 22px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 18px !important;
      background: linear-gradient(90deg, #fffaf0 0%, #f6efe2 100%) !important;
    }

    .nav-title.title-modern {
      display: grid !important;
      grid-template-columns: auto auto !important;
      grid-template-rows: auto auto !important;
      column-gap: 16px !important;
      align-items: center !important;
    }

    .nav-title.title-modern strong {
      grid-column: 1 / 2 !important;
      grid-row: 1 !important;
      font-size: 21px !important;
      font-weight: 900 !important;
      letter-spacing: 0.2px !important;
      color: #102235 !important;
      line-height: 1.15 !important;
    }

    .nav-title.title-modern span {
      grid-column: 1 / 2 !important;
      grid-row: 2 !important;
      margin-top: 4px !important;
      font-size: 13px !important;
      color: #607080 !important;
    }

    .dark-mode-toggle {
      grid-column: 2 / 3 !important;
      grid-row: 1 / 3 !important;
      align-self: center !important;
      width: auto !important;
      padding: 10px 16px !important;
      border-radius: 999px !important;
      border: 1px solid rgba(49, 87, 44, 0.25) !important;
      background: linear-gradient(135deg, #1b4332, #31572c) !important;
      color: white !important;
      font-size: 13px !important;
      font-weight: 900 !important;
      box-shadow: 0 8px 20px rgba(49, 87, 44, 0.22) !important;
      cursor: pointer !important;
      white-space: nowrap !important;
    }

    .nav-links {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    .nav-links button {
      margin-left: 0 !important;
      border-radius: 12px !important;
      padding: 10px 15px !important;
      font-weight: 900 !important;
    }

    body.dark-mode {
      background: #07111f !important;
      color: #e6edf5 !important;
    }

    body.dark-mode .top-nav {
      background: linear-gradient(90deg, #07111f 0%, #0f1b2d 100%) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
    }

    body.dark-mode .nav-title.title-modern strong {
      color: #f1f7ff !important;
    }

    body.dark-mode .nav-title.title-modern span {
      color: #b8c7d9 !important;
    }

    body.dark-mode .dark-mode-toggle {
      background: linear-gradient(135deg, #d8f3dc, #95d5b2) !important;
      color: #07111f !important;
    }

    body.dark-mode .main-area,
    body.dark-mode #homePage,
    body.dark-mode .chart-panel,
    body.dark-mode #comparisonPanel,
    body.dark-mode .comparison-panel,
    body.dark-mode .floating-detail,
    body.dark-mode .text-page,
    body.dark-mode .text-page-card,
    body.dark-mode .comparison-card {
      background: #07111f !important;
      color: #e6edf5 !important;
      border-color: rgba(255, 255, 255, 0.14) !important;
    }

    body.dark-mode .sidebar {
      background: #06101c !important;
      color: #e6edf5 !important;
    }

    body.dark-mode .panel-section,
    body.dark-mode .risk-card,
    body.dark-mode .ranking-control {
      background: #0f1b2d !important;
      color: #e6edf5 !important;
      border-color: rgba(255, 255, 255, 0.14) !important;
    }

    body.dark-mode input,
    body.dark-mode select {
      background: #14243a !important;
      color: #e6edf5 !important;
      border-color: rgba(255, 255, 255, 0.18) !important;
    }

    body.dark-mode .text-page-card h1,
    body.dark-mode .text-page-card h2 {
      color: #d8f3dc !important;
    }

    .user-resizable-panel {
      resize: both !important;
      overflow: auto !important;
      min-width: 260px !important;
      min-height: 120px !important;
      max-width: 96vw !important;
      max-height: none !important;
    }

    .floating-detail.user-resizable-panel {
      min-width: 430px !important;
      min-height: 360px !important;
      max-height: 92vh !important;
    }

    .chart-panel.user-resizable-panel,
    #comparisonPanel.user-resizable-panel,
    .comparison-panel.user-resizable-panel {
      min-width: 520px !important;
      min-height: 430px !important;
    }

    .text-page-card.user-resizable-panel {
      min-width: 520px !important;
      min-height: 420px !important;
      max-width: 96vw !important;
    }

    #mapComparePanel {
      position: fixed !important;
      left: 336px !important;
      top: 88px !important;
      width: 300px !important;
      z-index: 1000 !important;
      border-radius: 16px !important;
    }

    body:not(.detail-mode) #mapComparePanel {
      display: none !important;
    }

    #rankingChart {
      width: 100%;
      min-height: 760px;
      overflow: visible;
    }

    .chart-rank,
    .chart-label,
    .chart-value {
      dominant-baseline: middle;
    }

    .chart-label {
      fill: #17212b;
    }

    body.dark-mode .chart-label,
    body.dark-mode .chart-value {
      fill: #e6edf5;
    }

    .cluster-explain {
      margin-top: 10px;
      font-size: 12px;
      line-height: 1.45;
      color: #586575;
    }

    body.dark-mode .cluster-explain {
      color: #b8c7d9;
    }
  `;

  document.head.appendChild(style);

  const riskFilter = document.getElementById("riskFilter");
  if (riskFilter) {
    const section = riskFilter.closest(".panel-section");
    if (section) section.style.display = "none";
  }
}







// Add a resizable class to major dashboard panels.
function makeAllPanelsResizable() {
  const selectors = [
    ".floating-detail",
    ".chart-panel",
    "#comparisonPanel",
    ".comparison-panel",
    ".text-page-card",
    ".comparison-card",
    ".ranking-control",
    ".panel-section"
  ];

  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      el.classList.add("user-resizable-panel");
    });
  });
}


/* ================= Map ================= */
// Create the main Leaflet map object.
const map = L.map("map", {
  zoomControl: false,
  minZoom: 2,
  maxZoom: 14
}).setView([39, -98], 4);

// Put zoom buttons in the lower-left corner.
L.control.zoom({ position: "bottomleft" }).addTo(map);





// Basemap options users can switch between.
const basemaps = {
  Terrain: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Esri Terrain" }
  ),
  Topographic: L.tileLayer(
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
  Satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Esri" }
  )
};

// Start with Terrain as the default basemap.
basemaps.Terrain.addTo(map);






/* ================= Data ================= */
// Load the monthly climate-risk CSV and convert values into clean numeric fields.
async function loadClimateCSV() {
  // Read CSV rows and clean each row immediately.
  climateMonthly = await d3.csv(
    "data/national_parks_climate_risk_monthly_ALL63_1985_2026_FIXED.csv",
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
      precip: num(d.precip),
      pdsi: num(d.pdsi),
      heat_risk: num(d.heat_risk),
      flood_risk: num(d.flood_risk),
      drought_risk: num(d.drought_risk),
      cold_risk: num(d.cold_risk),
      multi_risk: num(d.multi_risk),
      heat_event: num(d.heat_event),
      flood_event: num(d.flood_event),
      drought_event: num(d.drought_event),
      cold_event: num(d.cold_event)
    })
  );

  // Save park codes that have climate records.
  climateParkCodes = new Set(climateMonthly.map(d => d.parkCode));
  buildAnnualData();
  setupYearSlider();
}

// Load official National Park metadata from the NPS API and keep only parks in the climate dataset.
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


  // Keep only the 63 parks that match the climate-risk dataset.
  parks = all.filter(p => climateParkCodes.has(codeOf(p.parkCode)));
  // Build lookup table for quick park matching.
  parkByCode = Object.fromEntries(parks.map(p => [codeOf(p.parkCode), p]));
}





// Aggregate monthly climate records into annual summaries for each park and year.
function buildAnnualData() {
  annual = {};

  d3.group(climateMonthly, d => d.parkCode, d => d.year).forEach((yearMap, code) => {
    annual[code] = {};

    yearMap.forEach((rows, year) => {
      annual[code][year] = {
        temp: meanValid(rows.map(d => d.temp)),
        tmax: meanValid(rows.map(d => d.tmax)),
        tmin: meanValid(rows.map(d => d.tmin)),
        precip: sumValid(rows.map(d => d.precip)),
        pdsi: meanValid(rows.map(d => d.pdsi)),
        heat_risk: meanValid(rows.map(d => d.heat_risk)),
        flood_risk: meanValid(rows.map(d => d.flood_risk)),
        drought_risk: meanValid(rows.map(d => d.drought_risk)),
        cold_risk: meanValid(rows.map(d => d.cold_risk)),
        multi_risk: meanValid(rows.map(d => d.multi_risk)),
        heat_event: sumValid(rows.map(d => d.heat_event)),
        flood_event: sumValid(rows.map(d => d.flood_event)),
        drought_event: sumValid(rows.map(d => d.drought_event)),
        cold_event: sumValid(rows.map(d => d.cold_event)),
        rowCount: rows.length,
        climateValueCount: rows.flatMap(d => [
          d.temp,
          d.tmax,
          d.tmin,
          d.precip,
          d.pdsi
        ]).filter(ok).length
      };
    });
  });
}




/* ================= Values ================= */
// Return the correct annual record depending on selected year mode.
function getAnnualRecord(park) {
  const code = codeOf(park?.parkCode);
  const records = annual[code];

  if (!records) return null;

  // When all-year mode is selected, summarize across all years.
  if (yearMode === "all") {
    const allYears = Object.values(records);

    return {
      temp: meanValid(allYears.map(d => d.temp)),
      tmax: meanValid(allYears.map(d => d.tmax)),
      tmin: meanValid(allYears.map(d => d.tmin)),
      precip: meanValid(allYears.map(d => d.precip)),
      pdsi: meanValid(allYears.map(d => d.pdsi)),
      heat_risk: meanValid(allYears.map(d => d.heat_risk)),
      flood_risk: meanValid(allYears.map(d => d.flood_risk)),
      drought_risk: meanValid(allYears.map(d => d.drought_risk)),
      cold_risk: meanValid(allYears.map(d => d.cold_risk)),
      multi_risk: meanValid(allYears.map(d => d.multi_risk)),
      heat_event: sumValid(allYears.map(d => d.heat_event)),
      flood_event: sumValid(allYears.map(d => d.flood_event)),
      drought_event: sumValid(allYears.map(d => d.drought_event)),
      cold_event: sumValid(allYears.map(d => d.cold_event)),
      climateValueCount: sumValid(allYears.map(d => d.climateValueCount))
    };
  }

  // Otherwise return the selected year only.
  return records[+currentYear] || null;
}





// Get the current map value for a park and selected hazard variable.
function getValue(park, hazard = currentHazard) {
  const r = getAnnualRecord(park);
  if (!r) return null;

  const x = r[hazard];
  return ok(x) ? +Number(x).toFixed(2) : null;
}

// Find the current min and max values for normalization.
function currentExtent(hazard = currentHazard) {
  const vals = parks.map(p => getValue(p, hazard)).filter(ok);
  return vals.length ? d3.extent(vals) : [0, 100];
}

// Normalize a raw value into a 0–100 scale for color and symbol sizing.
function normalizeValue(x, hazard = currentHazard) {
  if (!ok(x)) return null;

  const ex = currentExtent(hazard);
  if (!ok(ex[0]) || !ok(ex[1]) || ex[0] === ex[1]) return 50;

  return Math.max(0, Math.min(100, ((x - ex[0]) / (ex[1] - ex[0])) * 100));
}





// Choose a map color scale based on the selected climate or risk variable.
function getMapColor(x, hazard = currentHazard) {
  const n = normalizeValue(x, hazard);
  if (!ok(n)) return "#b8b8b8";

  // Pick color palette by variable type.
  const scale =
    hazard === "precip" || hazard === "flood_risk" ? d3.interpolateBlues :
    hazard === "pdsi" || hazard === "drought_risk" ? d3.interpolateBrBG :
    hazard === "cold_risk" || hazard === "tmin" ? d3.interpolatePuBu :
    hazard === "heat_risk" || hazard === "temp" || hazard === "tmax" ? d3.interpolateOranges :
    d3.interpolateYlOrRd;

  return scale(n / 100);
}

// Convert normalized risk value into a simple qualitative class.
function rankClass(x) {
  const n = normalizeValue(x);
  if (!ok(n)) return "No data";
  if (n >= 80) return "Very High";
  if (n >= 60) return "High";
  if (n >= 40) return "Moderate";
  if (n >= 20) return "Low";
  return "Very Low";
}




/* ================= GeoJSON ================= */
// Load a GeoJSON file safely without crashing the whole app if the file is missing.
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


// Load national, state, and county boundary reference layers.
async function loadContextLayers() {
  const nation = await safeGeoJSON("data/Nation_Boundary.geojson");
  const states = await safeGeoJSON("data/State_Boundary.geojson");
  const counties = await safeGeoJSON("data/County_Boundary.geojson");

  if (nation) {
    nationLayer = L.geoJSON(nation, {
      style: {
        color: "#1b4332",
        weight: 2,
        opacity: 0.85,
        fill: false
      },
      interactive: false
    }).addTo(map);
  }

  if (states) {
    stateLayer = L.geoJSON(states, {
      style: {
        color: "#31572c",
        weight: 1,
        dashArray: "5 5",
        opacity: 0.62,
        fill: false
      },
      interactive: false
    }).addTo(map);
  }

  if (counties) {
  countyLayer = L.geoJSON(counties, {
    style: {
      color: "#4f5d3a",
      weight: 0.9,
      dashArray: "3 4",
      opacity: 0.65,
      fill: false
    },
    interactive: false
  });
}
}

// Load National Park boundary polygons and attach style and interaction behavior.
async function loadBoundaries() {
  const geo = await safeGeoJSON("data/NPS_Boundary.geojson");

  if (!geo) {
    console.warn("NPS_Boundary.geojson not found. Put the file inside the data folder.");
    return;
  }

  // Add National Park polygons to the map.
  boundaryLayer = L.geoJSON(geo, {
    filter: f => !!parkFromFeature(f),
    style: boundaryStyle,
    onEachFeature: onBoundary
  }).addTo(map);

  boundaryLayer.bringToBack();
}

// Match a boundary polygon feature back to its NPS park object using park code fields.
function parkFromFeature(feature) {
  const p = feature.properties || {};

  const code = codeOf(
    p.UNIT_CODE ||
    p.UNITCODE ||
    p.PARK_CODE ||
    p.PARKCODE ||
    p.parkCode ||
    p.Code ||
    p.code
  );

  return parkByCode[code] || null;
}

// Style each park polygon using selected status and current risk value.
function boundaryStyle(feature) {
  const park = parkFromFeature(feature);
  const x = park ? getValue(park) : null;

  const selected =
    selectedPark &&
    codeOf(selectedPark.parkCode) === codeOf(park?.parkCode);

  return {
    color: selected ? "#ffb703" : "#0b3d2e",
    weight: selected ? 4 : 2.2,
    opacity: 1,
    dashArray: selected ? null : "6 4",
    fillColor: getMapColor(x),
    fillOpacity: ok(x) ? 0.22 : 0.08,
    interactive: true
  };
}





// Attach popup, hover behavior, and click selection to each park polygon.
function onBoundary(feature, layer) {
  const park = parkFromFeature(feature);
  if (!park) return;

  layer.bindPopup(() => popupHTML(park));

  layer.on({
    mouseover: () => {
      layer.setStyle({
        color: "#ffb703",
        weight: 4,
        fillOpacity: 0.35
      });
      layer.bringToFront();
      if (glyphLayer) glyphLayer.bringToFront();
    },

    mouseout: () => {
      if (boundaryLayer) {
        boundaryLayer.resetStyle(layer);
        boundaryLayer.bringToBack();
      }
      if (glyphLayer) glyphLayer.bringToFront();
    },

    click: () => {
      selectPark(park, layer);
    }
  });
}






/* ================= Glyphs + Clustering ================= */
// Create a sorted park ranking based on the current map variable.
function rankedParks() {
  return parks
    .map(p => ({ park: p, value: getValue(p) }))
    .filter(d => ok(d.value))
    .sort((a, b) => b.value - a.value)
    .map((d, i) => ({ ...d, rank: i + 1 }));
}

// Build a quick lookup table from park code to ranking number.
function rankLookup() {
  return Object.fromEntries(rankedParks().map(d => [codeOf(d.park.parkCode), d.rank]));
}

// Scale the park glyph size based on the normalized risk value.
function glyphSize(x) {
  const n = normalizeValue(x);
  if (!ok(n)) return 8;
  return 8 + (n / 100) * 18;
}



// Draw park rank diamonds and clusters on the map.
function drawGlyphs() {
  if (glyphLayer) glyphLayer.remove();
  if (clusterLayer) clusterLayer.remove();

  const useCluster = typeof L.markerClusterGroup === "function";

  // Use marker clustering when the plugin is available.
  clusterLayer = useCluster
    ? L.markerClusterGroup({
        disableClusteringAtZoom: 5,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 45
      })
    : L.layerGroup();

  const ranks = rankLookup();





  // Draw one glyph marker for each park.
  parks.forEach(park => {
    const lat = +park.latitude;
    const lon = +park.longitude;
    const x = getValue(park);

    if (!ok(lat) || !ok(lon)) return;

    const rank = ranks[codeOf(park.parkCode)] || "";
    const size = glyphSize(x);
    const selected = selectedPark && codeOf(selectedPark.parkCode) === codeOf(park.parkCode);

    const html = `
      <div class="rank-glyph ${selected ? "selected" : ""}"
           title="${park.fullName}"
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

    const marker = L.marker([lat, lon], { icon })
      .bindPopup(() => popupHTML(park))
      .on("click", () => selectPark(park));

    clusterLayer.addLayer(marker);
  });

  clusterLayer.addTo(map);
  glyphLayer = clusterLayer;

  if (boundaryLayer) boundaryLayer.bringToBack();
  if (glyphLayer) glyphLayer.bringToFront();
}






/* ================= Detail Panel ================= */
// Switch the layout into detail mode when a park is selected.
function enterDetailMode() {
  document.body.classList.add("detail-mode");
  setTimeout(() => map.invalidateSize(), 250);
}

// Leave detail mode and return to the regular map layout.
function exitDetailMode() {
  document.body.classList.remove("detail-mode");
  setTimeout(() => map.invalidateSize(), 250);
}

// Close the right-side park detail panel and clear selection.
function closeFloatingDetail() {
  const panel = document.getElementById("floatingDetail");
  if (panel) panel.classList.add("hidden");

  selectedPark = null;
  exitDetailMode();
}



// Main park selection function used by map clicks and chart clicks.
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



// Build the Leaflet popup content for one park.
function popupHTML(park) {
  const yearText = yearMode === "all" ? "All Years Average" : currentYear;

  return `
    <b>${park.fullName}</b><br>
    ${park.states || ""}<br>
    <b>${labels[currentHazard]} (${yearText}):</b> ${fmt(getValue(park), 2)}<br>
    <b>Rank:</b> ${rankLookup()[codeOf(park.parkCode)] || "NA"}
  `;
}



// Fill and open the floating detail panel for the selected park.
function openDetail(park) {
  const r = getAnnualRecord(park);
  const code = codeOf(park.parkCode);
  const yearText = yearMode === "all" ? "All Years Average" : currentYear;

  const rows = climateMonthly
    .filter(d => d.parkCode === code && (yearMode === "all" || d.year === +currentYear))
    .sort((a, b) => a.year - b.year || a.month - b.month);

  const monthlyRows = yearMode === "all"
    ? d3.rollups(
        rows,
        v => ({
          month: v[0].month,
          temp: meanValid(v.map(d => d.temp)),
          tmax: meanValid(v.map(d => d.tmax)),
          tmin: meanValid(v.map(d => d.tmin)),
          precip: meanValid(v.map(d => d.precip)),
          pdsi: meanValid(v.map(d => d.pdsi)),
          heat_risk: meanValid(v.map(d => d.heat_risk)),
          flood_risk: meanValid(v.map(d => d.flood_risk)),
          drought_risk: meanValid(v.map(d => d.drought_risk)),
          cold_risk: meanValid(v.map(d => d.cold_risk))
        }),
        d => d.month
      ).map(d => d[1]).sort((a, b) => a.month - b.month)
    : rows;

  const rank = rankLookup()[code] || "NA";
  const content = document.getElementById("floatingDetailContent");
  if (!content) return;

  document.getElementById("floatingDetail")?.classList.add("resizable-panel");

  // Build the full right-side detail panel content.
  content.innerHTML = `
    <h2>${park.fullName}</h2>
    <p class="detail-meta">${park.states || "NA"} · ${park.designation || "NA"} · Code: ${code}</p>

    ${park.images?.[0]?.url ? `<img class="detail-img" src="${park.images[0].url}">` : ""}

    <p>${park.description || "No description available."}</p>

    <div class="selected-value">
      <b>${labels[currentHazard]} (${yearText}):</b> ${fmt(getValue(park), 2)}<br>
      <b>Current rank:</b> #${rank} · <b>Class:</b> ${rankClass(getValue(park))}
    </div>

    <div class="detail-actions">
      <button onclick="toggleComparePark('${code}')">${isParkCompared(code) ? "Remove from Comparison" : "Add to Comparison"}</button>
      <button onclick="clearComparison()">Clear Comparison</button>
      <button onclick="closeFloatingDetail()">Close Panel</button>
    </div>

    ${r ? riskCards(r) : `<p>No annual record found for this park.</p>`}

    <p class="debug-note">
      Glyphs show relative park rank. Larger/darker symbols indicate higher relative values.
      Clusters combine nearby parks at small map scales.
    </p>

    <h3>Monthly Temperature</h3>
    <svg id="tempChart" class="mini-chart"></svg>

    <h3>Monthly Precipitation + Drought</h3>
    <svg id="waterChart" class="mini-chart"></svg>

    <h3>Monthly Climate Risk Scores</h3>
    <svg id="riskChart" class="mini-chart"></svg>

    <h3>NPS Weather Info</h3>
    <p>${park.weatherInfo || "No NPS weather information available."}</p>
    <p><a class="media-link" href="${park.url}" target="_blank">Official NPS Page →</a></p>
  `;

  const side = document.getElementById("selectedParkPanel");
  if (side) {
    side.innerHTML = `
      <b>${park.fullName}</b><br>
      ${labels[currentHazard]}: ${fmt(getValue(park), 2)}<br>
      Rank: #${rank}
    `;
  }

  document.getElementById("floatingDetail")?.classList.remove("hidden");

  drawMonthlyCharts(monthlyRows);
  updateMapComparePanel();
}





// Create the grid of annual climate and risk summary cards.
function riskCards(r) {
  return `
    <div class="risk-grid">
      ${card("Overall Risk", r.multi_risk, 2)}
      ${card("Heat Risk", r.heat_risk, 2)}
      ${card("Flood / Wetness Risk", r.flood_risk, 2)}
      ${card("Drought Risk", r.drought_risk, 2)}
      ${card("Cold Risk", r.cold_risk, 2)}
      ${card("Mean Temp", r.temp, 1)}
      ${card("Max Temp", r.tmax, 1)}
      ${card("Min Temp", r.tmin, 1)}
      ${card("Precipitation", r.precip, 1)}
      ${card("PDSI", r.pdsi, 2)}
    </div>

    <p class="debug-note">
      Event-burden values are not shown as primary indicators because the processed event flags are sparse and often equal to zero.
      The main interpretation uses climate-derived risk scores.
    </p>
  `;
}

// Create one small metric card in the detail panel.
function card(name, x, d = 1) {
  return `<div class="risk-card"><span>${name}</span><strong>${fmt(x, d)}</strong></div>`;
}





/* ================= Monthly Charts ================= */
// Draw all three monthly charts inside the detail panel.
function drawMonthlyCharts(rows) {
  // Temperature line chart.
  lineChart("#tempChart", rows, [
    ["tmin", "Min Temp"],
    ["temp", "Mean Temp"],
    ["tmax", "Max Temp"]
  ]);

  // Precipitation and drought chart.
  lineChart("#waterChart", rows, [
    ["precip", "Precip"],
    ["pdsi", "PDSI"]
  ]);

  // Climate risk score chart.
  lineChart("#riskChart", rows, [
    ["heat_risk", "Heat"],
    ["flood_risk", "Flood"],
    ["drought_risk", "Drought"],
    ["cold_risk", "Cold"]
  ]);
}



// Draw a reusable monthly line chart for any selected series.
function lineChart(selector, rows, series) {
  const svg = d3.select(selector);
  svg.selectAll("*").remove();

  const w = svg.node().clientWidth || 420;
  const h = 220;
  const m = { top: 22, right: 30, bottom: 38, left: 58 };

  svg.attr("viewBox", `0 0 ${w} ${h}`);

  const values = series.flatMap(([key]) => rows.map(d => d[key]).filter(ok));

  if (!rows.length || !values.length) {
    svg.append("text")
      .attr("x", 18)
      .attr("y", 45)
      .attr("fill", "currentColor")
      .text("No monthly values available.");
    return;
  }

  let yMin = d3.min(values);
  let yMax = d3.max(values);

  if (yMin < 0 && yMax > 0) {
    const abs = Math.max(Math.abs(yMin), Math.abs(yMax));
    yMin = -abs;
    yMax = abs;
  }

  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const x = d3.scaleLinear().domain([1, 12]).range([m.left, w - m.right]);
  const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([h - m.bottom, m.top]);

  svg.append("g")
    .attr("transform", `translate(0,${h - m.bottom})`)
    .call(d3.axisBottom(x).ticks(12).tickFormat(d3.format("d")));

  svg.append("g")
    .attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(5));

  if (yMin < 0 && yMax > 0) {
    svg.append("line")
      .attr("x1", m.left)
      .attr("x2", w - m.right)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", "#777")
      .attr("stroke-dasharray", "4 4")
      .attr("opacity", 0.7);
  }

  series.forEach(([key, name], i) => {
    const line = d3.line()
      .defined(d => ok(d[key]))
      .x(d => x(d.month))
      .y(d => y(d[key]));

    svg.append("path")
      .datum(rows)
      .attr("fill", "none")
      .attr("stroke", d3.schemeTableau10[i])
      .attr("stroke-width", 2.4)
      .attr("d", line);

    svg.selectAll(`.dot-${key}`)
      .data(rows.filter(d => ok(d[key])))
      .enter()
      .append("circle")
      .attr("cx", d => x(d.month))
      .attr("cy", d => y(d[key]))
      .attr("r", 3)
      .attr("fill", d3.schemeTableau10[i]);

    svg.append("text")
      .attr("x", w - 130)
      .attr("y", 20 + i * 15)
      .attr("fill", d3.schemeTableau10[i])
      .attr("font-size", 11)
      .attr("font-weight", 800)
      .text(name);
  });
}





/* ================= Ranking Chart ================= */
// Get the value used specifically by the ranking chart.
function getRankValue(park, hazard = rankingHazard) {
  const r = getAnnualRecord(park);
  if (!r) return null;

  const x = r[hazard];
  return ok(x) ? +Number(x).toFixed(2) : null;
}

// Create and wire the ranking dropdown if it does not already exist.
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
      <div class="cluster-explain">
        Bars rank parks by the selected indicator. Diamond glyph numbers match this ranking.
      </div>
    `;

    header.appendChild(control);
  }

  const select = document.getElementById("rankingHazardSelect");
  select.value = rankingHazard;

  select.onchange = e => {
    rankingHazard = e.target.value;
    updateChart();
  };
}





// Redraw the park ranking bar chart.
function updateChart() {
  ensureRankingControls();

  const svg = d3.select("#rankingChart");
  svg.selectAll("*").remove();

  document.querySelector(".chart-panel")?.classList.add("user-resizable-panel");

  // Prepare ranked data for the bar chart.
  const data = parks
    .map(p => ({
      park: p,
      code: codeOf(p.parkCode),
      name: p.fullName,
      short: shortName(p.fullName),
      x: getRankValue(p)
    }))
    .filter(d => ok(d.x))
    .sort((a, b) => b.x - a.x)
    .slice(0, 30);

  const rowHeight = 32;
  const h = Math.max(760, data.length * rowHeight + 90);
  const w = svg.node()?.clientWidth || 1000;

  const m = {
    top: 28,
    right: 120,
    bottom: 55,
    left: 310
  };

  svg.attr("viewBox", `0 0 ${w} ${h}`);
  svg.style("height", `${h}px`);

  if (!data.length) {
    svg.append("text")
      .attr("x", 30)
      .attr("y", 50)
      .attr("fill", "currentColor")
      .text("No parks have data for this variable/year.");
    return;
  }

  const xVals = data.map(d => d.x);
  let xMin = d3.min(xVals);
  let xMax = d3.max(xVals);

  if (xMin < 0 && xMax > 0) {
    const abs = Math.max(Math.abs(xMin), Math.abs(xMax));
    xMin = -abs;
    xMax = abs;
  }

  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }

  const innerW = w - m.left - m.right;
  const innerH = h - m.top - m.bottom;

  const x = d3.scaleLinear()
    .domain([Math.min(0, xMin), xMax * 1.12])
    .nice()
    .range([0, innerW]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.name))
    .range([0, innerH])
    .padding(0.32);

  const zeroX = x(0);

  const g = svg.append("g")
    .attr("transform", `translate(${m.left},${m.top})`);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6))
    .selectAll("text")
    .attr("font-size", 11);

  g.append("line")
    .attr("x1", zeroX)
    .attr("x2", zeroX)
    .attr("y1", 0)
    .attr("y2", innerH)
    .attr("stroke", "#777")
    .attr("stroke-dasharray", "4 4")
    .attr("opacity", 0.6);

  g.selectAll(".ranking-bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", d => `ranking-bar bar-${d.code}`)
    .attr("x", d => Math.min(zeroX, x(d.x)))
    .attr("y", d => y(d.name))
    .attr("height", y.bandwidth())
    .attr("width", d => Math.max(3, Math.abs(x(d.x) - zeroX)))
    .attr("rx", 8)
    .attr("fill", d => getMapColor(d.x, rankingHazard))
    .on("click", (_, d) => selectPark(d.park));

  g.selectAll(".chart-rank")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "chart-rank")
    .attr("x", -285)
    .attr("y", d => y(d.name) + y.bandwidth() / 2)
    .attr("fill", "#31572c")
    .attr("font-weight", 900)
    .attr("font-size", 13)
    .attr("text-anchor", "start")
    .attr("dominant-baseline", "middle")
    .text((d, i) => `#${i + 1}`);

  g.selectAll(".chart-label")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "chart-label")
    .attr("x", -18)
    .attr("y", d => y(d.name) + y.bandwidth() / 2)
    .attr("text-anchor", "end")
    .attr("font-size", 13)
    .attr("dominant-baseline", "middle")
    .text(d => d.short);

  g.selectAll(".chart-value")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "chart-value")
    .attr("x", d => d.x >= 0 ? x(d.x) + 10 : x(d.x) - 10)
    .attr("y", d => y(d.name) + y.bandwidth() / 2)
    .attr("font-size", 13)
    .attr("font-weight", 800)
    .attr("text-anchor", d => d.x >= 0 ? "start" : "end")
    .attr("fill", "currentColor")
    .attr("dominant-baseline", "middle")
    .text(d => fmt(d.x, 2));

  const yearText = yearMode === "all" ? "all years average" : currentYear;

  svg.append("text")
    .attr("x", m.left)
    .attr("y", h - 16)
    .attr("fill", "#31572c")
    .attr("font-size", 13)
    .attr("font-weight", 800)
    .text(`Top ${data.length} parks ranked by ${labels[rankingHazard]} in ${yearText}`);
}



/* ================= Comparison ================= */
// Create the floating map comparison control panel.
function ensureMapComparePanel() {
  if (document.getElementById("mapComparePanel")) return;

  const panel = document.createElement("div");
  panel.id = "mapComparePanel";
  // Create comparison panel HTML.
  panel.innerHTML = `
    <h4>Compare Parks</h4>
    <p id="mapCompareText">Click a park, then add it to comparison.</p>
    <button id="mapCompareButton" class="primary-compare-btn">Add to Comparison</button>
  `;

  document.body.appendChild(panel);
}



// Update the floating comparison panel based on the selected park.
function updateMapComparePanel() {
  ensureMapComparePanel();

  const text = document.getElementById("mapCompareText");
  const btn = document.getElementById("mapCompareButton");

  if (!text || !btn) return;

  if (!selectedPark) {
    text.innerHTML = "Click a national park, then add it to comparison.";
    btn.onclick = null;
    return;
  }

  const code = codeOf(selectedPark.parkCode);

  text.innerHTML = `
    <b>${shortName(selectedPark.fullName)}</b><br>
    ${labels[currentHazard]}: ${fmt(getValue(selectedPark), 2)}
  `;

  btn.textContent = isParkCompared(code) ? "Remove from Comparison" : "Add to Comparison";
  btn.onclick = () => toggleComparePark(code);
}



// Create the lower multi-park comparison dashboard.
function ensureComparisonDashboard() {
  if (document.getElementById("comparisonPanel")) return;

  const chartPanel = document.querySelector(".chart-panel");
  if (!chartPanel) return;

  const panel = document.createElement("section");
  panel.id = "comparisonPanel";
  panel.className = "comparison-panel user-resizable-panel";

  panel.innerHTML = `
    <div class="comparison-header">
      <div>
        <h3>Multi-Park Comparison Dashboard</h3>
        <p>
          Add up to five parks to compare annual climate values and risk scores.
          Bars show the selected map indicator; lines show monthly temperature patterns.
        </p>
      </div>
    </div>

    <div id="compareList" class="compare-list"></div>

    <div class="comparison-grid">
      <div class="comparison-card">
        <h4>Annual Indicator Comparison</h4>
        <svg id="compareBars" class="comparison-svg"></svg>
      </div>

      <div class="comparison-card">
        <h4>Monthly Temperature</h4>
        <svg id="compareTempLines" class="comparison-svg"></svg>
      </div>
    </div>
  `;

  chartPanel.after(panel);
}


// Check whether a park is already in the comparison list.
function isParkCompared(code) {
  return compareParks.some(p => codeOf(p.parkCode) === codeOf(code));
}



// Add or remove one park from the comparison dashboard.
function toggleComparePark(code) {
  const park = parkByCode[codeOf(code)] || parks.find(p => codeOf(p.parkCode) === codeOf(code));
  if (!park) return;

  if (isParkCompared(code)) {
    compareParks = compareParks.filter(p => codeOf(p.parkCode) !== codeOf(code));
  } else {
    if (compareParks.length >= 5) compareParks.shift();
    compareParks.push(park);
  }

  updateMapComparePanel();
  updateComparisonDashboard();

  if (selectedPark) openDetail(selectedPark);
}



// Remove one park from comparison by park code.
function removeComparePark(code) {
  compareParks = compareParks.filter(p => codeOf(p.parkCode) !== codeOf(code));
  updateComparisonDashboard();
}


// Clear all parks from the comparison dashboard.
function clearComparison() {
  compareParks = [];
  updateComparisonDashboard();
}

// Refresh comparison chips and comparison charts.
function updateComparisonDashboard() {
  ensureComparisonDashboard();

  const list = document.getElementById("compareList");
  if (!list) return;

  if (!compareParks.length) {
    list.innerHTML = `<p class="comparison-note">No parks selected yet.</p>`;
    d3.select("#compareBars").selectAll("*").remove();
    d3.select("#compareTempLines").selectAll("*").remove();
    return;
  }

  list.innerHTML = compareParks.map(p => `
    <span class="compare-chip">
      ${shortName(p.fullName)}
      <button onclick="removeComparePark('${codeOf(p.parkCode)}')">×</button>
    </span>
  `).join("");

  drawCompareBars();
  drawCompareTempLines();
}

// Pick a consistent color for each compared park.
function compareColor(i) {
  return d3.schemeTableau10[i % 10];
}





// Draw the annual indicator comparison bar chart.
function drawCompareBars() {
  const svg = d3.select("#compareBars");
  svg.selectAll("*").remove();

  // Prepare compared park values for the bar chart.
  const data = compareParks.map((p, i) => ({
    name: shortName(p.fullName),
    value: getValue(p),
    color: compareColor(i)
  })).filter(d => ok(d.value));

  const w = svg.node()?.clientWidth || 500;
  const h = 300;
  const m = { top: 28, right: 30, bottom: 70, left: 60 };

  svg.attr("viewBox", `0 0 ${w} ${h}`);

  if (!data.length) return;

  const vals = data.map(d => d.value);
  let min = d3.min(vals);
  let max = d3.max(vals);

  if (min < 0 && max > 0) {
    const abs = Math.max(Math.abs(min), Math.abs(max));
    min = -abs;
    max = abs;
  }

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const x = d3.scaleBand()
    .domain(data.map(d => d.name))
    .range([m.left, w - m.right])
    .padding(0.28);

  const y = d3.scaleLinear()
    .domain([Math.min(0, min), max])
    .nice()
    .range([h - m.bottom, m.top]);

  svg.append("g")
    .attr("transform", `translate(0,${h - m.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "rotate(-28)")
    .attr("text-anchor", "end");

  svg.append("g")
    .attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(5));

  if (min < 0 && max > 0) {
    svg.append("line")
      .attr("x1", m.left)
      .attr("x2", w - m.right)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", "#777")
      .attr("stroke-dasharray", "4 4");
  }

  svg.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", d => x(d.name))
    .attr("y", d => d.value >= 0 ? y(d.value) : y(0))
    .attr("width", x.bandwidth())
    .attr("height", d => Math.abs(y(d.value) - y(0)))
    .attr("rx", 8)
    .attr("fill", d => d.color);
}





// Draw monthly temperature lines for compared parks.
function drawCompareTempLines() {
  const svg = d3.select("#compareTempLines");
  svg.selectAll("*").remove();

  const w = svg.node()?.clientWidth || 500;
  const h = 300;
  const m = { top: 24, right: 25, bottom: 35, left: 58 };

  svg.attr("viewBox", `0 0 ${w} ${h}`);

  // Prepare monthly rows for every compared park.
  const rowsByPark = compareParks.map((p, i) => {
    const rawRows = climateMonthly
      .filter(d => d.parkCode === codeOf(p.parkCode) && (yearMode === "all" || d.year === +currentYear));

    const rows = yearMode === "all"
      ? d3.rollups(
          rawRows,
          v => ({
            month: v[0].month,
            temp: meanValid(v.map(d => d.temp))
          }),
          d => d.month
        ).map(d => d[1]).sort((a, b) => a.month - b.month)
      : rawRows.sort((a, b) => a.month - b.month);

    return {
      park: p,
      color: compareColor(i),
      rows
    };
  });

  const values = rowsByPark.flatMap(d => d.rows.map(r => r.temp).filter(ok));
  if (!values.length) return;

  let min = d3.min(values);
  let max = d3.max(values);

  if (min < 0 && max > 0) {
    const abs = Math.max(Math.abs(min), Math.abs(max));
    min = -abs;
    max = abs;
  }

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const x = d3.scaleLinear().domain([1, 12]).range([m.left, w - m.right]);
  const y = d3.scaleLinear().domain([min, max]).nice().range([h - m.bottom, m.top]);

  svg.append("g")
    .attr("transform", `translate(0,${h - m.bottom})`)
    .call(d3.axisBottom(x).ticks(12).tickFormat(d3.format("d")));

  svg.append("g")
    .attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(5));

  if (min < 0 && max > 0) {
    svg.append("line")
      .attr("x1", m.left)
      .attr("x2", w - m.right)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", "#777")
      .attr("stroke-dasharray", "4 4");
  }

  rowsByPark.forEach((item, i) => {
    const line = d3.line()
      .defined(d => ok(d.temp))
      .x(d => x(d.month))
      .y(d => y(d.temp));

    svg.append("path")
      .datum(item.rows)
      .attr("fill", "none")
      .attr("stroke", item.color)
      .attr("stroke-width", 2.4)
      .attr("d", line);

    svg.append("text")
      .attr("x", w - 150)
      .attr("y", 18 + i * 16)
      .attr("fill", item.color)
      .attr("font-size", 11)
      .attr("font-weight", 800)
      .text(shortName(item.park.fullName));
  });
}








/* ================= Controls ================= */
// Set the year slider range and add the current/all-years mode selector.
function setupYearSlider() {
  const years = [...new Set(climateMonthly.map(d => d.year))].sort((a, b) => a - b);
  const slider = document.getElementById("yearSlider");

  if (!slider || !years.length) return;

  slider.min = d3.min(years);
  slider.max = d3.max(years);

  currentYear = d3.max(years);
  slider.value = currentYear;

  document.getElementById("yearLabel").innerHTML = currentYear;

  const labs = document.querySelectorAll(".slider-labels span");
  if (labs.length >= 2) {
    labs[0].innerHTML = slider.min;
    labs[1].innerHTML = slider.max;
  }

  if (!document.getElementById("yearModeSelect")) {
    const yearPanel = slider.closest(".panel-section");

    const select = document.createElement("select");
    select.id = "yearModeSelect";
    select.style.marginTop = "10px";
    select.innerHTML = `
      <option value="current">Selected / Latest Year</option>
      <option value="all">All Years Average</option>
    `;

    yearPanel.appendChild(select);

    select.addEventListener("change", e => {
      yearMode = e.target.value;
      redrawMap();
      updateChart();
      updateComparisonDashboard();
      if (selectedPark) openDetail(selectedPark);
    });
  }
}



// Update the legend title, gradient, and explanation text.
function updateLegend() {
  const title = document.getElementById("legendTitle");
  const gradient = document.getElementById("legendGradient");

  if (!title || !gradient) return;

  const yearText = yearMode === "all" ? "All Years Average" : currentYear;
  title.innerHTML = `${labels[currentHazard]} (${yearText})`;

  const ex = currentExtent();

  const cols = d3.range(0, 1.01, 0.1).map(t => {
    return getMapColor(ex[0] + t * (ex[1] - ex[0]));
  });

  gradient.style.background = `linear-gradient(to right, ${cols.join(",")})`;

  const note = document.querySelector(".legend-note");
  if (note) {
    note.innerHTML = `
      Diamond glyphs show park rank. Larger and darker symbols indicate higher relative values.
      Clusters summarize parks at small map scales. Dashed polygons show National Park boundary areas.
    `;
  }
}



// Handle changes from hazard dropdown and year slider.
function updateControls() {
  // Read the selected map variable from the dropdown.
  currentHazard = document.getElementById("hazardSelect").value;
  rankingHazard = currentHazard;
  // Read the selected year from the slider.
  currentYear = +document.getElementById("yearSlider").value;

  document.getElementById("yearLabel").innerHTML = currentYear;

  redrawMap();
  updateChart();
  updateComparisonDashboard();

  if (selectedPark) openDetail(selectedPark);
}



// Search park names and zoom to the first matching park.
function searchPark() {
  const q = document.getElementById("searchBox").value.toLowerCase();

  if (q.length < 2) return;

  const p = parks.find(d => d.fullName.toLowerCase().includes(q));

  if (p) selectPark(p);
}

 

// Refresh polygon styles, glyphs, legend, and county visibility.
function redrawMap() {
  if (boundaryLayer) {
    boundaryLayer.eachLayer(layer => {
      const park = parkFromFeature(layer.feature);
      if (!park) return;
      layer.setStyle(boundaryStyle(layer.feature));
    });

    boundaryLayer.bringToBack();
  }

  drawGlyphs();

  if (glyphLayer) glyphLayer.bringToFront();

  updateLegend();
  updateCountyVisibility();
}

// Show counties only when the map is zoomed in enough.
function updateCountyVisibility() {
  if (!countyLayer) return;

  if (map.getZoom() >= 5) {
    if (!map.hasLayer(countyLayer)) countyLayer.addTo(map);
  } else {
    if (map.hasLayer(countyLayer)) map.removeLayer(countyLayer);
  }
}




// Create the Leaflet basemap and overlay control.
function setupLayerControl() {
  if (layerControl) map.removeControl(layerControl);

  const overlays = {};

  if (nationLayer) overlays["U.S. national boundary"] = nationLayer;
  if (stateLayer) overlays["State boundaries"] = stateLayer;
  if (countyLayer) overlays["County reference boundaries"] = countyLayer;
  if (boundaryLayer) overlays["National Park boundary polygons"] = boundaryLayer;
  if (glyphLayer) overlays["Park rank diamonds / clusters"] = glyphLayer;

  layerControl = L.control.layers(basemaps, overlays, {
    collapsed: true,
    position: "bottomleft"
  }).addTo(map);
}




/* ================= Pages ================= */
// Switch between Explorer, Story, and Data pages.
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));

  const page = document.getElementById(id);
  if (page) page.classList.add("active-page");

  if (id === "dataPage") fillDataPage();
  if (id === "storyPage") fillStoryPage();

  setTimeout(() => {
    map.invalidateSize();
    updateChart();
    updateComparisonDashboard();
    makeAllPanelsResizable();
  }, 200);
}



// Fill the Story page with project explanation text.
function fillStoryPage() {
  const page = document.getElementById("storyPage");
  if (!page) return;

  page.innerHTML = `
    <section class="text-page-card story-card user-resizable-panel">
      <h1>Project Story: Visualizing Climate Risks Across U.S. National Parks</h1>

      <p>
        This project was designed for an environmental planner, Lee, who works on climate
        resilience and land management. Lee needs to identify high-risk national parks,
        compare multiple climate hazards, and communicate results clearly to policymakers
        and the public.
      </p>

      <h2>Why This Tool Is Needed</h2>
      <p>
        Climate hazard information is often scattered across different datasets and formats.
        This makes it difficult for planners to understand how heat, drought, precipitation,
        and cold-related risks overlap across protected landscapes. The website brings these
        data into one interactive interface.
      </p>

      <h2>Main User Tasks</h2>
      <ul>
        <li>Identify parks with relatively high climate-risk values.</li>
        <li>Compare parks across multiple climate indicators.</li>
        <li>Explore how risk changes through time using the year slider or all-year average.</li>
        <li>Use park images and descriptions to support public communication.</li>
      </ul>

      <h2>Design Logic</h2>
      <p>
        The map provides a national overview, clustered glyphs reduce clutter at small
        scales, and park detail panels support local interpretation. The comparison dashboard
        supports side-by-side analysis, while the ranking chart helps identify outliers and
        priority parks.
      </p>

      <h2>Interpretation</h2>
      <p>
        The tool is intended for exploratory planning and communication. It does not replace
        field-level climate monitoring, but it helps users recognize spatial patterns,
        seasonal variation, and relative risk differences across the national park system.
      </p>
    </section>
  `;

  makeAllPanelsResizable();
}




// Fill the Data page with workflow and data explanation text.
function fillDataPage() {
  const page = document.getElementById("dataPage");
  if (!page) return;

  page.innerHTML = `
    <section class="text-page-card user-resizable-panel">
      <h1>Data Processing Workflow</h1>

      <h2>1. Project Overview</h2>
      <p>
        This project builds a long-term monthly climate-risk dataset for all 63 U.S.
        National Parks. The workflow combines park reference information, monthly climate
        records, and derived climate-risk indicators.
      </p>

      <h2>2. National Park Reference Table</h2>
      <p>
        Each park was assigned a unique park code, official name, state, county information,
        and geographic identifier. This reference table supports linking park locations with
        climate records and NPS descriptive information.
      </p>

      <h2>3. Monthly Climate Processing</h2>
      <p>
        Climate variables were reshaped into a long monthly format, so each row represents
        one park, one year, and one month. This structure supports both selected-year
        analysis and all-year average summaries.
      </p>

      <h2>4. Risk Indicators</h2>
      <table>
        <tr><th>Indicator</th><th>Interpretation</th></tr>
        <tr><td>heat_risk</td><td>Higher maximum temperature indicates greater heat stress.</td></tr>
        <tr><td>flood_risk</td><td>Higher precipitation indicates greater wetness or flood-related risk.</td></tr>
        <tr><td>drought_risk</td><td>Lower drought index values indicate drier conditions and greater drought risk.</td></tr>
        <tr><td>cold_risk</td><td>Lower minimum temperature indicates greater cold exposure.</td></tr>
        <tr><td>multi_risk</td><td>Combined score summarizing multiple climate-risk dimensions.</td></tr>
      </table>

      <h2>5. Temporal Design</h2>
      <p>
        The default view uses the most recent year so users see the latest available
        condition first. A year slider supports year-by-year exploration, while the
        all-year average option summarizes long-term patterns across the full study period.
      </p>

      <h2>6. Visualization Design</h2>
      <p>
        The map uses clustered park glyphs at small scales to reduce overlap. At larger
        scales, individual park symbols and park boundary polygons become visible. The
        ranking chart, detail panel, and comparison dashboard provide coordinated views
        for interpretation.
      </p>

      <h2>7. Limitations</h2>
      <p>
        The climate data represent broader climate conditions linked to park geography
        rather than exact field measurements within every park boundary. Event-burden flags
        are sparse in the processed dataset, so the main analysis emphasizes climate-derived
        risk indicators.
      </p>
    </section>
  `;

  makeAllPanelsResizable();
}





/* ================= Dark Mode ================= */
// Create the dark mode button and save theme preference in localStorage.
function setupDarkMode() {
  document.getElementById("darkModeToggle")?.remove();

  const titleBox = document.querySelector(".nav-title");
  if (!titleBox) return;

  titleBox.classList.add("title-modern");

  const btn = document.createElement("button");
  btn.id = "darkModeToggle";
  btn.className = "dark-mode-toggle";
  btn.type = "button";
  btn.innerHTML = "🌙 Dark Mode";

  titleBox.appendChild(btn);

  const saved = localStorage.getItem("themeMode");

  if (saved === "dark") {
    document.body.classList.add("dark-mode");
    btn.innerHTML = "☀️ Light Mode";
  }

  btn.onclick = () => {
    document.body.classList.toggle("dark-mode");

    const isDark = document.body.classList.contains("dark-mode");

    localStorage.setItem("themeMode", isDark ? "dark" : "light");
    btn.innerHTML = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
  };
}







/* ================= Zoom ================= */
// Zoom the map to preset regions.
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





/* ================= Exports ================= */
window.closeModal = closeModal;
// Expose functions for HTML onclick handlers.
window.closeFloatingDetail = closeFloatingDetail;
window.showPage = showPage;
window.zoomToRegion = zoomToRegion;
window.selectPark = selectPark;
window.toggleComparePark = toggleComparePark;
window.removeComparePark = removeComparePark;
window.clearComparison = clearComparison;
window.exitDetailMode = exitDetailMode;




/* ================= Init ================= */
// Initialize the full app: styling, data loading, layers, charts, and controls.
async function init() {
  injectLayoutFixes();
  setupDarkMode();
  ensureComparisonDashboard();
  ensureMapComparePanel();

  document.getElementById("floatingDetail")?.classList.add("hidden");
  document.body.classList.remove("detail-mode");

  document.getElementById("searchBox")?.addEventListener("keyup", searchPark);
  document.getElementById("hazardSelect")?.addEventListener("change", updateControls);
  document.getElementById("yearSlider")?.addEventListener("input", updateControls);

  try {
    await loadClimateCSV();
    await loadNPS();
    await loadContextLayers();
    await loadBoundaries();

    redrawMap();
    setupLayerControl();
    updateChart();
    updateComparisonDashboard();
    makeAllPanelsResizable();
    zoomToRegion("mainland");

    map.on("zoomend", updateCountyVisibility);
    updateCountyVisibility();

  } catch (err) {
    console.error("Initialization failed:", err);
    alert("Data loading failed. Check the climate dataset and file paths.");
  }
}

// Start the application.
init();