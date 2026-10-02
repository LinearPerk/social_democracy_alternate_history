'use strict';

import { setTimeout as delay } from 'node:timers/promises';
import {
  clickFirst,
  elementExistsWithText,
  evaluate,
  hasSelector,
  waitAndClickByText,
  waitForCondition,
} from './driver.mjs';

// Keeps following "Continue" links until ul.hand exists, or gives up after
// timeoutMs. Today's build has no intermediate Continue screens after
// "Begin", so this returns as soon as ul.hand renders.
async function advanceToHand(page, { timeoutMs = 8000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await hasSelector(page, 'ul.hand')) return;
    if (await elementExistsWithText(page, '#content a', 'Continue')) {
      await waitAndClickByText(page, '#content a', 'Continue');
    } else if (Date.now() >= deadline) {
      throw new Error('ul.hand did not appear and no Continue link is present');
    } else {
      await delay(100);
    }
  }
}

// The state column's settings live behind buttons that state-column.js
// handles with one document-level click listener, so a click on the button
// element works even while the Options overlay is closed.
async function clickStateColumn(page, selector) {
  await waitForCondition(() => hasSelector(page, selector));
  await clickFirst(page, selector);
}

// Sets qualities and draws the hub again, the way arriving at it from
// another page would. #content is emptied first because going to the scene
// already showing appends a second copy. `stubDeck`, if given, is a deck id
// whose draws the engine should treat as empty (an unavailable deck).
async function redrawHub(page, qualities, stubDeck) {
  await evaluate(page, `(() => {
    const engine = window.dendryUI.dendryEngine;
    Object.assign(engine.state.qualities, ${JSON.stringify(qualities)});
    if (${JSON.stringify(stubDeck || null)}) {
      const draw = engine._drawFromDeck;
      engine._drawFromDeck = function (id) {
        return id === ${JSON.stringify(stubDeck || null)} ? null : draw.apply(this, arguments);
      };
    }
    document.getElementById('content').innerHTML = '';
    engine.goToScene('main');
    return true;
  })()`);
  await waitForCondition(() => hasSelector(page, 'ul.decks'));
}

async function reachHub(page, difficultyLabel) {
  await waitAndClickByText(page, '#content a', 'Start game');
  await waitAndClickByText(page, '#content a', difficultyLabel);
  await advanceToHand(page);
  // The state column saves its settings in localStorage, which outlives a
  // navigation, so an earlier check's tab or symbol choice would carry over.
  await clickStateColumn(page, '[data-sc-symbols="period"]');
  await clickStateColumn(page, '[data-sc-tab="party"]');
}

// The hub as a later month shows it: no opening narrative, so the depth column
// rests on its resting view (Polls, or Die Zeit in historical mode). The
// game's first hub (`hub`) carries January 1928's narrative as page depth
// instead, which takes the column. post_event is the scene every month
// starts from, so routing there gets a hub with just the date heading.
async function reachMonthHub(page, difficultyLabel) {
  await reachHub(page, difficultyLabel);
  await evaluate(page, `(() => { window.dendryUI.dendryEngine.goToScene('post_event'); return true; })()`);
  await waitForCondition(async () => !(await elementExistsWithText(page, '#content h1', '1928')));
  await advanceToHand(page);
}

// The presidential vote readouts: the engine is sent to the
// scene that prints the vote, with the qualities that decide who stands, and
// the page waits for the placeholder's rows. #content is emptied first for
// the same reason as in redrawHub. The 1932 votes skip the election
// algorithm and set each party's normalised share, so the result is the same
// on every run. Round 1: Braun runs with the Center behind him and the KPD
// behind Thälmann, and no one clears 50. `majority`: Braun does not run and
// the Nazis back Hindenburg, so he does. Round 2 goes on through the scene's
// own menu. 1934 runs the scene's own algorithm with Braun against Hitler,
// Seldte, Thälmann and Adenauer.
const SHARES_1932 = {
  spd_normalized: 0.25, kpd_normalized: 0.1, z_normalized: 0.14, ddp_normalized: 0.03,
  dvp_normalized: 0.04, dnvp_normalized: 0.12, nsdap_normalized: 0.27, other_normalized: 0.05,
  sapd_formed: 0, sapd_normalized: 0,
};

