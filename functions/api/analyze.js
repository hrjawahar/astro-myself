// ─────────────────────────────────────────────────────────────────────────────
//  Jyotish Precision Analyzer  |  analyze.js  |  v3.0
//  All four scoring tiers applied against computed chart data from chart.js
//
//  Tier 1 : Functional benefic/malefic by lagna + dignity modifier
//  Tier 2 : Normalised per-domain thresholds + domain-weighted summary
//  Tier 3 : Combustion + planetary war + Parashari special aspects
//  Tier 4 : Yoga detection override + score-delta reason ranking
// ─────────────────────────────────────────────────────────────────────────────

const SIGNS = [
  "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
  "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"
];

const signLord = {
  Aries:"Mars", Taurus:"Venus", Gemini:"Mercury", Cancer:"Moon",
  Leo:"Sun", Virgo:"Mercury", Libra:"Venus", Scorpio:"Mars",
  Sagittarius:"Jupiter", Capricorn:"Saturn", Aquarius:"Saturn", Pisces:"Jupiter"
};

const HOUSE_SIGN_BY_LAGNA = {};
SIGNS.forEach((lagna, idx) => {
  HOUSE_SIGN_BY_LAGNA[lagna] = {};
  for (let h = 1; h <= 12; h++) {
    HOUSE_SIGN_BY_LAGNA[lagna][h] = SIGNS[(idx + h - 1) % 12];
  }
});

// ── TIER 1-A  Functional status (B=+2, M=−2, N=0, Y=+3) ─────────────────────
const FUNCTIONAL_STATUS = {
  //           Sun   Moon  Mars  Merc  Jup   Venus Saturn Rahu  Ketu
  Aries:      ["N",  "B",  "Y",  "N",  "N",  "N",  "M",   "N",  "N"],
  Taurus:     ["M",  "N",  "M",  "N",  "N",  "B",  "Y",   "N",  "N"],
  Gemini:     ["M",  "M",  "M",  "Y",  "B",  "M",  "N",   "N",  "N"],
  Cancer:     ["B",  "N",  "Y",  "M",  "N",  "N",  "M",   "N",  "N"],
  Leo:        ["N",  "M",  "Y",  "B",  "N",  "M",  "M",   "N",  "N"],
  Virgo:      ["M",  "M",  "M",  "N",  "B",  "M",  "N",   "N",  "N"],
  Libra:      ["M",  "M",  "M",  "B",  "N",  "N",  "Y",   "N",  "N"],
  Scorpio:    ["M",  "B",  "Y",  "N",  "M",  "M",  "M",   "N",  "N"],
  Sagittarius:["N",  "M",  "M",  "M",  "N",  "N",  "M",   "N",  "N"],
  Capricorn:  ["M",  "M",  "Y",  "B",  "N",  "M",  "N",   "N",  "N"],
  Aquarius:   ["M",  "M",  "N",  "B",  "N",  "M",  "N",   "N",  "N"],
  Pisces:     ["M",  "N",  "M",  "N",  "B",  "N",  "M",   "N",  "N"],
};
const FS_PLANETS = ["Sun","Moon","Mars","Mercury","Jupiter","Venus","Saturn","Rahu","Ketu"];
const FS_SCORE   = { B: 2, M: -2, N: 0, Y: 3 };

function functionalStatus(planet, lagna) {
  const row = FUNCTIONAL_STATUS[lagna];
  if (!row) return "N";
  const idx = FS_PLANETS.indexOf(planet);
  return idx >= 0 ? row[idx] : "N";
}
function functionalScore(planet, lagna) { return FS_SCORE[functionalStatus(planet, lagna)] ?? 0; }

// ── TIER 1-B  Dignity ────────────────────────────────────────────────────────
const EXALTATION = {
  Sun:"Aries", Moon:"Taurus", Mars:"Capricorn", Mercury:"Virgo",
  Jupiter:"Cancer", Venus:"Pisces", Saturn:"Libra",
  Rahu:"Gemini", Ketu:"Sagittarius"
};
const DEBILITATION = {
  Sun:"Libra", Moon:"Scorpio", Mars:"Cancer", Mercury:"Pisces",
  Jupiter:"Capricorn", Venus:"Virgo", Saturn:"Aries",
  Rahu:"Sagittarius", Ketu:"Gemini"
};
const OWN_SIGNS = {
  Sun:["Leo"], Moon:["Cancer"], Mars:["Aries","Scorpio"],
  Mercury:["Gemini","Virgo"], Jupiter:["Sagittarius","Pisces"],
  Venus:["Taurus","Libra"], Saturn:["Capricorn","Aquarius"],
  Rahu:[], Ketu:[]
};

function dignityModifier(planet, sign) {
  if (!planet || !sign) return 0;
  if (EXALTATION[planet] === sign) return 1;
  if (DEBILITATION[planet] === sign) return -1;
  if ((OWN_SIGNS[planet] || []).includes(sign)) return 1;
  return 0;
}

function dignityLabel(planet, sign) {
  if (EXALTATION[planet] === sign) return "Exalted";
  if (DEBILITATION[planet] === sign) return "Debilitated";
  if ((OWN_SIGNS[planet] || []).includes(sign)) return "Own sign";
  return "";
}

