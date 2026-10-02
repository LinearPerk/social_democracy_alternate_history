(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StateColumnModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Seating order, left to right (compact seat chart, party ledger).
  var PARTIES = [
    { id: 'kpd', abbr: 'KPD', de: 'Kommunistische Partei Deutschlands', en: 'Communist Party of Germany', color: '#8B0000' },
    { id: 'sapd', abbr: 'SAPD', de: 'Sozialistische Arbeiterpartei Deutschlands', en: "Socialist Workers' Party of Germany", color: '#C40000' },
    { id: 'spd', abbr: 'SPD', de: 'Sozialdemokratische Partei Deutschlands', en: 'Social Democratic Party of Germany', color: '#E3000F' },
    { id: 'ddp', abbr: 'DDP', de: 'Deutsche Demokratische Partei', en: 'German Democratic Party', color: '#E6CF3A', lightBg: true },
    { id: 'z', abbr: 'Z', de: 'Deutsche Zentrumspartei', en: 'Center Party', color: '#1c1c1c' },
    { id: 'bvp', abbr: 'BVP', de: 'Bayerische Volkspartei', en: "Bavarian People's Party", color: '#69A2BE', lightBg: true },
    { id: 'dvp', abbr: 'DVP', de: 'Deutsche Volkspartei', en: "German People's Party", color: '#B8892A', lightBg: true },
    { id: 'other', abbr: 'Andere', de: 'Andere Parteien', en: 'Other parties', color: '#a0a0a0', lightBg: true },
    { id: 'dnvp', abbr: 'DNVP', de: 'Deutschnationale Volkspartei', en: "German National People's Party", color: '#3F7BC1' },
    { id: 'nsdap', abbr: 'NSDAP', de: 'Nationalsozialistische Deutsche Arbeiterpartei', en: 'National Socialist German Workers\' Party', color: '#964B00' }
  ];

  var partyById = {};
  PARTIES.forEach(function (p) { partyById[p.id] = p; });

  function partyLabel(q, id) {
    var party = partyById[id];
    if (!party) {
      return undefined;
    }
    if (id === 'ddp' && typeof q.ddp_name === 'string' && q.ddp_name.length > 0) {
      return q.ddp_name;
    }
    return party.abbr;
  }

  function partyGerman(q, id) {
    var party = partyById[id];
    if (!party) {
      return undefined;
    }
    if (id === 'ddp' && q.ddp_name === 'DStP') {
      return 'Deutsche Staatspartei';
    }
    return party.de;
  }

  // Historical Reichstag elections. House size and ballot list numbers.
  var ELECTIONS = [
    { year: 1924, month: 12, house: 493, lists: {} },
    { year: 1928, month: 5, house: 491, lists: { spd: 1, dnvp: 2, z: 3, dvp: 4, kpd: 5, ddp: 6, bvp: 7, nsdap: 10 } },
    { year: 1930, month: 9, house: 577, lists: { spd: 1, dnvp: 2, z: 3, kpd: 4, dvp: 5, ddp: 6, bvp: 8, nsdap: 9 } },
    { year: 1932, month: 7, house: 608, lists: { spd: 1, nsdap: 2, kpd: 3, z: 4, dnvp: 5, dvp: 6, ddp: 8, bvp: 9, sapd: 17 } },
    { year: 1932, month: 11, house: 584, lists: { nsdap: 1, spd: 2, kpd: 3, z: 4, dnvp: 5, bvp: 6, dvp: 7, ddp: 8, sapd: 18 } },
    { year: 1933, month: 3, house: 647, lists: { nsdap: 1, spd: 2, kpd: 3, z: 4, dnvp: 5, bvp: 6, dvp: 7, ddp: 9 } }
  ];

  function toDate(year, month) {
    return year + month / 100;
  }

  function electionAt(year, month) {
    var target = toDate(year, month);
    var found = ELECTIONS[0];
    for (var i = 0; i < ELECTIONS.length; i++) {
      if (toDate(ELECTIONS[i].year, ELECTIONS[i].month) <= target) {
        found = ELECTIONS[i];
      }
    }
    return found;
  }

  function houseAt(year, month) {
    return electionAt(year, month).house;
  }

  function listNumber(id, year, month) {
    var n = electionAt(year, month).lists[id];
    return n === undefined ? null : n;
  }

  // Period emblem file for a party at the in-game date, or null when the
  // party has no usable one (a neutral badge is used instead). Files live
  // in assets/social_democracy_alternate_history/symbols/, copied into
  // out/html/state-column/symbols/ by the build.
  function symbolFile(id, year, month) {
    var date = toDate(year, month);
    switch (id) {
      case 'spd':
        return date >= toDate(1932, 6) ? 'Iron_Front_flag_Three_Arrows.svg' : 'SPD_monogram_recreation.svg';
      case 'kpd':
        return 'Kommunistische_Partei_Deutschlands_KPD_logo.svg';
      case 'z':
        return 'Zentrum_cross_shield_recreation.svg';
      case 'bvp':
        return 'Flag_of_Bavaria_lozengy.svg';
      case 'ddp':
        return 'DDP_tricolour_shield_recreation.svg';
      case 'dvp':
        return 'German_People_s_Party.svg';
      case 'dnvp':
        return 'DNVP_logo_basic.svg';
      case 'nsdap':
        return 'Flag_of_the_NSDAP_1920-1945.svg';
      default:
        return null;
    }
  }

  // Same idea for the forces tabs (paramilitaries, state forces).
  function forceSymbol(id, year, month) {
    var date = toDate(year, month);
    switch (id) {
      case 'rb':
        return 'Vectorized_Reichsbanner_Logo.svg';
      case 'rfb':
        return 'Roter_Frontkaempferbund.svg';
      case 'sh':
        return 'Stahlhelm_logo.svg';
      case 'sa':
        return 'SA-Logo.svg';
      case 'reichswehr':
        return date >= toDate(1933, 3) ? 'War_Ensign_of_Germany_1933-1935.svg' : 'War_Ensign_of_Germany_1921-1933.svg';
      case 'prussian_police':
        return 'Fahne_Polizei_Preussen_1931.svg';
      default:
        return null;
    }
  }

  // The defense organisations, in the order the Defense tab lists them.
  // Paramilitaries carry a strength share and a militancy; state forces carry
  // a loyalty (interior_police only exists once the SPD holds the interior
  // ministry). label is the list row's name, name the entry's heading, de the
  // German full name under it. polarity: whether a rise in strength or
  // militancy is good (1, the republican Reichsbanner) or bad (-1) for change
  // arrows. wiki_en and wiki_de are the articles the entry links to (English
  // has no article on the Prussian force alone, so its link is the general
  // Schutzpolizei one); the Reich interior police has no article of its own. library is the bold
  // lead-in of the group's paragraph in the game's Library, if it has one.
  var DEFENSE_ORGS = [
    { id: 'rb', kind: 'paramilitary', label: 'Reichsbanner', name: 'Reichsbanner', de: 'Reichsbanner Schwarz-Rot-Gold',
      color: '#E3000F', polarity: 1, library: 'Reichsbanner',
      wiki_en: 'https://en.wikipedia.org/wiki/Reichsbanner_Schwarz-Rot-Gold',
      wiki_de: 'https://de.wikipedia.org/wiki/Reichsbanner_Schwarz-Rot-Gold' },
    { id: 'rfb', kind: 'paramilitary', label: 'RFB', name: 'RFB', de: 'Roter Frontkämpferbund',
      color: '#8B0000', polarity: -1, library: 'Rotfrontkämpferbund',
      wiki_en: 'https://en.wikipedia.org/wiki/Roter_Frontk%C3%A4mpferbund',
      wiki_de: 'https://de.wikipedia.org/wiki/Roter_Frontk%C3%A4mpferbund' },
    { id: 'sh', kind: 'paramilitary', label: 'Stahlhelm', name: 'Stahlhelm', de: 'Der Stahlhelm, Bund der Frontsoldaten',
      color: '#3F7BC1', polarity: -1, library: 'Der Stahlhelm',
      wiki_en: 'https://en.wikipedia.org/wiki/Der_Stahlhelm,_Bund_der_Frontsoldaten',
      wiki_de: 'https://de.wikipedia.org/wiki/Stahlhelm,_Bund_der_Frontsoldaten' },
    { id: 'sa', kind: 'paramilitary', label: 'SA', name: 'SA', de: 'Sturmabteilung',
      color: '#964B00', polarity: -1, library: 'Sturmabteilung',
      wiki_en: 'https://en.wikipedia.org/wiki/Sturmabteilung',
      wiki_de: 'https://de.wikipedia.org/wiki/Sturmabteilung' },
    { id: 'reichswehr', kind: 'state', label: 'Reichswehr', name: 'Reichswehr', de: null,
      color: 'var(--sc-muted)', library: 'Reichswehr',
      wiki_en: 'https://en.wikipedia.org/wiki/Reichswehr',
      wiki_de: 'https://de.wikipedia.org/wiki/Reichswehr' },
    { id: 'prussian_police', kind: 'state', label: 'Preuß. Polizei', name: 'Prussian police', de: 'Preußische Schutzpolizei',
      color: 'var(--sc-muted)', library: 'Prussian police',
      wiki_en: 'https://en.wikipedia.org/wiki/Schutzpolizei',
      wiki_de: 'https://de.wikipedia.org/wiki/Schutzpolizei_(Weimarer_Republik)' },
    { id: 'interior_police', kind: 'state', label: 'Reich police', name: 'Reich police', de: null,
      color: 'var(--sc-muted)', onlyInGov: true, library: null,
      wiki_en: null, wiki_de: null }
  ];

  var defenseOrgById = {};
  DEFENSE_ORGS.forEach(function (o) { defenseOrgById[o.id] = o; });

  function defenseOrg(id) {
    return defenseOrgById[id] || null;
  }

  function numberOrZero(v) {
    return (typeof v === 'number' && !isNaN(v)) ? v : 0;
  }

  function seatShares(q, source) {
    var suffix = source === 'polls' ? '_votes' : '_r';
    var shares = {};
    PARTIES.forEach(function (p) {
      shares[p.id] = numberOrZero(q[p.id + suffix]);
    });
    if (!q.sapd_formed) {
      shares.sapd = 0;
    }
    // The game stores Z and BVP together under z; split it as the
    // in-game charts do.
    var zTotal = numberOrZero(q['z' + suffix]);
    shares.bvp = Math.min(3, zTotal);
    shares.z = zTotal - shares.bvp;
    return shares;
  }

  function allocateSeats(shares, house) {
    var ids = PARTIES.map(function (p) { return p.id; });
    var total = ids.reduce(function (sum, id) { return sum + numberOrZero(shares[id]); }, 0);
    var seats = {};
    if (total === 0) {
      ids.forEach(function (id) { seats[id] = 0; });
      return seats;
    }
    var quota = house / total;
    var remainders = [];
    var assigned = 0;
    ids.forEach(function (id, index) {
      var raw = numberOrZero(shares[id]) * quota;
      var floor = Math.floor(raw);
      seats[id] = floor;
      assigned += floor;
      remainders.push({ id: id, index: index, remainder: raw - floor });
    });
    var remaining = house - assigned;
    remainders.sort(function (a, b) {
      if (b.remainder !== a.remainder) {
        return b.remainder - a.remainder;
      }
      return a.index - b.index;
    });
    for (var i = 0; i < remaining; i++) {
      seats[remainders[i].id] += 1;
    }
    return seats;
  }

  function majority(house) {
    return Math.floor(house / 2) + 1;
  }

  // Rounds fractions (id to share of 1) to whole numbers that sum exactly to
  // total, by largest remainder. Rounding each party alone can leave a result
  // at 99 or 101. A remainder tie goes to the larger fraction, then the
  // earlier id. The 1e-9 keeps 0.29 * 100 from flooring to 28.
  function roundShares(fractions, total) {
    var ids = Object.keys(fractions);
    var out = {};
    var rows = ids.map(function (id, order) {
      var f = numberOrZero(fractions[id]);
      var exact = f * total;
      var whole = Math.floor(exact + 1e-9);
      out[id] = whole;
      return { id: id, order: order, f: f, rem: exact - whole };
    });
    var left = total - rows.reduce(function (n, r) { return n + out[r.id]; }, 0);
    rows.sort(function (a, b) {
      return (b.rem - a.rem) || (b.f - a.f) || (a.order - b.order);
    });
    for (var i = 0; i < left && i < rows.length; i++) {
      out[rows[i].id] += 1;
    }
    return out;
  }

  // Coalition flags to name and member parties, checked in this order. The
  // Popular Front leaves BVP out, as the game's own sum for it does.
  var GOVERNMENTS = [
    { flag: 'in_spd_majority', name: 'SPD majority', parties: ['spd'] },
    { flag: 'in_left_front', name: 'Left Front', parties: ['spd', 'kpd', 'sapd'] },
    { flag: 'in_popular_front', name: 'Popular Front', parties: ['spd', 'kpd', 'sapd', 'z', 'ddp'] },
    { flag: 'in_grand_coalition', name: 'Grand Coalition', parties: ['spd', 'ddp', 'z', 'bvp', 'dvp'] },
    { flag: 'in_weimar_coalition', name: 'Weimar Coalition', parties: ['spd', 'ddp', 'z'] },
    { flag: 'in_minority_government', name: 'Minority government', parties: ['spd'] },
    { flag: 'in_emergency_government', name: 'Emergency government', parties: ['spd'] }
  ];

  function government(q) {
    if (!q.spd_in_government) {
      return null;
    }
    for (var i = 0; i < GOVERNMENTS.length; i++) {
      var g = GOVERNMENTS[i];
      if (q[g.flag]) {
        return { name: g.name, parties: g.parties };
      }
    }
    return { name: 'Government', parties: ['spd'] };
  }

  function markedParties(q) {
    var g = government(q);
    return g ? g.parties : ['spd'];
  }

  function spdPosition(q) {
    if (q.spd_caretaker) {
      return 'Caretaker';
    }
    if (q.spd_in_government) {
      return 'Government';
    }
    if (q.spd_toleration) {
      return 'Toleration';
    }
    return 'Opposition';
  }

  // Thresholds copied verbatim from source/qdisplays/*.qdisplay.dry. The
  // engine's ranges are inclusive at both ends and the first matching case
  // wins (dendrynexus/lib/engine.js, getUserQDisplay: `min <= value && max
  // >= value`, checked in file order), so a value on a shared boundary
  // belongs to whichever band lists it first.
  var BANDS = {
    // relationships.qdisplay.dry
    relationships: [
      { max: 5, word: 'hostile' },
      { min: 5, max: 14.9, word: 'frigid' },
      { min: 14.9, max: 29.9, word: 'cold' },
      { min: 29.9, max: 39.9, word: 'cool' },
      { min: 39.9, max: 54.9, word: 'neutral' },
      { min: 54.9, max: 64.9, word: 'warm' },
      { min: 64.9, max: 74.9, word: 'friendly' },
      { min: 74.9, word: 'very friendly' }
    ],
    // strength.qdisplay.dry ("faction strength")
    strength: [
      { min: 0, max: 10, word: 'weak' },
      { min: 10, max: 25, word: 'moderate' },
      { min: 25, max: 40, word: 'strong' },
      { min: 40, max: 60, word: 'very strong' },
      { min: 60, word: 'dominant' }
    ],
    // dissent.qdisplay.dry ("party faction dissent")
    dissent: [
      { max: 4.999, word: 'very low' },
      { min: 4.999, max: 14.999, word: 'low' },
      { min: 14.999, max: 30.999, word: 'medium' },
      { min: 30.999, max: 49.999, word: 'high' },
      { min: 49.999, word: 'very high' }
    ],
    // militancy.qdisplay.dry ("militancy for paramilitary groups")
    militancy: [
      { max: 0.05, word: 'Nonexistent' },
      { min: 0.05, max: 0.14, word: 'Very low' },
      { min: 0.14, max: 0.24, word: 'Low' },
      { min: 0.24, max: 0.44, word: 'Medium-low' },
      { min: 0.44, max: 0.69, word: 'Medium' },
      { min: 0.69, max: 1, word: 'High' },
      { min: 1, word: 'Very high' }
    ],
    // loyalty.qdisplay.dry ("loyalty for police + reichswehr")
    loyalty: [
      { max: 0.06, word: 'completely disloyal' },
      { min: 0.06, max: 0.19, word: 'very disloyal' },
      { min: 0.19, max: 0.31, word: 'generally disloyal' },
      { min: 0.31, max: 0.41, word: 'mostly disloyal' },
      { min: 0.41, max: 0.54, word: 'divided' },
      { min: 0.54, max: 0.71, word: 'mostly loyal' },
      { min: 0.71, max: 0.95, word: 'generally loyal' },
      { min: 0.95, word: 'completely loyal' }
    ],
    // coalition_dissent.qdisplay.dry
    coalition_dissent: [
      { max: 0, word: 'very low' },
      { min: 1, max: 1, word: 'low' },
      { min: 2, max: 2, word: 'medium' },
      { min: 3, max: 3, word: 'high' },
      { min: 4, word: 'very high' }
    ]
  };

  function bandIndex(scale, v) {
    var cases = BANDS[scale];
    if (!cases) {
      return -1;
    }
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      if ((c.min === undefined || c.min <= v) && (c.max === undefined || c.max >= v)) {
        return i;
      }
    }
    return -1;
  }

  function bandWord(scale, v) {
    var i = bandIndex(scale, v);
    if (i === -1) {
      return v.toString();
    }
    return BANDS[scale][i].word;
  }

  // Severity of a band as a --sc-dis-* colour token suffix (the dissent
  // palette: grey, amber, red, dark red), for status words in the Defense
  // list and entries. Militancy climbs with its band index; loyalty reads the
  // other way, so the disloyal bands are the red ones and every loyal band is
  // calm grey. One entry per band of BANDS[scale].
  var SEVERITY = {
    militancy: ['very-low', 'very-low', 'low', 'low', 'medium', 'high', 'very-high'],
    loyalty: ['very-high', 'high', 'high', 'medium', 'medium', 'low', 'very-low', 'very-low']
  };

  function severity(scale, v) {
    var list = SEVERITY[scale];
    return (list && list[bandIndex(scale, v)]) || 'low';
  }

  /* Defense size bars */

  // Bar length for one organisation, as a fraction (0 to 1) of the track.
  // Strengths run from 50 to 2,000 (thousands of members), so a straight scale
  // would leave everything but the Reichsbanner a sliver. The square root
  // keeps the order and shows the small groups (the SA at 80 is about 20% of
  // the Reichsbanner's 2,000). The bar is a fudge for legibility; the number
  // beside it is the truth. `max` is the largest strength on the list.
  function sizeFraction(strength, max) {
    var s = numberOrZero(strength);
    var m = numberOrZero(max);
    if (s <= 0 || m <= 0) {
      return 0;
    }
    return Math.min(1, Math.sqrt(s / m));
  }

  // Members in thousands, as the bar's label: "2.0m", "500k", "80k".
  // Strengths carry many decimals after the game's percentage cuts, so round
  // to the thousand first.
  function formatMembers(strength) {
    var k = Math.round(numberOrZero(strength));
    if (k >= 1000) {
      return (k / 1000).toFixed(1) + 'm';
    }
    return k + 'k';
  }

  /* end Defense size bars */

  /* Monthly economic history */

  // One point per game month, kept as a JSON string in the quality
  // sc_history so it saves and loads with the game (Dendry's save is
  // JSON.stringify of the whole state, so a string quality round-trips).
  // The chart on the State tab draws from it.
  var HISTORY_CAP = 120;

  function timeIndex(year, month) {
    return year * 12 + (month - 1);
  }

  function round2(v) {
    var n = Number(v);
    return isFinite(n) ? Math.round(n * 100) / 100 + 0 : 0;
  }

  // The figures the state column charts, as of now, or null when the
  // qualities carry no date yet.
  function historyPoint(q) {
    var year = Number(q.year);
    var month = Number(q.month);
    if (!isFinite(year) || !isFinite(month) || !q.year || !q.month) {
      return null;
    }
    return {
      year: year,
      month: month,
      inflation: round2(q.inflation),
      growth: round2(q.economic_growth),
      unemployed: round2(q.unemployed),
      budget: round2(q.budget)
    };
  }

  // The points in a stored history, oldest first. Anything that isn't a
  // list of dated points (a missing quality, a hand-edited save) reads as
  // an empty history.
  function parseHistory(str) {
    var list;
    try {
      list = JSON.parse(str);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(list)) {
      return [];
    }
    var out = [];
    list.forEach(function (p) {
      if (p && isFinite(Number(p.year)) && isFinite(Number(p.month)) && p.year && p.month) {
        out.push({
          year: Number(p.year),
          month: Number(p.month),
          inflation: round2(p.inflation),
          growth: round2(p.growth),
          unemployed: round2(p.unemployed),
          budget: round2(p.budget)
        });
      }
    });
    out.sort(function (a, b) { return timeIndex(a.year, a.month) - timeIndex(b.year, b.month); });
    return out;
  }

  // The stored history with the present month recorded, as a JSON string:
  // this month's point is replaced while the month lasts and a new month
  // appends. Points later than now go (a back-out refunds a month), and the
  // oldest points go past HISTORY_CAP. Returns the same string when nothing
  // changed, so callers can compare before writing a quality.
  function recordHistory(str, q) {
    var now = historyPoint(q);
    if (!now) {
      return str;
    }
    var t = timeIndex(now.year, now.month);
    var points = parseHistory(str).filter(function (p) {
      return timeIndex(p.year, p.month) < t;
    });
    points.push(now);
    if (points.length > HISTORY_CAP) {
      points = points.slice(points.length - HISTORY_CAP);
    }
    return JSON.stringify(points);
  }

  /* end monthly economic history */

  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function monthsUntil(q) {
    if (!q.next_election_year) {
      return null;
    }
    return (q.next_election_year - q.year) * 12 + (q.next_election_month - q.month);
  }

  /* Coalition dissent */

  // The game keeps two small counters of how far a coalition partner has been
  // pushed (coalition_dissent for the bourgeois partners, kpd_coalition_dissent
  // for the KPD). At a threshold the partner calls a vote of no confidence:
  // events/vote_of_no_confidence.scene.dry (line 5) for the first,
  // events/kpd_vote_of_no_confidence.scene.dry (line 4) for the second. Both
  // scenes also need spd_r < 50 and no constructive_vonc. This reads those
  // conditions off the qualities and says, for each partner, how near the
  // vote is and what the player can do about it.
  var COALITION_CALLERS = { dvp: 'DVP', z: 'Center', kpd: 'KPD' };

  // The costs and waits the dissent block and its entry quote, each stated
  // here once and checked against its scene in coalition-strain.test.js.
  // coalition_affairs.scene.dry: the card waits for coalition_affairs_timer,
  // which it sets to 5 and post_event.scene.dry counts down once a month; its
  // @resources option costs 2 (choose-if) and takes one step off, and is
  // hidden in historical mode (view-if). advisors/braun and muller.scene.dry:
  // the Negotiating with the Coalition action sets advisor_action_timer to 6
  // and takes one step off. vote_of_no_confidence.scene.dry (and the KPD's):
  // the @resources option while a vote is called costs 3 and takes one off.
  var COALITION_TERMS = {
    cardWaitMonths: 5,
    cardResources: 2,
    advisorWaitMonths: 6,
    voteResources: 3,
    step: 1,
    // @promise_cuts: the welfare cut, and what it does to the party.
    cutsWelfare: 1,
    cutsBudget: 1,
    cutsLeftDissent: 10,
    cutsLaborDissent: 5
  };
  var COALITION_AFFAIRS_RESOURCES = COALITION_TERMS.cardResources;
  var COALITION_RESOURCE_STEP = COALITION_TERMS.step;

  function flag(q, name) {
    return !!q[name];
  }

  // Why no vote can be called, as a phrase that completes "No vote can be
  // called: ...", or null when the guards hold.
  function voteBlock(q) {
    if (q.constructive_vonc) {
      return 'the constitution bans votes of no confidence without a replacement government';
    }
    if (numberOrZero(Number(q.spd_r)) >= 50) {
      return 'the SPD holds half the seats on its own';
    }
    return null;
  }

  function coalitionAffairsState(q, value) {
    if (!(flag(q, 'in_grand_coalition') || flag(q, 'in_weimar_coalition') || flag(q, 'in_popular_front'))) {
      return { state: 'unavailable', months: 0, reason: 'in a minority government' };
    }
    var timer = numberOrZero(Number(q.coalition_affairs_timer));
    if (timer > 0) {
      return { state: 'wait', months: timer, reason: null };
    }
    if (value < 1) {
      return { state: 'unavailable', months: 0, reason: 'no dissent to ease' };
    }
    return { state: 'ready', months: 0, reason: null };
  }

  function coalitionResources(q) {
    if (q.historical_mode) {
      return null;
    }
    var have = numberOrZero(Number(q.resources));
    return {
      cost: COALITION_AFFAIRS_RESOURCES,
      lowersBy: COALITION_RESOURCE_STEP,
      affordable: have >= COALITION_AFFAIRS_RESOURCES,
      have: have
    };
  }

  function coalitionBand(value, stepsLeft) {
    if (value <= 0) {
      return 'calm';
    }
    if (stepsLeft <= 0) {
      return 'vote';
    }
    return stepsLeft === 1 ? 'strained' : 'uneasy';
  }

  // One partner's reading. blocked, when set, outranks the band in what the
  // player is told, since no vote can follow.
  function strainOf(q, spec) {
    var value = numberOrZero(Number(q[spec.key]));
    var stepsLeft = Math.max(0, spec.threshold - value);
    var band = coalitionBand(value, stepsLeft);
    var blocked = voteBlock(q);
    var caller = COALITION_CALLERS[spec.callerId];
    var before = null;
    var after = null;
    var sentence;
    if (blocked) {
      sentence = 'No vote can be called: ' + blocked + '.';
    } else if (band === 'calm') {
      sentence = 'The partners are content.';
    } else if (band === 'vote') {
      before = 'The ';
      after = ' will call a vote of no confidence this month.';
    } else {
      before = (stepsLeft === 1 ? 'One more step' : stepsLeft + ' more steps') + ' and the ';
      after = ' calls a vote of no confidence.';
    }
    if (before !== null) {
      sentence = before + caller + after;
    }
    return {
      key: spec.key,
      label: spec.label,
      callerId: spec.callerId,
      callerLabel: caller,
      value: value,
      threshold: spec.threshold,
      stepsLeft: stepsLeft,
      band: band,
      blocked: blocked,
      sentence: sentence,
      sentenceParts: before === null ? null : { before: before, after: after },
      remedies: spec.card
        ? { card: coalitionAffairsState(q, value), resources: coalitionResources(q) }
        : { card: null, resources: null }
    };
  }

  // The partners that can call a vote on the SPD now: zero, one or two. A
  // Grand Coalition has the DVP calling it (the scene names it for in_grand_
  // coalition, the Center for the rest); a Popular Front has the Center and
  // the KPD; a Left Front only the KPD. An SPD majority and an emergency
  // government have no vote, and no entry here.
  function coalitionStrain(q) {
    var out = [];
    if (!q || !q.spd_in_government) {
      return out;
    }
    var bourgeois = flag(q, 'in_grand_coalition') || flag(q, 'in_popular_front') || flag(q, 'in_minority_government')
      ? 3
      : (flag(q, 'in_weimar_coalition') ? 4 : 0);
    if (bourgeois) {
      out.push(strainOf(q, {
        key: 'coalition_dissent',
        label: 'Coalition dissent',
        callerId: flag(q, 'in_grand_coalition') ? 'dvp' : 'z',
        threshold: bourgeois,
        card: true
      }));
    }
    var kpd = flag(q, 'in_popular_front') ? 3 : (flag(q, 'in_left_front') ? 4 : 0);
    if (kpd) {
      out.push(strainOf(q, { key: 'kpd_coalition_dissent', label: 'KPD dissent', callerId: 'kpd', threshold: kpd, card: false }));
    }
    return out;
  }

  // What moved the dissents: one {t, key, delta, cause} per change, t being
  // Model.timeIndex of the month, cause the title of the card or event the
  // player was on. Kept as a JSON string in the quality sc_coalition_log, so
  // a saved game carries it, newest last, at most COALITION_LOG_CAP long.
  var COALITION_LOG_CAP = 12;
  var COALITION_KEYS = ['coalition_dissent', 'kpd_coalition_dissent'];

  function parseCoalitionLog(str) {
    var list;
    try {
      list = JSON.parse(str);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(list)) {
      return [];
    }
    var out = [];
    list.forEach(function (e) {
      if (e && e.t !== '' && e.t !== null && isFinite(Number(e.t)) && COALITION_KEYS.indexOf(e.key) >= 0 &&
          isFinite(Number(e.delta)) && Number(e.delta) !== 0) {
        out.push({ t: Number(e.t), key: e.key, delta: Number(e.delta), cause: typeof e.cause === 'string' && e.cause ? e.cause : 'an event' });
      }
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  // The stored log with what changed between prev (the dissents as last
  // drawn: {coalition_dissent, kpd_coalition_dissent}, or null when there is
  // no earlier reading) and q now. A change by the same cause in the same
  // month joins that month's entry. Entries after now go (the game went
  // back), and the log clears with the SPD out of government, where an
  // election has reset the dissents. Returns str itself when nothing
  // changed, so callers can compare before writing a quality.
  function recordCoalitionLog(str, prev, q, cause) {
    var before = parseCoalitionLog(str);
    var now = timeIndex(Number(q.year), Number(q.month));
    // Copies, so joining a change into an entry leaves `before` to compare with.
    var list = before.filter(function (e) { return e.t <= now; }).map(function (e) {
      return { t: e.t, key: e.key, delta: e.delta, cause: e.cause };
    });
    if (!q.spd_in_government) {
      list = [];
    } else if (prev) {
      COALITION_KEYS.forEach(function (key) {
        var delta = numberOrZero(Number(q[key])) - numberOrZero(Number(prev[key]));
        if (!delta) {
          return;
        }
        var why = cause || 'an event';
        var joined = false;
        for (var i = list.length - 1; i >= 0; i--) {
          if (list[i].t === now && list[i].key === key && list[i].cause === why) {
            list[i].delta += delta;
            if (!list[i].delta) {
              list.splice(i, 1);
            }
            joined = true;
            break;
          }
        }
        if (!joined) {
          list.push({ t: now, key: key, delta: delta, cause: why });
        }
      });
      if (list.length > COALITION_LOG_CAP) {
        list = list.slice(list.length - COALITION_LOG_CAP);
      }
    }
    return JSON.stringify(list) === JSON.stringify(before) ? str : JSON.stringify(list);
  }

  // The newest entry for a dissent in a parsed log, or null.
  function lastCoalitionMove(log, key) {
    for (var i = log.length - 1; i >= 0; i--) {
      if (log[i].key === key) {
        return log[i];
      }
    }
    return null;
  }

  // "Labor Rights, March 1929, +1", with a true minus sign.
  function coalitionMoveText(move) {
    var year = Math.floor(move.t / 12);
    var month = move.t - year * 12;
    var amount = (move.delta > 0 ? '+' : '−') + Math.abs(move.delta);
    return move.cause + ', ' + MONTHS[month] + ' ' + year + ', ' + amount;
  }

  /* end coalition dissent */

  return {
    PARTIES: PARTIES,
    partyLabel: partyLabel,
    partyGerman: partyGerman,
    ELECTIONS: ELECTIONS,
    electionAt: electionAt,
    houseAt: houseAt,
    listNumber: listNumber,
    symbolFile: symbolFile,
    forceSymbol: forceSymbol,
    DEFENSE_ORGS: DEFENSE_ORGS,
    defenseOrg: defenseOrg,
    roundShares: roundShares,
    seatShares: seatShares,
    allocateSeats: allocateSeats,
    majority: majority,
    GOVERNMENTS: GOVERNMENTS,
    government: government,
    markedParties: markedParties,
    spdPosition: spdPosition,
    BANDS: BANDS,
    bandIndex: bandIndex,
    bandWord: bandWord,
    severity: severity,
    sizeFraction: sizeFraction,
    formatMembers: formatMembers,
    MONTHS: MONTHS,
    monthsUntil: monthsUntil,
    HISTORY_CAP: HISTORY_CAP,
    timeIndex: timeIndex,
    historyPoint: historyPoint,
    parseHistory: parseHistory,
    recordHistory: recordHistory,
    COALITION_LOG_CAP: COALITION_LOG_CAP,
    COALITION_TERMS: COALITION_TERMS,
    coalitionStrain: coalitionStrain,
    parseCoalitionLog: parseCoalitionLog,
    recordCoalitionLog: recordCoalitionLog,
    lastCoalitionMove: lastCoalitionMove,
    coalitionMoveText: coalitionMoveText
  };
}));
