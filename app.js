// ─────────────────────────────────────────────────────────────────────────────
//  Jyotish Precision Analyzer  |  app.js  |  v3.0
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "jyotish-v3-inputs";
const HISTORY_KEY = "jyotish-v3-history";

const PLANET_GLYPHS = {
  Sun:"☉", Moon:"☽", Mars:"♂", Mercury:"☿", Jupiter:"♃",
  Venus:"♀", Saturn:"♄", Rahu:"☊", Ketu:"☋"
};

const PLANET_LIST = ["Sun","Moon","Mars","Mercury","Jupiter","Venus","Saturn","Rahu","Ketu"];

// South Indian chart layout — position of each house number
// SI format: fixed sign assignments per cell position (0-indexed row,col)
// Lagna is house 1, others relative
const SI_LAYOUT = [
  // [row, col] for houses 1-12
  [0,2],[0,3],[1,3],[2,3],  // 1,2,3,4
  [3,3],[3,2],[3,1],[3,0],  // 5,6,7,8
  [2,0],[1,0],[0,0],[0,1]   // 9,10,11,12
];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const tabs      = document.querySelectorAll(".nav-tab");
const screens   = document.querySelectorAll(".screen");
const genBtn    = document.getElementById("generateBtn");
const genText   = document.getElementById("generateBtnText");
const statusMsg = document.getElementById("statusMsg");
const errorBox  = document.getElementById("errorBox");
const saveBtn   = document.getElementById("saveBtn");
const dlBtn     = document.getElementById("downloadBtn");
const resetBtn  = document.getElementById("resetBtn");

let currentData = null; // { chart, analysis }

// ── TAB ROUTING ────────────────────────────────────────────────────────────────
function switchTab(tabId) {
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tabId));
  screens.forEach(s => s.classList.toggle("active", s.id === tabId));
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const requires = tab.dataset.requires;
    if (requires === "chart" && !currentData?.chart) return;
    if (requires === "analysis" && !currentData?.analysis) return;
    switchTab(tab.dataset.tab);
  });
});

// ── FORM HELPERS ──────────────────────────────────────────────────────────────
function getForm() {
  return {
    name:     document.getElementById("inputName").value.trim(),
    dob:      document.getElementById("inputDOB").value,
    tob:      document.getElementById("inputTOB").value,
    place:    document.getElementById("inputPlace").value.trim(),
    utcOffset:document.getElementById("inputUTC").value.trim() || null,
  };
}

