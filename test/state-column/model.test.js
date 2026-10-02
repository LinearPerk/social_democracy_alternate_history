'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../../out/html/state-column/model.js');
const start1928 = require('./fixtures/start1928.json');
const gov1932 = require('./fixtures/gov1932.json');
const crisis1930 = require('./fixtures/crisis1930.json');

test('PARTIES lists all ten parties in seating order, left to right', () => {
  const ids = Model.PARTIES.map((p) => p.id);
  assert.deepEqual(ids, [
    'kpd', 'sapd', 'spd', 'ddp', 'z', 'bvp', 'dvp', 'other', 'dnvp', 'nsdap'
  ]);
});

test('partyLabel returns the abbreviation by default', () => {
  const q = {};
  assert.equal(Model.partyLabel(q, 'spd'), 'SPD');
  assert.equal(Model.partyLabel(q, 'kpd'), 'KPD');
});

test('partyLabel returns ddp_name for ddp when it is a non-empty string', () => {
  assert.equal(Model.partyLabel({ ddp_name: 'DStP' }, 'ddp'), 'DStP');
  assert.equal(Model.partyLabel({ ddp_name: 'DDP' }, 'ddp'), 'DDP');
});

test('partyLabel falls back to the abbreviation when ddp_name is empty or absent', () => {
  assert.equal(Model.partyLabel({ ddp_name: '' }, 'ddp'), 'DDP');
  assert.equal(Model.partyLabel({}, 'ddp'), 'DDP');
});

test('partyGerman returns the German full name by default', () => {
  assert.equal(Model.partyGerman({}, 'spd'), 'Sozialdemokratische Partei Deutschlands');
  assert.equal(Model.partyGerman({}, 'ddp'), 'Deutsche Demokratische Partei');
});

test('partyGerman returns Deutsche Staatspartei for ddp once renamed DStP', () => {
  assert.equal(Model.partyGerman({ ddp_name: 'DStP' }, 'ddp'), 'Deutsche Staatspartei');
  assert.equal(Model.partyGerman({ ddp_name: 'DDP' }, 'ddp'), 'Deutsche Demokratische Partei');
});

test('electionAt returns the 1924 election before the 1928 election date', () => {
  assert.equal(Model.electionAt(1928, 1).house, 493);
});

test('electionAt returns the 1928 election on its own date', () => {
  assert.equal(Model.electionAt(1928, 5).house, 491);
});

test('electionAt returns the first entry when queried before any election', () => {
  assert.equal(Model.electionAt(1900, 1).house, 493);
});

test('electionAt distinguishes the two 1932 elections just before and on each date', () => {
  assert.equal(Model.electionAt(1932, 6).house, 577);
  assert.equal(Model.electionAt(1932, 7).house, 608);
  assert.equal(Model.electionAt(1932, 10).house, 608);
  assert.equal(Model.electionAt(1932, 11).house, 584);
});

test('electionAt returns the 1930 and 1933 elections just before and on their dates', () => {
  assert.equal(Model.electionAt(1930, 8).house, 491);
  assert.equal(Model.electionAt(1930, 9).house, 577);
  assert.equal(Model.electionAt(1933, 2).house, 584);
  assert.equal(Model.electionAt(1933, 3).house, 647);
});

test('houseAt reads the house size of the matching election', () => {
  assert.equal(Model.houseAt(1930, 10), 577);
});

test('listNumber reads a party ballot number, or null when the party has none', () => {
  assert.equal(Model.listNumber('spd', 1928, 5), 1);
  assert.equal(Model.listNumber('nsdap', 1928, 5), 10);
  assert.equal(Model.listNumber('sapd', 1928, 5), null);
  assert.equal(Model.listNumber('sapd', 1932, 7), 17);
  assert.equal(Model.listNumber('spd', 1924, 12), null);
});

