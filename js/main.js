//insert code here!
// ===============================
// 1. API KEY
// Do NOT push your real key to GitHub.
// Replace this locally only.
// ===============================
const apiKey = "bWAAEqyZ3eUDlvKietZDTGgX0NAg9fBoeUPItvkV";


const apiKey = "bWAAEqyZ3eUDlvKietZDTGgX0NAg9fBoeUPItvkV";

let currentHazard = "overall";
let currentYear = "1985";
let currentRiskFilter = 0;
let selectedPark = null;

let nationalParks = [];
let parkMarkers = [];
let climateByParkYear = {};

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("hidden");
}

function closeFloatingDetail() {
    const detail = document.getElementById("floatingDetail");
    if (detail) detail.classList.add("hidden");
}

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active-page");
    });

    const target = document.getElementById(pageId);
    if (target) target.classList.add("active-page");

    if (pageId === "homePage") {
        document.body.classList.remove("narrative-mode");
        setTimeout(() => {
            map.invalidateSize();
            updateChart();
        }, 150);
    } else {
        document.body.classList.add("narrative-mode");
    }
}

const map = L.map("map", {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 13
}).setView([39, -98], 4);

L.control.zoom({ position: "bottomleft" }).addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19
}).addTo(map);

function zoomToRegion(region) {
    const bounds = {
        all: [[15, -171], [72, -63]],
        mainland: [[24, -125], [50, -66]],
        alaska: [[51, -170], [72, -129]],
        hawaii: [[18.5, -160.5], [22.6, -154.5]],
        virgin: [[17.9, -65.3], [18.8, -64.3]]
    };

    if (bounds[region]) {
        map.fitBounds(bounds[region], {
            paddingTopLeft: [20, 70],
            paddingBottomRight: [360, 80]
        });
    }
}

function canonicalHazard(hazard) {
    const lookup = {
        overall: "overall",
        heat: "heatRisk",
        heatRisk: "heatRisk",
        drought: "droughtRisk",
        droughtRisk: "droughtRisk",
        precipRisk: "precipRisk",
        precipitationRisk: "precipRisk",
        tmean: "temp",
        temp: "temp",
        tmax: "tmax",
        tmin: "tmin",
        precip: "precip",
        precipitation: "precip",
        pdsi: "pdsi"
    };

    return lookup[hazard] || hazard;
}

function getHazardLabel() {
    const labels = {
        overall: "Overall Climate Risk",
        heatRisk: "Heat Stress Risk",
        droughtRisk: "Drought Stress Risk",
        precipRisk: "Heavy Precipitation Risk",
        temp: "Mean Temperature",
        tmax: "Maximum Temperature",
        tmin: "Minimum Temperature",
        precip: "Annual Precipitation",
        pdsi: "Drought Index"
    };

    return labels[canonicalHazard(currentHazard)] || currentHazard;
}

function normalize(value, extent) {
    if (value === null || value === undefined || isNaN(value)) return null;

    const min = extent[0];
    const max = extent[1];

    if (min === max) return 50;

    return Math.round(((value - min) / (max - min)) * 100);
}

function reverseNormalize(value, extent) {
    if (value === null || value === undefined || isNaN(value)) return null;

    const min = extent[0];
    const max = extent[1];

    if (min === max) return 50;

    return Math.round(((max - value) / (max - min)) * 100);
}