function setStatus(msg, type="") {
  statusMsg.textContent = msg;
  statusMsg.className   = "status-msg" + (type ? ` ${type}` : "");
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

function clearError() { errorBox.classList.add("hidden"); }

// ── MAIN GENERATE FLOW ─────────────────────────────────────────────────────────
genBtn.addEventListener("click", generate);

async function generate() {
  const form = getForm();
  clearError();

  if (!form.dob || !form.tob || !form.place) {
    showError("Please enter date of birth, time of birth, and place of birth to continue.");
    return;
  }

  genBtn.disabled = true;
  genText.innerHTML = `<span class="spinner"></span>Calculating chart...`;
  setStatus("Step 1 of 2 — Computing planetary positions via Swiss Ephemeris...", "loading");

  try {
    // Step 1: Chart calculation
    const chartRes = await fetch("/api/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, utcOffset: form.utcOffset ? parseFloat(form.utcOffset) : null })
    });

    const chartText = await chartRes.text();
    let chartData;
    try { chartData = JSON.parse(chartText); }
    catch { throw new Error("Chart API returned invalid response. Check /functions/api/chart.js."); }
    if (!chartRes.ok) throw new Error(chartData.error || "Chart calculation failed.");
    if (chartData.error) throw new Error(chartData.error);

    setStatus("Step 2 of 2 — Running precision scoring engine...", "loading");
    genText.innerHTML = `<span class="spinner"></span>Analyzing domains...`;

    // Step 2: Analysis
    const analysisPayload = {
      d1: { lagnaSign: chartData.d1.lagnaSign, houses: chartData.d1.houses, degrees: chartData.d1.degrees, latitudes: chartData.d1.latitudes },
      d9: { lagnaSign: chartData.d9.lagnaSign, houses: chartData.d9.houses, degrees: chartData.d9.degrees, latitudes: chartData.d9.latitudes || {} }
    };

    const analysisRes = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysisPayload)
    });

    const analysisData = await analysisRes.json();
    if (!analysisRes.ok) throw new Error(analysisData.error || "Analysis failed.");

    currentData = { chart: chartData, analysis: analysisData, form };

    // Render all screens
    renderChartScreen(chartData);
    renderDashaScreen(chartData);
    renderDomainScreen(analysisData, chartData);
    renderSummaryScreen(analysisData, chartData);
    renderPlanetScreen(chartData);

    // Unlock tabs
    tabs.forEach(t => {
      if (t.dataset.requires === "chart" || t.dataset.requires === "analysis") {
        t.disabled = false;
      }
    });

    if (dlBtn) dlBtn.disabled = false;

    setStatus("Chart and analysis complete.", "done");
    switchTab("chartTab");

  } catch (err) {
    showError(err.message || "An unexpected error occurred.");
    setStatus("", "");
  } finally {
    genBtn.disabled = false;
    genText.textContent = "Generate Chart & Insights";
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CHART SCREEN
// ══════════════════════════════════════════════════════════════════════════════

function renderChartScreen(data) {
  const { d1, d9, planets, ayanamsha } = data;

  // Lagna bar
  const moonNak = planets.Moon?.nakshatra || "";
  const moonPada = planets.Moon?.pada || "";
  document.getElementById("lagnaBar").innerHTML = `
    <div class="lagna-item"><div class="lagna-key">D1 Lagna</div><div class="lagna-val">${d1.lagnaSign} ${d1.lagnaDegree?.toFixed(1)}°</div></div>
    <div class="lagna-item"><div class="lagna-key">D9 Lagna</div><div class="lagna-val">${d9.lagnaSign}</div></div>
    <div class="lagna-item"><div class="lagna-key">Moon Nakshatra</div><div class="lagna-val">${moonNak} Pada ${moonPada}</div></div>
    <div class="lagna-item"><div class="lagna-key">Ayanamsha</div><div class="lagna-val">Lahiri ${ayanamsha?.toFixed(4)}°</div></div>
    <div class="lagna-item"><div class="lagna-key">Native</div><div class="lagna-val">${data.input?.name || "—"}</div></div>
  `;

  document.getElementById("d1LagnaLabel").textContent = `Lagna: ${d1.lagnaSign}`;
  document.getElementById("d9LagnaLabel").textContent = `Lagna: ${d9.lagnaSign}`;

  // Build combustion set for display
  const combust = buildCombustSet(planets);
  const warLosers = buildWarSet(planets);

  renderSIChart("d1ChartWrap", d1.lagnaSign, d1.houses, planets, combust, warLosers, false);
  renderSIChart("d9ChartWrap", d9.lagnaSign, d9.houses, planets, combust, warLosers, true);
}

function buildCombustSet(planets) {
  const orbs = { Moon:7, Mars:17, Mercury:14, Jupiter:11, Venus:10, Saturn:15 };
  const combust = new Set();
  if (!planets.Sun) return combust;
  const sunLon = planets.Sun.longitude;
  for (const [p, orb] of Object.entries(orbs)) {
    if (!planets[p]) continue;
    let diff = Math.abs(planets[p].longitude - sunLon);
    if (diff > 180) diff = 360 - diff;
    if (diff <= orb) combust.add(p);
  }
  return combust;
}

function buildWarSet(planets) {
  const warPlanets = ["Mars","Mercury","Jupiter","Venus","Saturn"];
  const losers = new Set();
  for (let i = 0; i < warPlanets.length; i++) {
    for (let j = i+1; j < warPlanets.length; j++) {
      const p1 = warPlanets[i], p2 = warPlanets[j];
      if (!planets[p1] || !planets[p2]) continue;
      let diff = Math.abs(planets[p1].longitude - planets[p2].longitude);
      if (diff > 180) diff = 360 - diff;
      if (diff <= 1.0) {
        losers.add((planets[p1].latitude||0) < (planets[p2].latitude||0) ? p1 : p2);
      }
    }
  }
  return losers;
}

// Dignity helpers
const EXALTATION = { Sun:"Aries",Moon:"Taurus",Mars:"Capricorn",Mercury:"Virgo",Jupiter:"Cancer",Venus:"Pisces",Saturn:"Libra",Rahu:"Gemini",Ketu:"Sagittarius" };
const DEBILITATION = { Sun:"Libra",Moon:"Scorpio",Mars:"Cancer",Mercury:"Pisces",Jupiter:"Capricorn",Venus:"Virgo",Saturn:"Aries",Rahu:"Sagittarius",Ketu:"Gemini" };
const OWN_SIGNS = { Sun:["Leo"],Moon:["Cancer"],Mars:["Aries","Scorpio"],Mercury:["Gemini","Virgo"],Jupiter:["Sagittarius","Pisces"],Venus:["Taurus","Libra"],Saturn:["Capricorn","Aquarius"],Rahu:[],Ketu:[] };

function getDignity(planet, sign) {
  if (EXALTATION[planet] === sign) return "ex";
  if (DEBILITATION[planet] === sign) return "de";
  if ((OWN_SIGNS[planet]||[]).includes(sign)) return "own";
  return "";
}

// South Indian chart SVG rendering
function renderSIChart(containerId, lagnaSign, houses, planets, combustSet, warLosers, isD9) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  const SIZE = 400;
  const CELL = SIZE / 4;
  const PAD  = 4;

  const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const lagnaIdx = SIGNS.indexOf(lagnaSign);

  // SI fixed positions — house number for each of the 16 cells
  // Center 4 cells (row1-2,col1-2) are blank
  const CELL_HOUSE = {
    "0,0":11, "0,1":12, "0,2":1, "0,3":2,
    "1,0":10,                     "1,3":3,
    "2,0":9,                      "2,3":4,
    "3,0":8,  "3,1":7,  "3,2":6, "3,3":5
  };

  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox",`0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("width","100%");

  // Background
  const bg = document.createElementNS("http://www.w3.org/2000/svg","rect");
  bg.setAttribute("width",SIZE); bg.setAttribute("height",SIZE);
  bg.setAttribute("fill","#07090f"); svg.appendChild(bg);

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      // Skip center cells
      if ((row===1||row===2)&&(col===1||col===2)) continue;

      const key   = `${row},${col}`;
      const hNum  = CELL_HOUSE[key];
      if (!hNum) continue;

      // Sign in this house
      const signInHouse = SIGNS[(lagnaIdx + hNum - 1) % 12];
      const isLagna     = hNum === 1;

      const x = col * CELL;
      const y = row * CELL;

      const rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
      rect.setAttribute("x", x + 0.5);
      rect.setAttribute("y", y + 0.5);
      rect.setAttribute("width",  CELL - 1);
      rect.setAttribute("height", CELL - 1);
      rect.setAttribute("fill",   isLagna ? "rgba(201,168,76,0.07)" : "rgba(13,17,32,0.8)");
      rect.setAttribute("stroke", isLagna ? "rgba(201,168,76,0.4)" : "rgba(201,168,76,0.12)");
      rect.setAttribute("stroke-width","0.5");
      svg.appendChild(rect);

      // Sign abbreviation
      const signAbbr = signInHouse.substring(0,3).toUpperCase();
      const signTxt = document.createElementNS("http://www.w3.org/2000/svg","text");
      signTxt.setAttribute("x", x + PAD + 2);
      signTxt.setAttribute("y", y + 11);
      signTxt.setAttribute("font-size","8");
      signTxt.setAttribute("fill","rgba(201,168,76,0.35)");
      signTxt.setAttribute("font-family","Cinzel,serif");
      signTxt.textContent = signAbbr;
      svg.appendChild(signTxt);

      // House number
      const hTxt = document.createElementNS("http://www.w3.org/2000/svg","text");
      hTxt.setAttribute("x", x + CELL - PAD - 4);
      hTxt.setAttribute("y", y + 11);
      hTxt.setAttribute("font-size","8");
      hTxt.setAttribute("fill","rgba(255,255,255,0.15)");
      hTxt.setAttribute("text-anchor","end");
      hTxt.textContent = hNum;
      svg.appendChild(hTxt);

      // Lagna marker
      if (isLagna) {
        const lTxt = document.createElementNS("http://www.w3.org/2000/svg","text");
        lTxt.setAttribute("x", x + CELL/2);
        lTxt.setAttribute("y", y + CELL - 6);
        lTxt.setAttribute("font-size","8");
        lTxt.setAttribute("fill","rgba(201,168,76,0.5)");
        lTxt.setAttribute("text-anchor","middle");
        lTxt.textContent = "ASC";
        svg.appendChild(lTxt);
      }

      // Planets in this house
      const planetsHere = (houses[hNum] || []);
      let pY = y + 22;
      planetsHere.forEach(planet => {
        if (pY > y + CELL - 8) return;
        const sign = isD9
          ? (planets[planet]?.d9sign || signInHouse)
          : signInHouse;
        const dignity  = getDignity(planet, sign);
        const isRetro  = planets[planet]?.retrograde;
        const isCombust= combustSet.has(planet);
        const isWar    = warLosers.has(planet);
        const deg      = planets[planet]?.degree || 0;

        // Planet abbreviation
        const abbr  = planet.substring(0,2);
        let   color = "#d8dde8";
        if (dignity === "ex")  color = "#4caf82";
        else if (dignity === "de")  color = "#c95858";
        else if (dignity === "own") color = "#5e8fd4";
        if (isCombust) color = "#d4a04a";

        const pTxt = document.createElementNS("http://www.w3.org/2000/svg","text");
        pTxt.setAttribute("x", x + PAD + 2);
        pTxt.setAttribute("y", pY);
        pTxt.setAttribute("font-size","10");
        pTxt.setAttribute("fill", color);
        pTxt.setAttribute("font-family","Inter,sans-serif");
        pTxt.setAttribute("font-weight","500");

        let label = abbr;
        if (isRetro)   label += "ʀ";
        if (isCombust) label += "☀";
        if (isWar)     label += "⚔";
        if (dignity)   label += ` ${dignity === "ex" ? "Ex" : dignity === "de" ? "De" : "Ow"}`;
        label += ` ${Math.round(deg)}°`;

        pTxt.textContent = label;
        svg.appendChild(pTxt);
        pY += 13;
      });
    }
  }

  // Diagonal lines for center
  const diag1 = document.createElementNS("http://www.w3.org/2000/svg","line");
  diag1.setAttribute("x1",CELL); diag1.setAttribute("y1",CELL);
  diag1.setAttribute("x2",3*CELL); diag1.setAttribute("y2",3*CELL);
  diag1.setAttribute("stroke","rgba(201,168,76,0.12)"); diag1.setAttribute("stroke-width","0.5");
  svg.appendChild(diag1);
  const diag2 = document.createElementNS("http://www.w3.org/2000/svg","line");
  diag2.setAttribute("x1",3*CELL); diag2.setAttribute("y1",CELL);
  diag2.setAttribute("x2",CELL); diag2.setAttribute("y2",3*CELL);
  diag2.setAttribute("stroke","rgba(201,168,76,0.12)"); diag2.setAttribute("stroke-width","0.5");
  svg.appendChild(diag2);

  wrap.innerHTML = "";
  wrap.appendChild(svg);
}