test('seatShares reads seat shares and splits z into z and bvp, sapd at 0 before it forms', () => {
  const shares = Model.seatShares(start1928, 'seats');
  assert.deepEqual(shares, {
    kpd: 9, sapd: 0, spd: 26, ddp: 6, z: 14, bvp: 3, dvp: 10, other: 9, dnvp: 20, nsdap: 3
  });
});

test('seatShares counts sapd once sapd_formed is set', () => {
  const shares = Model.seatShares(gov1932, 'seats');
  assert.deepEqual(shares, {
    kpd: 12, sapd: 3, spd: 27, ddp: 3, z: 13, bvp: 3, dvp: 3, other: 7, dnvp: 7, nsdap: 22
  });
});

test('seatShares reads polls from the *_votes fields', () => {
  const shares = Model.seatShares(gov1932, 'polls');
  assert.deepEqual(shares, {
    kpd: 11, sapd: 5, spd: 28, ddp: 2, z: 13, bvp: 3, dvp: 2, other: 7, dnvp: 8, nsdap: 21
  });
});

test('seatShares treats missing or non-numeric values as 0', () => {
  const shares = Model.seatShares({ spd_r: '26', kpd_r: null, z_r: 17 }, 'seats');
  assert.equal(shares.spd, 0);
  assert.equal(shares.kpd, 0);
  assert.equal(shares.ddp, 0);
  assert.equal(shares.other, 0);
});

test('allocateSeats assigns the largest remainder to the earliest party in a tie', () => {
  // Worked by hand: quota = 10 / 100 = 0.1.
  // kpd 10 -> 1.0 (floor 1, remainder 0); spd 45 -> 4.5 (floor 4, remainder 0.5);
  // dnvp 25 -> 2.5 (floor 2, remainder 0.5); nsdap 20 -> 2.0 (floor 2, remainder 0).
  // Floors sum to 9, one seat remains; spd and dnvp tie at 0.5, spd comes first
  // in party order and gets it.
  const shares = {
    kpd: 10, sapd: 0, spd: 45, ddp: 0, z: 0, bvp: 0, dvp: 0, other: 0, dnvp: 25, nsdap: 20
  };
  const seats = Model.allocateSeats(shares, 10);
  assert.deepEqual(seats, {
    kpd: 1, sapd: 0, spd: 5, ddp: 0, z: 0, bvp: 0, dvp: 0, other: 0, dnvp: 2, nsdap: 2
  });
});

test('allocateSeats sums to exactly the house for each fixture, seats and polls', () => {
  for (const [q, house] of [
    [start1928, 493],
    [gov1932, 608],
    [crisis1930, 577]
  ]) {
    for (const source of ['seats', 'polls']) {
      const shares = Model.seatShares(q, source);
      const seats = Model.allocateSeats(shares, house);
      const total = Object.values(seats).reduce((a, b) => a + b, 0);
      const shareTotal = Object.values(shares).reduce((a, b) => a + b, 0);
      assert.equal(total, shareTotal === 0 ? 0 : house);
    }
  }
});

test('allocateSeats returns all zero seats when the shares sum to 0', () => {
  const shares = {
    kpd: 0, sapd: 0, spd: 0, ddp: 0, z: 0, bvp: 0, dvp: 0, other: 0, dnvp: 0, nsdap: 0
  };
  const seats = Model.allocateSeats(shares, 491);
  assert.deepEqual(seats, shares);
});

test('majority is one more than half the house, rounded down', () => {
  assert.equal(Model.majority(491), 246);
  assert.equal(Model.majority(608), 305);
  assert.equal(Model.majority(4), 3);
});

test('government is null when the SPD is not in government', () => {
  assert.equal(Model.government(crisis1930), null);
});

test('government is the Popular Front for gov1932', () => {
  assert.deepEqual(Model.government(gov1932), {
    name: 'Popular Front',
    parties: ['spd', 'kpd', 'sapd', 'z', 'ddp']
  });
});