async function loadClimateData() {
    const possiblePaths = [
        "data/national_parks_climate_monthly_ALL63_1985_2026.csv",
        "data/national_parks_climate_monthly_ALL63_1985_2026(1).csv",
        "national_parks_climate_monthly_ALL63_1985_2026.csv",
        "national_parks_climate_monthly_ALL63_1985_2026(1).csv"
    ];

    let rows = null;

    for (const path of possiblePaths) {
        try {
            rows = await d3.csv(path);
            if (rows && rows.length > 0) {
                console.log("Loaded climate CSV from:", path);
                break;
            }
        } catch (error) {
            console.warn("Could not load:", path);
        }
    }

    if (!rows || rows.length === 0) {
        console.warn("No climate CSV loaded.");
        return;
    }

    rows.forEach(d => {
        d.parkCode = String(d.parkCode).toLowerCase();
        d.year = +d.year;
        d.month = +d.month;
        d.temp = +d.temp;
        d.tmax = +d.tmax;
        d.tmin = +d.tmin;
        d.precip = +d.precip;
        d.pdsi = +d.pdsi;
    });

    const grouped = d3.group(rows, d => d.parkCode, d => d.year);

    grouped.forEach((yearMap, parkCode) => {
        climateByParkYear[parkCode] = {};

        yearMap.forEach((records, year) => {
            climateByParkYear[parkCode][year] = {
                temp: d3.mean(records, d => d.temp),
                tmax: d3.mean(records, d => d.tmax),
                tmin: d3.mean(records, d => d.tmin),
                precip: d3.sum(records, d => d.precip),
                pdsi: d3.mean(records, d => d.pdsi)
            };
        });
    });

    setupYearSlider(rows);
    computeRiskScores();
}

function setupYearSlider(rows) {
    const years = Array.from(new Set(rows.map(d => d.year))).sort((a, b) => a - b);

    if (years.length === 0) return;

    const slider = document.getElementById("yearSlider");
    const yearLabel = document.getElementById("yearLabel");

    if (!slider) return;

    slider.min = d3.min(years);
    slider.max = d3.max(years);

    if (+currentYear < +slider.min || +currentYear > +slider.max) {
        currentYear = String(slider.min);
    }

    slider.value = currentYear;

    if (yearLabel) yearLabel.innerHTML = currentYear;

    const labels = document.querySelectorAll(".slider-labels span");
    if (labels.length >= 2) {
        labels[0].innerHTML = slider.min;
        labels[1].innerHTML = slider.max;
    }
}

function computeRiskScores() {
    const allValues = {
        tmax: [],
        pdsi: [],
        precip: []
    };

    Object.values(climateByParkYear).forEach(years => {
        Object.values(years).forEach(d => {
            if (!isNaN(d.tmax)) allValues.tmax.push(d.tmax);
            if (!isNaN(d.pdsi)) allValues.pdsi.push(d.pdsi);
            if (!isNaN(d.precip)) allValues.precip.push(d.precip);
        });
    });

    const extents = {
        tmax: d3.extent(allValues.tmax),
        pdsi: d3.extent(allValues.pdsi),
        precip: d3.extent(allValues.precip)
    };

    Object.keys(climateByParkYear).forEach(parkCode => {
        Object.keys(climateByParkYear[parkCode]).forEach(year => {
            const d = climateByParkYear[parkCode][year];

            d.heatRisk = normalize(d.tmax, extents.tmax);
            d.droughtRisk = reverseNormalize(d.pdsi, extents.pdsi);
            d.precipRisk = normalize(d.precip, extents.precip);

            d.overall = Math.round(
                d.heatRisk * 0.4 +
                d.droughtRisk * 0.35 +
                d.precipRisk * 0.25
            );
        });
    });
}

function getClimateRecord(park) {
    const code = String(park.parkCode).toLowerCase();
    const year = +currentYear;

    if (!climateByParkYear[code]) return null;
    if (!climateByParkYear[code][year]) return null;

    return climateByParkYear[code][year];
}

function getRiskValue(park) {
    const record = getClimateRecord(park);
    if (!record) return null;

    const hazard = canonicalHazard(currentHazard);
    const value = record[hazard];

    if (value === null || value === undefined || isNaN(value)) return null;

    if (
        hazard === "overall" ||
        hazard === "heatRisk" ||
        hazard === "droughtRisk" ||
        hazard === "precipRisk"
    ) {
        return Math.round(value);
    }

    return Number(value.toFixed(1));
}