async function reachVoteReadout(page, state) {
  await reachHub(page, 'Normal');
  const go = async (scene, qualities) => {
    await evaluate(page, `(() => {
      const engine = window.dendryUI.dendryEngine;
      Object.assign(engine.state.qualities, ${JSON.stringify(qualities)});
      document.getElementById('content').innerHTML = '';
      engine.goToScene(${JSON.stringify(scene)});
      return true;
    })()`);
  };
  const rows = () => hasSelector(page, '#content .result-rows .rr-row');
  // Pressed through the page, as the election state does: a choice's link
  // text is built from the scene, which clickByText does not match.
  const pressLink = async (text) => {
    await waitForCondition(() => evaluate(page, `Array.from(document.querySelectorAll('#content a'))
      .some((a) => a.textContent.includes(${JSON.stringify(text)}))`));
    await evaluate(page, `(() => {
      Array.from(document.querySelectorAll('#content a'))
        .find((a) => a.textContent.includes(${JSON.stringify(text)})).click();
      return true;
    })()`);
  };
  if (state.startsWith('vote-1932')) {
    const own = state === 'vote-1932-majority'
      ? { braun_campaign: 0, spd_support_thalmann: 0, hitler_support_hindenburg: 1 }
      : { braun_campaign: 1, kpd_support_braun: 0, z_support_braun: 1, dvp_support_braun: 0, hitler_support_hindenburg: 0 };
    await go('presidential_election_1932.post_election',
      { ...SHARES_1932, ...own, nsdap_candidate: 'Hitler', election_round: 0, hindenburg_to_braun_bonus: 0, thalmann_to_braun_bonus: 0 });
    await waitForCondition(rows, { timeoutMs: 8000 });
    if (state === 'vote-1932-round2') {
      await pressLink('Let the second round voting begin');
      await waitForCondition(() => evaluate(page, `document.querySelectorAll('#content .result-rows').length === 2`),
        { timeoutMs: 8000 });
    }
    return;
  }
  await go('death_of_hindenburg_president', {});
  await go('death_of_hindenburg_president.round_1', {
    spd_candidate: 'Braun', kpd_candidate: 'Thälmann', z_candidate: 'Adenauer', ddp_candidate: 'Gessler',
    dvp_candidate: 'Gessler', dnvp_candidate: 'Seldte', other_candidate: 'Seldte', nsdap_candidate: 'Hitler',
    sapd_candidate: 'Thälmann', is_unity_candidate: 0,
  });
  await waitForCondition(rows, { timeoutMs: 8000 });
  if (state === 'vote-1934-round2') {
    await pressLink('Let the voting begin');
    await waitForCondition(() => evaluate(page, `document.querySelectorAll('#content .result-rows').length === 2`),
      { timeoutMs: 8000 });
  }
}