test('government checks flags in order and stops at the first match', () => {
  const q = { spd_in_government: 1, in_grand_coalition: 1, in_popular_front: 1 };
  assert.equal(Model.government(q).name, 'Popular Front');
});

test('government falls back to a plain SPD government when no flag is set', () => {
  const q = { spd_in_government: 1 };
  assert.deepEqual(Model.government(q), { name: 'Government', parties: ['spd'] });
});

test('markedParties returns the government parties, or just SPD with no government', () => {
  assert.deepEqual(Model.markedParties(gov1932), ['spd', 'kpd', 'sapd', 'z', 'ddp']);
  assert.deepEqual(Model.markedParties(crisis1930), ['spd']);
});

test('spdPosition reflects caretaker, government, toleration, and opposition', () => {
  assert.equal(Model.spdPosition({ spd_caretaker: 1, spd_in_government: 1 }), 'Caretaker');
  assert.equal(Model.spdPosition(gov1932), 'Government');
  assert.equal(Model.spdPosition(crisis1930), 'Toleration');
  assert.equal(Model.spdPosition(start1928), 'Opposition');
});

// Boundaries copied from source/qdisplays/relationships.qdisplay.dry. Bounds
// are inclusive at both ends (dendrynexus/lib/engine.js's getUserQDisplay:
// `min <= value && max >= value`), and the first matching case wins, so a
// value sitting exactly on a shared boundary belongs to the earlier band.
test('bandWord for relationships matches the qdisplay at every boundary', () => {
  assert.equal(Model.bandWord('relationships', 0), 'hostile');
  assert.equal(Model.bandWord('relationships', 5), 'hostile');
  assert.equal(Model.bandWord('relationships', 14.9), 'frigid');
  assert.equal(Model.bandWord('relationships', 29.9), 'cold');
  assert.equal(Model.bandWord('relationships', 39.9), 'cool');
  assert.equal(Model.bandWord('relationships', 54.9), 'neutral');
  assert.equal(Model.bandWord('relationships', 64.9), 'warm');
  assert.equal(Model.bandWord('relationships', 74.9), 'friendly');
  assert.equal(Model.bandWord('relationships', 100), 'very friendly');
});

test('bandWord for strength matches the qdisplay at every boundary', () => {
  assert.equal(Model.bandWord('strength', 0), 'weak');
  assert.equal(Model.bandWord('strength', 10), 'weak');
  assert.equal(Model.bandWord('strength', 25), 'moderate');
  assert.equal(Model.bandWord('strength', 40), 'strong');
  assert.equal(Model.bandWord('strength', 60), 'very strong');
  assert.equal(Model.bandWord('strength', 100), 'dominant');
});

test('bandWord for dissent matches the qdisplay at every boundary', () => {
  assert.equal(Model.bandWord('dissent', 0), 'very low');
  assert.equal(Model.bandWord('dissent', 4.999), 'very low');
  assert.equal(Model.bandWord('dissent', 14.999), 'low');
  assert.equal(Model.bandWord('dissent', 30.999), 'medium');
  assert.equal(Model.bandWord('dissent', 49.999), 'high');
  assert.equal(Model.bandWord('dissent', 100), 'very high');
});

test('bandWord for militancy matches the qdisplay at every boundary', () => {
  assert.equal(Model.bandWord('militancy', 0), 'Nonexistent');
  assert.equal(Model.bandWord('militancy', 0.05), 'Nonexistent');
  assert.equal(Model.bandWord('militancy', 0.14), 'Very low');
  assert.equal(Model.bandWord('militancy', 0.24), 'Low');
  assert.equal(Model.bandWord('militancy', 0.44), 'Medium-low');
  assert.equal(Model.bandWord('militancy', 0.69), 'Medium');
  assert.equal(Model.bandWord('militancy', 1), 'High');
  assert.equal(Model.bandWord('militancy', 5), 'Very high');
});