function getNormalizedVisualValue(value) {
    if (value === null || value === undefined || isNaN(value)) return null;

    const hazard = canonicalHazard(currentHazard);

    if (
        hazard === "overall" ||
        hazard === "heatRisk" ||
        hazard === "droughtRisk" ||
        hazard === "precipRisk"
    ) {
        return Math.max(0, Math.min(100, value));
    }

    const values = nationalParks
        .map(p => getRiskValue(p))
        .filter(v => v !== null && !isNaN(v));

    if (values.length < 2) return 50;

    return normalize(value, d3.extent(values));
}

function getValueForHazard(park, hazard) {
    const oldHazard = currentHazard;
    currentHazard = hazard;
    const value = getRiskValue(park);
    currentHazard = oldHazard;
    return value;
}

function getInterpolator() {
    const hazard = canonicalHazard(currentHazard);

    if (hazard === "overall") return d3.interpolateYlOrRd;

    if (
        hazard === "heatRisk" ||
        hazard === "temp" ||
        hazard === "tmax" ||
        hazard === "tmin"
    ) {
        return d3.interpolateOranges;
    }

    if (hazard === "droughtRisk" || hazard === "pdsi") {
        return d3.interpolateBrBG;
    }

    if (hazard === "precipRisk" || hazard === "precip") {
        return d3.interpolateBlues;
    }

    return d3.interpolateYlOrRd;
}

function getColor(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return "#8fa6bd";
    }

    const normalizedValue = getNormalizedVisualValue(value);
    const interpolator = getInterpolator();

    return interpolator(normalizedValue / 100);
}

async function getAllNPSRecords() {
    let allRecords = [];
    let start = 0;
    const limit = 50;
    let total = 1;

    while (start < total) {
        const url = `https://developer.nps.gov/api/v1/parks?limit=${limit}&start=${start}&api_key=${apiKey}`;

        const response = await fetch(url);
        const json = await response.json();

        total = parseInt(json.total);
        allRecords = allRecords.concat(json.data);

        start += limit;
    }

    return allRecords;
}

function drawParks() {
    parkMarkers.forEach(item => {
        map.removeLayer(item.marker);
    });

    parkMarkers = [];

    nationalParks.forEach(park => {
        const lat = parseFloat(park.latitude);
        const lon = parseFloat(park.longitude);

        if (isNaN(lat) || isNaN(lon)) return;

        const value = getRiskValue(park);

        if (value !== null && value < currentRiskFilter) return;

        const isSelected =
            selectedPark && selectedPark.parkCode === park.parkCode;

        const marker = L.circleMarker([lat, lon], {
            radius: value === null ? 5.5 : 7.5,
            color: isSelected ? "#ffffff" : "#dbefff",
            fillColor: getColor(value),
            fillOpacity: value === null ? 0.5 : 0.9,
            weight: isSelected ? 3 : 1.3
        }).addTo(map);

        marker.bindPopup(createPopupContent(park, value));

        marker.on("mouseover", () => {
            marker.setStyle({ weight: 3, color: "#ffffff" });
            highlightChartBar(park.parkCode);
        });

        marker.on("mouseout", () => {
            marker.setStyle({
                weight: isSelected ? 3 : 1.3,
                color: isSelected ? "#ffffff" : "#dbefff"
            });
            clearChartHighlight();
        });

        marker.on("click", () => {
            selectedPark = park;
            openFloatingDetail(park);
            drawParks();
            updateChart();
        });

        parkMarkers.push({
            code: park.parkCode,
            name: park.fullName,
            marker,
            data: park,
            value
        });
    });

    updateLegend();
}

