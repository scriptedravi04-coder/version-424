// Session 43 (Ravi: "Faridabad search → nearby creators, 12 km from Faridabad"): approximate
// centre points of Indian cities (lat, lng). A fixed list in code — no database change (rule 91).
// Aliases map spellings / old names to the same place.
export const CITIES = {
  delhi: [28.6139, 77.209], "new delhi": [28.6139, 77.209], noida: [28.5355, 77.391], "greater noida": [28.4744, 77.504],
  gurgaon: [28.4595, 77.0266], gurugram: [28.4595, 77.0266], faridabad: [28.4089, 77.3178], ghaziabad: [28.6692, 77.4538],
  "gautam buddha nagar": [28.5355, 77.391], sonipat: [28.9931, 77.0151], panipat: [29.3909, 76.9635], karnal: [29.6857, 76.9905],
  rohtak: [28.8955, 76.6066], hisar: [29.1492, 75.7217], ambala: [30.3782, 76.7767], panchkula: [30.6942, 76.8606],
  chandigarh: [30.7333, 76.7794], mohali: [30.7046, 76.7179], ludhiana: [30.901, 75.8573], amritsar: [31.634, 74.8723],
  jalandhar: [31.326, 75.5762], patiala: [30.3398, 76.3869], bathinda: [30.211, 74.9455], shimla: [31.1048, 77.1734],
  dehradun: [30.3165, 78.0322], haridwar: [29.9457, 78.1642], rishikesh: [30.0869, 78.2676], meerut: [28.9845, 77.7064],
  "muzaffarnagar": [29.4727, 77.7085], saharanpur: [29.968, 77.5552], moradabad: [28.8386, 78.7733], bareilly: [28.367, 79.4304],
  aligarh: [27.8974, 78.088], agra: [27.1767, 78.0081], mathura: [27.4924, 77.6737], vrindavan: [27.5806, 77.7006],
  lucknow: [26.8467, 80.9462], kanpur: [26.4499, 80.3319], prayagraj: [25.4358, 81.8463], allahabad: [25.4358, 81.8463],
  varanasi: [25.3176, 82.9739], gorakhpur: [26.7606, 83.3732], ayodhya: [26.7922, 82.1998], jhansi: [25.4484, 78.5685],
  jaipur: [26.9124, 75.7873], ajmer: [26.4499, 74.6399], jodhpur: [26.2389, 73.0243], udaipur: [24.5854, 73.7125],
  kota: [25.2138, 75.8648], bikaner: [28.0229, 73.3119], alwar: [27.553, 76.6346], bhilwara: [25.3407, 74.6313],
  sikar: [27.6094, 75.1399], jaisalmer: [26.9157, 70.9083], ahmedabad: [23.0225, 72.5714], gandhinagar: [23.2156, 72.6369],
  surat: [21.1702, 72.8311], vadodara: [22.3072, 73.1812], baroda: [22.3072, 73.1812], rajkot: [22.3039, 70.8022],
  bhavnagar: [21.7645, 72.1519], jamnagar: [22.4707, 70.0577], anand: [22.5645, 72.9289], mumbai: [19.076, 72.8777],
  bombay: [19.076, 72.8777], "navi mumbai": [19.033, 73.0297], thane: [19.2183, 72.9781], "kalyan": [19.2437, 73.1355],
  "vasai": [19.3919, 72.8397], pune: [18.5204, 73.8567], "pimpri chinchwad": [18.6298, 73.7997], nashik: [19.9975, 73.7898],
  nagpur: [21.1458, 79.0882], aurangabad: [19.8762, 75.3433], "chhatrapati sambhajinagar": [19.8762, 75.3433], solapur: [17.6599, 75.9064],
  kolhapur: [16.705, 74.2433], amravati: [20.9374, 77.7796], goa: [15.2993, 74.124], panaji: [15.4909, 73.8278],
  margao: [15.2832, 73.9862], indore: [22.7196, 75.8577], bhopal: [23.2599, 77.4126], gwalior: [26.2183, 78.1828],
  jabalpur: [23.1815, 79.9864], ujjain: [23.1765, 75.7885], raipur: [21.2514, 81.6296], bilaspur: [22.0797, 82.1409],
  bhilai: [21.1938, 81.3509], kolkata: [22.5726, 88.3639], calcutta: [22.5726, 88.3639], howrah: [22.5958, 88.2636],
  siliguri: [26.7271, 88.3953], durgapur: [23.5204, 87.3119], asansol: [23.6739, 86.9524], patna: [25.5941, 85.1376],
  gaya: [24.7955, 84.9994], muzaffarpur: [26.1209, 85.3647], ranchi: [23.3441, 85.3096], jamshedpur: [22.8046, 86.2029],
  dhanbad: [23.7957, 86.4304], bhubaneswar: [20.2961, 85.8245], cuttack: [20.4625, 85.8828], puri: [19.8135, 85.8312],
  guwahati: [26.1445, 91.7362], shillong: [25.5788, 91.8933], imphal: [24.817, 93.9368], agartala: [23.8315, 91.2868],
  gangtok: [27.3389, 88.6065], hyderabad: [17.385, 78.4867], secunderabad: [17.4399, 78.4983], warangal: [17.9689, 79.5941],
  vijayawada: [16.5062, 80.648], visakhapatnam: [17.6868, 83.2185], vizag: [17.6868, 83.2185], guntur: [16.3067, 80.4365],
  tirupati: [13.6288, 79.4192], nellore: [14.4426, 79.9865], bengaluru: [12.9716, 77.5946], bangalore: [12.9716, 77.5946],
  mysuru: [12.2958, 76.6394], mysore: [12.2958, 76.6394], mangaluru: [12.9141, 74.856], mangalore: [12.9141, 74.856],
  hubli: [15.3647, 75.124], belgaum: [15.8497, 74.4977], belagavi: [15.8497, 74.4977], chennai: [13.0827, 80.2707],
  madras: [13.0827, 80.2707], coimbatore: [11.0168, 76.9558], madurai: [9.9252, 78.1198], tiruchirappalli: [10.7905, 78.7047],
  trichy: [10.7905, 78.7047], salem: [11.6643, 78.146], tirunelveli: [8.7139, 77.7567], vellore: [12.9165, 79.1325],
  pondicherry: [11.9416, 79.8083], puducherry: [11.9416, 79.8083], kochi: [9.9312, 76.2673], cochin: [9.9312, 76.2673],
  thiruvananthapuram: [8.5241, 76.9366], trivandrum: [8.5241, 76.9366], kozhikode: [11.2588, 75.7804], calicut: [11.2588, 75.7804],
  thrissur: [10.5276, 76.2144], kannur: [11.8745, 75.3704], srinagar: [34.0837, 74.7973], jammu: [32.7266, 74.857],
  leh: [34.1526, 77.5771], dharamshala: [32.219, 76.3234], manali: [32.2432, 77.1892], nainital: [29.3803, 79.4636],
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

/** Coordinates for a city text ("Gautam Buddha Nagar", "Noida, UP"), or null. */
export function cityPoint(text) {
  const t = norm(text);
  if (!t) return null;
  if (CITIES[t]) return CITIES[t];
  // "noida up" / "jaipur rajasthan" → first known city name inside the text (longest first)
  const names = Object.keys(CITIES).sort((a, b) => b.length - a.length);
  const hit = names.find((n) => (` ${t} `).includes(` ${n} `));
  return hit ? CITIES[hit] : null;
}

export function distanceKm(a, b) {
  if (!a || !b) return null;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const FILLER = /\b(creators?|influencers?|bloggers?|youtubers?|in|near|from|around|based|ke|ka|ki|wale|wala)\b/g;

/** "Jaipur creators" → { city: "Jaipur", point } when the search is a place; else null. */
export function placeFromSearch(term) {
  const cleaned = norm(term).replace(FILLER, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const point = CITIES[cleaned] || null;
  if (!point) return null;
  return { city: cleaned.replace(/\b\w/g, (m) => m.toUpperCase()), point };
}