test('bandWord for loyalty matches the qdisplay at every boundary', () => {
  assert.equal(Model.bandWord('loyalty', 0), 'completely disloyal');
  assert.equal(Model.bandWord('loyalty', 0.06), 'completely disloyal');
  assert.equal(Model.bandWord('loyalty', 0.19), 'very disloyal');
  assert.equal(Model.bandWord('loyalty', 0.31), 'generally disloyal');
  assert.equal(Model.bandWord('loyalty', 0.41), 'mostly disloyal');
  assert.equal(Model.bandWord('loyalty', 0.54), 'divided');
  assert.equal(Model.bandWord('loyalty', 0.71), 'mostly loyal');
  assert.equal(Model.bandWord('loyalty', 0.95), 'generally loyal');
  assert.equal(Model.bandWord('loyalty', 1), 'completely loyal');
});

test('bandWord for coalition_dissent matches the qdisplay at every boundary', () => {
  assert.equal(Model.bandWord('coalition_dissent', 0), 'very low');
  assert.equal(Model.bandWord('coalition_dissent', 1), 'low');
  assert.equal(Model.bandWord('coalition_dissent', 2), 'medium');
  assert.equal(Model.bandWord('coalition_dissent', 3), 'high');
  assert.equal(Model.bandWord('coalition_dissent', 4), 'very high');
});

test('bandIndex returns the position of the matching band', () => {
  assert.equal(Model.bandIndex('strength', 0), 0);
  assert.equal(Model.bandIndex('strength', 100), 4);
});

test('monthsUntil counts months to the next election', () => {
  assert.equal(Model.monthsUntil(start1928), 4);
  assert.equal(Model.monthsUntil(gov1932), 47);
  assert.equal(Model.monthsUntil(crisis1930), 47);
});

test('monthsUntil is null without a next election', () => {
  assert.equal(Model.monthsUntil({ year: 1930, month: 1 }), null);
  assert.equal(Model.monthsUntil({ year: 1930, month: 1, next_election_year: 0 }), null);
});

test('MONTHS names all twelve months in order', () => {
  assert.equal(Model.MONTHS.length, 12);
  assert.equal(Model.MONTHS[0], 'January');
  assert.equal(Model.MONTHS[11], 'December');
});

test('symbolFile gives the SPD monogram before June 1932, the Three Arrows from then on', () => {
  assert.equal(Model.symbolFile('spd', 1932, 5), 'SPD_monogram_recreation.svg');
  assert.equal(Model.symbolFile('spd', 1932, 6), 'Iron_Front_flag_Three_Arrows.svg');
});

test('symbolFile gives each other party its fixed period emblem', () => {
  assert.equal(Model.symbolFile('kpd', 1930, 1), 'Kommunistische_Partei_Deutschlands_KPD_logo.svg');
  assert.equal(Model.symbolFile('z', 1930, 1), 'Zentrum_cross_shield_recreation.svg');
  assert.equal(Model.symbolFile('bvp', 1930, 1), 'Flag_of_Bavaria_lozengy.svg');
  assert.equal(Model.symbolFile('ddp', 1930, 1), 'DDP_tricolour_shield_recreation.svg');
  assert.equal(Model.symbolFile('dvp', 1930, 1), 'German_People_s_Party.svg');
  assert.equal(Model.symbolFile('dnvp', 1930, 1), 'DNVP_logo_basic.svg');
  assert.equal(Model.symbolFile('nsdap', 1930, 1), 'Flag_of_the_NSDAP_1920-1945.svg');
});

test('symbolFile returns null for parties with no period emblem', () => {
  assert.equal(Model.symbolFile('sapd', 1932, 8), null);
  assert.equal(Model.symbolFile('other', 1930, 1), null);
});

test('forceSymbol gives the Reichswehr its ensign before March 1933, the later one from then on', () => {
  assert.equal(Model.forceSymbol('reichswehr', 1933, 2), 'War_Ensign_of_Germany_1921-1933.svg');
  assert.equal(Model.forceSymbol('reichswehr', 1933, 3), 'War_Ensign_of_Germany_1933-1935.svg');
});

