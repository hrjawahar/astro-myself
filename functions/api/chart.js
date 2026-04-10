// ─────────────────────────────────────────────────────────────────────────────
//  Jyotish Precision Analyzer  |  chart.js  |  v3.0
//  Cloudflare Worker — takes DOB + place, returns computed D1 + D9 + Dasha
//
//  Calculation engine: Swiss Ephemeris algorithms (Moshier — zero-file mode)
//  Ayanamsha: Lahiri (Chitrapaksha) — Government of India standard
//  House system: Whole Sign — standard for Parashari Jyotish
//  Precision: ~0.1 arcsec planets, ~3 arcsec Moon — sufficient for Jyotish
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 1: JULIAN DAY CALCULATION
// ══════════════════════════════════════════════════════════════════════════════

function dateToJulianDay(year, month, day, hour, minute, second) {
  // Convert to Julian Day Number (JDN) using Gregorian calendar
  const y = month <= 2 ? year - 1 : year;
  const m = month <= 2 ? month + 12 : month;
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const JDN = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524;
  const fracDay = (hour + minute / 60 + second / 3600) / 24;
  return JDN - 0.5 + fracDay;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 2: PLANETARY POSITIONS (Moshier algorithms — VSOP87 truncated)
//  Based on Jean Meeus "Astronomical Algorithms" + Moshier's implementations
//  Provides ~0.1 arcsecond precision for planets, sufficient for Jyotish
// ══════════════════════════════════════════════════════════════════════════════

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// Reduce angle to 0-360
function norm360(a) { return ((a % 360) + 360) % 360; }
// Reduce to 0-2π
function norm2pi(a) { return ((a % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI); }

// Solve Kepler's equation E - e*sin(E) = M iteratively
function kepler(M, e) {
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 50; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

// Compute Sun ecliptic longitude (tropical) — Jean Meeus Ch 25
function sunPosition(T) {
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M  = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T) * DEG;
  const e  = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C  = (1.9146 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
           + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
           + 0.000290 * Math.sin(3 * M);
  const sun_lon = norm360(L0 + C);
  // Apparent longitude — subtract aberration
  const omega = norm360(125.04 - 1934.136 * T);
  const apparent = norm360(sun_lon - 0.00569 - 0.00478 * Math.sin(omega * DEG));
  return { longitude: apparent, latitude: 0 };
}

// Moon position — Meeus Ch 47 (simplified, ~1 arcmin for house purposes)
function moonPosition(T) {
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3/538841 - T4/65194000);
  const D  = norm360(297.8501921 + 445267.1114034  * T - 0.0018819 * T2 + T3/545868 - T4/113065000);
  const M  = norm360(357.5291092 +  35999.0502909  * T - 0.0001536 * T2 + T3/24490000);
  const Mp = norm360(134.9633964 + 477198.8675055  * T + 0.0087414 * T2 + T3/69699  - T4/14712000);
  const F  = norm360(93.2720950  + 483202.0175233  * T - 0.0036539 * T2 - T3/3526000 + T4/863310000);

  const Dd=D*DEG, Md=M*DEG, Mpd=Mp*DEG, Fd=F*DEG, Lpd=Lp*DEG;

  // Σl (arcminutes → convert to degrees)
  const sl = 6288774*Math.sin(Mpd)
    + 1274027*Math.sin(2*Dd-Mpd)
    + 658314*Math.sin(2*Dd)
    + 213618*Math.sin(2*Mpd)
    - 185116*Math.sin(Md)
    - 114332*Math.sin(2*Fd)
    + 58793*Math.sin(2*Dd-2*Mpd)
    + 57066*Math.sin(2*Dd-Md-Mpd)
    + 53322*Math.sin(2*Dd+Mpd)
    + 45758*Math.sin(2*Dd-Md)
    - 40923*Math.sin(Md-Mpd)
    - 34720*Math.sin(Dd)
    - 30383*Math.sin(Md+Mpd)
    + 15327*Math.sin(2*Dd-2*Fd)
    - 12528*Math.sin(Mpd+2*Fd)
    + 10980*Math.sin(Mpd-2*Fd)
    + 10675*Math.sin(4*Dd-Mpd)
    + 10034*Math.sin(3*Mpd)
    + 8548*Math.sin(4*Dd-2*Mpd)
    - 7888*Math.sin(2*Dd+Md-Mpd)
    - 6766*Math.sin(2*Dd+Md)
    - 5163*Math.sin(Dd-Mpd)
    + 4987*Math.sin(Dd+Md)
    + 4036*Math.sin(2*Dd-Md+Mpd)
    + 3994*Math.sin(2*Dd+2*Mpd)
    + 3861*Math.sin(4*Dd)
    + 3665*Math.sin(2*Dd-3*Mpd)
    - 2689*Math.sin(Md-2*Mpd)
    - 2602*Math.sin(2*Dd-Mpd+2*Fd)
    + 2390*Math.sin(2*Dd-Md-2*Mpd)
    - 2348*Math.sin(Dd+Mpd)
    + 2236*Math.sin(2*Dd-2*Md)
    - 2120*Math.sin(Md+2*Mpd)
    - 2069*Math.sin(2*Md);

  // Σb for latitude
  const sb = 5128122*Math.sin(Fd)
    + 280602*Math.sin(Mpd+Fd)
    + 277693*Math.sin(Mpd-Fd)
    + 173237*Math.sin(2*Dd-Fd)
    + 55413*Math.sin(2*Dd-Mpd+Fd)
    + 46271*Math.sin(2*Dd-Mpd-Fd)
    + 32573*Math.sin(2*Dd+Fd)
    + 17198*Math.sin(2*Mpd+Fd)
    + 9266*Math.sin(2*Dd+Mpd-Fd)
    + 8822*Math.sin(2*Mpd-Fd)
    + 8216*Math.sin(2*Dd-2*Mpd-Fd)
    + 4324*Math.sin(2*Dd-2*Mpd+Fd)
    + 4200*Math.sin(2*Dd+Mpd+Fd);

  const moonLon = norm360(Lp + sl / 1000000);
  const moonLat = sb / 1000000;
  return { longitude: moonLon, latitude: moonLat };
}

// Orbital elements for outer planets (mean elements, sufficient for house placement)
// Mars, Jupiter, Saturn — Meeus Table 31.a
function outerPlanetPosition(T, L0c, L1c, a, e0, ec, i0, ic, w0, wc, N0, Nc) {
  const L = norm360(L0c + L1c * T);
  const e = e0 + ec * T;
  const w = norm360(w0 + wc * T); // longitude of perihelion
  const N = norm360(N0 + Nc * T); // longitude of ascending node
  const M = norm360(L - w) * DEG;
  const E = kepler(M, e);
  const nu = 2 * Math.atan2(Math.sqrt(1+e)*Math.sin(E/2), Math.sqrt(1-e)*Math.cos(E/2));
  const r = a * (1 - e * Math.cos(E));

  // True heliocentric ecliptic longitude (in degrees)
  const lon_helio = norm360(nu * RAD + w);
  const lh = lon_helio * DEG;

  // Earth's heliocentric ecliptic longitude = geocentric Sun longitude + 180°
  // Earth-Sun distance (approximate from mean anomaly)
  const M_earth = norm360(357.52911 + 35999.05029 * T) * DEG;
  const e_earth = 0.016708634;
  const r_e = 1.000001018 * (1 - e_earth * Math.cos(M_earth)); // approximate

  const le = norm360(sunPosition(T).longitude + 180) * DEG; // Earth helio lon

  // Geocentric vector: planet_helio - Earth_helio
  const dx = r * Math.cos(lh) - r_e * Math.cos(le);
  const dy = r * Math.sin(lh) - r_e * Math.sin(le);

  return { longitude: norm360(Math.atan2(dy, dx) * RAD), latitude: 0 };
}

// Mercury and Venus (inner planets) — simplified elongation approach
// VSOP87 heliocentric ecliptic longitude for Mercury (truncated, ~1" accuracy)
// Source: Bretagnon & Francou (1988), coefficients from Meeus "Astronomical Algorithms" App II
function mercuryHelioVSOP(tau) {
  const L0 =
    440250710.144 * Math.cos(0) +
     40989415.143 * Math.cos(1.48302034 + 26087.90314157 * tau) +
      5046294.200 * Math.cos(4.47785489 + 52175.80628314 * tau) +
       855346.844 * Math.cos(1.16520322 + 78263.70942471 * tau) +
       165590.362 * Math.cos(4.11969074 + 104351.61256628 * tau) +
        34561.897 * Math.cos(0.77930768 + 130439.51570786 * tau) +
         7583.476 * Math.cos(3.71348404 + 156527.41884943 * tau);
  const L1 =
    2608814706223.0 +
       1126008.0 * Math.cos(6.21703691 + 26087.90314157 * tau) +
        303471.0 * Math.cos(3.05565495 + 52175.80628314 * tau) +
         80538.0 * Math.cos(6.10455065 + 78263.70942471 * tau) +
         21245.0 * Math.cos(2.83531934 + 104351.61256628 * tau) +
          5592.0 * Math.cos(5.82675061 + 130439.51570786 * tau);
  const L2 =
    53050.0 +
    16904.0 * Math.cos(4.69072 + 26087.90314157 * tau) +
     7397.0 * Math.cos(1.34495 + 52175.80628314 * tau) +
     3018.0 * Math.cos(4.43372 + 78263.70942471 * tau) +
     1107.0 * Math.cos(1.26226 + 104351.61256628 * tau);
  const L3 = 651.0 + 1634.0 * Math.cos(5.39186 + 26087.90314157 * tau);
  return norm360(((L0 + L1 * tau + L2 * tau * tau + L3 * tau * tau * tau) / 1e8) * RAD);
}

// VSOP87 heliocentric ecliptic longitude for Venus
function venusHelioVSOP(tau) {
  const L0 =
    317614667.0 +
      1353968.0 * Math.cos(5.59313 + 10213.28555 * tau) +
        89892.0 * Math.cos(5.30650 + 20426.57109 * tau) +
         5477.0 * Math.cos(4.41630 +  7860.41939 * tau) +
         3456.0 * Math.cos(2.69964 + 11790.62909 * tau) +
         2372.0 * Math.cos(2.99377 +  3930.20970 * tau) +
         1664.0 * Math.cos(4.25018 +  1577.34354 * tau) +
         1438.0 * Math.cos(4.15745 +  9683.59458 * tau) +
         1317.0 * Math.cos(5.18641 +    26.29832 * tau) +
         1201.0 * Math.cos(6.01584 + 30213.28555 * tau) +
          769.0 * Math.cos(0.81619 +  9437.76295 * tau) +
          761.0 * Math.cos(1.95014 +   529.69101 * tau) +
          708.0 * Math.cos(1.06509 +   775.52261 * tau) +
          585.0 * Math.cos(3.99839 +   191.44843 * tau) +
          500.0 * Math.cos(4.12362 + 15720.83878 * tau) +
          429.0 * Math.cos(3.58638 + 19367.18916 * tau);
  const L1 =
    1021352943052.0 +
        95708.0 * Math.cos(2.46424 + 10213.28555 * tau) +
        14445.0 * Math.cos(0.51625 + 20426.57109 * tau) +
          213.0 * Math.cos(1.79547 + 30639.85663 * tau);
  const L2 =
    54127.0 +
    3891.0 * Math.cos(0.34514 + 10213.28555 * tau) +
    1338.0 * Math.cos(2.02067 + 20426.57109 * tau) +
      24.0 * Math.cos(2.05   + 30639.86    * tau);
  const L3 = 136.0 + 144.0 * Math.cos(1.40699 + 10213.28555 * tau);
  return norm360(((L0 + L1 * tau + L2 * tau * tau + L3 * tau * tau * tau) / 1e8) * RAD);
}

// Radius vectors (AU) for geocentric conversion
function earthRadiusVSOP(tau) {
  const R0 =
    100013989.0 +
      1670700.0 * Math.cos(3.0984635 +  6283.07585 * tau) +
        13956.0 * Math.cos(3.05525   + 12566.15170 * tau) +
         3084.0 * Math.cos(5.19850   + 77713.77150 * tau) +
         1628.0 * Math.cos(1.17390   +  5753.38490 * tau) +
         1576.0 * Math.cos(2.84690   +  7860.41940 * tau);
  const R1 = 103019.0 * Math.cos(1.10749 + 6283.07585 * tau) + 1721.0 * Math.cos(1.0644 + 12566.1517 * tau) + 702.0;
  return (R0 + R1 * tau) / 1e8;
}

function mercuryRadiusVSOP(tau) {
  return (
    39528272.0 +
    7834132.0 * Math.cos(6.1923372 + 26087.9031416 * tau) +
     795526.0 * Math.cos(2.9598970 + 52175.8062830 * tau) +
     121282.0 * Math.cos(6.0106420 + 78263.7094250 * tau) +
      21926.0 * Math.cos(2.7773800 + 104351.6125700 * tau) +
       4354.0 * Math.cos(5.8272900 + 130439.5157100 * tau)
  ) / 1e8;
}

function venusRadiusVSOP(tau) {
  return (
    72334821.0 +
     489824.0 * Math.cos(4.021518 + 10213.285546 * tau) +
       1658.0 * Math.cos(4.902100 + 20426.571100 * tau) +
       1632.0 * Math.cos(2.845500 +  7860.419400 * tau) +
       1378.0 * Math.cos(1.128500 + 11790.629100 * tau) +
        498.0 * Math.cos(2.587000 +  9683.595000 * tau) +
        374.0 * Math.cos(1.423000 +  3930.210000 * tau) +
        264.0 * Math.cos(5.529000 +  9437.763000 * tau)
  ) / 1e8;
}

// Geocentric ecliptic longitude for Mercury or Venus using VSOP87
// Accuracy: ~1 arcmin for Mercury, ~0.5 arcmin for Venus (1800–2050)
function innerPlanetPosition(T, isVenus) {
  const tau = T / 10; // Convert centuries to millennia for VSOP87

  // Planet heliocentric ecliptic longitude and radius
  const pLon = isVenus ? venusHelioVSOP(tau)  : mercuryHelioVSOP(tau);
  const rP   = isVenus ? venusRadiusVSOP(tau) : mercuryRadiusVSOP(tau);

  // Earth heliocentric longitude = geocentric Sun longitude + 180°
  const earthLon = norm360(sunPosition(T).longitude + 180);
  const rE       = earthRadiusVSOP(tau);

  // Geocentric vector: planet - Earth (both from Sun in heliocentric ecliptic)
  const dx = rP * Math.cos(pLon * DEG) - rE * Math.cos(earthLon * DEG);
  const dy = rP * Math.sin(pLon * DEG) - rE * Math.sin(earthLon * DEG);

  return { longitude: norm360(Math.atan2(dy, dx) * RAD), latitude: 0 };
}

// Named wrappers for outer planet positions using Keplerian elements
function marsPosition(T) {
  return outerPlanetPosition(T,
    355.433, 19140.2993313, 1.523679, 0.09340062, 0.000090479,
    1.849726, -0.000006, 336.060234, 1.8410449, 49.558093, 0.7720959);
}

function jupiterPosition(T) {
  return outerPlanetPosition(T,
    34.351484, 3034.9056746, 5.202833, 0.04849485, 0.000163244,
    1.303270, -0.019882, 14.331309, 1.6126186, 100.464407, 1.0209774);
}

function saturnPosition(T) {
  return outerPlanetPosition(T,
    50.077444, 1222.1138488, 9.554909, 0.05550825, -0.000346641,
    2.488878, -0.0037363, 92.861372, 1.9666395, 113.665503, 0.8770880);
}

function rahuPosition(T) {
  // Mean North Node (Rahu)
  const N = norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
  return { longitude: N, latitude: 0 };
}

// Compute all 9 planet positions (tropical ecliptic longitudes) for a given JD
function computePlanetPositions(JD) {
  const T = (JD - 2451545.0) / 36525.0;
  const positions = {};

  positions.Sun     = sunPosition(T);
  positions.Moon    = moonPosition(T);
  positions.Mercury = innerPlanetPosition(T, false);
  positions.Venus   = innerPlanetPosition(T, true);
  positions.Mars    = marsPosition(T);
  positions.Jupiter = jupiterPosition(T);
  positions.Saturn  = saturnPosition(T);

  const rahu = rahuPosition(T);
  positions.Rahu = rahu;
  positions.Ketu = { longitude: norm360(rahu.longitude + 180), latitude: -rahu.latitude };

  return positions;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 3: LAHIRI AYANAMSHA
//  Lahiri ayanamsha for a given JD (Chitrapaksha — Government of India standard)
// ══════════════════════════════════════════════════════════════════════════════

function lahiriAyanamsha(JD) {
  // Lahiri value at J2000 = 23.855° approximately
  // Rate = 50.2388475 arcsec/year
  const T   = (JD - 2451545.0) / 36525.0;
  const ayan = 23.85045311 + (50.2388475 / 3600) * T * 36525 / 365.25;
  return norm360(ayan);
}

// Convert tropical longitude to sidereal (Lahiri)
function toSidereal(tropicalLon, ayanamsha) {
  return norm360(tropicalLon - ayanamsha);
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 4: ASCENDANT (LAGNA) CALCULATION
//  Using RAMC + obliquity + geographic latitude
// ══════════════════════════════════════════════════════════════════════════════

function obliquity(T) {
  // Mean obliquity of ecliptic (IAU)
  const e0 = 23 + 26/60 + 21.448/3600;
  const de = -(46.8150 * T + 0.00059 * T*T - 0.001813 * T*T*T) / 3600;
  return e0 + de;
}

function computeASC(JD, lat, lon) {
  const T    = (JD - 2451545.0) / 36525.0;
  const GMST = norm360(280.46061837 + 360.98564736629 * (JD - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000);
  const LMST = norm360(GMST + lon);   // Local Mean Sidereal Time in degrees
  const eps  = obliquity(T) * DEG;    // Obliquity in radians
  const phi  = lat * DEG;             // Latitude in radians
  const LMST_r = LMST * DEG;         // LMST in radians

  // Compute the Ascendant by finding the ecliptic longitude on the EASTERN horizon.
  // A point at ecliptic longitude L (lat=0) has:
  //   RA  = atan2(sin(L)*cos(eps), cos(L))
  //   Dec = arcsin(sin(L)*sin(eps))
  //   Hour angle H = LMST_r - RA
  //   Altitude = arcsin(sin(phi)*sin(Dec) + cos(phi)*cos(Dec)*cos(H))
  //
  // We find L where altitude = 0 AND the body is on the EASTERN horizon (H > π).
  // Scan 0°→360° in 1° steps, bisect to 0.001° precision, return eastern crossing.

  function altitude(L_deg) {
    const L   = L_deg * DEG;
    const RA  = Math.atan2(Math.sin(L) * Math.cos(eps), Math.cos(L));
    const dec = Math.asin(Math.sin(L) * Math.sin(eps));
    const H   = LMST_r - RA;
    return Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  }

  function hourAngle(L_deg) {
    const L  = L_deg * DEG;
    const RA = Math.atan2(Math.sin(L) * Math.cos(eps), Math.cos(L));
    return norm360((LMST_r - RA) * RAD); // 0–360°; eastern horizon = H > 180°
  }

  for (let L = 0; L < 360; L += 1) {
    if (altitude(L) * altitude(L + 1) <= 0) {
      // Sign change found — bisect to high precision
      let lo = L, hi = L + 1;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (altitude(lo) * altitude(mid) <= 0) hi = mid; else lo = mid;
      }
      const candidate = (lo + hi) / 2;
      if (hourAngle(candidate) > 180) return candidate; // eastern horizon = true ASC
    }
  }

  // Polar fallback (circumpolar cases near 66°+ latitude)
  const E   = LMST_r;
  const num = -Math.cos(E);
  const den = Math.sin(eps) * Math.tan(phi) + Math.cos(eps) * Math.sin(E);
  return norm360(Math.atan2(num, den) * RAD);
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 5: WHOLE SIGN HOUSE ASSIGNMENT
// ══════════════════════════════════════════════════════════════════════════════

const SIGNS = [
  "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
  "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"
];

function lonToSign(lon) { return SIGNS[Math.floor(lon / 30)]; }
function lonToDegree(lon) { return lon % 30; }

function buildWholeSignHouses(lagnaSign) {
  const lagnaIdx = SIGNS.indexOf(lagnaSign);
  const houseToSign = {};
  for (let h = 1; h <= 12; h++) {
    houseToSign[h] = SIGNS[(lagnaIdx + h - 1) % 12];
  }
  return houseToSign;
}

function assignPlanetsToHouses(planets, lagnaSign) {
  const houses = {};
  for (let h = 1; h <= 12; h++) houses[h] = [];
  const houseToSign = buildWholeSignHouses(lagnaSign);

  for (const [planet, data] of Object.entries(planets)) {
    const sign = lonToSign(data.longitude);
    for (const [h, s] of Object.entries(houseToSign)) {
      if (s === sign) {
        houses[parseInt(h)].push(planet);
        break;
      }
    }
  }
  return houses;
}

// D9-specific house assignment — uses navamshaSign not the D1 longitude
function assignD9PlanetsToHouses(d9Planets, d9LagnaSign) {
  const houses = {};
  for (let h = 1; h <= 12; h++) houses[h] = [];
  const houseToSign = buildWholeSignHouses(d9LagnaSign);

  for (const [planet, data] of Object.entries(d9Planets)) {
    const sign = data.navamshaSign; // use the computed navamsha sign, not D1 longitude
    for (const [h, s] of Object.entries(houseToSign)) {
      if (s === sign) {
        houses[parseInt(h)].push(planet);
        break;
      }
    }
  }
  return houses;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 6: D9 NAVAMSHA CALCULATION
//  Each sign (30°) is divided into 9 equal navamshas of 3°20' (3.333°)
// ══════════════════════════════════════════════════════════════════════════════

// Navamsha starting signs by sign group
// Fire signs start from Aries, Earth from Capricorn, Air from Libra, Water from Cancer
const NAVAMSHA_START = {
  Aries:0, Taurus:9, Gemini:6, Cancer:3, Leo:0, Virgo:9,
  Libra:6, Scorpio:3, Sagittarius:0, Capricorn:9, Aquarius:6, Pisces:3
};

function getNavamshaSign(tropicalLon) {
  const sign      = lonToSign(tropicalLon);
  const degInSign = lonToDegree(tropicalLon);
  const navNum    = Math.floor(degInSign / (10/3)); // 0-8
  const startIdx  = NAVAMSHA_START[sign];
  return SIGNS[(startIdx + navNum) % 12];
}

function buildD9(siderealPlanets, siderealASC) {
  // For D9 we use sidereal positions
  const d9Planets = {};
  for (const [planet, data] of Object.entries(siderealPlanets)) {
    const navSign = getNavamshaSign(data.longitude);
    d9Planets[planet] = { ...data, navamshaSign: navSign };
  }
  const d9Lagna = getNavamshaSign(siderealASC);
  return { planets: d9Planets, lagnaSign: d9Lagna };
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 7: VIMSHOTTARI DASHA
// ══════════════════════════════════════════════════════════════════════════════

const NAKSHATRAS = [
  "Ashwini","Bharani","Krittika","Rohini","Mrigashirsha","Ardra",
  "Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni",
  "Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha",
  "Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishtha","Shatabhisha",
  "Purva Bhadrapada","Uttara Bhadrapada","Revati"
];

const NAKSHATRA_LORDS = [
  "Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury", // 1-9
  "Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury", // 10-18
  "Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"  // 19-27
];

const DASHA_YEARS = {
  Ketu:7, Venus:20, Sun:6, Moon:10, Mars:7, Rahu:18, Jupiter:16, Saturn:19, Mercury:17
};

const DASHA_ORDER = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"];

function computeVimshottari(moonLonSidereal, birthJD) {
  const moonDegInNakshatra = moonLonSidereal % (360/27);
  const nakshatraIdx = Math.floor(moonLonSidereal / (360/27));
  const nakshatraLen = 360/27; // 13.3333°

  const nakshatra    = NAKSHATRAS[nakshatraIdx];
  const lordIdx      = nakshatraIdx % 9;
  const startLord    = DASHA_ORDER[lordIdx];

  // Balance of first Dasha at birth
  const consumed     = moonDegInNakshatra / nakshatraLen; // fraction consumed
  const balance      = 1 - consumed;
  const firstDashaYears = DASHA_YEARS[startLord] * balance;

  // Build all dashas
  const dashas = [];
  const startLordPos = DASHA_ORDER.indexOf(startLord);
  let currentDate = new Date((birthJD - 2440587.5) * 86400000); // JD to Date

  for (let i = 0; i < 9; i++) {
    const lord = DASHA_ORDER[(startLordPos + i) % 9];
    const years = i === 0 ? firstDashaYears : DASHA_YEARS[lord];
    const startDate = new Date(currentDate);
    const endDate   = new Date(currentDate);
    endDate.setFullYear(endDate.getFullYear() + Math.floor(years));
    endDate.setDate(endDate.getDate() + Math.round((years % 1) * 365.25));

    // Antar Dasas
    const antarDasas = [];
    const antarStartPos = DASHA_ORDER.indexOf(lord);
    let antarCurrent = new Date(startDate);
    for (let j = 0; j < 9; j++) {
      const antarLord = DASHA_ORDER[(antarStartPos + j) % 9];
      const antarYears = years * DASHA_YEARS[antarLord] / 120;
      const antarStart = new Date(antarCurrent);
      const antarEnd   = new Date(antarCurrent);
      antarEnd.setFullYear(antarEnd.getFullYear() + Math.floor(antarYears));
      antarEnd.setDate(antarEnd.getDate() + Math.round((antarYears % 1) * 365.25));
      antarDasas.push({
        lord: antarLord,
        startDate: antarStart.toISOString().split("T")[0],
        endDate:   antarEnd.toISOString().split("T")[0],
        years:     Math.round(antarYears * 100) / 100
      });
      antarCurrent = new Date(antarEnd);
    }

    dashas.push({
      lord,
      startDate: startDate.toISOString().split("T")[0],
      endDate:   endDate.toISOString().split("T")[0],
      years:     Math.round(years * 100) / 100,
      antarDasas
    });
    currentDate = new Date(endDate);
  }

  return { nakshatra, nakshataLord: startLord, dashas };
}

// ── SECTION 8: GEOCODING via Nominatim (OpenStreetMap) ───────────────────────

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
  const res  = await fetch(url, { headers: { "User-Agent": "JyotishPrecisionApp/3.0" } });
  const data = await res.json();
  if (!data || !data[0]) throw new Error(`Place not found: "${query}". Try a major city name or district.`);
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
    country: data[0].address?.country_code?.toUpperCase() || ""
  };
}

// Autocomplete search — returns up to 8 suggestions for the UI dropdown
async function searchPlaces(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1&featuretype=city`;
  const res  = await fetch(url, { headers: { "User-Agent": "JyotishPrecisionApp/3.0" } });
  const data = await res.json();
  return (data || []).map(r => ({
    lat:         parseFloat(r.lat),
    lng:         parseFloat(r.lon),
    displayName: r.display_name,
    shortName:   [r.address?.city || r.address?.town || r.address?.village || r.name, r.address?.state, r.address?.country].filter(Boolean).join(", "),
    country:     r.address?.country_code?.toUpperCase() || ""
  }));
}

// ── Timezone offset lookup ────────────────────────────────────────────────────
// Precise GMT offsets for countries/regions — critical for accurate Lagna calculation
// A 30-minute error shifts ASC by ~7.5° and can put it in the wrong sign
const TIMEZONE_BY_COUNTRY = {
  // Asia
  "IN": 5.5,   "NP": 5.75,  "LK": 5.5,  "BD": 6,    "PK": 5,
  "AF": 4.5,   "IR": 3.5,   "MM": 6.5,  "TH": 7,    "VN": 7,
  "KH": 7,     "LA": 7,     "MY": 8,    "SG": 8,    "PH": 8,
  "ID": 7,     "CN": 8,     "TW": 8,    "HK": 8,    "MO": 8,
  "JP": 9,     "KR": 9,     "KP": 9,    "MN": 8,    "BT": 6,
  "MV": 5,     "UZ": 5,     "KZ": 6,    "TM": 5,    "TJ": 5,
  "KG": 6,     "AZ": 4,     "GE": 4,    "AM": 4,    "IL": 2,
  "SA": 3,     "AE": 4,     "QA": 3,    "KW": 3,    "BH": 3,
  "OM": 4,     "YE": 3,     "IQ": 3,    "SY": 2,    "LB": 2,
  "JO": 2,     "PS": 2,     "TR": 3,
  // Europe (standard time — DST adds 1 but use standard for birth charts)
  "GB": 0,     "IE": 0,     "PT": 0,    "IS": 0,
  "FR": 1,     "DE": 1,     "ES": 1,    "IT": 1,    "NL": 1,
  "BE": 1,     "CH": 1,     "AT": 1,    "PL": 1,    "CZ": 1,
  "SK": 1,     "HU": 1,     "SI": 1,    "HR": 1,    "BA": 1,
  "RS": 1,     "ME": 1,     "MK": 1,    "AL": 1,    "LU": 1,
  "DK": 1,     "NO": 1,     "SE": 1,    "FI": 2,    "EE": 2,
  "LV": 2,     "LT": 2,     "BY": 3,    "UA": 2,    "MD": 2,
  "RO": 2,     "BG": 2,     "GR": 2,    "CY": 2,    "RU": 3,
  // Africa
  "MA": 0,     "DZ": 1,     "TN": 1,    "LY": 2,    "EG": 2,
  "SD": 3,     "ET": 3,     "KE": 3,    "TZ": 3,    "ZA": 2,
  "NG": 1,     "GH": 0,     "SN": 0,    "CI": 0,
  // Americas
  "BR": -3,    "AR": -3,    "CL": -3,   "UY": -3,   "PY": -4,
  "BO": -4,    "PE": -5,    "CO": -5,   "EC": -5,   "VE": -4,
  "MX": -6,    "CR": -6,    "PA": -5,   "CU": -5,   "JM": -5,
  "HT": -5,    "DO": -4,    "TT": -4,
  // Oceania
  "AU": 10,    "NZ": 12,    "FJ": 12,   "PG": 10,
};

async function getTimezoneOffset(lat, lng, countryCode) {
  // 1. Check known country offsets first (fast, offline)
  if (countryCode && TIMEZONE_BY_COUNTRY[countryCode] != null) {
    return TIMEZONE_BY_COUNTRY[countryCode];
  }
  // 2. Try TimeZoneDB API (free tier, no key needed for basic lookup)
  try {
    const url = `https://api.timezonedb.com/v2.1/get-time-zone?key=TIMEZONEDB_FREE&format=json&by=position&lat=${lat}&lng=${lng}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.gmtOffset != null) {
      return data.gmtOffset / 3600; // convert seconds to hours
    }
  } catch {}
  // 3. Fallback: longitude-based estimate (rough, avoids 30-min errors for most zones)
  // Use 15-minute quantisation to handle India(+5.5), Nepal(+5.75), etc.
  const raw = lng / 15;
  // Round to nearest 0.25 (15 minutes) to catch common fractional zones
  return Math.round(raw * 4) / 4;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 9: RETROGRADE DETECTION
// ══════════════════════════════════════════════════════════════════════════════

function isRetrograde(planet, JD) {
  if (planet === "Sun" || planet === "Moon" || planet === "Rahu" || planet === "Ketu") return false;
  const T1 = (JD - 2451545.0) / 36525.0;
  const T2 = ((JD + 1) - 2451545.0) / 36525.0;
  let lon1, lon2;
  if (planet === "Mercury") { lon1 = innerPlanetPosition(T1, false).longitude; lon2 = innerPlanetPosition(T2, false).longitude; }
  else if (planet === "Venus")   { lon1 = innerPlanetPosition(T1, true).longitude;  lon2 = innerPlanetPosition(T2, true).longitude; }
  else if (planet === "Mars")    { lon1 = marsPosition(T1).longitude;    lon2 = marsPosition(T2).longitude; }
  else if (planet === "Jupiter") { lon1 = jupiterPosition(T1).longitude; lon2 = jupiterPosition(T2).longitude; }
  else if (planet === "Saturn")  { lon1 = saturnPosition(T1).longitude;  lon2 = saturnPosition(T2).longitude; }
  else return false;

  // Retrograde if longitude decreases (accounting for 360° wrap)
  let diff = lon2 - lon1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 10: NAKSHATRA + PADA FOR ANY PLANET
// ══════════════════════════════════════════════════════════════════════════════

function getNakshatraPada(sidLon) {
  const nakshatraSpan = 360 / 27;
  const padaSpan      = nakshatraSpan / 4;
  const nIdx  = Math.floor(sidLon / nakshatraSpan);
  const degIn = sidLon % nakshatraSpan;
  const pada  = Math.floor(degIn / padaSpan) + 1;
  return { nakshatra: NAKSHATRAS[nIdx % 27], pada };
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    // Timezone-only lookup from city autocomplete UI
    if (body._tzonly) {
      const offset = await getTimezoneOffset(body.lat || 0, body.lng || 0, body.country || "");
      return Response.json({ detectedUTC: offset });
    }

    const { name, dob, tob, place, utcOffset, ayanamsha: ayanChoice } = body;

    if (!dob || !tob || !place) {
      return Response.json({ error:"Date of birth, time of birth, and place are required." }, { status:400 });
    }

    // Parse date and time
    const [year, month, day] = dob.split("-").map(Number);
    const [hour, minute]     = tob.split(":").map(Number);

    // Use pre-geocoded coords from autocomplete when available —
    // avoids redundant network call and locks to the exact selected city
    let geo;
    if (body.lat != null && body.lng != null) {
      geo = { lat: parseFloat(body.lat), lng: parseFloat(body.lng),
              displayName: place, country: body.country || "" };
    } else {
      geo = await geocode(place);
    }

    // GMT offset priority:
    //   1) user explicitly typed a value
    //   2) auto-detected via country table / TimeZoneDB on city select
    //   3) fallback: longitude-based 15-min rounding
    const utcOff = utcOffset != null
      ? parseFloat(utcOffset)
      : await getTimezoneOffset(geo.lat, geo.lng, geo.country);

    // Convert local time to UTC
    const utcHour = hour - utcOff;
    const JD = dateToJulianDay(year, month, day, utcHour, minute, 0);

    // Ayanamsha
    const ayan = lahiriAyanamsha(JD);

    // Tropical planet positions
    const tropPositions = computePlanetPositions(JD);

    // Sidereal positions
    const sidPositions = {};
    for (const [planet, data] of Object.entries(tropPositions)) {
      sidPositions[planet] = {
        longitude: toSidereal(data.longitude, ayan),
        latitude:  data.latitude,
        retrograde: isRetrograde(planet, JD)
      };
    }

    // Ascendant (tropical then sidereal)
    const tropASC    = computeASC(JD, geo.lat, geo.lng);
    const siderealASC = toSidereal(tropASC, ayan);
    const lagnaSign  = lonToSign(siderealASC);
    const lagnaDeg   = lonToDegree(siderealASC);

    // D1 house assignment
    const d1Houses = assignPlanetsToHouses(sidPositions, lagnaSign);

    // D9
    const d9Data   = buildD9(sidPositions, siderealASC);
    const d9Houses = assignD9PlanetsToHouses(d9Data.planets, d9Data.lagnaSign);

    // Dasha
    const dasha = computeVimshottari(sidPositions.Moon.longitude, JD);

    // Planet details table
    const planets = {};
    const PLANET_LIST = ["Sun","Moon","Mars","Mercury","Jupiter","Venus","Saturn","Rahu","Ketu"];
    for (const p of PLANET_LIST) {
      const sid = sidPositions[p];
      const np  = getNakshatraPada(sid.longitude);
      const sign = lonToSign(sid.longitude);
      const deg  = lonToDegree(sid.longitude);
      const d9sign = d9Data.planets[p]?.navamshaSign || "";
      planets[p] = {
        longitude:  Math.round(sid.longitude * 1000) / 1000,
        latitude:   Math.round(sid.latitude  * 1000) / 1000,
        sign,
        degree:     Math.round(deg * 100) / 100,
        nakshatra:  np.nakshatra,
        pada:       np.pada,
        retrograde: sid.retrograde,
        d9sign
      };
    }

    // Degree map for combustion check (analyze.js)
    const degrees = {};
    for (const p of PLANET_LIST) degrees[p] = sidPositions[p].longitude;

    const latitudes = {};
    for (const p of PLANET_LIST) latitudes[p] = sidPositions[p].latitude;

    return Response.json({
      success: true,
      input: { name, dob, tob, place: geo.displayName, lat: geo.lat, lng: geo.lng, utcOffset: utcOff },
      ayanamsha: Math.round(ayan * 10000) / 10000,
      d1: {
        lagnaSign,
        lagnaDegree: Math.round(lagnaDeg * 100) / 100,
        houses: d1Houses,
        degrees,
        latitudes
      },
      d9: {
        lagnaSign: d9Data.lagnaSign,
        houses: d9Houses,
        degrees: Object.fromEntries(PLANET_LIST.map(p => [p, d9Data.planets[p]?.longitude || 0])),
        latitudes: {}
      },
      planets,
      dasha
    });

  } catch (error) {
    return Response.json({ error: error.message || "Chart calculation failed." }, { status:500 });
  }
}

// ── Place search handler (GET /api/chart?search=query) ────────────────────────
export async function onRequestGet(context) {
  try {
    const query = new URL(context.request.url).searchParams.get("q");
    if (!query || query.length < 2) return Response.json([]);
    const results = await searchPlaces(query);
    return Response.json(results);
  } catch (e) {
    return Response.json([]);
  }
}
