/* =========================================================
   GEOG 575 Final Project
   Climate Risks to U.S. National Parks
========================================================= */

(function () {

  // ------------------------------------------------------
  // Global variables
  // ------------------------------------------------------
  let csvData = [];
  let parkGeoJSON = null;
  let stateTopo = null;

  let map;
  let markerLayer;
  let markerLookup = {};

  let activeParkId = null;
  let selectedParkIds = [];

  let expressed = "overall";
  let currentYear = "2025";

  const attrArray = ["overall", "wildfire", "drought", "heat", "flood"];
  const attrNames = {
    overall: "Overall Risk",
    wildfire: "Wildfire Risk",
    drought: "Drought Risk",
    heat: "Heat Risk",
    flood: "Flood Risk"
  };

  const metadataLookup = {
    overall: "Overall risk synthesizes multiple climate hazards into a comparable park-level indicator.",
    wildfire: "Wildfire risk emphasizes relative fire exposure and related ecosystem vulnerability.",
    drought: "Drought risk reflects relative water stress and dry-climate vulnerability.",
    heat: "Heat risk reflects long-term warming and temperature stress across parks.",
    flood: "Flood risk reflects relative vulnerability to flooding and water-related hazards."
  };

  const chartConfig = {
    width: 900,
    height: 340,
    margin: { top: 20, right: 20, bottom: 100, left: 70 }
  };

  // ------------------------------------------------------
  // Start application
  // ------------------------------------------------------
  window.onload = initialize;

  function initialize() {
    createMap();

    Promise.all([
      d3.json("data/national_parks_points.geojson"),
      d3.csv("data/national_parks_risk.csv"),
      d3.json("data/us_states.topojson").catch(() => null)
    ])
      .then(function (data) {
        parkGeoJSON = data[0];
        csvData = data[1];
        stateTopo = data[2];

        processCSV(csvData);
        joinData(parkGeoJSON, csvData);

        createAttributeDropdown();
        setUIListeners();
        updateAllViews();
      })
      .catch(function (error) {
        console.error("Error loading data:", error);
      });
  }

  // ------------------------------------------------------
  // Map setup
  // ------------------------------------------------------
  function createMap() {
    map = L.map("map", {
      center: [39.5, -98.5],
      zoom: 4,
      minZoom: 3
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
  }

  // ------------------------------------------------------
  // Data processing
  // ------------------------------------------------------
  function processCSV(data) {
    data.forEach(function (d) {
      const numericFields = [
        "overall_2025", "overall_2050", "overall_2100",
        "wildfire_2025", "wildfire_2050", "wildfire_2100",
        "drought_2025", "drought_2050", "drought_2100",
        "heat_2025", "heat_2050", "heat_2100",
        "flood_2025", "flood_2050", "flood_2100"
      ];

      numericFields.forEach(function (field) {
        d[field] = parseFloat(d[field]);
      });
    });
  }

  function joinData(geojson, csv) {
    const csvLookup = {};

    csv.forEach(function (row) {
      csvLookup[String(row.park_id).trim()] = row;
    });

    geojson.features.forEach(function (feature) {
      const props = feature.properties;
      const key = String(props.park_id).trim();
      const match = csvLookup[key];

      if (match) {
        Object.keys(match).forEach(function (field) {
          props[field] = match[field];
        });
      }
    });
  }

  // ------------------------------------------------------
  // UI setup
  // ------------------------------------------------------
  function createAttributeDropdown() {
    const select = document.getElementById("attributeSelect");
    select.innerHTML = "";

    attrArray.forEach(function (attr) {
      const option = document.createElement("option");
      option.value = attr;
      option.textContent = attrNames[attr];
      if (attr === expressed) option.selected = true;
      select.appendChild(option);
    });
  }

  function setUIListeners() {
    document.getElementById("attributeSelect").addEventListener("change", function () {
      expressed = this.value;
      updateAllViews();
    });

    document.getElementById("yearSelect").addEventListener("change", function () {
      currentYear = this.value;
      updateAllViews();
    });

    document.getElementById("thresholdRange").addEventListener("input", function () {
      document.getElementById("thresholdLabel").textContent = this.value;
      updateAllViews();
    });

    document.getElementById("regionFilter").addEventListener("change", function () {
      updateAllViews();
    });

    document.getElementById("searchInput").addEventListener("input", function () {
      updateAllViews();
    });

    document.getElementById("resetBtn").addEventListener("click", function () {
      resetFilters();
    });

    document.getElementById("clearSelectionBtn").addEventListener("click", function () {
      selectedParkIds = [];
      renderSelectedPanel();
    });
  }

  function resetFilters() {
    expressed = "overall";
    currentYear = "2025";

    document.getElementById("attributeSelect").value = "overall";
    document.getElementById("yearSelect").value = "2025";
    document.getElementById("thresholdRange").value = 0;
    document.getElementById("thresholdLabel").textContent = 0;
    document.getElementById("regionFilter").value = "all";
    document.getElementById("searchInput").value = "";

    updateAllViews();
  }

  // ------------------------------------------------------
  // Filtering helpers
  // ------------------------------------------------------
  function getAttributeField() {
    return expressed + "_" + currentYear;
  }

  function getFilteredData() {
    const threshold = parseFloat(document.getElementById("thresholdRange").value);
    const regionValue = document.getElementById("regionFilter").value;
    const searchText = document.getElementById("searchInput").value.toLowerCase().trim();
    const valueField = getAttributeField();

    return csvData.filter(function (d) {
      const passesThreshold = d[valueField] >= threshold;
      const passesRegion = regionValue === "all" || d.region === regionValue;
      const passesSearch = d.name.toLowerCase().includes(searchText);
      return passesThreshold && passesRegion && passesSearch;
    });
  }

  function getSortedFilteredData() {
    const data = getFilteredData();
    const valueField = getAttributeField();

    return data.slice().sort(function (a, b) {
      return b[valueField] - a[valueField];
    });
  }

  // ------------------------------------------------------
  // Color logic
  // ------------------------------------------------------
  function getColorInterpolator() {
    if (expressed === "wildfire") return d3.interpolateReds;
    if (expressed === "drought") return d3.interpolateYlOrBr;
    if (expressed === "heat") return d3.interpolateOranges;
    if (expressed === "flood") return d3.interpolateBlues;
    return d3.interpolatePuRd;
  }

  function getColor(value) {
    return getColorInterpolator()(value / 100);
  }

  // ------------------------------------------------------
  // Dynamic legend
  // ------------------------------------------------------
  function updateLegend() {
    const colors = [];
    const interpolator = getColorInterpolator();

    for (let i = 0; i <= 8; i++) {
      colors.push(interpolator(i / 8));
    }

    document.getElementById("legendTitle").textContent =
      "Legend for " + attrNames[expressed];

    document.getElementById("legendGradient").style.background =
      "linear-gradient(to right, " + colors.join(",") + ")";

    document.getElementById("metadataText").textContent =
      metadataLookup[expressed];
  }

  // ------------------------------------------------------
  // Map rendering
  // ------------------------------------------------------
  function renderMap() {
    markerLayer.clearLayers();
    markerLookup = {};

    const filteredIds = new Set(getFilteredData().map(d => String(d.park_id)));
    const valueField = getAttributeField();

    parkGeoJSON.features.forEach(function (feature) {
      const props = feature.properties;
      const parkId = String(props.park_id);

      if (!filteredIds.has(parkId)) return;

      const value = parseFloat(props[valueField]);
      const lat = feature.geometry.coordinates[1];
      const lon = feature.geometry.coordinates[0];

      const marker = L.circleMarker([lat, lon], {
        radius: 6 + value / 8,
        fillColor: getColor(value),
        color: "#1f2937",
        weight: activeParkId === parkId ? 3 : 1,
        fillOpacity: 0.85
      });

      marker.bindPopup(
        "<strong>" + props.name + "</strong><br>" +
        props.state + " | " + props.region + "<br>" +
        attrNames[expressed] + ": " + value
      );

      marker.on("mouseover", function () {
        setActivePark(parkId, false);
      });

      marker.on("click", function () {
        setActivePark(parkId, true);
        toggleSelection(parkId);
      });

      marker.addTo(markerLayer);
      markerLookup[parkId] = marker;
    });

    document.getElementById("mapSummary").textContent =
      "Showing " + getFilteredData().length + " parks for " + currentYear +
      " using " + attrNames[expressed] + ".";
  }

  // ------------------------------------------------------
  // Chart rendering
  // ------------------------------------------------------
  function renderChart() {
    const data = getSortedFilteredData();
    const valueField = getAttributeField();

    const svg = d3.select("#chartSvg");
    svg.selectAll("*").remove();

    const width = chartConfig.width;
    const height = chartConfig.height;
    const margin = chartConfig.margin;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr("viewBox", "0 0 " + width + " " + height);

    const g = svg.append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    const x = d3.scaleBand()
      .domain(data.map(d => d.name))
      .range([0, innerWidth])
      .padding(0.15);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

    g.append("g")
      .attr("transform", "translate(0," + innerHeight + ")")
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-40)")
      .style("text-anchor", "end");

    g.append("g")
      .call(d3.axisLeft(y));

    g.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", function (d) {
        return "bar bar-" + sanitizeClass(d.park_id);
      })
      .attr("x", d => x(d.name))
      .attr("y", d => y(d[valueField]))
      .attr("width", x.bandwidth())
      .attr("height", d => innerHeight - y(d[valueField]))
      .attr("fill", d => getColor(d[valueField]))
      .attr("stroke", d => String(d.park_id) === activeParkId ? "#111827" : "none")
      .attr("stroke-width", d => String(d.park_id) === activeParkId ? 3 : 0)
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        setActivePark(String(d.park_id), false);
      })
      .on("click", function (event, d) {
        setActivePark(String(d.park_id), true);
        toggleSelection(String(d.park_id));
      });
  }

  // ------------------------------------------------------
  // Table rendering
  // ------------------------------------------------------
  function renderTable() {
    const tbody = document.querySelector("#rankingTable tbody");
    tbody.innerHTML = "";

    const valueField = getAttributeField();
    document.getElementById("tableAttributeHeader").textContent = attrNames[expressed];

    getSortedFilteredData().forEach(function (d, i) {
      const tr = document.createElement("tr");
      if (String(d.park_id) === activeParkId) {
        tr.classList.add("active-row");
      }

      tr.innerHTML =
        "<td>" + (i + 1) + "</td>" +
        "<td>" + d.name + "</td>" +
        "<td>" + d.state + "</td>" +
        "<td>" + d.region + "</td>" +
        "<td>" + d[valueField] + "</td>";

      tr.addEventListener("mouseover", function () {
        setActivePark(String(d.park_id), false);
      });

      tr.addEventListener("click", function () {
        setActivePark(String(d.park_id), true);
        toggleSelection(String(d.park_id));
      });

      tbody.appendChild(tr);
    });
  }

  // ------------------------------------------------------
  // Detail panel
  // ------------------------------------------------------
  function renderDetailPanel() {
    const container = document.getElementById("detailPanel");

    if (!activeParkId) {
      container.innerHTML =
        '<p class="placeholder-text">Click a park on the map, chart, or table to view detailed information.</p>';
      return;
    }

    const row = csvData.find(d => String(d.park_id) === activeParkId);
    if (!row) return;

    container.innerHTML =
      '<div class="detail-card">' +
        '<h3>' + row.name + '</h3>' +
        '<p>' + row.state + ' | ' + row.region + '</p>' +
        '<p>' + (row.description || "No description available.") + '</p>' +
        '<div class="metric-grid">' +
          metricHTML("Overall", row["overall_" + currentYear]) +
          metricHTML("Wildfire", row["wildfire_" + currentYear]) +
          metricHTML("Drought", row["drought_" + currentYear]) +
          metricHTML("Heat", row["heat_" + currentYear]) +
          metricHTML("Flood", row["flood_" + currentYear]) +
        '</div>' +
      '</div>';
  }

  function metricHTML(label, value) {
    return (
      '<div class="metric-box">' +
        '<span>' + label + '</span>' +
        '<strong>' + value + '</strong>' +
      '</div>'
    );
  }

  // ------------------------------------------------------
  // Selected parks panel
  // ------------------------------------------------------
  function renderSelectedPanel() {
    const container = document.getElementById("selectedPanel");

    if (selectedParkIds.length === 0) {
      container.innerHTML =
        '<p class="placeholder-text">No parks selected yet.</p>';
      return;
    }

    const html = selectedParkIds.map(function (id) {
      const d = csvData.find(row => String(row.park_id) === String(id));
      if (!d) return "";

      return (
        '<div class="selected-card">' +
          '<strong>' + d.name + '</strong>' +
          '<p>' + d.state + ' | ' + d.region + '</p>' +
          '<p>Overall: ' + d["overall_" + currentYear] + '</p>' +
          '<p>Wildfire: ' + d["wildfire_" + currentYear] + '</p>' +
          '<p>Drought: ' + d["drought_" + currentYear] + '</p>' +
          '<p>Heat: ' + d["heat_" + currentYear] + '</p>' +
          '<p>Flood: ' + d["flood_" + currentYear] + '</p>' +
        '</div>'
      );
    }).join("");

    container.innerHTML = html;
  }

  // ------------------------------------------------------
  // Linked highlighting
  // ------------------------------------------------------
  function setActivePark(parkId, flyToMarker) {
    activeParkId = String(parkId);

    Object.keys(markerLookup).forEach(function (id) {
      const marker = markerLookup[id];
      const row = csvData.find(d => String(d.park_id) === id);
      const value = row[getAttributeField()];

      marker.setStyle({
        radius: 6 + value / 8,
        fillColor: getColor(value),
        color: "#1f2937",
        weight: id === activeParkId ? 3 : 1,
        fillOpacity: 0.85
      });

      if (id === activeParkId && flyToMarker) {
        marker.openPopup();
        map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 5), { duration: 0.8 });
      }
    });

    renderChart();
    renderTable();
    renderDetailPanel();
  }

  function toggleSelection(parkId) {
    const id = String(parkId);
    const index = selectedParkIds.indexOf(id);

    if (index === -1) {
      selectedParkIds.push(id);
    } else {
      selectedParkIds.splice(index, 1);
    }

    renderSelectedPanel();
  }

  // ------------------------------------------------------
  // Master update
  // ------------------------------------------------------
  function updateAllViews() {
    updateLegend();
    renderMap();
    renderChart();
    renderTable();
    renderDetailPanel();
    renderSelectedPanel();
  }

  // ------------------------------------------------------
  // Utility
  // ------------------------------------------------------
  function sanitizeClass(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

})();
