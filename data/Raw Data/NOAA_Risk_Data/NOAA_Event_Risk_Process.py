import pandas as pd
from pathlib import Path

# =========================
# 1. Park-county lookup
# =========================
parks = [
("acad","Acadia National Park","Hancock","ME","23009"),
("arch","Arches National Park","Grand","UT","49019"),
("badl","Badlands National Park","Jackson","SD","46071"),
("bibe","Big Bend National Park","Brewster","TX","48043"),
("bisc","Biscayne National Park","Miami-Dade","FL","12086"),
("blca","Black Canyon of the Gunnison National Park","Montrose","CO","08085"),
("brca","Bryce Canyon National Park","Garfield","UT","49017"),
("cany","Canyonlands National Park","San Juan","UT","49037"),
("care","Capitol Reef National Park","Wayne","UT","49055"),
("cave","Carlsbad Caverns National Park","Eddy","NM","35015"),
("chis","Channel Islands National Park","Ventura","CA","06111"),
("cong","Congaree National Park","Richland","SC","45079"),
("crla","Crater Lake National Park","Klamath","OR","41035"),
("cuva","Cuyahoga Valley National Park","Summit","OH","39153"),
("dena","Denali National Park","Denali Borough","AK","02068"),
("deva","Death Valley National Park","Inyo","CA","06027"),
("drto","Dry Tortugas National Park","Monroe","FL","12087"),
("ever","Everglades National Park","Miami-Dade","FL","12086"),
("gaar","Gates of the Arctic National Park","Northwest Arctic","AK","02188"),
("glac","Glacier National Park","Flathead","MT","30029"),
("glba","Glacier Bay National Park","Hoonah-Angoon","AK","02105"),
("grba","Great Basin National Park","White Pine","NV","32033"),
("grca","Grand Canyon National Park","Coconino","AZ","04005"),
("grsa","Great Sand Dunes National Park","Alamosa","CO","08003"),
("grsm","Great Smoky Mountains National Park","Sevier","TN","47155"),
("grte","Grand Teton National Park","Teton","WY","56039"),
("gumo","Guadalupe Mountains National Park","Culberson","TX","48109"),
("hale","Haleakalā National Park","Maui","HI","15009"),
("havo","Hawaiʻi Volcanoes National Park","Hawaii","HI","15001"),
("hosp","Hot Springs National Park","Garland","AR","05051"),
("indu","Indiana Dunes National Park","Porter","IN","18127"),
("isro","Isle Royale National Park","Keweenaw","MI","26083"),
("jotr","Joshua Tree National Park","Riverside","CA","06065"),
("katm","Katmai National Park","Lake and Peninsula","AK","02164"),
("kefj","Kenai Fjords National Park","Kenai Peninsula","AK","02122"),
("kova","Kobuk Valley National Park","Northwest Arctic","AK","02188"),
("lacl","Lake Clark National Park","Lake and Peninsula","AK","02164"),
("lavo","Lassen Volcanic National Park","Shasta","CA","06089"),
("maca","Mammoth Cave National Park","Edmonson","KY","21061"),
("meve","Mesa Verde National Park","Montezuma","CO","08083"),
("mora","Mount Rainier National Park","Pierce","WA","53053"),
("noca","North Cascades National Park","Whatcom","WA","53073"),
("olym","Olympic National Park","Clallam","WA","53009"),
("pefo","Petrified Forest National Park","Navajo","AZ","04017"),
("pinn","Pinnacles National Park","San Benito","CA","06069"),
("redw","Redwood National Park","Humboldt","CA","06023"),
("romo","Rocky Mountain National Park","Larimer","CO","08069"),
("sagu","Saguaro National Park","Pima","AZ","04019"),
("sequoia","Sequoia National Park","Tulare","CA","06107"),
("kings","Kings Canyon National Park","Fresno","CA","06019"),
("shen","Shenandoah National Park","Madison","VA","51113"),
("thro","Theodore Roosevelt National Park","Billings","ND","38007"),
("viis","Virgin Islands National Park","St John","VI","78020"),
("voyg","Voyageurs National Park","Koochiching","MN","27071"),
("whsa","White Sands National Park","Otero","NM","35035"),
("wica","Wind Cave National Park","Custer","SD","46033"),
("wrst","Wrangell–St. Elias National Park","Copper River","AK","02066"),
("yell","Yellowstone National Park","Park","WY","56029"),
("yose","Yosemite National Park","Mariposa","CA","06043"),
("zion","Zion National Park","Washington","UT","49053"),
("newr","New River Gorge National Park","Fayette","WV","54019"),
("jeff","Gateway Arch National Park","St Louis City","MO","29510"),
("amis","National Park of American Samoa","Eastern District","AS","60010")
]

parks = pd.DataFrame(parks, columns=["parkCode","parkName","county","state","GEOID"])
parks["GEOID"] = parks["GEOID"].astype(str).str.zfill(5)

# =========================
# 2. Read NOAA Storm Events
# =========================
folder = Path("NOAA_Risk_Data")
files = list(folder.glob("StormEvents_details*.csv")) + list(folder.glob("StormEvents_details*.csv.gz"))

dfs = []

for file in files:
    print("Reading:", file.name)

    df = pd.read_csv(
        file,
        low_memory=False,
        dtype={
            "STATE_FIPS": str,
            "CZ_FIPS": str,
            "CZ_TYPE": str
        }
    )

    keep_cols = [
        "BEGIN_YEARMONTH",
        "EVENT_ID",
        "STATE",
        "STATE_FIPS",
        "EVENT_TYPE",
        "CZ_TYPE",
        "CZ_FIPS",
        "CZ_NAME",
        "DAMAGE_PROPERTY",
        "DAMAGE_CROPS",
        "INJURIES_DIRECT",
        "INJURIES_INDIRECT",
        "DEATHS_DIRECT",
        "DEATHS_INDIRECT"
    ]

    existing = [c for c in keep_cols if c in df.columns]
    df = df[existing]

    dfs.append(df)