// ── TIER 2-A  Per-domain max scores ──────────────────────────────────────────
// DOMAIN_MAX recalibrated for weighted aspect scoring (Jupiter trinal = ±2.5,
// Mars special = ±2.0, Saturn upachaya = ±1.5). Old maxes were set for flat ±1
// which caused Strong threshold to be breached by a single Jupiter aspect alone.
// New maxes restore meaningful discrimination between Developing/Strong/Weak.
const DOMAIN_MAX = {
  "Identity & Personality":    9,
  "Wealth & Family":          12,
  "Marriage & Relationship":  14,
  "Career & Ambition":        16,
  "Emotional Fidelity":       12,
  "Health & Vitality":        16,
};
function getStrength(score, domainTitle) {
  const max = DOMAIN_MAX[domainTitle] || 8;
  if (score >= 0.40 * max) return "Strong";
  if (score <= -0.15 * max) return "Weak";
  return "Developing";
}

// ── TIER 2-B  Domain salience weights ────────────────────────────────────────
const DOMAIN_WEIGHT = {
  "Career & Ambition":        1.5,
  "Wealth & Family":          1.5,
  "Marriage & Relationship":  1.3,
  "Health & Vitality":        1.2,
  "Identity & Personality":   1.0,
  "Emotional Fidelity":       0.8,
};
const MAJOR_DOMAINS = ["Career & Ambition","Wealth & Family","Marriage & Relationship"];