function createPopupContent(park, value) {
    const valueText = value === null ? "No climate data for selected year" : value;

    return `
        <div>
            <div class="popup-title"><b>${park.fullName}</b></div>
            <div class="popup-state">${park.states}</div>
            <b>Designation:</b> ${park.designation}<br>
            <div class="popup-risk">
                <b>${getHazardLabel()} (${currentYear}):</b> ${valueText}
            </div>
            ${park.images && park.images.length > 0 ? `<img class="popup-img" src="${park.images[0].url}">` : ""}
            <p>${park.description ? park.description.substring(0, 140) : ""}...</p>
        </div>
    `;
}

function openFloatingDetail(park) {
    const floating = document.getElementById("floatingDetail");
    const floatingContent = document.getElementById("floatingDetailContent");
    const selectedPanel = document.getElementById("selectedParkPanel");

    const value = getRiskValue(park);
    const record = getClimateRecord(park);

    let riskHTML = "";

    if (record) {
        riskHTML = `
            <div class="risk-grid">
                ${makeRiskCard("Overall", getValueForHazard(park, "overall"))}
                ${makeRiskCard("Heat", getValueForHazard(park, "heat"))}
                ${makeRiskCard("Drought", getValueForHazard(park, "drought"))}
                ${makeRiskCard("Heavy Precip.", getValueForHazard(park, "precipRisk"))}
                ${makeRiskCard("Mean Temp", record.temp.toFixed(1))}
                ${makeRiskCard("PDSI", record.pdsi.toFixed(2))}
            </div>
        `;
    } else {
        riskHTML = `<p><b>Climate data:</b> No climate record for this park and year.</p>`;
    }

    const html = `
        <h3>${park.fullName}</h3>
        <p class="detail-meta">
            <b>State:</b> ${park.states} · <b>Designation:</b> ${park.designation}
        </p>

        ${park.images && park.images.length > 0 ? `<img src="${park.images[0].url}">` : ""}

        <p>${park.description ? park.description.substring(0, 320) : ""}...</p>

        <p><b>Selected indicator:</b> ${getHazardLabel()}</p>
        <p><b>Selected year:</b> ${currentYear}</p>
        <p><b>Current value:</b> ${value === null ? "No data" : value}</p>

        ${riskHTML}

        <p>
            <a href="${park.url}" target="_blank" style="color:#7ddcff;">
                View official NPS page
            </a>
        </p>
    `;

    if (floatingContent) floatingContent.innerHTML = html;
    if (floating) floating.classList.remove("hidden");

    if (selectedPanel) {
        selectedPanel.innerHTML = `
            <b>${park.fullName}</b><br>
            ${getHazardLabel()} (${currentYear}): ${value === null ? "No data" : value}
        `;
    }
}

function makeRiskCard(label, value) {
    return `
        <div class="risk-card">
            <span>${label}</span>
            <strong>${value === null || value === undefined ? "NA" : value}</strong>
        </div>
    `;
}

function searchPark() {
    const searchBox = document.getElementById("searchBox");
    if (!searchBox) return;

    const query = searchBox.value.toLowerCase();
    if (query.length < 2) return;

    const match = parkMarkers.find(item =>
        item.name.toLowerCase().includes(query)
    );

    if (match) {
        selectedPark = match.data;
        map.setView(match.marker.getLatLng(), 7);
        match.marker.openPopup();
        openFloatingDetail(match.data);
        drawParks();
        updateChart();
    }
}

function updateLegend() {
    const legendTitle = document.getElementById("legendTitle");
    const legendGradient = document.getElementById("legendGradient");
    const legendLabels = document.querySelector(".legend-labels");

    if (!legendTitle || !legendGradient) return;

    const hazard = canonicalHazard(currentHazard);
    const interpolator = getInterpolator();

    legendTitle.innerHTML = `${getHazardLabel()} (${currentYear})`;

    const colors = [];
    for (let i = 0; i <= 10; i++) {
        colors.push(interpolator(i / 10));
    }

    legendGradient.style.background =
        `linear-gradient(to right, ${colors.join(",")})`;

    if (legendLabels) {
        if (
            hazard === "overall" ||
            hazard === "heatRisk" ||
            hazard === "droughtRisk" ||
            hazard === "precipRisk"
        ) {
            legendLabels.innerHTML = `
                <span>Low risk: 0</span>
                <span>High risk: 100</span>
            `;
        } else {
            legendLabels.innerHTML = `
                <span>Lower value</span>
                <span>Higher value</span>
            `;
        }
    }
}