test('forceSymbol gives each other force its fixed emblem, and null for the interior police', () => {
  assert.equal(Model.forceSymbol('rb', 1930, 1), 'Vectorized_Reichsbanner_Logo.svg');
  assert.equal(Model.forceSymbol('rfb', 1930, 1), 'Roter_Frontkaempferbund.svg');
  assert.equal(Model.forceSymbol('sh', 1930, 1), 'Stahlhelm_logo.svg');
  assert.equal(Model.forceSymbol('sa', 1930, 1), 'SA-Logo.svg');
  assert.equal(Model.forceSymbol('prussian_police', 1930, 1), 'Fahne_Polizei_Preussen_1931.svg');
  assert.equal(Model.forceSymbol('interior_police', 1930, 1), null);
});

test('loading the model touches neither window nor document', () => {
  const modelPath = require.resolve('../../out/html/state-column/model.js');
  delete require.cache[modelPath];
  const touched = [];
  const trap = new Proxy({}, {
    get(target, prop) {
      touched.push(prop);
      return undefined;
    }
  });
  global.window = trap;
  global.document = trap;
  try {
    require(modelPath);
  } finally {
    delete global.window;
    delete global.document;
    delete require.cache[modelPath];
  }
  assert.deepEqual(touched, []);
});

test('the Popular Front leaves BVP out, as the game sum does', () => {
  const pf = Model.GOVERNMENTS.find((g) => g.flag === 'in_popular_front');
  assert.ok(!pf.parties.includes('bvp'));
  assert.ok(Model.GOVERNMENTS.find((g) => g.flag === 'in_grand_coalition').parties.includes('bvp'));
});

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test('roundShares sums to the total on the opening 1928 fractions', () => {
  const f = { spd: 28.78332833050769, kpd: 10.62048386486589, z: 16.470749950715184, ddp: 4.621982143911969,
    dvp: 9.299932268343465, dnvp: 15.431350690431742, nsdap: 3.363728612931164, other: 11.408444138292891 };
  for (const k in f) f[k] /= 100;
  const r = Model.roundShares(f, 100);
  assert.equal(sum(r), 100);
  assert.deepEqual(r, { spd: 29, kpd: 11, z: 17, ddp: 5, dvp: 9, dnvp: 15, nsdap: 3, other: 11 });
});

test('roundShares breaks a three-way tie toward the earlier id', () => {
  const t = 1 / 3;
  assert.deepEqual(Model.roundShares({ a: t, b: t, c: t }, 100), { a: 34, b: 33, c: 33 });
});

test('roundShares breaks a remainder tie toward the larger fraction', () => {
  // 0.125 and 0.375 of 4 leave the same remainder .5 and .5; the larger one wins the spare seat
  const r = Model.roundShares({ a: 0.125, b: 0.375, c: 0.5 }, 4);
  assert.deepEqual(r, { a: 0, b: 2, c: 2 });
});

test('roundShares copes with zeros and NaN', () => {
  assert.deepEqual(Model.roundShares({ a: 0, b: 0.5, c: 0, d: 0.5 }, 100), { a: 0, b: 50, c: 0, d: 50 });
  const r = Model.roundShares({ a: NaN, b: 0.25, c: 0.75 }, 100);
  assert.deepEqual(r, { a: 0, b: 25, c: 75 });
});

test('roundShares matches plain rounding whenever plain rounding already sums to the total', () => {
  const cases = [
    { a: 0.294, b: 0.206, c: 0.5 },
    { a: 0.4, b: 0.6 },
    { a: 0.016, b: 0.384, c: 0.6 },
    { a: 0.346, b: 0.343, c: 0.311 }
  ];
  for (const f of cases) {
    const plain = {};
    for (const k in f) plain[k] = Math.round(f[k] * 100);
    assert.equal(sum(plain), 100);
    assert.deepEqual(Model.roundShares(f, 100), plain);
  }
});