// ── Domain configs ────────────────────────────────────────────────────────────
const DOMAIN_CONFIG = [
  {
    title: "Identity & Personality",
    houses: [1],
    karakas: ["Sun","Moon"],
    overview: "Your 1st house (Lagna) is your cosmic fingerprint — it shows the face you show the world, your physical constitution, and the core pattern of how you engage with life. The Sun defines your soul's authority and confidence; the Moon shapes your emotional nature and instinctive responses. Together they form the foundation from which all other life areas are read.",
    flagLogic: "When the Lagna and its lord are under pressure, or the Sun and Moon are weakened, the native may struggle with self-confidence, direction, or a fragmented sense of identity. Developing means the pattern exists but fluctuates — circumstances can either build or erode the core self depending on timing.",
    beginner: "Think of this as your 'who am I' chart area. It reflects your personality, first impressions, physical body, and life force."
  },
  {
    title: "Wealth & Family",
    houses: [2, 11],
    karakas: ["Jupiter","Venus","Mercury"],
    overview: "The 2nd house covers family of origin, accumulated wealth, speech, and food. The 11th house covers gains, income, elder siblings, and social networks. Jupiter brings wisdom and expansion to wealth; Venus adds harmony and material refinement; Mercury manages transactions and communication of resources. The D9 chart confirms whether these material promises mature and sustain over the later half of life.",
    flagLogic: "Vulnerabilities arise when 2nd and 11th lords are placed in dusthana houses (6, 8, 12) or are afflicted by malefics without counterbalancing support. A Developing verdict means earning potential exists but retention, family harmony, or gains remain inconsistent.",
    beginner: "This area covers your finances, earning ability, family relationships, and whether the money you make stays with you."
  },
  {
    title: "Marriage & Relationship",
    houses: [7, 8, 12],
    karakas: ["Venus","Jupiter","Moon"],
    overview: "The 7th house is the primary house of partnership, marriage, and the nature of the spouse. The 8th extends into the depth, longevity, and transformation of the bond — including shared resources. The 12th speaks to bedroom intimacy, emotional withdrawal, and the dissolution dimension of any union. Venus is the primary karaka of love and harmony; Jupiter of wisdom in partnership; Moon of emotional resonance and compatibility.",
    flagLogic: "Vulnerable verdicts arise when 7th lord, Venus, and the 7th house in D9 are all simultaneously under pressure. Developing reflects attraction and intent without stable continuity. D9 confirmation is essential — a strong D1 with a weak D9 means early promise that fades.",
    beginner: "This covers your marriage, romantic relationships, the quality of your bond with your partner, and whether partnerships tend to be harmonious or challenging."
  },
  {
    title: "Career & Ambition",
    houses: [10, 11, 6],
    karakas: ["Sun","Saturn","Mercury","Jupiter"],
    overview: "The 10th house is the apex of the chart — karma, career, reputation, and your visible contribution to the world. The 6th house governs service, competition, daily effort, and the discipline required to sustain a career. The 11th brings gains and recognition. Saturn brings structure and longevity to career; Mercury communication and analytical skill; Sun authority and recognition; Jupiter expansion and wisdom in professional fields.",
    flagLogic: "Pressure on the 10th lord, Sun, or Saturn with weak D9 support produces delays, obstacles, or a career that never quite reaches its visible potential. Developing means the talent is real but the path is longer or harder than average.",
    beginner: "This is about your career, professional reputation, ambition, and whether your hard work translates into visible success and recognition."
  },
  {
    title: "Emotional Fidelity",
    houses: [12, 8],
    karakas: ["Saturn","Ketu","Moon"],
    overview: "The 12th house governs withdrawal, hidden life, subconscious patterns, and what happens away from the public eye — including secret relationships, foreign connections, and bed pleasures. The 8th house rules hidden matters, sudden changes, deep psychological drives, and the transformative forces that operate beneath the surface of life. Saturn governs restraint and karmic discipline; Ketu brings detachment and past-life patterns; Moon reveals emotional vulnerability and susceptibility to unseen impulses.",
    flagLogic: "When the 12th and 8th houses have afflicted lords combined with a pressured Moon, the chart shows difficulty in maintaining emotional boundaries, susceptibility to secret liaisons, or hidden emotional needs that drive behaviour outside the primary relationship. Developing here suggests the impulse exists but has not yet manifested or is being consciously contained.",
    beginner: "This area reflects your inner emotional world, hidden desires, capacity for discretion, and the patterns around secret or private aspects of your personal life — including fidelity and impulse control in intimate matters."
  },
  {
    title: "Health & Vitality",
    houses: [6, 8, 12],
    karakas: ["Sun","Moon","Saturn","Mars"],
    overview: "The dusthana triad of 6th (disease, immune system), 8th (chronic and hidden illness, surgery), and 12th (hospitalisation, confinement, long-term drain) together map the health axis. The Sun represents vitality and the heart; Moon the mind and fluids; Saturn chronic conditions and aging; Mars inflammation, injuries, and fevers. D9 confirmation reveals whether health pressures resolve or deepen with age.",
    flagLogic: "Multiple dusthana planets plus a weakened Sun and Moon indicates a chart carrying genuine health burden. Developing means sensitivity and periodic strain but not a uniformly compromised constitution.",
    beginner: "This reveals your physical vitality, vulnerability to illness, recovery capacity, and long-term health patterns — whether your constitution is robust or needs careful maintenance."
  }
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeHouses(houses) {
  const out = {};
  for (let i = 1; i <= 12; i++) {
    out[i] = Array.isArray(houses?.[i]) ? houses[i]
           : Array.isArray(houses?.[String(i)]) ? houses[String(i)]
           : [];
  }
  return out;
}

function getPlanetHouse(houses, planet) {
  for (let i = 1; i <= 12; i++) {
    if ((houses[i] || []).includes(planet)) return i;
  }
  return null;
}

function houseSign(lagnaSign, houseNum) {
  return HOUSE_SIGN_BY_LAGNA[lagnaSign]?.[houseNum] || null;
}

function getSupportBucket(houseNum) {
  if ([1,4,5,7,9,10,11].includes(houseNum)) return "supportive";
  if ([6,8,12].includes(houseNum)) return "stress";
  return "neutral";
}

// ── TIER 3-A  Combustion ─────────────────────────────────────────────────────
const COMBUSTION_ORB = { Moon:7, Mars:17, Mercury:14, Jupiter:11, Venus:10, Saturn:15 };

function buildCombustFlags(planetDegrees) {
  const combust = new Set();
  if (!planetDegrees || planetDegrees.Sun == null) return combust;
  const sunDeg = planetDegrees.Sun;
  for (const [planet, orb] of Object.entries(COMBUSTION_ORB)) {
    if (planetDegrees[planet] == null) continue;
    let diff = Math.abs(planetDegrees[planet] - sunDeg);
    if (diff > 180) diff = 360 - diff;
    if (diff <= orb) combust.add(planet);
  }
  return combust;
}

// ── TIER 3-B  Planetary war ───────────────────────────────────────────────────
const WAR_PLANETS = ["Mars","Mercury","Jupiter","Venus","Saturn"];

function buildWarLosers(planetDegrees, planetLatitudes) {
  const losers = new Set();
  if (!planetDegrees || !planetLatitudes) return losers;
  for (let i = 0; i < WAR_PLANETS.length; i++) {
    for (let j = i + 1; j < WAR_PLANETS.length; j++) {
      const p1 = WAR_PLANETS[i], p2 = WAR_PLANETS[j];
      if (planetDegrees[p1] == null || planetDegrees[p2] == null) continue;
      let diff = Math.abs(planetDegrees[p1] - planetDegrees[p2]);
      if (diff > 180) diff = 360 - diff;
      if (diff <= 1.0) losers.add((planetLatitudes[p1] ?? 0) < (planetLatitudes[p2] ?? 0) ? p1 : p2);
    }
  }
  return losers;
}

// ── TIER 3-C  Aspects — Weighted Parashari Graha Drishti ─────────────────────
//
// Classical weights (Parashari tradition):
//
//  Jupiter 5th / 9th (trinal aspects) — STRONGEST: grace flows through dharmic houses.
//    Benefic/Yogakaraka Jupiter: +2.5  |  Malefic Jupiter: −1.5
//    Even a neutral Jupiter on 5th/9th brings some uplift to the domain.
//
//  Jupiter 7th (full drishti) — STRONG:
//    Benefic/Yogakaraka: +1.5  |  Malefic: −1.0
//
//  Mars 4th / 8th (special aspects) — FORCEFUL:
//    4th (kendra): active energy, can build or disrupt.
//    8th (dusthana): most destructive special aspect when malefic.
//    Benefic/Yogakaraka Mars: +1.5  |  Malefic Mars: −2.0
//
//  Saturn 3rd / 10th (upachaya aspects) — CHRONIC:
//    Grows slowly; results compound over time.
//    Benefic/Yogakaraka Saturn: +1.0  |  Malefic Saturn: −1.5
//
//  All planets 7th — STANDARD full drishti:
//    Benefic/Yogakaraka: +1.0  |  Malefic: −1.0
//
// The offsets below are from the PLANET'S house number, matching the
// South Indian Parashari reckoning (wrap-around within 1–12):
//   +6 = 7th from planet  (all planets)
//   +3 = 4th from planet, +7 = 8th from planet  (Mars only)
//   +4 = 5th from planet, +8 = 9th from planet  (Jupiter only)
//   +2 = 3rd from planet, +9 = 10th from planet (Saturn only)

function getAspects(planet, planetHouseNum) {
  const h    = planetHouseNum;
  const wrap = n => ((n - 1 + 12) % 12) + 1;
  // Returns array of { house, weight_benefic, weight_malefic, label }
  const aspects = [{ house: wrap(h + 6), wb: 1.0, wm: -1.0, label: '7th (full)' }];
  if (planet === 'Mars') {
    aspects.push({ house: wrap(h + 3), wb: 1.5, wm: -2.0, label: '4th (special)' });
    aspects.push({ house: wrap(h + 7), wb: 1.5, wm: -2.0, label: '8th (special)' });
  }
  if (planet === 'Jupiter') {
    aspects.push({ house: wrap(h + 4), wb: 2.5, wm: -1.5, label: '5th trinal (strongest)' });
    aspects.push({ house: wrap(h + 8), wb: 2.5, wm: -1.5, label: '9th trinal (strongest)' });
  }
  if (planet === 'Saturn') {
    aspects.push({ house: wrap(h + 2), wb: 1.0, wm: -1.5, label: '3rd upachaya' });
    aspects.push({ house: wrap(h + 9), wb: 1.0, wm: -1.5, label: '10th upachaya' });
  }
  return aspects;
}

// Keep backward-compatible helper (used only for retro-detection, not scoring)
function getAspectedHouses(planet, planetHouseNum) {
  return getAspects(planet, planetHouseNum).map(a => a.house);
}

// ── TIER 4-A  Yoga detection ─────────────────────────────────────────────────
const KENDRA_HOUSES  = [1,4,7,10];
const TRIKONA_HOUSES = [1,5,9];

function detectYogas(chart) {
  const houses = normalizeHouses(chart.houses);
  const lagna  = chart.lagnaSign;
  const yogas  = [];
  const ph = p => getPlanetHouse(houses, p);
  const ps = p => { const h = ph(p); return h ? houseSign(lagna, h) : null; };

  // Pancha Mahapurusha
  const pmp = [
    { name:"Hamsa Yoga",   planet:"Jupiter", affects:["Marriage & Relationship","Career & Ambition"] },
    { name:"Malavya Yoga", planet:"Venus",   affects:["Marriage & Relationship","Wealth & Family"] },
    { name:"Ruchaka Yoga", planet:"Mars",    affects:["Career & Ambition","Health & Vitality"] },
    { name:"Sasa Yoga",    planet:"Saturn",  affects:["Career & Ambition","Emotional Fidelity"] },
    { name:"Bhadra Yoga",  planet:"Mercury", affects:["Career & Ambition","Wealth & Family"] },
  ];
  for (const { name, planet, affects } of pmp) {
    const h = ph(planet); const sign = ps(planet);
    if (!h || !sign) continue;
    if (KENDRA_HOUSES.includes(h) && dignityModifier(planet, sign) >= 1) {
      yogas.push({ name, type:"BOOST", domains: affects,
        reason:`${name}: ${planet} is exalted or in own sign in a kendra — elevates ${affects.join(" and ")}.` });
    }
  }

  // Raja Yoga
  const kendraLords  = [...new Set(KENDRA_HOUSES.map(h => { const s=houseSign(lagna,h); return s?signLord[s]:null; }).filter(Boolean))];
  const trikonaLords = [...new Set(TRIKONA_HOUSES.map(h => { const s=houseSign(lagna,h); return s?signLord[s]:null; }).filter(Boolean))];
  outer: for (const kl of kendraLords) {
    for (const tl of trikonaLords) {
      if (kl === tl) continue;
      const klH = ph(kl), tlH = ph(tl);
      if (!klH || !tlH) continue;
      if (klH === tlH) {
        yogas.push({ name:"Raja Yoga", type:"BOOST", domains:["Career & Ambition","Wealth & Family","Identity & Personality"],
          reason:`Raja Yoga: ${kl} (kendra lord) and ${tl} (trikona lord) conjunct — powerful career and wealth elevation.` });
        break outer;
      }
    }
  }

  // Dhana Yoga
  const dhanaHouses = [2,5,9,11];
  const dhanaLords = [...new Set(dhanaHouses.map(h => { const s=houseSign(lagna,h); return s?signLord[s]:null; }).filter(Boolean))];
  const dhanaCount = dhanaLords.filter(dl => { const h=ph(dl); return h && dhanaHouses.includes(h); }).length;
  if (dhanaCount >= 2) {
    yogas.push({ name:"Dhana Yoga", type:"BOOST", domains:["Wealth & Family","Career & Ambition"],
      reason:`Dhana Yoga: ${dhanaCount} wealth-house lords mutually placed — strong financial signification.` });
  }

  // Viparita Raja Yoga
  const dusthanas = [6,8,12];
  const dusthanaLords = dusthanas.map(h => { const s=houseSign(lagna,h); return s?signLord[s]:null; }).filter(Boolean);
  const viparitaCount = dusthanaLords.filter(dl => { const h=ph(dl); return h && dusthanas.includes(h); }).length;
  if (viparitaCount >= 2) {
    // FIX 6: Viparita RY now BOOSTS the dusthana domains it activates.
    // Classical: when dusthana lords occupy other dusthanas, the negative energy
    // cancels and inverts — producing unexpected gains, resilience and hidden strength
    // particularly for Health, Emotional, and transformative domains (8th/12th).
    // Previous REMOVE_FLAG had no scoring impact; BOOST lifts the domain verdict.
    yogas.push({ name:"Viparita Raja Yoga", type:"BOOST",
      domains:["Health & Vitality","Emotional Fidelity","Marriage & Relationship"],
      reason:`Viparita Raja Yoga: ${viparitaCount} dusthana lords placed in dusthanas — adversity inverts to hidden strength in these domains.` });
  }

  // Kemadruma (negative)
  const moonH = ph("Moon");
  if (moonH) {
    const wrap = n => ((n - 1 + 12) % 12) + 1;
    const h2 = wrap(moonH + 1), h12 = wrap(moonH - 1);
    const allP = ["Sun","Mars","Mercury","Jupiter","Venus","Saturn"];
    if (!allP.some(p => { const h=ph(p); return h===h2||h===h12; })) {
      yogas.push({ name:"Kemadruma Yoga", type:"SUPPRESS", domains:["Identity & Personality","Wealth & Family"],
        reason:`Kemadruma Yoga: Moon has no planets in adjacent houses — emotional instability signal.` });
    }
  }

  // Neecha Bhanga
  for (const planet of FS_PLANETS) {
    const sign = ps(planet);
    if (!sign || DEBILITATION[planet] !== sign) continue;
    const dispositor = signLord[sign];
    const dispH = ph(dispositor);
    if (dispH && KENDRA_HOUSES.includes(dispH)) {
      yogas.push({ name:"Neecha Bhanga", type:"REMOVE_FLAG", domains: DOMAIN_CONFIG.map(d=>d.title), planet,
        targetFlag:`neecha-${planet.toLowerCase()}`,
        reason:`Neecha Bhanga: ${planet} is debilitated but its dispositor ${dispositor} is in a kendra — debilitation cancelled.` });
    }
  }

  // Parivartana Yoga (Mutual Reception) — FIX 7
  // Two planets each placed in the other's own sign = strong mutual exchange.
  // Classical effect: both planets behave as if in own sign → dignity boost.
  // Score impact: each planet in the exchange gains +1 to domain score (via BOOST)
  // when either planet is a karaka or lord relevant to a domain.
  const parivartanaPairs = [];
  for (let i=0; i<FS_PLANETS.length; i++) {
    for (let j=i+1; j<FS_PLANETS.length; j++) {
      const p1 = FS_PLANETS[i], p2 = FS_PLANETS[j];
      if (!p1 || !p2) continue;
      const h1 = ph(p1), h2 = ph(p2);
      if (!h1 || !h2) continue;
      const s1 = houseSign(lagna, h1), s2 = houseSign(lagna, h2);
      if (!s1 || !s2) continue;
      const own1 = OWN_SIGNS[p1] || [], own2 = OWN_SIGNS[p2] || [];
      // p1 in p2's sign AND p2 in p1's sign
      if (own2.includes(s1) && own1.includes(s2)) {
        parivartanaPairs.push({ p1, p2, h1, h2, s1, s2 });
        // Determine which domains benefit from this exchange
        const activeDomains = DOMAIN_CONFIG
          .filter(d => d.houses.includes(h1) || d.houses.includes(h2) ||
                       d.karakas.includes(p1) || d.karakas.includes(p2))
          .map(d => d.title);
        if (activeDomains.length > 0) {
          yogas.push({
            name: "Parivartana Yoga",
            type: "BOOST",
            domains: activeDomains,
            reason: `Parivartana Yoga: ${p1} in ${s1} and ${p2} in ${s2} — mutual reception; both planets act as if in own sign, strengthening the domains they rule and occupy.`
          });
        }
      }
    }
  }

  return yogas;
}

// ── Core domain scoring ────────────────────────────────────────────────────────
function scoreChartDomain(chart, config, combustSet, warLosers) {
  const houses = normalizeHouses(chart.houses);
  const lagna  = chart.lagnaSign;
  let score    = 0;
  const flags   = [];
  const reasons = [];

  config.houses.forEach(houseNum => {
    const sign        = houseSign(lagna, houseNum);
    const housePlanets = houses[houseNum] || [];

    housePlanets.forEach(planet => {
      const fs   = functionalStatus(planet, lagna);
      const base = FS_SCORE[fs] ?? 0;
      const dig  = sign ? dignityModifier(planet, sign) : 0;
      const comb = combustSet.has(planet) ? -1 : 0;
      const war  = warLosers.has(planet)  ? -1 : 0;
      const total = base + dig + comb + war;
      score += total;

      const lbl = fs==="Y"?"yogakaraka":fs==="B"?"benefic":fs==="M"?"malefic":"neutral";
      const extras = [dig>0?"exalted/own":"",dig<0?"debilitated":"",combustSet.has(planet)?"combust":"",warLosers.has(planet)?"war-defeated":""].filter(Boolean);
      const extStr = extras.length ? ` (${extras.join(", ")})` : "";
      reasons.push({ text:`House ${houseNum}: ${planet} is ${lbl}${extStr} — contributes ${total>=0?"+":""}${total} to this domain.`, delta:total, type:dig?"DIGNITY":"HOUSE_PLANET", planet, house:houseNum });

      if (fs==="Y") flags.push(`yogakaraka-${planet.toLowerCase()}`);
      if (combustSet.has(planet)) flags.push(`combust-${planet.toLowerCase()}`);
      if (warLosers.has(planet)) flags.push(`graha-yuddha-${planet.toLowerCase()}`);
      if (fs==="M"||comb||war) flags.push(`house-${houseNum}-pressure`);
    });

    // Lord
    const lord     = sign ? signLord[sign] : null;
    const lordHouse = lord ? getPlanetHouse(houses, lord) : null;
    if (!lord) {
      score -= 1;
      flags.push(`house-${houseNum}-sign-missing`);
      reasons.push({ text:`House ${houseNum} sign could not be resolved.`, delta:-1, type:"LORD", house:houseNum });
    } else if (lordHouse === null) {
      score -= 1;
      flags.push(`house-${houseNum}-lord-missing`);
      reasons.push({ text:`House ${houseNum} lord ${lord} not found in chart.`, delta:-1, type:"LORD", planet:lord, house:houseNum });
    } else {
      const bucket   = getSupportBucket(lordHouse);
      const lordSign = houseSign(lagna, lordHouse);
      const lordDig  = lordSign ? dignityModifier(lord, lordSign) : 0;
      const lordFS   = functionalStatus(lord, lagna);
      // FIX 4: Graduated dusthana lord scoring.
      // Old: all lords in H6/8/12 scored flat -2 regardless of functional status.
      // Classical: a yogakaraka/benefic lord in dusthana is stressed but not destroyed —
      // it partially retains its positive quality (Viparita Yoga tendency).
      // A malefic lord in its own dusthana is even more destructive than flat -2.
      let lordBase;
      if (bucket === "supportive") {
        lordBase = lordFS === "Y" ? 3 : lordFS === "B" ? 2 : 0;
      } else if (bucket === "stress") {
        if (lordFS === "Y")      lordBase = -1;   // YK in dusthana: stressed but dignity buffers
        else if (lordFS === "B") lordBase = -1;   // Benefic in dusthana: partially offset
        else if (lordFS === "M") lordBase = -3;   // Malefic in dusthana: compounded
        else                     lordBase = -2;   // Neutral in dusthana: standard
      } else {
        lordBase = 0;
      }
      const lordTotal = lordBase + lordDig;
      score += lordTotal;
      if (bucket === "supportive") {
        reasons.push({ text:`House ${houseNum} lord ${lord} in house ${lordHouse} — structural support${lordDig>0?" (dignified, bonus)":lordDig<0?" (debilitated, reduced)":""}.`, delta:lordTotal, type:"LORD", planet:lord, house:houseNum });
      } else if (bucket === "stress") {
        const stressNote = lordFS === "Y" || lordFS === "B" ? " (functional status partially offsets stress)" : lordFS === "M" ? " (malefic lord in dusthana — compounded pressure)" : "";
        flags.push(`house-${houseNum}-lord-under-stress`);
        reasons.push({ text:`House ${houseNum} lord ${lord} in house ${lordHouse} (dusthana placement)${stressNote}.`, delta:lordTotal, type:"LORD", planet:lord, house:houseNum });
      } else {
        reasons.push({ text:`House ${houseNum} lord ${lord} in house ${lordHouse} — neutral placement.`, delta:lordTotal, type:"LORD", planet:lord, house:houseNum });
      }
    }
  });

  // Karakas — FIX 5: primary karaka (first in array) scores 1.5x secondary karakas.
  // Classical: Venus is primary karaka for Marriage, Jupiter for Wealth/Children etc.
  // Treating all karakas equally understates the primary's influence on domain verdict.
  config.karakas.forEach((planet, karakaIdx) => {
    const planetHouse = getPlanetHouse(houses, planet);
    if (planetHouse === null) return;
    const sign   = houseSign(lagna, planetHouse);
    const dig    = sign ? dignityModifier(planet, sign) : 0;
    const bucket = getSupportBucket(planetHouse);
    const comb   = combustSet.has(planet) ? -1 : 0;
    const war    = warLosers.has(planet)  ? -1 : 0;
    const bucketBase = bucket==="supportive"?1:bucket==="stress"?-1:0;
    const baseTotal  = bucketBase + Math.trunc(dig * 0.5) + comb + war;
    // Primary karaka (index 0) gets 1.5x multiplier; secondary karakas get 1x
    const karakaWeight = karakaIdx === 0 ? 1.5 : 1.0;
    const total = Math.round(baseTotal * karakaWeight * 10) / 10;
    score += total;
    const primaryLabel = karakaIdx === 0 ? "primary karaka" : "secondary karaka";
    if (bucket==="stress") {
      flags.push(`${planet.toLowerCase()}-under-pressure`);
      reasons.push({ text:`${planet} (${primaryLabel}) in house ${planetHouse} adds strain${combustSet.has(planet)?" — also combust":""}.`, delta:total, type:"KARAKA", planet, house:planetHouse });
    } else if (bucket==="supportive") {
      reasons.push({ text:`${planet} (${primaryLabel}) supports this domain from house ${planetHouse}${dig>0?" — dignified":""}.`, delta:total, type:"KARAKA", planet, house:planetHouse });
    }
  });

  // Aspects (Tier 3-C) — weighted Parashari graha drishti
  const allPlanets = [...FS_PLANETS];
  allPlanets.forEach(planet => {
    const planetH = getPlanetHouse(houses, planet);
    if (!planetH) return;
    const aspectList = getAspects(planet, planetH);
    const fs = functionalStatus(planet, lagna);

    // FIX 1: Dignified-neutral rule — a neutral planet that is exalted or in own
    // sign acts as functionally benefic for ASPECT purposes (not for lordship).
    // Classical Parashari: dignity overrides neutrality when casting aspects.
    const planetSign = houseSign(lagna, planetH); // sign the aspecting planet occupies
    const planetDig  = planetSign ? dignityModifier(planet, planetSign) : 0;
    const effectiveFs = (fs === 'N' && planetDig >= 1) ? 'B' : fs;

    aspectList.forEach(({ house: aspectedHouse, wb, wm, label }) => {
      // Skip if the planet is already IN that house (conjunction, not aspect)
      if ((houses[aspectedHouse] || []).includes(planet)) return;
      // Skip if the aspected house is not one of this domain's houses
      if (!config.houses.includes(aspectedHouse)) return;

      if (effectiveFs === 'Y') {
        score += wb;
        reasons.push({
          text: `${planet} (yogakaraka) casts its ${label} aspect on house ${aspectedHouse} — strong uplift.`,
          delta: wb, type: 'ASPECT', planet, house: aspectedHouse
        });
      } else if (effectiveFs === 'B') {
        const dignity_note = (fs === 'N' && planetDig >= 1) ? ' (dignity elevates neutral to benefic)' : '';
        score += wb;
        reasons.push({
          text: `${planet} (benefic${dignity_note}) casts its ${label} aspect on house ${aspectedHouse}.`,
          delta: wb, type: 'ASPECT', planet, house: aspectedHouse
        });
      } else if (effectiveFs === 'M') {
        score += wm;
        flags.push(`malefic-aspect-house-${aspectedHouse}`);
        reasons.push({
          text: `${planet} (malefic) casts its ${label} aspect on house ${aspectedHouse} — puts pressure on this domain.`,
          delta: wm, type: 'ASPECT', planet, house: aspectedHouse
        });
      }
      // Neutral undignified planets cast no scored aspect — standard Parashari practice
    });
  });

  const strength = getStrength(score, config.title);
  const sortedReasons = reasons
    .filter(r => Math.abs(r.delta) > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map(r => r.text);

  return { score, strength, flags, reasons: sortedReasons };
}

// ── Verdict combination ──────────────────────────────────────────────────────
function combineVerdict(d1, d9) {
  if (d1==="Strong"     && d9==="Strong")     return "In Full Flow";
  if (d1==="Weak"       && d9==="Weak")       return "Needs Tending";
  if (d1==="Strong"     && d9==="Weak")       return "Peak Comes Early";
  if (d1==="Weak"       && d9==="Strong")     return "Deferred, Not Denied";
  if (d1==="Developing" && d9==="Developing") return "Still Forming";
  if (d1==="Strong")                           return "Foundation Holds";
  if (d9==="Strong")                           return "Ripening";
  return "Still Forming";
}

// ── Build domain result with yoga overrides ───────────────────────────────────
function buildDomainResult(d1, d9, config, combustD1, warD1, combustD9, warD9, yogasD1, yogasD9) {
  const d1Result = scoreChartDomain(d1, config, combustD1, warD1);
  const d9Result = scoreChartDomain(d9, config, combustD9, warD9);
  let d1Strength = d1Result.strength;
  let d9Strength = d9Result.strength;
  let verdict    = combineVerdict(d1Strength, d9Strength);
  const allFlags   = [...new Set([...d1Result.flags, ...d9Result.flags])];
  const allReasons = [
    ...d1Result.reasons.slice(0,4).map(r=>`[D1] ${r}`),
    ...d9Result.reasons.slice(0,4).map(r=>`[D9] ${r}`)
  ];

  const relevantYogas = [...yogasD1, ...yogasD9].filter(y => y.domains.includes(config.title));
  for (const yoga of relevantYogas) {
    if (yoga.type==="BOOST") {
      // Boost the strength to Strong, then re-derive verdict so display is always consistent
      if (d1Strength!=="Strong") d1Strength = "Strong";
      verdict = combineVerdict(d1Strength, d9Strength);
      allReasons.unshift(`[YOGA] ${yoga.reason}`);
      allFlags.push(`yoga-${yoga.name.toLowerCase().replace(/\s+/g,"-")}`);
    }
    if (yoga.type==="SUPPRESS") {
      if (d1Result.score<0 || d9Result.score<0) {
        // Reflect underlying weakness in the displayed strengths so Strong/Strong/Vulnerable
        // contradiction cannot appear — the suppressed strength drops to Weak
        if (d1Result.score<0) d1Strength = "Weak";
        if (d9Result.score<0) d9Strength = "Weak";
        verdict = combineVerdict(d1Strength, d9Strength);
        allReasons.unshift(`[YOGA] ${yoga.reason}`);
        allFlags.push(`yoga-negative-${yoga.name.toLowerCase().replace(/\s+/g,"-")}`);
      }
    }
    if (yoga.type==="REMOVE_FLAG") allReasons.push(`[YOGA] ${yoga.reason}`);
  }

  // Final guard: verdict must always be consistent with the displayed d1/d9 strengths.
  // Re-derive once more so no yoga sequencing edge-case can leave an impossible combination.
  verdict = combineVerdict(d1Strength, d9Strength);

  return {
    title: config.title,
    d1Strength, d9Strength, verdict,
    factorOverview: config.overview,
    flagLogic: config.flagLogic,
    beginnerNote: config.beginner,
    flags: allFlags.map(f => f.replace(/-/g," ")),
    reasons: allReasons
  };
}

// ── TIER 2-B  Weighted summary ───────────────────────────────────────────────
function buildSummary(domains) {
  const weightedStable     = domains.filter(d=>d.verdict==="In Full Flow").reduce((s,d)=>s+(DOMAIN_WEIGHT[d.title]||1),0);
  const weightedVulnerable = domains.filter(d=>d.verdict==="Needs Tending").reduce((s,d)=>s+(DOMAIN_WEIGHT[d.title]||1),0);
  const improvingCount     = domains.filter(d=>d.verdict==="Deferred, Not Denied"||d.verdict==="Peak Comes Early").length;

  let overallPattern = "Balanced chart with selective strengths and areas requiring attention.";
  if (weightedStable >= 4.0)      overallPattern = "This chart shows broad structural support across the most important life domains.";
  else if (weightedVulnerable>=3.5) overallPattern = "This chart carries repeated stress signatures across major domains — these areas need careful and conscious handling.";
  else if (improvingCount >= 2)     overallPattern = "This chart shows early unevenness but carries a noticeable pattern of later-life strengthening.";

  const earlyStrongDomains = domains.filter(d=>d.d1Strength==="Strong").map(d=>d.title);
  const lateStrongDomains  = domains.filter(d=>d.d9Strength==="Strong").map(d=>d.title);
  const earlyMajor = earlyStrongDomains.some(t=>MAJOR_DOMAINS.includes(t));
  const lateMajor  = lateStrongDomains.some(t=>MAJOR_DOMAINS.includes(t));

  const earlyLife = (earlyStrongDomains.length>2 && earlyMajor)
    ? "Outer-life promise is clearly visible in the earlier years, especially in key life domains."
    : "The early years may require conscious effort and course correction before momentum builds.";
  const laterLife = (lateStrongDomains.length>2 && lateMajor)
    ? "Later-life results look considerably stronger and more settled — the second half of life brings reward."
    : "Later-life results require deliberate strengthening; natural momentum alone may not deliver stability.";

  return { overallPattern, earlyLife, laterLife };
}

// ── Request handler ───────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    // Accept either pre-computed houses (from chart.js) or raw house data
    const d1 = { lagnaSign: body?.d1?.lagnaSign, houses: normalizeHouses(body?.d1?.houses) };
    const d9 = { lagnaSign: body?.d9?.lagnaSign, houses: normalizeHouses(body?.d9?.houses) };

    if (!d1.lagnaSign || !d9.lagnaSign) {
      return Response.json({ error:"D1 and D9 lagna signs are required." }, { status:400 });
    }

    const d1Degrees   = body?.d1?.degrees   || null;
    const d1Latitudes = body?.d1?.latitudes || null;

    // FIX 3: D9 combustion/war uses D1 sidereal degrees.
    // Combustion is a physical sky phenomenon (angular distance from Sun).
    // A planet combust in D1 is equally combust when assessing its D9 house —
    // the navamsha chart does not change the planet's actual solar proximity.
    // Passing empty degrees here was producing artificially clean D9 scores.
    const combustD1 = buildCombustFlags(d1Degrees);
    const warD1     = buildWarLosers(d1Degrees, d1Latitudes);
    const combustD9 = buildCombustFlags(d1Degrees);   // same physical degrees
    const warD9     = buildWarLosers(d1Degrees, d1Latitudes); // same physical latitudes

    const yogasD1 = detectYogas(d1);
    const yogasD9 = detectYogas(d9);

    const domains = DOMAIN_CONFIG.map(config =>
      buildDomainResult(d1, d9, config, combustD1, warD1, combustD9, warD9, yogasD1, yogasD9)
    );

    const summary = buildSummary(domains);

    return Response.json({ generatedAt: new Date().toISOString(), summary, domains });
  } catch (error) {
    return Response.json({ error: error.message || "Unexpected error." }, { status:500 });
  }
}