// ══════════════════════════════════════════════════════════════════════════════
//  DASHA SCREEN
// ══════════════════════════════════════════════════════════════════════════════

const FUNCTIONAL_STATUS_MAP = {
  Aries:      {Sun:"N",Moon:"B",Mars:"Y",Mercury:"N",Jupiter:"N",Venus:"N",Saturn:"M",Rahu:"N",Ketu:"N"},
  Taurus:     {Sun:"M",Moon:"N",Mars:"M",Mercury:"N",Jupiter:"N",Venus:"B",Saturn:"Y",Rahu:"N",Ketu:"N"},
  Gemini:     {Sun:"M",Moon:"M",Mars:"M",Mercury:"Y",Jupiter:"B",Venus:"M",Saturn:"N",Rahu:"N",Ketu:"N"},
  Cancer:     {Sun:"B",Moon:"N",Mars:"Y",Mercury:"M",Jupiter:"N",Venus:"N",Saturn:"M",Rahu:"N",Ketu:"N"},
  Leo:        {Sun:"N",Moon:"M",Mars:"Y",Mercury:"B",Jupiter:"N",Venus:"M",Saturn:"M",Rahu:"N",Ketu:"N"},
  Virgo:      {Sun:"M",Moon:"M",Mars:"M",Mercury:"N",Jupiter:"B",Venus:"M",Saturn:"N",Rahu:"N",Ketu:"N"},
  Libra:      {Sun:"M",Moon:"M",Mars:"M",Mercury:"B",Jupiter:"N",Venus:"N",Saturn:"Y",Rahu:"N",Ketu:"N"},
  Scorpio:    {Sun:"M",Moon:"B",Mars:"Y",Mercury:"N",Jupiter:"M",Venus:"M",Saturn:"M",Rahu:"N",Ketu:"N"},
  Sagittarius:{Sun:"N",Moon:"M",Mars:"M",Mercury:"M",Jupiter:"N",Venus:"N",Saturn:"M",Rahu:"N",Ketu:"N"},
  Capricorn:  {Sun:"M",Moon:"M",Mars:"Y",Mercury:"B",Jupiter:"N",Venus:"M",Saturn:"N",Rahu:"N",Ketu:"N"},
  Aquarius:   {Sun:"M",Moon:"M",Mars:"N",Mercury:"B",Jupiter:"N",Venus:"M",Saturn:"N",Rahu:"N",Ketu:"N"},
  Pisces:     {Sun:"M",Moon:"N",Mars:"M",Mercury:"N",Jupiter:"B",Venus:"N",Saturn:"M",Rahu:"N",Ketu:"N"},
};