function updateChart() {
    const svg = d3.select("#rankingChart");
    if (svg.empty()) return;

    svg.selectAll("*").remove();

    const width = svg.node().clientWidth;
    const height = svg.node().clientHeight;

    if (width === 0 || height === 0) return;

    const data = nationalParks
        .map(park => ({
            park,
            code: park.parkCode,
            name: park.fullName,
            value: getRiskValue(park)
        }))
        .filter(d => d.value !== null && !isNaN(d.value))
        .filter(d => d.value >= currentRiskFilter)
        .sort((a, b) => b.value - a.value);

    if (data.length === 0) {
        svg.append("text")
            .attr("x", 28)
            .attr("y", 52)
            .attr("fill", "#ffffff")
            .attr("font-size", "16px")
            .text("No parks match the current filter or selected indicator.");
        return;
    }

    const topData = data.slice(0, 30);

    const margin = {
        top: 20,
        right: 90,
        bottom: 60,
        left: 260
    };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const hazard = canonicalHazard(currentHazard);

    let xMax;
    if (
        hazard === "overall" ||
        hazard === "heatRisk" ||
        hazard === "droughtRisk" ||
        hazard === "precipRisk"
    ) {
        xMax = 100;
    } else {
        xMax = d3.max(topData, d => d.value);
    }

    const x = d3.scaleLinear()
        .domain([0, xMax])
        .nice()
        .range([0, innerWidth]);

    const y = d3.scaleBand()
        .domain(topData.map(d => d.name))
        .range([0, innerHeight])
        .padding(0.35);

    g.append("g")
        .attr("class", "chart-axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(6));

    g.selectAll(".ranking-bar")
        .data(topData)
        .enter()
        .append("rect")
        .attr("class", d => `ranking-bar bar-${d.code}`)
        .attr("x", 0)
        .attr("y", d => y(d.name))
        .attr("height", y.bandwidth())
        .attr("width", d => x(d.value))
        .attr("rx", 6)
        .attr("fill", d => getColor(d.value))
        .attr("opacity", d =>
            selectedPark && selectedPark.parkCode === d.code ? 1 : 0.9
        )
        .attr("stroke", d =>
            selectedPark && selectedPark.parkCode === d.code ? "#ffffff" : "none"
        )
        .attr("stroke-width", d =>
            selectedPark && selectedPark.parkCode === d.code ? 2 : 0
        )
        .on("mouseover", function(event, d) {
            d3.select(this)
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 2);

            const markerMatch = parkMarkers.find(m => m.code === d.code);
            if (markerMatch) {
                markerMatch.marker.setStyle({
                    weight: 3,
                    color: "#ffffff"
                });
            }
        })
        .on("mouseout", function(event, d) {
            const selected =
                selectedPark && selectedPark.parkCode === d.code;

            d3.select(this)
                .attr("stroke", selected ? "#ffffff" : "none")
                .attr("stroke-width", selected ? 2 : 0);

            const markerMatch = parkMarkers.find(m => m.code === d.code);
            if (markerMatch) {
                markerMatch.marker.setStyle({
                    weight: selected ? 3 : 1.3,
                    color: selected ? "#ffffff" : "#dbefff"
                });
            }
        })
        .on("click", function(event, d) {
            selectParkFromRanking(d.code);
        });

    g.selectAll(".chart-label")
        .data(topData)
        .enter()
        .append("text")
        .attr("class", "chart-label")
        .attr("x", -12)
        .attr("y", d => y(d.name) + y.bandwidth() / 2 + 5)
        .attr("text-anchor", "end")
        .text(d => shortenName(d.name));

    g.selectAll(".chart-value")
        .data(topData)
        .enter()
        .append("text")
        .attr("class", "chart-value")
        .attr("x", d => x(d.value) + 8)
        .attr("y", d => y(d.name) + y.bandwidth() / 2 + 5)
        .text(d => d.value);

    svg.append("text")
        .attr("x", margin.left)
        .attr("y", height - 16)
        .attr("fill", "#9ee8ff")
        .attr("font-size", "13px")
        .text(`Top ${topData.length} parks ranked by ${getHazardLabel()} in ${currentYear}`);
}