storm = pd.concat(dfs, ignore_index=True)

print("Raw NOAA rows:", len(storm))

# =========================
# 3. County-level only
# =========================
# C = county, Z = forecast zone
# For county-level analysis, keep C only.
storm = storm[storm["CZ_TYPE"] == "C"].copy()

storm["STATE_FIPS"] = storm["STATE_FIPS"].astype(str).str.zfill(2)
storm["CZ_FIPS"] = storm["CZ_FIPS"].astype(str).str.zfill(3)
storm["GEOID"] = storm["STATE_FIPS"] + storm["CZ_FIPS"]

storm["BEGIN_YEARMONTH"] = storm["BEGIN_YEARMONTH"].astype(str)
storm["year"] = storm["BEGIN_YEARMONTH"].str[:4].astype(int)
storm["month"] = storm["BEGIN_YEARMONTH"].str[4:6].astype(int)

storm = storm[(storm["year"] >= 1985) & (storm["year"] <= 2026)]

# Keep only your 63 park counties
target_geoids = set(parks["GEOID"])
storm = storm[storm["GEOID"].isin(target_geoids)].copy()

print("Rows in park counties:", len(storm))

# =========================
# 4. Define hazard types
# =========================
flood_types = [
    "Flood",
    "Flash Flood",
    "Coastal Flood",
    "Lakeshore Flood",
    "Storm Surge/Tide",
    "Heavy Rain",
    "Tropical Storm",
    "Hurricane"
]

wildfire_types = [
    "Wildfire"
]

cold_types = [
    "Extreme Cold/Wind Chill",
    "Cold/Wind Chill",
    "Frost/Freeze",
    "Winter Storm",
    "Ice Storm",
    "Heavy Snow",
    "Blizzard"
]

drought_types = [
    "Drought"
]

storm["flood_event"] = storm["EVENT_TYPE"].isin(flood_types).astype(int)
storm["wildfire_event"] = storm["EVENT_TYPE"].isin(wildfire_types).astype(int)
storm["cold_event"] = storm["EVENT_TYPE"].isin(cold_types).astype(int)
storm["drought_event"] = storm["EVENT_TYPE"].isin(drought_types).astype(int)

storm["any_risk_event"] = (
    storm["flood_event"] +
    storm["wildfire_event"] +
    storm["cold_event"] +
    storm["drought_event"]
)

storm = storm[storm["any_risk_event"] > 0].copy()

print("Filtered risk events:", len(storm))

# =========================
# 5. Aggregate to county-month
# =========================
county_month = storm.groupby(
    ["GEOID", "year", "month"],
    as_index=False
).agg(
    flood_events=("flood_event", "sum"),
    wildfire_events=("wildfire_event", "sum"),
    cold_events=("cold_event", "sum"),
    drought_events=("drought_event", "sum"),
    total_risk_events=("EVENT_ID", "count")
)

# =========================
# 6. Build full park-month panel
# =========================
years = list(range(1985, 2027))
months = list(range(1, 13))

time_grid = pd.MultiIndex.from_product(
    [years, months],
    names=["year","month"]
).to_frame(index=False)

park_grid = parks.merge(time_grid, how="cross")

final = park_grid.merge(
    county_month,
    on=["GEOID", "year", "month"],
    how="left"
)

event_cols = [
    "flood_events",
    "wildfire_events",
    "cold_events",
    "drought_events",
    "total_risk_events"
]

for col in event_cols:
    final[col] = final[col].fillna(0).astype(int)

# =========================
# 7. Monthly 5-quantile risk ranks
# =========================
risk_labels = ["Very Low", "Low", "Moderate", "High", "Extreme"]

def rank_monthly(series):
    valid = series.dropna()

    # If all values are same or too few unique values, return "Very Low"
    if valid.nunique() < 2:
        return pd.Series(["Very Low"] * len(series), index=series.index)

    try:
        codes = pd.qcut(
            series.rank(method="first"),
            q=5,
            labels=risk_labels
        )
        return codes
    except Exception:
        return pd.Series([pd.NA] * len(series), index=series.index)


final["flood_rank_monthly"] = final.groupby(["year","month"])["flood_events"].transform(rank_monthly)
final["wildfire_rank_monthly"] = final.groupby(["year","month"])["wildfire_events"].transform(rank_monthly)
final["cold_rank_monthly"] = final.groupby(["year","month"])["cold_events"].transform(rank_monthly)
final["drought_rank_monthly"] = final.groupby(["year","month"])["drought_events"].transform(rank_monthly)
final["total_event_rank_monthly"] = final.groupby(["year","month"])["total_risk_events"].transform(rank_monthly)



from pathlib import Path

# =========================
# SAVE OUTPUTS
# =========================

output_folder = Path.cwd()

park_output = output_folder / "national_parks_NOAA_event_risk_monthly_1985_2026.csv"
county_output = output_folder / "county_monthly_NOAA_event_risk_1985_2026.csv"

final.to_csv(park_output, index=False)
county_month.to_csv(county_output, index=False)

print("DONE")
print("National Parks matched output saved here:")
print(park_output)

print("County-level output saved here:")
print(county_output)

print("Rows:", len(final))
print("Parks:", final["parkCode"].nunique())