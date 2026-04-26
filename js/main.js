// ===============================
// 1. API KEY
// ===============================
const apiKey = "bWAAEqyZ3eUDlvKietZDTGgX0NAg9fBoeUPItvkV";

// ===============================
// 2. CREATE MAP
// ===============================
const map = L.map("map").setView([39, -98], 4);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19
}).addTo(map);

// ===============================
// 3. GET ALL NPS RECORDS
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

        console.log("Loaded page starting at:", start, json.data.length);

        total = parseInt(json.total);
        allRecords = allRecords.concat(json.data);

        start += limit;
    }

    return allRecords;
}

// ===============================
// 4. DRAW ONLY NATIONAL PARKS
// ===============================
getAllNPSRecords()
    .then(data => {

        console.log("All NPS records:", data.length);

        const nationalParks = data.filter(park =>
            park.designation === "National Park"
        );

        console.log("National Parks only:", nationalParks.length);
        console.log(nationalParks);

        nationalParks.forEach(park => {

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
                <b>${park.fullName}</b><br>
                ${park.states}<br>
                <b>Designation:</b> ${park.designation}<br>
                ${park.images.length > 0 ? `<img src="${park.images[0].url}" width="220">` : ""}
                <p>${park.description.substring(0, 150)}...</p>
            `);
        });

    })
    .catch(error => {
        console.error("Error loading NPS data:", error);
    });