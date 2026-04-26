//insert code here!
// ===============================
// 1. API KEY
// Do NOT push your real key to GitHub.
// Replace this locally only.
// ===============================
const apiKey = "bWAAEqyZ3eUDlvKietZDTGgX0NAg9fBoeUPItvkV";

// ===============================
// 2. CREATE MAP
// ===============================
const map = L.map("map", {
    zoomControl: true
}).setView([39, -98], 4);

// Dark technology-style basemap
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19
}).addTo(map);

// ===============================
// 3. GLOBAL VARIABLES
// ===============================
let nationalParks = [];
let parkMarkers = [];

// ===============================
// 4. GET ALL NPS RECORDS WITH PAGINATION
// ===============================
async function getAllNPSRecords() {
    let allRecords = [];
    let start = 0;
    const limit = 50;
    let total = 1;

    while (start < total) {
        const url = `https://developer.nps.gov/api/v1/parks?limit=${limit}&start=${start}&api_key=${apiKey}`;

        const response = await fetch(url);
        const json = await response.json();

        console.log("Loaded page starting at:", start, "records:", json.data.length);

        total = parseInt(json.total);
        allRecords = allRecords.concat(json.data);

        start += limit;
    }

    return allRecords;
}

// ===============================
// 5. DRAW PARK POINTS
// ===============================
function drawParks(parks) {

    // clear old markers
    parkMarkers.forEach(item => {
        map.removeLayer(item.marker);
    });

    parkMarkers = [];

    parks.forEach(park => {

        const lat = parseFloat(park.latitude);
        const lon = parseFloat(park.longitude);

        if (isNaN(lat) || isNaN(lon)) return;

        const marker = L.circleMarker([lat, lon], {
            radius: 7,
            color: "#00e5ff",
            fillColor: "#00e5ff",
            fillOpacity: 0.85,
            weight: 1.5
        }).addTo(map);

        marker.bindPopup(`
            <div>
                <div class="popup-title"><b>${park.fullName}</b></div>
                <div class="popup-state">${park.states}</div>
                <b>Designation:</b> ${park.designation}<br>
                ${park.images.length > 0 ? `<img class="popup-img" src="${park.images[0].url}">` : ""}
                <p>${park.description.substring(0, 150)}...</p>
            </div>
        `);

        marker.on("click", () => {
            updateDetailPanel(park);
        });

        parkMarkers.push({
            name: park.fullName,
            marker: marker,
            data: park
        });
    });
}

// ===============================
// 6. UPDATE DETAIL PANEL
// ===============================
function updateDetailPanel(park) {
    const detailPanel = document.getElementById("detailPanel");

    detailPanel.innerHTML = `
        <h3>${park.fullName}</h3>
        <p><b>State:</b> ${park.states}</p>
        <p><b>Designation:</b> ${park.designation}</p>
        ${park.images.length > 0 ? `<img src="${park.images[0].url}">` : ""}
        <p>${park.description.substring(0, 220)}...</p>
        <p>
            <a href="${park.url}" target="_blank" style="color:#7ddcff;">
                View official NPS page
            </a>
        </p>
    `;
}

// ===============================
// 7. SEARCH FUNCTION
// ===============================
function searchPark() {
    const query = document.getElementById("searchBox").value.toLowerCase();

    if (query.length < 2) return;

    const match = parkMarkers.find(item =>
        item.name.toLowerCase().includes(query)
    );

    if (match) {
        map.setView(match.marker.getLatLng(), 7);
        match.marker.openPopup();
        updateDetailPanel(match.data);
    }
}

// ===============================
// 8. EVENT LISTENERS
// ===============================
document.getElementById("searchBox").addEventListener("keyup", searchPark);

// ===============================
// 9. LOAD DATA
// ===============================
getAllNPSRecords()
    .then(data => {

        console.log("All NPS records:", data.length);

        nationalParks = data.filter(park =>
            park.designation === "National Park"
        );

        console.log("National Parks only:", nationalParks.length);
        console.log(nationalParks);

        drawParks(nationalParks);
    })
    .catch(error => {
        console.error("Error loading NPS data:", error);
    });