// Named game states the layout checks measure against. `title` is the page
// as loaded; the rest are reached by clicking through the game.
export async function reachState(page, state) {
  switch (state) {
    case 'title':
      return;
    case 'title-after-simulation':
      // The title page again, by way of the election simulation and its
      // Continue link: the engine arrives through two scenes on one page.
      for (const text of ['Election simulation', '1928 historical scenario', 'Continue']) {
        await waitForCondition(() => evaluate(page, `Array.from(document.querySelectorAll('#content a')).some((a) => a.textContent.includes(${JSON.stringify(text)}))`));
        await evaluate(page, `(() => { Array.from(document.querySelectorAll('#content a')).find((a) => a.textContent.includes(${JSON.stringify(text)})).click(); return true; })()`);
      }
      await waitForCondition(() => evaluate(page, `Array.from(document.querySelectorAll('#content a')).some((a) => a.textContent.includes('Start game'))`));
      return;
    case 'start':
      // The page after "Start game": the title page's epigraph and difficulty
      // table, before a game is under way.
      await waitAndClickByText(page, '#content a', 'Start game');
      // The difficulty menu is a table once choice-tables.json has loaded, a
      // moment after the page does; wait for it so a check never sees the
      // plain list. If the file never loads, go on: checks/start-table.mjs
      // reports the missing table, and the others still see a page.
      await waitForCondition(() => hasSelector(page, 'table.choice-table')).catch(() => {});
      return;
    case 'hub':
      await reachHub(page, 'Normal');
      return;
    case 'hub-month':
      await reachMonthHub(page, 'Normal');
      return;
    case 'hub-easy':
      await reachHub(page, 'Easy');
      return;
    case 'hub-badges':
      await reachHub(page, 'Normal');
      await clickStateColumn(page, '[data-sc-symbols="badges"]');
      return;
    case 'hub-government':
      await reachHub(page, 'Normal');
      // The game starts in opposition; the flags a Grand Coalition sets are
      // written straight into the qualities and the column re-rendered.
      await evaluate(page, `(() => {
        Object.assign(window.dendryUI.dendryEngine.state.qualities, { spd_in_government: 1, in_grand_coalition: 1 });
        window.updateSidebar();
        return true;
      })()`);
      return;
    case 'hub-black-thursday':
      await reachHub(page, 'Normal');
      // The Center's relation is dropped, the month advanced (which starts a
      // new change baseline at that low), and the relation raised again, so
      // its ledger row shows the longest band word beside a two-arrow pill.
      await evaluate(page, `(() => {
        const q = window.dendryUI.dendryEngine.state.qualities;
        Object.assign(q, { black_thursday_seen: 1, unemployed: 12.3, z_relation: 40 });
        q.month = Number(q.month) % 12 + 1;
        window.updateSidebar();
        q.z_relation = 95;
        window.updateSidebar();
        return true;
      })()`);
      return;
    case 'hub-state':
      await reachHub(page, 'Normal');
      await clickStateColumn(page, '[data-sc-tab="state"]');
      return;
    case 'hub-state-government':
      // The Grand Coalition, as hub-government sets it, with the State tab
      // open: the budget and one coalition row appear.
      await reachHub(page, 'Normal');
      await evaluate(page, `(() => {
        Object.assign(window.dendryUI.dendryEngine.state.qualities, { spd_in_government: 1, in_grand_coalition: 1 });
        window.updateSidebar();
        return true;
      })()`);
      await clickStateColumn(page, '[data-sc-tab="state"]');
      return;
    case 'hub-state-full': {
      // The tallest State tab: the budget shown, a Popular Front (both
      // coalition rows), and June 1930 with 30 months of history behind it.
      await reachHub(page, 'Normal');
      const history = [];
      for (let i = 0; i < 29; i++) {
        const t = 1928 * 12 + i;
        history.push({
          year: Math.floor(t / 12), month: (t % 12) + 1,
          inflation: Math.round((2.9 - i * 0.12) * 10) / 10,
          growth: Math.round((4.4 - i * 0.2) * 10) / 10,
          unemployed: Math.round((8.6 + i * 0.4) * 10) / 10,
          budget: 4 - Math.floor(i / 8),
        });
      }
      await evaluate(page, `(() => {
        Object.assign(window.dendryUI.dendryEngine.state.qualities, {
          spd_in_government: 1, in_popular_front: 1, black_thursday_seen: 1,
          coalition_dissent: 2, kpd_coalition_dissent: 3, unemployed: 20.1,
          inflation: -0.3, economic_growth: -2.4, budget: 1,
          year: 1930, month: 6, next_election_year: 1930, next_election_month: 9,
          sc_history: ${JSON.stringify(JSON.stringify(history))},
        });
        window.updateSidebar();
        return true;
      })()`);
      await clickStateColumn(page, '[data-sc-tab="state"]');
      return;
    }
    case 'hub-govt-empty':
      // From June the Government Affairs deck is drawn; with nothing to draw
      // it is present but unavailable, and the SPD is still in opposition.
      await reachHub(page, 'Normal');
      await redrawHub(page, { time: 6, spd_in_government: 0 }, 'main.govt');
      return;
    case 'hub-govt-empty-government':
      await reachHub(page, 'Normal');
      await redrawHub(page, { time: 6, spd_in_government: 1, in_grand_coalition: 1 }, 'main.govt');
      return;
    case 'hub-factions':
      // One advisor from each faction, and a non-factional one, in place of
      // the three the game starts with (all centrist).
      await reachHub(page, 'Normal');
      await redrawHub(page, {
        wels_advisor: 0, muller_advisor: 0, hilferding_advisor: 0,
        levi_advisor: 1, leipart_advisor: 1, severing_advisor: 1,
        mierendorff_advisor: 1, baade_advisor: 1, advisor_action_timer: 3,
      });
      return;
    case 'party-varied':
      // Neorevisionists present and every dissent band in play: Left at the
      // top of the scale, Labor high, Reformists medium, Center and
      // Neorevisionists low. Strengths reach the far end of the 0-50 scale.
      await reachHub(page, 'Normal');
      await redrawHub(page, {
        neorevisionism: 1,
        left_strength: 44, center_strength: 22, labor_strength: 16, reformist_strength: 12, neorevisionist_strength: 6,
        left_dissent: 58, center_dissent: 6, labor_dissent: 36, reformist_dissent: 22, neorevisionist_dissent: 12,
      });
      return;
    case 'hub-defense':
      await reachHub(page, 'Normal');
      await clickStateColumn(page, '[data-sc-tab="defense"]');
      return;
    case 'hub-defense-entry':
    case 'hub-defense-entry-back':
    case 'hub-defense-reichswehr':
    case 'hub-defense-reichswehr-badges': {
      // A later month's hub, so the column rests on Polls and Back has a
      // resting view to return to (the first hub carries page depth).
      await reachMonthHub(page, 'Normal');
      if (state.endsWith('-badges')) await clickStateColumn(page, '[data-sc-symbols="badges"]');
      await clickStateColumn(page, '[data-sc-tab="defense"]');
      const id = state.startsWith('hub-defense-reichswehr') ? 'reichswehr' : 'sa';
      await clickStateColumn(page, `[data-depth-entry="defense:${id}"]`);
      await waitForCondition(() => hasSelector(page, '#depth_column .dc-entry'));
      if (state === 'hub-defense-entry-back') {
        await clickStateColumn(page, '#depth-bar [data-dc-back]');
        await waitForCondition(async () => !(await hasSelector(page, '#depth_column .dc-entry')));
      }
      return;
    }
    case 'reichstag-entry':
    case 'reichstag-picked':
    case 'reichstag-government':
    case 'reichstag-back': {
      // The Reichstag entry, opened by a click on the seat chart at a later
      // month's hub. -government seats the SPD in a Weimar Coalition first, so
      // the entry marks it current. -picked lights the Weimar Coalition;
      // -back then presses Back.
      await reachMonthHub(page, 'Normal');
      if (state === 'reichstag-government') {
        await evaluate(page, `(() => {
          Object.assign(window.dendryUI.dendryEngine.state.qualities, { spd_in_government: 1, in_weimar_coalition: 1 });
          window.updateSidebar();
          return true;
        })()`);
      }
      // The hemicycle is an SVG, which has no click(): dispatch the event.
      await waitForCondition(() => hasSelector(page, '#state-column [data-sc-chart] .sc-hemi'));
      await evaluate(page, `(() => {
        document.querySelector('#state-column [data-sc-chart] .sc-hemi').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      })()`);
      await waitForCondition(() => hasSelector(page, '#depth_column .rs-entry'));
      if (state === 'reichstag-picked' || state === 'reichstag-back') {
        await clickStateColumn(page, '#depth_column [data-rs-coalition="weimar"]');
        await waitForCondition(() => hasSelector(page, '#depth_column .rs-row.on'));
      }
      if (state === 'reichstag-back') {
        await clickStateColumn(page, '#depth-bar [data-dc-back]');
        await waitForCondition(async () => !(await hasSelector(page, '#depth_column .rs-entry')));
      }
      return;
    }
    case 'hub-defense-badges':
      await reachHub(page, 'Normal');
      await clickStateColumn(page, '[data-sc-symbols="badges"]');
      await clickStateColumn(page, '[data-sc-tab="defense"]');
      return;
    case 'election': {
      // The Reichstag election's results page: the 1928 election run from the
      // hub, with "May we do our best..." pressed. #content is emptied first
      // because going to a scene already showing appends a second copy. The
      // link is pressed through the page, not clickByText, which does not
      // match its text (the link is built from the scene's title).
      await reachHub(page, 'Normal');
      await evaluate(page, `(() => {
        window.__ledgerBefore = {};
        document.querySelectorAll('#state-column .sc-ledger').forEach((row) => {
          const n = parseInt(row.querySelector('.st').textContent, 10);
          window.__ledgerBefore[row.getAttribute('data-sc-party')] = isNaN(n) ? 0 : n;
        });
        return true;
      })()`);
      await evaluate(page, `(() => {
        document.getElementById('content').innerHTML = '';
        window.dendryUI.dendryEngine.goToScene('election_1928');
        return true;
      })()`);
      await waitForCondition(() => evaluate(page, `Array.from(document.querySelectorAll('#content a'))
        .some((a) => a.textContent.includes('May we do our best'))`));
      await evaluate(page, `(() => {
        const link = Array.from(document.querySelectorAll('#content a'))
          .find((a) => a.textContent.includes('May we do our best'));
        link.click();
        return true;
      })()`);
      await waitForCondition(() => hasSelector(page, '#content .result-rows'), { timeoutMs: 8000 });
      // The rows are drawn by a decoration pass just after the text appears.
      await waitForCondition(() => hasSelector(page, '#content .result-rows .rr-row'), { timeoutMs: 8000 });
      return;
    }
    case 'hub-historical':
    case 'hub-historical-polls':
      // A later month's hub: Die Zeit is the column's resting view here, and
      // fills it once the-times.json has loaded.
      await reachMonthHub(page, 'Historical');
      await waitForCondition(() => hasSelector(page, '#depth_column .dc-times-mast'));
      if (state === 'hub-historical-polls') {
        await clickStateColumn(page, '#depth-bar [data-dc-pick="polls"]');
      }
      return;
    case 'card':
      await reachHub(page, 'Normal');
      // The hand starts empty (blank-card placeholders); the deck fills a
      // slot when clicked. Reaching a card page needs that draw first.
      if (!(await hasSelector(page, 'li.card-in-hand a.card'))) {
        await clickFirst(page, 'li.deck a.card');
        await waitForCondition(() => hasSelector(page, 'li.card-in-hand a.card'));
      }
      await clickFirst(page, 'li.card-in-hand a.card');
      return;
    case 'card-depth':
      // A card whose page carries depth (response_to_antisemitism), opened
      // through the engine as a click on it would, so the column holds a real
      // page view beside a real card page.
      await reachMonthHub(page, 'Normal');
      await evaluate(page, `(() => { window.dendryUI.dendryEngine.playCard('response_to_antisemitism'); return true; })()`);
      await waitForCondition(() => evaluate(page, `!!document.querySelector('#depth_column[data-view="page"] .dc-body p')`));
      return;
    case 'election-night': {
      // The results page of an election held at the first hub, which takes the
      // depth column. The engine's own scene change stands in for the clicks
      // that lead to an election; the link is clicked as a player would. The
      // seats fade in over about 700 ms, so the state waits it out.
      await reachHub(page, 'Normal');
      await evaluate(page, `(() => {
        window.__ledgerBefore = {};
        document.querySelectorAll('#state-column .sc-ledger').forEach((row) => {
          const n = parseInt(row.querySelector('.st').textContent, 10);
          window.__ledgerBefore[row.getAttribute('data-sc-party')] = isNaN(n) ? 0 : n;
        });
        return true;
      })()`);
      await evaluate(page, `(() => {
        document.getElementById('content').innerHTML = '';
        window.dendryUI.dendryEngine.goToScene('election_1928');
        return true;
      })()`);
      // The driver's text matchers do not find this link, so both the wait and
      // the click read the page's links directly.
      await waitForCondition(() => evaluate(page, `Array.from(document.querySelectorAll('#content a'))
        .some((a) => a.textContent.includes('May we do our best'))`));
      await evaluate(page, `(() => {
        Array.from(document.querySelectorAll('#content a'))
          .find((a) => a.textContent.includes('May we do our best')).click();
        return true;
      })()`);
      await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
      await delay(900);
      return;
    }
    case 'view-entry-term':
      // A term entry opened from the Party tab's own span, on a later month's
      // hub so Back has the resting view to return to.
      await reachMonthHub(page, 'Normal');
      await clickStateColumn(page, '#state-column [data-depth-term="party-resources"]');
      await waitForCondition(() => hasSelector(page, '#depth_column[data-view="entry"] .dc-body p'));
      return;
    case 'view-entry-party':
      await reachMonthHub(page, 'Normal');
      await clickStateColumn(page, '[data-sc-party="z"] .nm');
      await waitForCondition(() => hasSelector(page, '#depth_column[data-view="entry"] .dc-body p'));
      return;
    case 'view-entry-advisor':
      // An advisor's bio opened from a hire menu by clicking the name: the
      // player's route, through Shuffle leadership, removing the three
      // starting advisors first so the menu offers someone.
      await reachMonthHub(page, 'Normal');
      await evaluate(page, `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const engine = window.dendryUI.dendryEngine;
        const choices = () => Array.from(document.querySelectorAll('#content ul.choices li a'));
        const click = (text) => {
          const a = choices().find((e) => e.textContent.trim().startsWith(text));
          if (!a) throw new Error('no choice starting "' + text + '"');
          a.click();
        };
        engine.goToScene('shuffle_leadership');
        await wait(200);
        while (choices().some((e) => e.textContent.startsWith('Remove '))) { click('Remove '); await wait(150); }
        click('Add advisors');
        await wait(200);
        click('Add Centrists');
        await wait(200);
        document.querySelector('#content [data-depth-advisor]').click();
        return true;
      })()`);
      await waitForCondition(() => hasSelector(page, '#depth_column[data-view="entry"] .dc-body p'));
      return;
    case 'view-library-home':
      await reachMonthHub(page, 'Normal');
      await clickStateColumn(page, '#depth-bar [data-dc-pick="library"]');
      await waitForCondition(() => hasSelector(page, '#depth_column .dc-menu a'));
      return;
    case 'library-charts':
      await reachHub(page, 'Normal');
      // Upstream's route, whatever the width: showStats opens the column's
      // Library where the column is on screen, and these charts draw in the
      // main column.
      await evaluate(page, `(() => { window.dendryUI.dendryEngine.goToScene('library'); return true; })()`);
      await waitAndClickByText(page, '#content a', 'Figures and charts');
      return;
    case 'library-link':
      await reachHub(page, 'Normal');
      await clickFirst(page, '#stats-link');
      return;
    case 'library-link-from-section':
      // A section open in the column first, so the link's effect (the
      // Library home) shows against it.
      await reachHub(page, 'Normal');
      await evaluate(
        page,
        `(() => { window.DepthColumn.show({kind: 'library', key: 'library.government', title: 'Section'}); return true; })()`
      );
      await clickFirst(page, '#stats-link');
      return;
    case 'library-section':
      await reachMonthHub(page, 'Normal');
      await clickStateColumn(page, '#depth-bar [data-dc-pick="library"]');
      await waitAndClickByText(page, '#depth_column .dc-menu a', 'Current government details');
      return;
    case 'vote-1932-round1':
    case 'vote-1932-majority':
    case 'vote-1932-round2':
    case 'vote-1934-round1':
    case 'vote-1934-round2':
      await reachVoteReadout(page, state);
      return;
    default:
      throw new Error(`unknown state: ${state}`);
  }
}
