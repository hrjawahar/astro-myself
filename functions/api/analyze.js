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
const DOMAIN_MAX = {
  "Identity & Personality":    6,
  "Wealth & Family":           8,
  "Marriage & Relationship":  10,
  "Career & Ambition":        11,
  "Emotional Fidelity":        8,
  "Health & Vitality":        11,
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

// ── TIER 3-C  Aspects ─────────────────────────────────────────────────────────
function getAspectedHouses(planet, planetHouseNum) {
  const h = planetHouseNum;
  const wrap = n => ((n - 1 + 12) % 12) + 1;
  const aspects = [wrap(h + 6)];
  if (planet === "Mars")    aspects.push(wrap(h + 3), wrap(h + 7));
  if (planet === "Jupiter") aspects.push(wrap(h + 4), wrap(h + 8));
  if (planet === "Saturn")  aspects.push(wrap(h + 2), wrap(h + 9));
  return aspects;
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
    yogas.push({ name:"Viparita Raja Yoga", type:"REMOVE_FLAG", domains:["Health & Vitality","Emotional Fidelity"],
      targetFlag:"dusthana-lord-stress",
      reason:`Viparita Raja Yoga: ${viparitaCount} dusthana lords in dusthanas — net harm to these domains is reduced.` });
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
      const lordBase = bucket==="supportive"?(lordFS==="Y"?3:2):bucket==="stress"?-2:0;
      const lordTotal = lordBase + lordDig;
      score += lordTotal;
      if (bucket==="supportive") {
        reasons.push({ text:`House ${houseNum} lord ${lord} in house ${lordHouse} — structural support${lordDig>0?" (dignified, bonus)":lordDig<0?" (debilitated, reduced)":""}.`, delta:lordTotal, type:"LORD", planet:lord, house:houseNum });
      } else if (bucket==="stress") {
        flags.push(`house-${houseNum}-lord-under-stress`);
        reasons.push({ text:`House ${houseNum} lord ${lord} in house ${lordHouse} (stress placement)${lordDig>0?" — dignity partially offsets":""}.`, delta:lordTotal, type:"LORD", planet:lord, house:houseNum });
      } else {
        reasons.push({ text:`House ${houseNum} lord ${lord} in house ${lordHouse} — neutral placement.`, delta:lordTotal, type:"LORD", planet:lord, house:houseNum });
      }
    }
  });

  // Karakas
  config.karakas.forEach(planet => {
    const planetHouse = getPlanetHouse(houses, planet);
    if (planetHouse === null) return;
    const sign   = houseSign(lagna, planetHouse);
    const dig    = sign ? dignityModifier(planet, sign) : 0;
    const bucket = getSupportBucket(planetHouse);
    const comb   = combustSet.has(planet) ? -1 : 0;
    const war    = warLosers.has(planet)  ? -1 : 0;
    const bucketBase = bucket==="supportive"?1:bucket==="stress"?-1:0;
    const total  = bucketBase + Math.trunc(dig * 0.5) + comb + war;
    score += total;
    if (bucket==="stress") {
      flags.push(`${planet.toLowerCase()}-under-pressure`);
      reasons.push({ text:`${planet} (karaka) in house ${planetHouse} adds strain${combustSet.has(planet)?" — also combust":""}.`, delta:total, type:"KARAKA", planet, house:planetHouse });
    } else if (bucket==="supportive") {
      reasons.push({ text:`${planet} (karaka) supports this domain from house ${planetHouse}${dig>0?" — dignified":""}.`, delta:total, type:"KARAKA", planet, house:planetHouse });
    }
  });

  // Aspects (Tier 3-C)
  const allPlanets = [...FS_PLANETS];
  allPlanets.forEach(planet => {
    const planetH = getPlanetHouse(houses, planet);
    if (!planetH) return;
    const aspectedHouses = getAspectedHouses(planet, planetH);
    const fs = functionalStatus(planet, lagna);
    config.houses.forEach(domainHouse => {
      if (aspectedHouses.includes(domainHouse) && !(houses[domainHouse] || []).includes(planet)) {
        if (fs==="B"||fs==="Y") {
          score += 1;
          reasons.push({ text:`${planet} casts a beneficial aspect on house ${domainHouse}.`, delta:1, type:"ASPECT", planet, house:domainHouse });
        } else if (fs==="M") {
          score -= 1;
          flags.push(`malefic-aspect-house-${domainHouse}`);
          reasons.push({ text:`${planet} casts a malefic aspect on house ${domainHouse}.`, delta:-1, type:"ASPECT", planet, house:domainHouse });
        }
      }
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
  if (d1==="Strong"     && d9==="Strong")     return "Stable";
  if (d1==="Weak"       && d9==="Weak")       return "Vulnerable";
  if (d1==="Strong"     && d9==="Weak")       return "Early promise, later inconsistency";
  if (d1==="Weak"       && d9==="Strong")     return "Delayed but improving";
  if (d1==="Developing" && d9==="Developing") return "Developing";
  if (d1==="Strong"     || d9==="Strong")     return "Moderately supported";
  return "Developing";
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
  const weightedStable     = domains.filter(d=>d.verdict==="Stable").reduce((s,d)=>s+(DOMAIN_WEIGHT[d.title]||1),0);
  const weightedVulnerable = domains.filter(d=>d.verdict==="Vulnerable").reduce((s,d)=>s+(DOMAIN_WEIGHT[d.title]||1),0);
  const improvingCount     = domains.filter(d=>d.verdict==="Delayed but improving"||d.verdict==="Early promise, later inconsistency").length;

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
    const d9Degrees   = body?.d9?.degrees   || null;
    const d9Latitudes = body?.d9?.latitudes || null;

    const combustD1 = buildCombustFlags(d1Degrees);
    const warD1     = buildWarLosers(d1Degrees, d1Latitudes);
    const combustD9 = buildCombustFlags(d9Degrees);
    const warD9     = buildWarLosers(d9Degrees, d9Latitudes);

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