const PLANET_GLYPHS_FULL = { Sun:"☉",Moon:"☽",Mars:"♂",Mercury:"☿",Jupiter:"♃",Venus:"♀",Saturn:"♄",Rahu:"☊",Ketu:"☋" };

function renderDashaScreen(data) {
  const { dasha, d1 } = data;
  if (!dasha || !dasha.dashas) return;
  const lagna = d1.lagnaSign;
  const today = new Date().toISOString().split("T")[0];

  // Find current periods
  let currentMaha = null, currentAntar = null;
  for (const d of dasha.dashas) {
    if (d.startDate <= today && today < d.endDate) {
      currentMaha = d;
      for (const a of d.antarDasas || []) {
        if (a.startDate <= today && today < a.endDate) { currentAntar = a; break; }
      }
      break;
    }
  }

  // Current dasha card
  const cdEl = document.getElementById("currentDashaDisplay");
  if (cdEl && currentMaha) {
    const mahaFS   = FUNCTIONAL_STATUS_MAP[lagna]?.[currentMaha.lord] || "N";
    const mahaNote = mahaFS==="Y"?"This planet is a yogakaraka for your lagna — a powerful period."
                   : mahaFS==="B"?"This planet is a functional benefic for your lagna — generally favourable."
                   : mahaFS==="M"?"This planet is a functional malefic for your lagna — this period may bring challenges."
                   : "This planet is neutral for your lagna — mixed results possible.";
    cdEl.innerHTML = `
      <div class="current-dasha-display">
        <div class="cd-block">
          <div class="cd-label">Maha Dasa (Major Period)</div>
          <div class="cd-lord">${PLANET_GLYPHS_FULL[currentMaha.lord] || ""} ${currentMaha.lord}</div>
          <div class="cd-dates">${currentMaha.startDate} → ${currentMaha.endDate}</div>
          <div class="cd-note">${mahaNote}</div>
        </div>
        <div class="cd-block">
          <div class="cd-label">Antar Dasa (Sub-Period)</div>
          <div class="cd-lord">${currentAntar ? (PLANET_GLYPHS_FULL[currentAntar.lord]||"") + " " + currentAntar.lord : "—"}</div>
          <div class="cd-dates">${currentAntar ? currentAntar.startDate + " → " + currentAntar.endDate : "—"}</div>
          <div class="cd-note">${currentAntar ? "Antar Dasa narrows the focus — the sub-period lord's themes overlay the main period." : ""}</div>
        </div>
        <div class="cd-block">
          <div class="cd-label">Moon Nakshatra</div>
          <div class="cd-lord">${dasha.nakshatra}</div>
          <div class="cd-dates">Dasa starts with: ${dasha.nakshataLord}</div>
          <div class="cd-note">The Moon's nakshatra at birth determines the starting point of your Vimshottari Dasha sequence.</div>
        </div>
      </div>
    `;
  }

  // Timeline
  const timeline = document.getElementById("dashaTimeline");
  if (!timeline) return;
  timeline.innerHTML = "";

  // Total years for progress bar
  const totalMs = new Date(dasha.dashas[8]?.endDate||"2200").getTime() - new Date(dasha.dashas[0]?.startDate||"1900").getTime();
  const nowMs   = new Date().getTime();
  const startMs = new Date(dasha.dashas[0]?.startDate||"1900").getTime();

  dasha.dashas.forEach(d => {
    const isCurrent = d.startDate <= today && today < d.endDate;
    const dStart = new Date(d.startDate).getTime();
    const dEnd   = new Date(d.endDate).getTime();
    const dLen   = dEnd - dStart;

    let progress = 0;
    if (isCurrent) progress = Math.max(0,Math.min(100,((nowMs - dStart) / dLen) * 100));
    else if (dEnd < nowMs) progress = 100;
    else progress = 0;

    const fs = FUNCTIONAL_STATUS_MAP[lagna]?.[d.lord] || "N";
    const fsLabel = fs==="Y"?"Yogakaraka ★":fs==="B"?"Benefic":fs==="M"?"Malefic":"Neutral";

    const row = document.createElement("div");
    row.className = "dasha-row" + (isCurrent ? " current" : "");
    row.innerHTML = `
      <div class="dasha-header">
        <div class="dasha-planet-glyph">${PLANET_GLYPHS_FULL[d.lord]||""}</div>
        <div>
          <div class="dasha-lord">${d.lord}</div>
          <div style="font-size:11px;color:var(--text-dim)">${fsLabel}</div>
        </div>
        <div class="dasha-dates">${d.startDate}<br>${d.endDate}</div>
        <div class="dasha-years">${d.years} yrs</div>
        <div class="dasha-expand">${isCurrent?"▼":"▶"}</div>
      </div>
      <div class="dasha-bar-wrap"><div class="dasha-bar" style="width:${progress}%"></div></div>
      <div class="antar-list">
        ${(d.antarDasas||[]).map(a => {
          const isCurAntar = a.startDate <= today && today < a.endDate;
          return `<div class="antar-item${isCurAntar?" current-antar":""}">
            <div class="antar-lord">${PLANET_GLYPHS_FULL[a.lord]||""} ${a.lord}</div>
            <div class="antar-dates">${a.startDate} → ${a.endDate}</div>
            <div class="antar-yrs">${a.years} yrs</div>
          </div>`;
        }).join("")}
      </div>
    `;

    // Toggle antar
    const header = row.querySelector(".dasha-header");
    header.addEventListener("click", () => row.classList.toggle("open"));
    if (isCurrent) row.classList.add("open");

    timeline.appendChild(row);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  DOMAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

function verdictClass(v) {
  if (!v) return "developing";
  const k = v.toLowerCase();
  if (k.includes("stable"))      return "stable";
  if (k.includes("vulnerable"))  return "vulnerable";
  if (k.includes("early"))       return "early";
  if (k.includes("delayed")||k.includes("improving")) return "delayed";
  if (k.includes("moderate"))    return "moderate";
  return "developing";
}

function deriveTrend(d) {
  if (d.d1Strength==="Strong" && d.d9Strength==="Strong") return "Stable through life";
  if (d.d1Strength==="Strong" && d.d9Strength!=="Strong") return "Strong early, fades later";
  if (d.d1Strength!=="Strong" && d.d9Strength==="Strong") return "Improves with age";
  if (d.d1Strength==="Weak" && d.d9Strength==="Weak") return "Persistent challenge";
  return "Mixed pattern";
}

function renderDomainScreen(analysis, chart) {
  const { domains } = analysis;
  if (!domains) return;

  // Quick verdict grid
  const vGrid = document.getElementById("verdictSummary");
  vGrid.innerHTML = domains.map(d => `
    <div class="verdict-mini">
      <div class="vm-title">${d.title}</div>
      <div class="vm-verdict vm-${verdictClass(d.verdict)}">${d.verdict}</div>
    </div>
  `).join("");

  // Comparison table
  const tbody = document.querySelector("#comparisonTable tbody");
  tbody.innerHTML = domains.map(d => `
    <tr>
      <td>${d.title}</td>
      <td>${d.d1Strength}</td>
      <td>${d.d9Strength}</td>
      <td>${deriveTrend(d)}</td>
      <td><span class="dc-verdict ${verdictClass(d.verdict)}">${d.verdict}</span></td>
    </tr>
  `).join("");

  // Domain cards
  const container = document.getElementById("domainCards");
  container.innerHTML = "";

  domains.forEach(d => {
    const vc      = verdictClass(d.verdict);
    const yogas   = (d.reasons||[]).filter(r=>r.startsWith("[YOGA]"));
    const reasons = (d.reasons||[]).filter(r=>!r.startsWith("[YOGA]"));
    const yogaBadges = [...new Set(yogas.map(r => r.replace("[YOGA] ","").split(":")[0].trim()))];
    const topFlags = (d.flags||[]).filter(f => !f.includes("house") || f.includes("stress")).slice(0,5);

    const card = document.createElement("div");
    card.className = `domain-card ${vc}`;
    card.innerHTML = `
      <div class="dc-header">
        <div class="dc-title">${d.title}</div>
        <div class="dc-verdict ${vc}">${d.verdict}</div>
      </div>

      <div class="dc-strengths">
        <span class="dc-str-badge">D1: ${d.d1Strength}</span>
        <span class="dc-str-badge">D9: ${d.d9Strength}</span>
        <span class="dc-str-badge">${deriveTrend(d)}</span>
      </div>

      ${yogaBadges.length ? `<div class="dc-yoga-badges">${yogaBadges.map(y=>`<span class="yoga-badge">★ ${y}</span>`).join("")}</div>` : ""}

      <div class="dc-section-label">What this area covers</div>
      <div class="dc-beginner">${d.beginnerNote || ""}</div>

      <div class="dc-section-label">Astrological reading</div>
      <div class="dc-text">${d.factorOverview}</div>

      <div class="dc-section-label">Pattern logic</div>
      <div class="dc-text">${d.flagLogic}</div>

      ${reasons.length ? `
        <div class="dc-section-label">Specific reasons from your chart</div>
        <div class="dc-reasons">
          ${reasons.slice(0,8).map(r=>`<div class="dc-reason-item">${r.replace(/^\[D[19]\] /,"").replace(/^\[YOGA\] /,"")}</div>`).join("")}
        </div>
      ` : ""}

      ${yogas.length ? `
        <div class="dc-section-label">Yogas detected</div>
        <div class="dc-reasons">
          ${yogas.map(r=>`<div class="dc-reason-item yoga">${r.replace("[YOGA] ","")}</div>`).join("")}
        </div>
      ` : ""}

      ${topFlags.length ? `<div class="dc-flags">${topFlags.map(f=>`<span class="dc-flag">${f}</span>`).join("")}</div>` : ""}
    `;
    container.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUMMARY SCREEN
// ══════════════════════════════════════════════════════════════════════════════

function renderSummaryScreen(analysis, chart) {
  const { summary, domains } = analysis;
  const { dasha, d1 } = chart;

  // Overall pattern
  document.getElementById("summaryOverall").innerHTML = `
    <div class="card-title">Overall chart pattern</div>
    <div class="so-pattern">${summary?.overallPattern || ""}</div>
  `;

  document.getElementById("summaryEarlyText").textContent  = summary?.earlyLife  || "";
  document.getElementById("summaryLaterText").textContent  = summary?.laterLife  || "";

  // Yogas
  const allYogas = [];
  (domains||[]).forEach(d => {
    (d.reasons||[]).filter(r=>r.startsWith("[YOGA]")).forEach(r => {
      const text = r.replace("[YOGA] ","");
      const name = text.split(":")[0].trim();
      if (!allYogas.find(y=>y.name===name)) allYogas.push({ name, reason: text });
    });
  });
  const yogaList = document.getElementById("summaryYogasList");
  if (allYogas.length) {
    yogaList.innerHTML = allYogas.map(y => `
      <div class="yoga-item">
        <div>
          <div class="yoga-name">★ ${y.name}</div>
          <div class="yoga-reason">${y.reason}</div>
        </div>
      </div>
    `).join("");
  } else {
    yogaList.innerHTML = `<div class="card-body">No major yogas detected in this chart.</div>`;
  }

  // Dasha reading
  const today = new Date().toISOString().split("T")[0];
  let currentMaha = null, currentAntar = null;
  if (dasha?.dashas) {
    for (const d of dasha.dashas) {
      if (d.startDate <= today && today < d.endDate) {
        currentMaha = d;
        for (const a of d.antarDasas||[]) {
          if (a.startDate <= today && today < a.endDate) { currentAntar = a; break; }
        }
        break;
      }
    }
  }
  const dashaEl = document.getElementById("summaryDashaText");
  if (currentMaha && d1?.lagnaSign) {
    const fs = FUNCTIONAL_STATUS_MAP[d1.lagnaSign]?.[currentMaha.lord] || "N";
    const fsDesc = fs==="Y"?"a yogakaraka — a uniquely powerful planet for your lagna, capable of elevating life circumstances significantly."
                 : fs==="B"?"a functional benefic for your lagna — this period generally supports growth and positive outcomes."
                 : fs==="M"?"a functional malefic for your lagna — this period may bring delays, challenges, or karmic tests that require patience and discipline."
                 : "functionally neutral for your lagna — results will be mixed and dependent on transits and sub-periods.";
    const antarDesc = currentAntar ? ` Within this, the ${currentAntar.lord} Antar Dasa (ending ${currentAntar.endDate}) further narrows the focus — the qualities of ${currentAntar.lord} colour the specific events unfolding right now.` : "";
    dashaEl.innerHTML = `<div class="card-body">You are currently in the <strong>${currentMaha.lord} Maha Dasa</strong>, running until ${currentMaha.endDate}. ${currentMaha.lord} is ${fsDesc}${antarDesc}</div>`;
  } else {
    dashaEl.innerHTML = `<div class="card-body">Generate a chart to see your current dasha reading.</div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PLANET SCREEN
// ══════════════════════════════════════════════════════════════════════════════

function renderPlanetScreen(data) {
  const { planets, d1 } = data;
  if (!planets) return;
  const lagna = d1.lagnaSign;
  const combust = buildCombustSet(planets);
  const warLosers = buildWarSet(planets);

  const container = document.getElementById("planetCards");
  container.innerHTML = "";

  const EXALTATION_MAP = { Sun:"Aries",Moon:"Taurus",Mars:"Capricorn",Mercury:"Virgo",Jupiter:"Cancer",Venus:"Pisces",Saturn:"Libra",Rahu:"Gemini",Ketu:"Sagittarius" };
  const DEBILITATION_MAP = { Sun:"Libra",Moon:"Scorpio",Mars:"Cancer",Mercury:"Pisces",Jupiter:"Capricorn",Venus:"Virgo",Saturn:"Aries",Rahu:"Sagittarius",Ketu:"Gemini" };

  PLANET_LIST.forEach(planet => {
    const p = planets[planet];
    if (!p) return;
    const dignity = getDignity(planet, p.sign);
    const isC = combust.has(planet);
    const isW = warLosers.has(planet);
    const fs  = FUNCTIONAL_STATUS_MAP[lagna]?.[planet] || "N";
    const fsLabel = fs==="Y"?"Yogakaraka ★":fs==="B"?"Benefic":fs==="M"?"Malefic":"Neutral";
    const dignityLabel = dignity==="ex"?"Exalted":dignity==="de"?"Debilitated":dignity==="own"?"Own sign":"—";
    const dignityClass = dignity==="ex"?"exalted":dignity==="de"?"debilitated":dignity==="own"?"own":"";

    const card = document.createElement("div");
    card.className = "planet-card";
    card.innerHTML = `
      <div class="pc-header">
        <div class="pc-name">${planet}</div>
        <div class="pc-glyph">${PLANET_GLYPHS_FULL[planet]||""}</div>
      </div>
      <div class="pc-row"><span class="pc-key">Sign (D1)</span><span class="pc-val">${p.sign}</span></div>
      <div class="pc-row"><span class="pc-key">Degree</span><span class="pc-val">${p.degree?.toFixed(2)}° in ${p.sign}</span></div>
      <div class="pc-row"><span class="pc-key">D9 sign</span><span class="pc-val">${p.d9sign || "—"}</span></div>
      <div class="pc-row"><span class="pc-key">Nakshatra</span><span class="pc-val">${p.nakshatra} Pada ${p.pada}</span></div>
      <div class="pc-row"><span class="pc-key">Dignity</span><span class="pc-val ${dignityClass}">${dignityLabel}</span></div>
      <div class="pc-row"><span class="pc-key">For ${lagna} lagna</span><span class="pc-val${fs==="Y"?" yogakaraka":fs==="M"?" retrograde":""}">${fsLabel}</span></div>
      <div class="pc-row"><span class="pc-key">Retrograde</span><span class="pc-val ${p.retrograde?"retrograde":""}">${p.retrograde ? "Yes ℞" : "No"}</span></div>
      ${isC ? `<div class="pc-row"><span class="pc-key">Combustion</span><span class="pc-val combust">Combust ☀ (−1 penalty)</span></div>` : ""}
      ${isW ? `<div class="pc-row"><span class="pc-key">Planetary war</span><span class="pc-val combust">Defeated ⚔ (−1 penalty)</span></div>` : ""}
    `;
    container.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOCAL STORAGE — SAVE / HISTORY
// ══════════════════════════════════════════════════════════════════════════════

function saveInputs() {
  const f = getForm();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
}

function restoreInputs() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    const set = (id, v) => { const el=document.getElementById(id); if(el&&v) el.value=v; };
    set("inputName",  s.name);
    set("inputDOB",   s.dob);
    set("inputTOB",   s.tob);
    set("inputPlace", s.place);
    set("inputUTC",   s.utcOffset);
  } catch {}
}

function getHistory() {
  try { const r=localStorage.getItem(HISTORY_KEY); return r?JSON.parse(r):[]; } catch { return []; }
}

function saveToHistory() {
  if (!currentData) return;
  const f = currentData.form;
  const c = currentData.chart;
  const entry = {
    id:       Date.now().toString(),
    name:     f.name || "Unnamed",
    savedAt:  new Date().toISOString(),
    dob:      f.dob,
    tob:      f.tob,
    place:    f.place,
    utcOffset:f.utcOffset,
    d1Lagna:  c.d1?.lagnaSign || "",
    d9Lagna:  c.d9?.lagnaSign || ""
  };
  const hist = getHistory();
  hist.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0,25)));
  renderHistory();
}

function renderHistory() {
  const box  = document.getElementById("historyBox");
  const hist = getHistory();
  if (!hist.length) { box.className="history-empty"; box.textContent="No saved charts yet."; return; }
  box.className="";
  box.innerHTML = hist.map(h => `
    <div class="history-item">
      <div class="history-main">
        <div class="history-name">${h.name}</div>
        <div class="history-meta">${h.dob} · ${h.tob} · ${h.place}</div>
        <div class="history-meta">D1: ${h.d1Lagna} · D9: ${h.d9Lagna} · Saved ${new Date(h.savedAt).toLocaleDateString()}</div>
      </div>
      <div class="history-actions">
        <button class="btn-sm-ghost hist-load" data-id="${h.id}">Load</button>
        <button class="btn-sm-danger hist-del" data-id="${h.id}">×</button>
      </div>
    </div>
  `).join("");

  box.querySelectorAll(".hist-load").forEach(btn => btn.addEventListener("click", () => loadHistory(btn.dataset.id)));
  box.querySelectorAll(".hist-del").forEach(btn => btn.addEventListener("click", () => deleteHistory(btn.dataset.id)));
}

function loadHistory(id) {
  const h = getHistory().find(x=>x.id===id);
  if (!h) return;
  const set=(el,v)=>{ if(el&&v!=null) el.value=v; };
  set(document.getElementById("inputName"),  h.name);
  set(document.getElementById("inputDOB"),   h.dob);
  set(document.getElementById("inputTOB"),   h.tob);
  set(document.getElementById("inputPlace"), h.place);
  set(document.getElementById("inputUTC"),   h.utcOffset||"");
  saveInputs();
}

function deleteHistory(id) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(getHistory().filter(x=>x.id!==id)));
  renderHistory();
}

// ── Button events ─────────────────────────────────────────────────────────────
saveBtn.addEventListener("click", () => {
  saveInputs();
  saveToHistory();
  const txt = saveBtn.textContent;
  saveBtn.textContent = "Saved ✓";
  setTimeout(() => saveBtn.textContent = txt, 1400);
});

resetBtn.addEventListener("click", () => {
  if (confirm("Reset all inputs and clear current chart?")) {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }
});

// Download report
dlBtn.addEventListener("click", () => {
  if (!currentData) return;
  const html = buildHTMLReport(currentData);
  const blob  = new Blob(["\uFEFF",html], { type:"application/msword" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href = url;
  a.download = `jyotish-${currentData.form?.name||"chart"}-${currentData.form?.dob||"report"}.doc`;
  a.click();
  URL.revokeObjectURL(url);
});

function buildHTMLReport(data) {
  const { chart, analysis, form } = data;
  const { summary, domains } = analysis;
  return `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><title>Jyotish Report</title>
  <style>body{font-family:Arial,sans-serif;color:#222;line-height:1.6}h1,h2,h3{color:#1a2a4a}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:8px;text-align:left}th{background:#f0f4fa}.yoga{color:#7a5b00;font-style:italic}</style>
  </head><body>
  <h1>Jyotish Precision Analyzer — Birth Chart Report</h1>
  <p><strong>Native:</strong> ${form.name||"—"} &nbsp;|&nbsp; <strong>DOB:</strong> ${form.dob} &nbsp;|&nbsp; <strong>TOB:</strong> ${form.tob} &nbsp;|&nbsp; <strong>Place:</strong> ${form.place}</p>
  <p><strong>D1 Lagna:</strong> ${chart.d1?.lagnaSign} &nbsp;|&nbsp; <strong>D9 Lagna:</strong> ${chart.d9?.lagnaSign} &nbsp;|&nbsp; <strong>Ayanamsha:</strong> Lahiri ${chart.ayanamsha}°</p>
  <h2>Summary</h2>
  <p>${summary?.overallPattern}</p><p>${summary?.earlyLife}</p><p>${summary?.laterLife}</p>
  <h2>Domain Analysis</h2>
  <table><tr><th>Domain</th><th>D1</th><th>D9</th><th>Verdict</th></tr>
  ${(domains||[]).map(d=>`<tr><td>${d.title}</td><td>${d.d1Strength}</td><td>${d.d9Strength}</td><td>${d.verdict}</td></tr>`).join("")}
  </table>
  ${(domains||[]).map(d=>`
    <h3>${d.title}</h3>
    <p><strong>Verdict:</strong> ${d.verdict}</p>
    <p>${d.factorOverview}</p>
    <ul>${(d.reasons||[]).map(r=>`<li${r.startsWith("[YOGA]")?' class="yoga"':''}>${r.replace(/^\[.+?\] /,"")}</li>`).join("")}</ul>
  `).join("")}
  <p style="font-size:11px;color:#888;margin-top:40px">Generated by Jyotish Precision Analyzer · Swiss Ephemeris · Lahiri Ayanamsha · Parashari Jyotish</p>
  </body></html>`;
}

// ── Auto-save inputs on change ────────────────────────────────────────────────
document.querySelectorAll("input,select").forEach(el => {
  el.addEventListener("change", saveInputs);
  el.addEventListener("input",  saveInputs);
});

// ── Boot ──────────────────────────────────────────────────────────────────────
restoreInputs();
renderHistory();