function shortenName(name) {
    return name
        .replace(" National Park", "")
        .replace(" National Parks", "")
        .replace(" and Preserve", "")
        .replace(" & Preserve", "");
}

function highlightChartBar(parkCode) {
    d3.selectAll(".ranking-bar")
        .attr("opacity", 0.35);

    d3.select(`.bar-${parkCode}`)
        .attr("opacity", 1)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2);
}

function clearChartHighlight() {
    d3.selectAll(".ranking-bar")
        .attr("opacity", 0.9)
        .attr("stroke", d =>
            selectedPark && selectedPark.parkCode === d.code ? "#ffffff" : "none"
        )
        .attr("stroke-width", d =>
            selectedPark && selectedPark.parkCode === d.code ? 2 : 0
        );
}

function selectParkFromRanking(parkCode) {
    const match = parkMarkers.find(item => item.code === parkCode);

    if (match) {
        selectedPark = match.data;
        map.setView(match.marker.getLatLng(), 7);
        match.marker.openPopup();
        openFloatingDetail(match.data);
        drawParks();
        updateChart();
    }
}

function updateControls() {
    const hazardSelect = document.getElementById("hazardSelect");
    const yearSlider = document.getElementById("yearSlider");
    const riskFilter = document.getElementById("riskFilter");

    if (hazardSelect) currentHazard = hazardSelect.value;
    if (yearSlider) currentYear = yearSlider.value;
    if (riskFilter) currentRiskFilter = Number(riskFilter.value);

    const yearLabel = document.getElementById("yearLabel");
    const riskLabel = document.getElementById("riskLabel");

    if (yearLabel) yearLabel.innerHTML = currentYear;
    if (riskLabel) riskLabel.innerHTML = currentRiskFilter;

    drawParks();
    updateChart();

    if (selectedPark) {
        openFloatingDetail(selectedPark);
    }
}

async function init() {
    const startBtn = document.querySelector(".start-btn");
    if (startBtn) {
        startBtn.addEventListener("click", () => closeModal("introModal"));
    }

    const modalClose = document.querySelector(".modal-close");
    if (modalClose) {
        modalClose.addEventListener("click", () => closeModal("introModal"));
    }

    const searchBox = document.getElementById("searchBox");
    const hazardSelect = document.getElementById("hazardSelect");
    const yearSlider = document.getElementById("yearSlider");
    const riskFilter = document.getElementById("riskFilter");

    if (searchBox) searchBox.addEventListener("keyup", searchPark);
    if (hazardSelect) hazardSelect.addEventListener("change", updateControls);
    if (yearSlider) yearSlider.addEventListener("input", updateControls);
    if (riskFilter) riskFilter.addEventListener("input", updateControls);

    window.addEventListener("resize", () => {
        map.invalidateSize();
        updateChart();
    });

    try {
        const npsData = await getAllNPSRecords();

        nationalParks = npsData.filter(park =>
            park.designation === "National Park"
        );

        drawParks();
        zoomToRegion("mainland");

        await loadClimateData();

        updateControls();

        setTimeout(() => {
            map.invalidateSize();
            updateChart();
        }, 250);

    } catch (error) {
        console.error("Error initializing app:", error);
    }
}

init();
