// 88x31 front page: accounts, daily pull, player pages, guestbooks, save codes.
const $ = (id) => document.getElementById(id);
// Let code pass "maybe" pieces (null/undefined/false) to append() without them printing as text.
{
  const orig = Element.prototype.append;
  Element.prototype.append = function (...kids) { return orig.apply(this, kids.filter((k) => k != null && k !== false)); };
}
const say = (text) => ($("msg").textContent = text || "");
const TOP = ["loading", "out", "in", "code-card", "about", "check", "wall"];
const showTop = (id) => {
  TOP.forEach((s) => ($(s).hidden = s !== id));
  $("top-nav").hidden = id === "code-card"; // one-line menu at the very top (members get more links)
  document.querySelectorAll(".only-in").forEach((x) => (x.hidden = !me));
  document.querySelectorAll(".only-out").forEach((x) => (x.hidden = !!me));
  $("dash").hidden = true; // the "Hi!" box only shows on your own page (showPage turns it on)
};
// "Buttons you can collect": a random handful of buttons the viewer may see, found ones mixed in,
// and a few [ ? ] tiles standing in for the rare stuff. Repeated once so the scroll loops.
async function fillStrip() {
  try {
    const { designs } = await api("/api/designs");
    const seen = designs.filter((d) => !d.hidden), mystery = designs.filter((d) => d.hidden);
    for (let i = seen.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seen[i], seen[j]] = [seen[j], seen[i]]; }
    const picks = seen.slice(0, 16).map((d) => el("img", { src: d.image_key, alt: "", width: 88, height: 31 }));
    for (let k = 0; k < Math.min(3, mystery.length); k++) picks.splice(Math.floor(Math.random() * (picks.length + 1)), 0, el("span", { class: "mystery-tile strip-q" }, "?"));
    const track = $("strip-track");
    track.textContent = "";
    track.append(...picks, ...picks.map((x) => x.cloneNode(true)));
  } catch {}
}

// Logged-out front page: join / log in boxes, with the Wall of Buttons right below them.
function showFront() {
  showTop("out");
  $("wall").hidden = false;
  renderFreePack();
}
const VIEWS = ["view-page", "view-banner", "view-codes", "view-trades", "view-pack"];
const showView = (id) => VIEWS.forEach((v) => ($(v).hidden = v !== id));

// Tiny element builder. Text always goes in as text, never as HTML.
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : String(k));
  return e;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

const fmtDate = (t) => new Date(t * 1000).toLocaleDateString();
// date + time, for the ledger (e.g. "10/11/2026, 9:52:13 PM")
const fmtStamp = (t) => new Date(t * 1000).toLocaleString();

// In-game "are you sure?" window instead of the browser's popup. Resolves true/false.
function ask(text, { ok = "OK", cancel = "Cancel", pic = null, input = null } = {}) {
  return new Promise((resolve) => {
    $("dialog-text").textContent = text;
    const box = $("dialog-input");
    box.hidden = input === null;
    box.value = input ?? "";
    const p = $("dialog-pic"); p.textContent = ""; if (pic) p.append(pic);
    $("dialog-ok").textContent = ok; $("dialog-cancel").textContent = cancel;
    $("dialog").hidden = false;
    (input === null ? $("dialog-ok") : box).focus();
    const done = (v) => {
      $("dialog").hidden = true;
      $("dialog-ok").onclick = $("dialog-cancel").onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === "Escape") done(input === null ? false : null);
      else if (e.key === "Enter" && input !== null) done(box.value);
    };
    document.addEventListener("keydown", onKey);
    $("dialog-ok").onclick = () => done(input === null ? true : box.value);
    $("dialog-cancel").onclick = () => done(input === null ? false : null);
  });
}
// Same window with a text box: resolves to the text, or null if cancelled.
const askText = (text, initial = "", opts = {}) => ask(text, { ...opts, input: initial });
function ago(t) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t);
  if (s < 120) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
  if (s < 7200) return "an hour ago";
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  return Math.floor(s / 86400) === 1 ? "yesterday" : `${Math.floor(s / 86400)} days ago`;
}
const edition = (b) => `#${b.edition}${b.max_editions ? " of " + b.max_editions : ""}`;
const HOW = {
  welcome: "welcome pack", daily: "daily pull", pass_on: "passed on", guestbook: "guestbook gift",
  trade: "trade", gift: "gift", fusion: "fusion", starter: "starter", admin: "admin", set_reward: "set reward", found: "found & added", pack: "opened from a sealed pack", free_pack: "free pack", request: "request filled", open_trade: "open trade",
};

// ---------- foils, patterns, effects ----------
// Every copy has a foil (its material), maybe a pattern (how a real foil's shine is cut) and maybe an
// effect (how the whole button plays on screen). The kinds come from /api/foils; the site draws the
// ones listed in DRAWN, and anything else shows plain for now.
let FOILS = {};
const DRAWN = new Set(["glitter", "sheen", "holo", "galaxy", "ripple", "chrome", "gold", "oil-slick", "prismatic",
  "double-rainbow", "liquid-metal", "fracture", "etched", "surge", "dialup", "marquee", "crt", "vhs", "crt-vhs",
  "phosphor", "scanline"]);
async function loadFoils() {
  try { const r = await api("/api/foils"); FOILS = Object.fromEntries(r.foils.map((f) => [f.id, f])); } catch {}
}
const foilName = (id) => (FOILS[id] && FOILS[id].name) || id;
const tierOf = (id) => (FOILS[id] && FOILS[id].tier) || 0;
const drawn = (id) => FOILS[id] && DRAWN.has(FOILS[id].effect) ? FOILS[id].effect : null;
// "VHS Fracture Holo", "Glitter", "Clear", or null for a First Print
// A plain foil is called "None"; next to an effect it's just left out ("VHS", not "VHS None").
function finishName(b) {
  if (!b.foil) return null;
  const foil = b.foil === "clear" ? (b.effect ? null : "None") : foilName(b.foil);
  return [b.effect && foilName(b.effect), b.pattern && foilName(b.pattern), foil].filter(Boolean).join(" ");
}

function bannerImg(design, scale = 1) {
  const fin = finishName(design);
  const img = el("img", {
    src: design.image_key, alt: design.name, width: 88 * scale, height: 31 * scale,
    class: "banner rarity-" + design.rarity,
    title: `${design.name} (${design.rarity}${fin && fin !== "None" ? ", " + fin : ""})`,
  });
  const foil = design.foil && drawn(design.foil), pat = design.pattern && drawn(design.pattern), fx = design.effect && drawn(design.effect);
  if (!foil && !fx) return img;
  // each copy shimmers a little differently, seeded from its own number
  const seed = Number(design.foil_seed) || 0;
  const vars = `--foil-angle:${seed % 360}deg;--foil-delay:-${seed % 7000}ms;--w:${88 * scale + 4}px;--h:${31 * scale + 4}px`;
  const layer = () => el("span", { class: ["foil-wrap", foil && "foil-" + foil, pat && "pat-" + pat].filter(Boolean).join(" "), style: vars }, img.cloneNode());
  if (!fx) return layer();
  // the effect plays on the foiled button as one picture
  const cls = "fx " + (fx === "crt-vhs" ? "fx-crt fx-vhs" : "fx-" + fx);
  if (fx === "marquee") return el("span", { class: cls, style: vars, title: img.title }, el("span", { class: "fx-track" }, layer(), layer()));
  return el("span", { class: cls, style: vars, title: img.title }, layer());
}

// "First Print" = made before foils existed; otherwise the copy's finish.
const TIER_LABEL = ["", "foil", "metal foil", "showpiece foil"];
function foilLine(b, entry) {
  if (b.foil === undefined) return null;
  if (!b.foil) return el("p", { class: "first-print" }, "★ First Print ★ ", el("span", { class: "small" }, "made before foils existed"));
  const t = tierOf(b.foil);
  return el("p", {}, "Finish: ", el("b", {}, finishName(b)),
    t ? el("span", { class: "small" }, ` · tier ${t} ${TIER_LABEL[t]}`) : null,
    entry ? el("span", { class: "hash small", title: entry.hash }, ` [ledger #${entry.id} · ${entry.hash.slice(0, 12)}…]`) : null);
}

// Where the art came from: the cLuB's own, or found in the wild and shown as found.
function tierNote(d, webmaster) {
  if (d.tier !== "archive") return null;
  return el("div", { class: "archive-note small" },
    el("p", {}, el("b", {}, "From the archive. "), "Found in the wild and shown here as found, credited where we know who made it. Not relicensed."),
    d.found_by ? el("p", {}, "Found by ", el("a", { href: "#u/" + encodeURIComponent(d.found_by) }, d.found_by)) : null,
    el("p", {}, "Is this yours? ", webmaster
      ? el("a", { href: "#u/" + encodeURIComponent(webmaster) }, `Sign ${webmaster}'s guestbook`) : "Tell the webmaster",
      " to get credited or have it taken down."));
}

// Webmaster-only box: remove/restore a design, block whoever found it.
function adminBox(designId, name, status, finder, after) {
  if (!me || !me.is_admin) return null;
  const run = async (body, msg) => {
    try { const r = await api("/api/admin", { method: "POST", body }); say(msg + (r.removed ? ` (${r.removed} removed)` : "")); wallLoaded = false; after(); }
    catch (e) { say(e.message); }
  };
  const box = el("div", { class: "admin-box" }, el("p", { class: "small" }, el("b", {}, "☠ Webmaster")));
  if (status === "removed") {
    box.append(el("button", { type: "button", onclick: async () => {
      if (await ask(`Bring back "${name}"? It goes back into play.`, { ok: "Restore" })) run({ action: "restore_design", design_id: designId }, "Restored.");
    } }, "Restore button"));
  } else {
    box.append(el("button", { type: "button", onclick: async () => {
      const note = await askText(`Remove "${name}"? It leaves packs now and every copy shows "removed by request". Owners keep their copies.\n\nReason (optional, goes on the ledger):`, "", { ok: "Remove it" });
      if (note !== null) run({ action: "remove_design", design_id: designId, note }, "Removed.");
    } }, "Remove button"));
  }
  if (finder) {
    box.append(" ", el("button", { type: "button", onclick: async () => {
      const note = await askText(`Block ${finder} from adding buttons? Type "all" to also remove everything they've added.`, "", { ok: "Block", cancel: "Cancel" });
      if (note !== null) run({ action: "block_uploader", name: finder, remove_uploads: note.trim().toLowerCase() === "all", note: note.trim().toLowerCase() === "all" ? null : note }, `Blocked ${finder}.`);
    } }, `Block ${finder}`), " ", el("button", { type: "button", onclick: () => run({ action: "unblock_uploader", name: finder }, `Unblocked ${finder}.`) }, "Unblock"));
  }
  return box;
}

const GIFTY = ["pass_on", "guestbook", "trade", "gift", "open_trade", "request"]; // reasons that always have a giver

let me = null;

// ---------- routing ----------

async function route() {
  say("");
  setPageMode();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === "about") {
    showTop("about");
    return showAbout().catch((e) => say(e.message));
  }
  if (hash === "check") { showTop("check"); return; }
  if (hash === "wall" || hash.startsWith("wall/")) {
    if (!me) { showFront(); return showWall(hash.slice(5)).catch((e) => say(e.message)); }
    showTop("wall");
    return showWall(hash.slice(5)).catch((e) => say(e.message));
  }
  // Player pages and button pages are public: anyone can look, members can interact.
  if (!me && (hash.startsWith("u/") || hash.startsWith("banner/") || hash.startsWith("pack/"))) {
    showTop("in");
    try { return hash.startsWith("u/") ? await showPage(hash.slice(2)) : hash.startsWith("pack/") ? await showPack(hash.slice(5)) : await showBanner(hash.slice(7)); }
    catch (e) { say(e.message); return; }
  }
  if (!me) { showFront(); return showWall().catch((e) => say(e.message)); }
  showTop("in");
  if (!hash || hash === "u/" + me.name) loadSummary(); // refresh the dashboard when coming back home
  try {
    if (hash.startsWith("u/")) return await showPage(hash.slice(2));
    if (hash.startsWith("banner/")) return await showBanner(hash.slice(7));
    if (hash.startsWith("pack/")) return await showPack(hash.slice(5));
    if (hash === "codes") return await showCodes();
    if (hash === "trades") return await showTrades();
    if (hash === "pull") { location.replace("#u/" + encodeURIComponent(me.name)); return; } // daily packs live on your page now
    return await showPage(me.name); // your guestbook is home
  } catch (e) { say(e.message); }
}
window.addEventListener("hashchange", (e) => {
  // Clicking around the Wall of Buttons only fills in the info box: no jump, no redraw.
  const was = decodeURIComponent(new URL(e.oldURL).hash.slice(1)), now = decodeURIComponent(location.hash.slice(1));
  // (logged out, the Wall is on the front page, so clicks there count as "on the Wall" too)
  const onWall = /^wall(\/|$)/.test(was) || (!me && !/^(about|check|u\/|banner\/)/.test(was));
  if (onWall && /^wall\/\d+(\/c\/\d+)?$/.test(now) && wallLoaded) { openWallHash(now.slice(5)).catch((err) => say(err.message)); return; }
  if (onWall && now === "wall" && wallLoaded) { closeInfo(); return; }
  window.scrollTo(0, 0); route();
});

// Player pages are pared down: no marquee, ticker, button strip, counter or webring,
// and the "Welcome 2 X's Page" title sits between the rainbow bars.
function setPageMode() {
  // pared-down look for public views of a page: logged out, or someone else's page
  const m = /^#u\/(.+)$/.exec(location.hash);
  const name = m ? decodeURIComponent(m[1]).toLowerCase() : null;
  document.body.classList.toggle("on-page", !!name && (!me || name !== me.name.toLowerCase()));
}
window.addEventListener("hashchange", setPageMode);

async function refresh() {
  wallLoaded = false;
  const [{ user, trades_waiting }] = await Promise.all([api("/api/me"), loadFoils()]);
  fillStrip();
  me = user;
  setUploadMode();
  if (!me) return route();
  setTradeCount(trades_waiting || 0);
  loadSummary();
  $("who").textContent = me.name;
  const short = me.name.length > 16 ? me.name.slice(0, 15) + "…" : me.name;
  document.querySelectorAll(".my-page-name").forEach((a) => { a.textContent = `${short}'s Page`; a.title = `${me.name}'s Page`; });
  setupGivePacks();
  document.querySelectorAll(".my-page-link").forEach((a) => (a.href = "#u/" + encodeURIComponent(me.name)));
  loadPlayers();
  await route();
}

// ---------- daily pull ----------

// Today's daily pack, opened inside the Packs section on your page (keep 1, pass one on if you like).
async function showPull() {
  const box = $("pack-open");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  box.textContent = "Loading...";
  const pull = await api("/api/pull");
  const o = pull.odds;
  $("pull-odds").textContent = `Odds for each button: common ${o.common}% · uncommon ${o.uncommon}% · rare ${o.rare}% · ULTRA ${o.ultra}%. Rares are limited editions, and every ultra is one of a kind. About 1 in ${Math.round(1 / pull.bonus_chance)} packs has a BONUS PACK card.`;
  box.textContent = "";
  if (pull.bonus_pack) box.append(el("p", { class: "center bonus-head" }, el("b", {}, "★ BONUS PACK! ★")));
  else if (pull.pulls_per_day > 1) box.append(el("p", { class: "center" }, el("b", {}, `Pack ${pull.pull_number} of ${pull.pulls_per_day} today`)));

  if (pull.status === "done") { box.textContent = ""; loadPacksPanel(true); return; } // all used up today
  let keep = null;
  const giftBox = el("div", { class: "gift-choices" });
  const toInput = el("input", { name: "to", placeholder: "friend's name", autocomplete: "off", list: "player-names" });
  const toRow = el("label", { class: "to-row" }, "Send it to: ", toInput);
  const giftChoice = () => (giftBox.querySelector("input:checked") || {}).value || "";

  const cards = pull.options.map((d, i) => card(d, i, pull, () => {
    keep = i;
    cards.forEach((c, j) => c.classList.toggle("chosen", j === i));
    // Radio choices: skip, or gift one of the two you didn't keep.
    giftBox.textContent = "";
    const keptName = d && !d.bonus ? d.name : "it";
    // The button says exactly what will happen.
    const updateBtn = () => {
      const g = giftChoice();
      keepBtn.textContent = g === "" ? `Keep ${keptName}!` : `Keep ${keptName} & send the gift!`;
    };
    const radio = (value, ...label) => {
      const input = el("input", { type: "radio", name: "gift", value });
      input.onchange = () => { toRow.hidden = giftChoice() === ""; updateBtn(); };
      return el("label", { class: "radio" }, input, ...label);
    };
    pull.options.forEach((d2, j) => {
      if (j !== i && d2 && !d2.bonus) giftBox.append(radio(String(j), "Gift ", bannerImg(d2), " ", el("b", {}, d2.name)));
    });
    giftBox.append(radio("", "No thanks, let the other two go"));
    giftBox.querySelector('input[value=""]').checked = true;
    toRow.hidden = true;
    // taking the bonus pack: no gifting, just open the new pack
    const isBonus = !!(pull.options[i] && pull.options[i].bonus);
    giftHead.hidden = giftBox.hidden = isBonus;
    if (isBonus) keepBtn.textContent = "Open the bonus pack!"; else updateBtn();
    form.hidden = false;
  }));
  box.append(el("div", { class: "pull-row" }, cards));
  box.append(el("p", { class: "center small" }, "Click the one you want to keep."));

  const giftHead = el("p", {}, el("b", {}, "Gift one of the other two to a friend?"));
  const keepBtn = el("button", {}, "Keep it!");
  const form = el("form", { class: "pull-form" }, giftHead, giftBox, toRow, el("p", { class: "center" }, keepBtn));
  form.hidden = true;
  form.onsubmit = async (e) => {
    e.preventDefault();
    say("");
    const pass = giftChoice();
    if (pass !== "" && !toInput.value.trim()) return say("Type who to send it to, or choose \"No thanks\".");
    try {
      const takingBonus = !!(pull.options[keep] && pull.options[keep].bonus);
      const r = await api("/api/pull", { method: "POST", body: { keep, pass: takingBonus || pass === "" ? null : Number(pass), to: toInput.value } });
      if (r.bonus) { say("★ BONUS PACK! ★ Here's a fresh one!"); return await showPull(); }
      loadSummary();
      say(pass !== "" && !r.passed ? "Kept! (The one you gifted sold out, sorry.)" : pass !== "" ? "Kept, and your gift is on its way!" : "Added to your collection!");
      box.textContent = "";
      afterOpening();
    } catch (err) { say(err.message); }
  };
  box.append(form);
}

function card(d, i, pull, onPick) {
  if (!d) return el("div", { class: "card" }, "(gone)");
  if (d.bonus) {
    const c = el("div", { class: "card bonus-card" + (pull.kept_index === i ? " chosen" : "") },
      el("b", { class: "bonus-star" }, "★"), el("b", {}, "BONUS PACK!"),
      el("span", { class: "small" }, "Take this instead of a button and open a fresh pack right now."));
    if (onPick) { c.tabIndex = 0; c.onclick = onPick; c.onkeydown = (e) => { if (e.key === "Enter") onPick(); }; c.classList.add("pickable"); }
    return c;
  }
  const left = d.max_editions ? `${Math.max(0, d.max_editions - d.minted)} of ${d.max_editions} left` : "";
  const c = el("div", { class: "card rarity-" + d.rarity + (pull.kept_index === i ? " chosen" : "") },
    bannerImg(d, 2), el("b", {}, d.name), el("span", { class: "small" }, `${d.rarity} · ${d.type}`),
    left ? el("span", { class: "small" }, left) : null,
    // a finish already rolled (special packs show theirs before you choose)
    d.foil && d.foil !== "clear" ? el("span", { class: "small card-finish" }, "✦ " + finishName(d)) : null);
  if (onPick) { c.tabIndex = 0; c.onclick = onPick; c.onkeydown = (e) => { if (e.key === "Enter") onPick(); }; c.classList.add("pickable"); }
  return c;
}

// ---------- player page ----------

// Each page load gets a number; if you click somewhere else before it finishes,
// the older load is thrown away instead of flashing up on screen.
let loadSeq = 0;

async function showPage(name) {
  const seq = ++loadSeq;
  showView("view-page");
  $("page-name").textContent = name;
  document.querySelectorAll(".page-name-2").forEach((x) => (x.textContent = name));
  $("page-collection").textContent = "Loading...";
  $("page-guestbook").textContent = "";
  const [col, gb] = await Promise.all([
    api("/api/collection?user=" + encodeURIComponent(name)),
    api("/api/guestbook?user=" + encodeURIComponent(name)),
  ]);
  if (seq !== loadSeq) return;
  const owner = col.owner.name;
  applyTheme(col.owner.theme);
  renderLinks(owner, gb, col);
  if (col.owner.is_bot) $("sets-panel").hidden = true;
  else api("/api/sets?user=" + encodeURIComponent(owner)).then((r) => { if (seq === loadSeq) renderSets(owner, r); }).catch(() => {});
  $("page-name").textContent = owner;
  document.querySelectorAll(".page-name-2").forEach((x) => (x.textContent = owner));
  $("page-bot").hidden = !col.owner.is_bot;
  $("page-seen").hidden = !col.owner.last_seen;
  if (col.owner.last_seen) $("page-seen").textContent = `${owner} was last online ${ago(col.owner.last_seen)}`;

  const mine = !!me && owner.toLowerCase() === me.name.toLowerCase();
  $("dash").hidden = !mine;
  loadShelf(mine);
  loadWanted(owner);

  stopArranging(false);
  $("arrange-bar").hidden = !mine || col.banners.length < 2;
  $("theme-picker").hidden = !mine;
  if (mine) renderSwatches(col.owner.theme || "starry");
  const grid = $("page-collection");
  grid.textContent = "";
  if (!col.banners.length) grid.append(el("p", {}, "No buttons yet!"));
  for (const b of col.banners) {
    grid.append(el("a", { href: "#banner/" + b.id, class: "tile", title: `${b.name} ${edition(b)}`, "data-id": b.id },
      bannerImg(b), el("span", { class: "small" }, edition(b))));
  }

  // Sign form: only on other people's pages.
  const form = $("sign-form");
  form.hidden = !me || owner.toLowerCase() === me.name.toLowerCase();
  $("join-note").hidden = !!me;
  if (!form.hidden) {
    form.dataset.user = owner;
    chooseGift(null);
    $("gift-picker").hidden = true;
    const mine = await api("/api/collection");
    const grid = $("gift-grid");
    grid.textContent = "";
    if (!mine.banners.length) grid.append(el("p", { class: "small" }, "You don't have any buttons to give yet!"));
    for (const b of mine.banners.filter((x) => !x.locked)) { // skip buttons tied up in a trade
      grid.append(el("button", { type: "button", class: "tile pick-tile", title: `${b.name} ${edition(b)}`,
        onclick: () => { chooseGift(b); $("gift-picker").hidden = true; } },
        bannerImg(b), el("span", { class: "small" }, edition(b))));
    }
  }

  // Trade panel: only on other people's pages.
  const tp = $("trade-panel");
  tp.hidden = !me || owner.toLowerCase() === me.name.toLowerCase();
  $("trade-builder").hidden = true;
  if (!tp.hidden) {
    document.querySelectorAll(".tb-name").forEach((n) => (n.textContent = owner));
    tp.dataset.user = owner;
    tradeTheirs = col.banners;
  }

  const list = $("page-guestbook");
  list.textContent = "";
  // messages and finished trades, newest first
  const items = [
    ...gb.entries.map((g) => ({ at: g.created_at, g })),
    ...(gb.trades || []).map((t) => ({ at: t.at, t })),
  ].sort((x, y) => y.at - x.at);
  if (!items.length) list.append(el("p", { class: "small" }, "No one has signed yet. Be the first!"));
  for (const it of items) {
    if (it.t) { list.append(tradeNote(it.t)); continue; }
    const g = it.g;
    list.append(el("div", { class: "entry" + (g.author_is_bot ? " from-bot" : "") },
      el("p", { class: "small" },
        el("a", { href: "#u/" + encodeURIComponent(g.author) }, g.author), g.author_is_bot ? el("span", { class: "bot-badge" }, " [BOT]") : null, ` wrote on ${fmtDate(g.created_at)}:`),
      el("p", {}, g.message),
      g.gift_id ? el("p", { class: "stamp" },
        el("a", { href: "#banner/" + g.gift_id }, bannerImg({ image_key: g.gift_image, name: g.gift_name, rarity: g.gift_rarity, foil: g.gift_foil, foil_seed: g.gift_foil_seed, pattern: g.gift_pattern, effect: g.gift_effect })),
        el("span", { class: "small" }, ` stamped ${g.gift_name} #${g.gift_edition}${g.gift_max ? " of " + g.gift_max : ""}`)) : null));
  }
}

// ---------- Wall of Buttons + info window ----------

const RARITY_LABEL = { common: "common", uncommon: "uncommon", rare: "rare", ultra: "ULTRA RARE", special: "set reward" };
let wallLoaded = false;

// The Wall of Buttons: shuffled every time it loads (mystery tiles always last), with a
// Show (all / cLuB originals / found) and Order (shuffle / rarity) choice remembered in this browser.
let wallDesigns = [];
const wallPref = (k, def) => { try { return localStorage.getItem("wall-" + k) || def; } catch { return def; } };
const setWallPref = (k, v) => { try { localStorage.setItem("wall-" + k, v); } catch {} };
function renderWallGrid() {
  const show = wallPref("show", "all"), order = wallPref("order", "shuffle");
  const RANK = { common: 0, uncommon: 1, rare: 2, ultra: 3, special: 4 };
  let list = wallDesigns.filter((d) => show === "all" || (show === "found" ? d.tier === "archive" : d.tier !== "archive"));
  const known = list.filter((d) => !d.hidden), mystery = list.filter((d) => d.hidden);
  if (order === "rarity") known.sort((a, b) => (RANK[a.rarity] ?? 9) - (RANK[b.rarity] ?? 9) || a._r - b._r);
  else known.sort((a, b) => a._r - b._r);
  const grid = $("wall-grid");
  grid.textContent = "";
  // logged out: just the pictures, nothing to click
  const tile = (d, inner) => (me ? el("a", { href: "#wall/" + d.id, class: "wall-tile", title: d.hidden ? "???" : d.name }, inner)
    : el("span", { class: "wall-tile still", title: d.hidden ? "???" : d.name }, inner));
  for (const d of [...known, ...mystery]) grid.append(tile(d, d.hidden ? el("span", { class: "mystery-tile" }, "?") : bannerImg(d)));
  $("wall-count").textContent = `${list.length} buttons${show === "all" ? " and counting!" : ""}`;
  document.querySelectorAll("#wall-controls button").forEach((b) => b.classList.toggle("on", wallPref(b.dataset.k, b.dataset.k === "show" ? "all" : "shuffle") === b.dataset.v));
}
function wallControls() {
  const box = $("wall-controls");
  if (box.childElementCount) return;
  const btn = (k, v, label) => el("button", { type: "button", "data-k": k, "data-v": v, onclick: () => { setWallPref(k, v); renderWallGrid(); } }, label);
  box.append(el("span", {}, "Show: ", btn("show", "all", "All"), btn("show", "original", "cLuB Originals"), btn("show", "found", "Found")),
    el("span", {}, " Order: ", btn("order", "shuffle", "Shuffle"), btn("order", "rarity", "Rarity")));
}
async function showWall(openId) {
  loadSeriesPanel();
  // logged out, the Wall is pictures only: no info box, no "click one" line
  $("info-win").hidden = !me;
  document.querySelectorAll(".wall-intro").forEach((x) => (x.hidden = !me));
  if (!me) openId = null;
  if (!wallLoaded) {
    const { designs } = await api("/api/designs");
    wallDesigns = designs.map((d) => ({ ...d, _r: Math.random() }));   // a fresh shuffle each load
    wallControls();
    renderWallGrid();
    wallLoaded = true;
  }
  if (openId) await openWallHash(openId);
}

// "#wall/7" = design 7's info; "#wall/7/c/42" = copy 42 of it, shown in the same info box.
function openWallHash(rest) {
  const m = /^(\d+)(?:\/c\/(\d+))?$/.exec(rest || "");
  if (!m) return closeInfo();
  return m[2] ? openCopyInfo(Number(m[1]), Number(m[2])) : openInfo(Number(m[1]));
}

// One specific copy, inside the Wall's info box, with a way back to the button's info.
async function openCopyInfo(designId, copyId) {
  const body = $("info-body");
  body.textContent = "Loading...";
  $("info-win").scrollIntoView({ behavior: "smooth", block: "nearest" });
  const { banner: b, foil_entry: fe, history } = await api("/api/banner?id=" + copyId);
  $("info-title").textContent = `${b.name} ${edition(b)}`;
  const LOG = 8;
  const steps = history.slice(-LOG);
  const left = [
    el("p", { class: "small" }, el("a", { href: "#wall/" + designId }, `« back to ${b.name}`)),
    el("p", { class: "center" }, bannerImg(b, 3)),
    variantLine(b),
    foilLine(b, fe),
    ownedLine(b, history),
    b.status === "removed" ? el("p", {}, el("b", {}, "Removed by request.")) : null,
  ].filter(Boolean);
  const right = [
    el("h3", {}, "Travel Log"),
    history.length > LOG ? el("p", { class: "small" }, `...${history.length - LOG} earlier steps`) : null,
    el("ol", { class: "log small", start: String(Math.max(1, history.length - LOG + 1)) }, steps.map((h) => el("li", {},
      `${fmtDate(h.created_at)}: ${HOW[h.reason] || h.reason}`,
      h.reason === "fusion"
        ? (h.to_name ? " · came out shinier" : " → used up")
        : [h.from_name ? ` from ${h.from_name}` : "", ` → ${h.to_name || "a former player"}`],
      h.hash ? el("span", { class: "hash", title: h.hash }, ` ${h.hash.slice(0, 8)}…`) : null))),
    el("p", {}, el("a", { href: "#banner/" + b.id }, "Open this copy's full page »")),
  ].filter(Boolean);
  body.textContent = "";
  body.append(el("div", { class: "info-cols" }, el("div", {}, ...left), el("div", {}, ...right)));
}

// The info window is part of the Wall page; "closing" just resets it to its welcome message.
function closeInfo() {
  $("info-title").textContent = "Button info";
  const body = $("info-body");
  body.textContent = "";
  body.append(el("p", { class: "center info-empty" }, "↑ Click any button above to see its info, credits, and who owns one!"));
  document.querySelectorAll(".wall-tile.on").forEach((t) => t.classList.remove("on"));
}
closeInfo();
// ---------- Found a Button? (drop a GIF, it uploads right away) ----------
// Players add one at a time and get copy #1. Webmasters can drop many at once; in batch mode
// they're "Found on the internets" with no copy #1, straight into packs.
{
  const status = (text, bad = false) => { const e = $("add-status"); e.textContent = text || ""; e.className = "center add-status" + (bad ? " bad-text" : ""); };
  let busy = false;
  const isGif = (f) => /\.gif$/i.test(f.name) || f.type === "image/gif";
  // webmasters can add the cLuB's own art straight into a series, with a rarity and kind
  const intoSeries = () => (me && me.is_admin && $("add-as").value) || "";
  const upload = async (file, batch) => {
    const fd = new FormData(); fd.append("file", file); if (batch) fd.append("batch", "1");
    if (intoSeries()) { fd.append("series", intoSeries()); fd.append("rarity", $("add-rarity").value); fd.append("kind", $("add-kind").value); }
    const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "same-origin" });
    const r = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...r };
  };
  const send = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length || busy) return;
    const many = me && me.is_admin;
    busy = true; $("add-drop").classList.add("busy");
    const skipped = $("add-skipped"); skipped.textContent = ""; skipped.hidden = true;
    try {
      if (!many || files.length === 1 && !$("add-batch").checked && !intoSeries()) {
        // one button, credited to you
        const file = files[0];
        if (!isGif(file)) return status("It has to be a GIF.", true);
        status(`Adding ${file.name}...`);
        const r = await upload(file, false);
        if (!r.ok) { status(r.error || "Something went wrong.", true); if (r.design_id) location.hash = "#wall/" + r.design_id; return; }
        status(r.foiled ? "Added!! And yours came out SHINY!" : "Added! It's in ~*~ tHe cLuB ~*~ now, and copy #1 is yours.");
        wallLoaded = false;
        location.hash = r.instance_id ? "#banner/" + r.instance_id : "#wall/" + r.design_id;
        return;
      }
      // webmaster: many at once, one after another, with a running tally
      const batch = !intoSeries() && $("add-batch").checked;
      let added = 0, dupes = 0, wrong = 0, failed = 0;
      const skip = (name, why) => { skipped.hidden = false; skipped.append(el("li", {}, `${name}: ${why}`)); };
      for (const [i, file] of files.entries()) {
        status(`Adding ${i + 1} of ${files.length}... (${added} added · ${dupes} already in · ${wrong} not 88x31)`);
        if (!isGif(file)) { wrong++; skip(file.name, "not a GIF"); continue; }
        try {
          const r = await upload(file, batch);
          if (r.ok) added++;
          else if (r.status === 409) { dupes++; skip(file.name, r.error); }
          else if (/88x31|too big/i.test(r.error || "")) { wrong++; skip(file.name, r.error); }
          else { failed++; skip(file.name, r.error || "something went wrong"); }
        } catch { failed++; skip(file.name, "couldn't upload"); }
      }
      const where = intoSeries() ? ` to ${$("add-as").selectedOptions[0].textContent}` : "";
      status(`Done! ${added} added${where} · ${dupes} already in ~*~ tHe cLuB ~*~ · ${wrong} not 88x31` + (failed ? ` · ${failed} failed` : ""), !added);
      if (intoSeries()) seriesPanelLoaded = false;
      wallLoaded = false;
      if (added) showWall();
    } finally { busy = false; $("add-drop").classList.remove("busy"); $("add-file").value = ""; }
  };
  $("add-form").onsubmit = (e) => e.preventDefault();
  $("add-file").addEventListener("change", (e) => send(e.target.files));
  const addDrop = $("add-drop");
  addDrop.addEventListener("dragover", (e) => { e.preventDefault(); addDrop.classList.add("over"); });
  addDrop.addEventListener("dragleave", () => addDrop.classList.remove("over"));
  // dropping a folder: read the files inside it (and any folders inside that)
  const readEntry = (entry) => new Promise((resolve) => {
    if (entry.isFile) return entry.file((f) => resolve([f]), () => resolve([]));
    if (!entry.isDirectory) return resolve([]);
    const reader = entry.createReader(), out = [];
    const next = () => reader.readEntries(async (batch) => {
      if (!batch.length) return resolve(out);
      for (const en of batch) out.push(...(await readEntry(en)));
      next();
    }, () => resolve(out));
    next();
  });
  addDrop.addEventListener("drop", async (e) => {
    e.preventDefault(); addDrop.classList.remove("over");
    const items = [...(e.dataTransfer.items || [])].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
    if (items.some((en) => en.isDirectory) && me && me.is_admin) {
      status("Reading the folder...");
      const files = (await Promise.all(items.map(readEntry))).flat();
      return send(files);
    }
    send(e.dataTransfer.files);
  });
}
// ---------- Series panel (webmasters) ----------
// Upcoming series are hidden and not in packs; up to 3 active ones share the pack slots (newest
// gets the most); retired ones stay in collections but leave packs.
let seriesPanelLoaded = false;
const sSay = (t) => { $("series-msg").textContent = t || ""; };
async function loadSeriesPanel() {
  const panel = $("series-panel");
  panel.hidden = !(me && me.is_admin);
  if (panel.hidden || seriesPanelLoaded) return;
  seriesPanelLoaded = true;
  let r;
  try { r = await api("/api/series"); } catch (e) { seriesPanelLoaded = false; return; }
  const active = r.series.filter((x) => x.status === "active").length;
  $("series-note").textContent = `${active} of ${r.max_active} active. Packs split 60/25/15 between the newest active series.`;
  const setStatus = async (x, status) => {
    const verb = { active: "Release", retired: "Retire", upcoming: "Hide" }[status];
    const what = { active: "It goes into packs right away and everyone can see it.", retired: "It leaves packs. Copies people own stay theirs.", upcoming: "It leaves packs and is hidden from players." }[status];
    if (!(await ask(`${verb} Series ${x.name}? ${what}`, { ok: verb }))) return;
    try {
      const res = await api("/api/series", { method: "POST", body: { action: "status", id: x.id, status } });
      sSay(res.warning || `Series ${x.name} is now ${status}.`);
      seriesPanelLoaded = false; wallLoaded = false; loadSeriesPanel();
    } catch (e) { sSay(e.message); }
  };
  const rows = $("series-rows");
  rows.textContent = "";
  for (const x of r.series) {
    const btns = ["active", "retired", "upcoming"].filter((st) => st !== x.status).map((st) =>
      el("button", { type: "button", class: "mini", onclick: () => setStatus(x, st) }, { active: "Release", retired: "Retire", upcoming: "Hide" }[st]));
    rows.append(el("tr", {},
      el("td", {}, el("b", {}, `Series ${x.name}`)),
      el("td", {}, el("span", { class: "series-status st-" + x.status }, x.status)),
      el("td", {}, `${x.buttons} button${x.buttons === 1 ? "" : "s"}`),
      el("td", {}, el("button", { type: "button", class: "mini", onclick: () => showSeriesDetail(x) }, "Look"), " ", ...btns)));
  }
  // cLuB originals that aren't in a series yet
  const loose = $("series-loose");
  loose.textContent = "";
  if (r.loose.length) {
    loose.append(el("p", {}, el("b", {}, "Originals not in a series: ")));
    for (const d of r.loose) {
      const pick = el("select", { "aria-label": `Series for ${d.name}` }, el("option", { value: "" }, "—"), ...r.series.map((x) => el("option", { value: x.id }, x.name)));
      pick.onchange = async () => {
        try { await api("/api/series", { method: "POST", body: { action: "assign", design_id: d.id, series_id: pick.value } }); sSay(`${d.name} → Series ${pick.selectedOptions[0].textContent}`); seriesPanelLoaded = false; wallLoaded = false; loadSeriesPanel(); }
        catch (e) { sSay(e.message); }
      };
      loose.append(el("span", { class: "loose-item" }, `${d.name} (${d.rarity}) `, pick));
    }
  }
  const form = $("series-new");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) return;
    try { await api("/api/series", { method: "POST", body: { action: "create", name } }); form.reset(); sSay(`Series ${name} made! It's hidden until you release it.`); seriesPanelLoaded = false; loadSeriesPanel(); }
    catch (err) { sSay(err.message); }
  };
}
async function showSeriesDetail(x) {
  const box = $("series-detail");
  box.textContent = "Loading...";
  try {
    const { designs } = await api("/api/series?id=" + x.id);
    box.textContent = "";
    box.append(el("p", { class: "small center" }, el("b", {}, `Series ${x.name}`), ` · ${designs.length} buttons · `,
      el("a", { href: "#", onclick: (e) => { e.preventDefault(); box.textContent = ""; } }, "close")),
      el("div", { class: "wall-grid" }, designs.map((d) => el("a", { href: "#wall/" + d.id, class: "wall-tile", title: `${d.name} (${d.rarity}${d.max_editions ? ", " + d.max_editions + " copies" : ""})` }, bannerImg(d)))));
  } catch (e) { box.textContent = e.message; }
}

// webmasters get multi-file drops and the batch switch
let addAsReady = false;
function setUploadMode() {
  const admin = !!(me && me.is_admin);
  $("add-batch-row").hidden = !admin;
  $("add-as-row").hidden = !admin;
  if (admin && !addAsReady) {
    addAsReady = true;
    const pick = $("add-as");
    pick.onchange = () => { $("add-orig-opts").hidden = !pick.value; $("add-batch-row").hidden = !!pick.value; };
    api("/api/series").then(({ series }) => {
      for (const x of series) pick.append(el("option", { value: x.id }, `a cLuB original → Series ${x.name}` + (x.status !== "active" ? ` (${x.status})` : "")));
    }).catch(() => {});
  }
  if (admin) $("add-file").setAttribute("multiple", "multiple"); else $("add-file").removeAttribute("multiple");
  $("add-pick").textContent = admin ? "Click to pick GIFs, or drop a bunch here" : "Click to pick a GIF, or drop one here";
}

$("info-close").onclick = () => { closeInfo(); history.replaceState(null, "", "#wall"); };

const MYSTERY_LINES = [
  "Some buttons stay hidden until you've owned one yourself...",
  "Nobody knows what this one looks like. Well, somebody does.",
  "Keep pulling packs, trading, and finishing sets. Maybe it'll find you.",
  "Rumor has it this one is really something.",
  "ERROR 404: button not found... yet.",
  "Maybe someone you know has one. Check their page!",
  "This button is still under construction. For you, anyway.",
  "Shhh. It's a secret.",
];

async function openInfo(id) {
  const body = $("info-body");
  body.textContent = "Loading...";
  $("info-title").textContent = "Button info";
  document.querySelectorAll(".wall-tile").forEach((t) => t.classList.toggle("on", t.getAttribute("href") === "#wall/" + id));
  $("info-win").scrollIntoView({ behavior: "smooth", block: "nearest" }); // bring the info box into view
  const info = await api("/api/designs?id=" + id);
  if (info.hidden) {
    $("info-title").textContent = "???";
    body.textContent = "";
    body.append(el("p", { class: "center" }, el("span", { class: "mystery-tile big" }, "?")),
      el("p", { class: "center" }, el("b", {}, "A mystery button!")),
      el("p", { class: "center small" }, MYSTERY_LINES[Math.floor(Math.random() * MYSTERY_LINES.length)]));
    return;
  }
  if (info.removed) {
    const d = info.design;
    $("info-title").textContent = d.name;
    body.textContent = "";
    body.append(...[el("p", { class: "center" }, bannerImg(d, 3)),
      el("p", { class: "center" }, el("b", {}, "Removed by request.")),
      el("p", { class: "center small" }, `Gone from packs. The ${d.minted} ${d.minted === 1 ? "copy" : "copies"} out there stay with their owners.`),
      adminBox(d.id, d.name, "removed", null, () => openInfo(id))].filter(Boolean));
    return;
  }
  const { design: d, ledger, sets, copies, foils = [], webmaster } = info;
  $("info-title").textContent = d.name;
  const foilCounts = foils.filter((f) => f.foil !== "clear").map((f) => `${f.n} ${f.foil === "first" ? "First Print" : foilName(f.foil)}`);
  let st = {}; try { st = JSON.parse(d.stats || "{}"); } catch {}
  const who = (c) => c.owner ? el("a", { href: "#u/" + encodeURIComponent(c.owner) }, c.owner) : "nobody";
  body.textContent = "";
  const left = [
    el("p", { class: "center" }, bannerImg(d, 3)),
    st.variant_of ? el("p", { class: "variant center" }, `✦ ${st.variant || "Special"} version of ${st.variant_of} ✦`) : null,
    el("p", {}, d.series ? el("b", { class: "series-tag" }, `Series ${d.series} · `) : null, el("b", {}, RARITY_LABEL[d.rarity] || d.rarity), ` · ${d.type}`),
    el("p", {}, d.max_editions ? `${d.minted} of ${d.max_editions} copies made` + (d.minted >= d.max_editions ? " (all gone!)" : "")
      : `${d.minted} copies so far (unlimited)`,
      d.left_count != null && d.left_count < d.minted ? ` · ${d.left_count} left` : ""),
    d.status === "reward" ? el("p", { class: "small" }, "Only given as a set reward. Never found in packs.") : null,
    d.status === "frozen" ? el("p", { class: "small" }, "❄ Frozen: an early special version. No new copies are being made.") : null,
    foilCounts.length ? el("p", { class: "small" }, "Special copies: " + foilCounts.join(" · ")) : null,
    ...sets.map((s) => el("p", { class: "small" }, s.name === "a secret set"
      ? (s.role === "reward" ? "Reward for finishing a secret set..." : "Part of a secret set... 🤫")
      : (s.role === "reward" ? `Reward for finishing the ${s.name} set.` : `Part of the ${s.name} set.`))),
    el("h3", {}, "Credits"),
    credit(d) || el("p", { class: "small" }, "No credit recorded."),
    d.source_url ? el("p", { class: "small" }, "Original: ", el("a", { href: d.source_url, target: "_blank", rel: "noopener" }, d.source_url)) : null,
    tierNote(d, webmaster),
    adminBox(d.id, d.name, d.status, d.found_by, () => openInfo(id)),
  ].filter(Boolean);
  const right = [
    el("h3", {}, "On the Ledger"),
    el("p", { class: "small" }, ledger ? `Recorded ${fmtStamp(ledger.created_at)} as entry #${ledger.id}` : "Not sealed yet."),
    ledger ? el("p", { class: "small" }, "Fingerprint: ", el("span", { class: "hash", title: ledger.hash }, ledger.hash.slice(0, 12) + "…")) : null,
    el("p", { class: "small" }, "Artwork fingerprint: ", el("span", { class: "hash", title: d.image_hash }, d.image_hash.slice(0, 12) + "…")),
    el("h3", {}, "Who has one"),
    copies.length
      ? el("ul", { class: "owners copies" }, copies.slice(0, OWNERS_SHOWN()).map((c) => {
          const look = { ...d, ...c, name: d.name, image_key: d.image_key, rarity: d.rarity };
          const fin = finishName(look);
          return el("li", {},
            el("a", { href: `#wall/${d.id}/c/${c.id}`, class: "copy-pic", title: "See this copy" }, bannerImg(look, 0.5)),
            el("span", {}, el("span", { class: "who-line", title: c.owner || "" }, el("a", { href: "#banner/" + c.id, title: "Open this copy's page" }, `#${c.edition}`), " · ", who(c),
              c.is_bot ? el("span", { class: "bot-badge" }, " [BOT]") : null),
              el("span", { class: "fin" + (fin && fin !== "None" ? " special" : "") }, fin || "First Print")));
        }))
      : el("p", { class: "small" }, "Nobody yet! Could be you..."),
    (d.left_count ?? d.minted) > OWNERS_SHOWN() && copies.length > OWNERS_SHOWN()
      ? el("p", { class: "small" }, `...and ${(d.left_count ?? d.minted) - OWNERS_SHOWN()} more!`) : null].filter(Boolean);
  body.append(el("div", { class: "info-cols" }, el("div", {}, ...left), el("div", {}, ...right)));
}

// ---------- sets ----------

function renderSets(owner, r) {
  const mine = !!r.mine;
  const body = $("sets-body");
  body.textContent = "";
  $("sets-title").textContent = mine ? "My Sets" : `${owner}'s Trophies`;
  // visitors only see finished sets the owner chose to show off
  $("sets-panel").hidden = !mine && !r.sets.length;
  if (mine && !r.sets.length) body.append(el("p", { class: "small" }, "No sets started yet... keep collecting and see what turns up!"));
  for (const st of r.sets) {
    if (!mine) {
      body.append(el("div", { class: "set-row trophy" },
        el("p", {}, el("b", {}, st.secret ? "★ a secret set" : "★ " + st.name), " ✓ ",
          el("span", { class: "small" }, `finished ${fmtDate(st.claimed_at)}`)),
        st.designs ? el("div", { class: "set-grid" }, st.designs.map((d) => el("span", { class: "set-item", title: d.name }, bannerImg(d)))) : null,
        st.reward ? el("p", { class: "small" }, "Reward: ", st.claimed_instance
          ? el("a", { href: "#banner/" + st.claimed_instance }, st.reward.name) : st.reward.name) : null));
      continue;
    }
    const status = st.claimed ? el("span", { class: "set-badge" }, " ★ done!")
      : st.complete ? el("button", { type: "button", class: "mini claim-btn", onclick: async (e) => {
          e.preventDefault();
          try {
            await api("/api/sets/claim", { method: "POST", body: { set_id: st.id } });
            say("★ SET COMPLETE! ★ Your reward is in your collection, plus a sealed pack on your shelf!");
            await showPage(me.name); loadSummary();
          } catch (err) { say(err.message); }
        } }, "Claim reward!")
      : null;
    // show-off checkbox for finished sets
    let show = null;
    if (st.claimed) {
      const box = el("input", { type: "checkbox" });
      box.checked = !!st.showcase;
      box.onchange = async () => {
        try { await api("/api/sets", { method: "POST", body: { set_id: st.id, show: box.checked } }); say(box.checked ? "Showing it off on your page!" : "Hidden from visitors."); }
        catch (err) { box.checked = !box.checked; say(err.message); }
      };
      show = el("label", { class: "small show-off" }, box, st.secret ? " Show on my page (as \"a secret set\")" : " Show on my page");
    }
    const row = el("details", { class: "set-row" },
      el("summary", {}, el("b", {}, (st.secret ? "★ " : "") + st.name), ` ${st.have}/${st.total} `, status),
      el("div", { class: "set-grid" }, st.designs.map((d) => d.hidden
        ? el("span", { class: "set-item missing", title: "???" }, el("span", { class: "mystery-tile" }, "?"))
        : el("span", { class: "set-item", title: d.name }, bannerImg(d)))),
      st.reward ? el("p", { class: "small" }, "Reward: ", st.reward.hidden ? "???" : st.claimed_instance
        ? el("a", { href: "#banner/" + st.claimed_instance }, st.reward.name) : st.reward.name) : null,
      show);
    body.append(row);
  }
  if (mine && r.secrets_left) body.append(el("p", { class: "small center secret-hint" },
    r.secrets_left === 1 ? "...psst. There's a secret set out there. Can you find it?" : `...psst. There are ${r.secrets_left} secret sets out there.`));
}

// ---------- Cool Links (link exchange) ----------

function cardImg(c, href, title) {
  return el("a", { href, title, ...(href.startsWith("http") ? { target: "_blank", rel: "noopener nofollow ugc" } : {}) },
    c ? bannerImg(c) : el("span", { class: "no-card" }, "88x31"));
}

function renderLinks(owner, gb, col) {
  const mine = !!me && owner.toLowerCase() === me.name.toLowerCase();
  const go = (name) => async (action) => {
    try { await api("/api/links", { method: "POST", body: { to: name, action } }); await showPage(owner); loadSummary(); }
    catch (e) { say(e.message); }
  };

  // your calling card
  const meBox = $("links-me");
  meBox.hidden = !mine;
  meBox.textContent = "";
  if (mine) {
    meBox.append(el("span", { class: "small" }, "My Button: "),
      gb.my_card ? bannerImg(gb.my_card) : el("span", { class: "small" }, "(none yet)"),
      " ", el("button", { type: "button", class: "mini", onclick: () => {
        const grid = $("card-grid");
        grid.textContent = "";
        for (const b of col.banners) {
          grid.append(el("button", { type: "button", class: "tile pick-tile", title: `${b.name} ${edition(b)}`, onclick: async () => {
            try { await api("/api/profile", { method: "POST", body: { my_button: b.id } }); say("My Button updated!"); await showPage(me.name); }
            catch (e) { say(e.message); }
          } }, bannerImg(b), el("span", { class: "small" }, edition(b))));
        }
        $("card-picker").hidden = !$("card-picker").hidden;
      } }, "Change"),
      el("span", { class: "small" }, " This is what shows up in your friends' Cool Links."));
  }
  $("card-picker").hidden = true;

  // requests waiting (only on your own page)
  const req = $("links-requests");
  req.textContent = "";
  for (const q of mine ? gb.link_requests || [] : []) {
    req.append(el("p", { class: "link-req" }, el("a", { href: "#u/" + encodeURIComponent(q.name) }, el("b", {}, q.name)),
      " wants to swap links! ",
      el("button", { type: "button", class: "mini", onclick: () => go(q.name)("accept") }, "Swap!"), " ",
      el("button", { type: "button", class: "mini", onclick: () => go(q.name)("decline") }, "No thanks")));
  }

  // the links themselves
  const body = $("links-body");
  body.textContent = "";
  const list = gb.links || [];
  if (!list.length) body.append(el("p", { class: "small" }, mine ? "No links yet. Visit a guestbook and hit \"Swap links!\"" : "No links yet."));
  for (const l of list) {
    const href = "#u/" + encodeURIComponent(l.name);
    body.append(el("span", { class: "tile link-tile" }, cardImg(l.card, href, `${l.name}'s page`),
      el("a", { class: "small", href: "#u/" + encodeURIComponent(l.name) }, l.name),
      mine ? el("button", { type: "button", class: "mini unlink", title: "Unlink", onclick: async () => {
        if (await ask(`Unlink from ${l.name}? You'll both drop out of each other's Cool Links.`, { ok: "Unlink", cancel: "Keep" })) go(l.name)("remove");
      } }, "x") : null));
  }

  // the swap button for visitors
  const swap = $("links-swap");
  swap.textContent = "";
  if (!me) swap.append(el("span", { class: "small" }, el("a", { href: "#" }, "Join ~*~ tHe cLuB ~*~"), " to swap links!"));
  else if (!mine) {
    const st = gb.link_state;
    if (st === "linked") swap.append(el("span", { class: "small" }, "You and ", el("b", {}, owner), " are linked ✓ "),
      el("button", { type: "button", class: "mini", onclick: () => go(owner)("remove") }, "unlink"));
    else if (st === "sent") swap.append(el("span", { class: "small" }, "Link swap request sent! Waiting for them to say yes."));
    else if (st === "received") swap.append(el("button", { type: "button", onclick: () => go(owner)("accept") }, `${owner} asked to swap links. Swap!`));
    else swap.append(el("button", { type: "button", onclick: () => go(owner)("request") }, "Swap links!"));
  }
}

// ---------- "Hi, space!" dashboard ----------

async function loadSummary() {
  let s;
  try { s = await api("/api/summary"); } catch { return; }
  setTradeCount(s.trades_waiting);
  const list = $("dash-list");
  list.textContent = "";
  const li = (...kids) => list.append(el("li", {}, ...kids));
  const label = (g) => `${g.design} #${g.edition}${g.max_editions ? " of " + g.max_editions : ""}`;
  const who = (n) => n ? el("a", { href: "#u/" + encodeURIComponent(n) }, n) : "a former player";
  li(s.packs_left
    ? el("span", {}, el("b", {}, `${s.packs_left} pack${s.packs_left === 1 ? "" : "s"}`), " left to open today! ", el("a", { href: "#", onclick: (e) => { e.preventDefault(); $("packs-panel").scrollIntoView({ behavior: "smooth" }); } }, "Open them »"))
    : "You've opened all your packs today. New ones tomorrow!");
  li(s.trades_waiting
    ? el("span", {}, el("b", {}, `${s.trades_waiting} trade offer${s.trades_waiting === 1 ? "" : "s"}`), " waiting for you. ", el("a", { href: "#trades" }, "Take a look »"))
    : "No trade offers waiting.");
  if (s.guestbook_today) li(el("b", {}, `${s.guestbook_today} new guestbook message${s.guestbook_today === 1 ? "" : "s"}`), " today. ",
    el("a", { href: "#u/" + encodeURIComponent(me.name) }, "Read »"));
  const pic = (g) => el("a", { href: "#banner/" + g.id, class: "dash-pic", title: label(g) }, bannerImg(g));
  if (s.last_received) li("Last gift you got: ", pic(s.last_received), el("br"),
    el("a", { href: "#banner/" + s.last_received.id }, label(s.last_received)), " from ", who(s.last_received.who), `, ${ago(s.last_received.at)}`);
  if (s.last_given) li("Last thing you gave: ", pic(s.last_given), el("br"),
    el("a", { href: "#banner/" + s.last_given.id }, label(s.last_given)), " to ", who(s.last_given.who), `, ${ago(s.last_given.at)}`);
  if (s.sets_ready) li(el("b", { class: "hot" }, `★ ${s.sets_ready} set${s.sets_ready === 1 ? "" : "s"} complete!`), " Claim your reward on ",
    el("a", { href: "#u/" + encodeURIComponent(me.name) }, "your guestbook »"));
  if (s.link_requests) li(el("b", {}, `${s.link_requests} link swap request${s.link_requests === 1 ? "" : "s"}`), " waiting. ",
    el("a", { href: "#u/" + encodeURIComponent(me.name) }, "See »"));
  li(`You have ${s.buttons} button${s.buttons === 1 ? "" : "s"} in your collection.`);
}

// ---------- trading ----------

let tradeTheirs = [];
const pickedGive = new Set(), pickedWant = new Set();

function setTradeCount(n) {
  document.querySelectorAll(".trades-link").forEach((a) => {
    a.textContent = n ? `Trades (${n})` : "Trades";
    a.classList.toggle("has-offers", !!n);
  });
}

const smallList = (list) => list.map((b) => el("span", { class: "tr-item", title: `${b.name} ${edition(b)}` },
  el("a", { href: "#banner/" + b.id }, bannerImg(b)), el("span", { class: "small" }, ` ${b.name} ${edition(b)}`)));

function tradeNote(t) {
  return el("div", { class: "entry trade-note" },
    el("p", { class: "small" }, `⇄ TRADE · ${fmtDate(t.at)}`),
    el("p", {}, el("a", { href: "#u/" + encodeURIComponent(t.from_name) }, t.from_name), " traded ",
      ...smallList(t.give), " to ", el("a", { href: "#u/" + encodeURIComponent(t.to_name) }, t.to_name), " for ", ...smallList(t.want)));
}

function pickGrid(box, list, picked, label) {
  box.textContent = "";
  const usable = list.filter((b) => b.rarity !== "ultra");
  if (!usable.length) { box.append(el("p", { class: "small" }, `No buttons ${label}.`)); return; }
  for (const b of usable) {
    const busy = b.locked && label === "to give";
    const tile = el("button", { type: "button", class: "tile pick-tile" + (picked.has(b.id) ? " picked" : "") + (busy ? " busy" : ""),
      title: busy ? "Already in another open trade" : `${b.name} ${edition(b)}` },
      bannerImg(b), el("span", { class: "small" }, busy ? "in a trade" : edition(b)));
    if (busy) tile.disabled = true;
    tile.onclick = () => {
      if (picked.has(b.id)) picked.delete(b.id);
      else if (picked.size < 3) picked.add(b.id);
      else return say("Up to 3 on each side!");
      say("");
      tile.classList.toggle("picked", picked.has(b.id));
    };
    box.append(tile);
  }
}

$("trade-open").onclick = async () => {
  pickedGive.clear(); pickedWant.clear();
  $("tb-note").value = "";
  try {
    const mine = await api("/api/collection");
    pickGrid($("tb-give"), mine.banners, pickedGive, "to give");
    pickGrid($("tb-want"), tradeTheirs, pickedWant, "to ask for");
    $("trade-builder").hidden = false;
  } catch (e) { say(e.message); }
};
$("tb-close").onclick = () => { $("trade-builder").hidden = true; };
$("tb-send").onclick = async () => {
  if (!pickedGive.size || !pickedWant.size) return say("Pick at least one button on each side!");
  try {
    await api("/api/trades", { method: "POST", body: {
      to: $("trade-panel").dataset.user, give: [...pickedGive], want: [...pickedWant], message: $("tb-note").value } });
    $("trade-builder").hidden = true;
    say("Offer sent! Check the Trades page for their answer.");
  } catch (e) { say(e.message); }
};

async function showTrades() {
  showView("view-trades");
  const { incoming, outgoing, history } = await api("/api/trades");
  setTradeCount(incoming.length);
  const card = (t, buttons) => el("div", { class: "entry" },
    el("p", { class: "small" }, t.to_user === me.id
      ? el("span", {}, el("a", { href: "#u/" + encodeURIComponent(t.from_name) }, t.from_name), t.from_bot ? " [BOT]" : "", ` offered on ${fmtDate(t.created_at)}:`)
      : el("span", {}, "To ", el("a", { href: "#u/" + encodeURIComponent(t.to_name) }, t.to_name), t.to_bot ? " [BOT]" : "", ` on ${fmtDate(t.created_at)}:`)),
    el("p", {}, t.to_user === me.id ? "You get " : "You give ", ...smallList(t.give)),
    el("p", {}, t.to_user === me.id ? "You give " : "You get ", ...smallList(t.want)),
    t.message ? el("p", { class: "small" }, `"${t.message}"`) : null,
    t.status === "open" ? el("p", { class: "small" }, `Expires ${fmtDate(t.expires_at)}`) : null,
    buttons ? el("p", { class: "sign-buttons" }, buttons) : null);
  const act = (t, action, label) => el("button", { type: "button", onclick: async () => {
    if (action === "accept" && !(await ask("Accept this trade? The buttons swap right away.", { ok: "Deal!", cancel: "Hmm, wait" }))) return;
    try { await api("/api/trades/act", { method: "POST", body: { id: t.id, action } }); say(action === "accept" ? "Trade done! Enjoy ur new buttons!" : "Done."); await showTrades(); }
    catch (e) { say(e.message); await showTrades(); }
  } }, label);

  const fill = (box, list, empty, buttonsFor) => {
    box.textContent = "";
    if (!list.length) box.append(el("p", { class: "small" }, empty));
    for (const t of list) box.append(card(t, buttonsFor ? buttonsFor(t) : null));
  };
  fill($("tr-in"), incoming, "No offers right now. Go make one on somebody's guestbook!", (t) => [act(t, "accept", "Accept!"), " ", act(t, "decline", "No thanks")]);
  fill($("tr-out"), outgoing, "You haven't sent any offers.", (t) => [act(t, "cancel", "Cancel offer")]);
  renderBoard().catch((e) => say(e.message));
  const past = $("tr-past");
  past.textContent = "";
  if (!history.length) past.append(el("p", { class: "small" }, "No trades yet."));
  for (const t of history) {
    const other = t.to_user === me.id ? t.from_name : t.to_name;
    past.append(el("p", { class: "small" }, `${fmtDate(t.resolved_at || t.created_at)}: with `,
      el("a", { href: "#u/" + encodeURIComponent(other) }, other), ` · ${t.status.toUpperCase()}`));
  }
}

// ---------- request board + open trades ----------
const wantLabel = (name, foil) => (foil ? `${foilName(foil) === "None" ? "plain" : foilName(foil)} ` : "") + name;

async function loadWanted(owner) {
  const line = $("page-wanted");
  line.hidden = true;
  try {
    const { wanted } = await api("/api/board?user=" + encodeURIComponent(owner));
    if (!wanted.length) return;
    line.textContent = "";
    line.append("★ Wanted: ", wanted.map((w) => wantLabel(w.name, w.foil)).join(", "), " ", el("a", { href: "#trades" }, "(request board)"));
    line.hidden = false;
  } catch {}
}

// a <select> of buttons you could ask for, and one of finishes
function designSelect(designs, filter) {
  const sel = el("select", {}, el("option", { value: "" }, "pick a button..."));
  for (const d of designs.filter(filter).sort((a, b) => a.name.localeCompare(b.name))) sel.append(el("option", { value: d.id }, `${d.name} (${d.rarity})`));
  return sel;
}
function foilSelect() {
  const sel = el("select", {}, el("option", { value: "" }, "any finish"));
  for (const f of Object.values(FOILS).filter((f) => (f.kind || "foil") === "foil")) sel.append(el("option", { value: f.id }, f.id === "clear" ? "plain (no foil)" : f.name));
  return sel;
}

async function renderBoard() {
  const [{ requests, open_trades }, { designs }] = await Promise.all([api("/api/board"), api("/api/designs")]);
  const seen = designs.filter((d) => !d.hidden && d.status !== "removed");
  const who = (name, bot) => [el("a", { href: "#u/" + encodeURIComponent(name) }, name), bot ? el("span", { class: "bot-badge" }, " [BOT]") : null];
  const picker = (copies, label, onGo) => {
    if (!copies || !copies.length) return null;
    const sel = el("select", {}, copies.map((c) => el("option", { value: c.id }, `#${c.edition}` + (finishName(c) === "None" ? "" : ` ${finishName(c) || "First Print"}`))));
    return el("span", { class: "board-act" }, copies.length > 1 ? sel : null, " ",
      el("button", { type: "button", onclick: () => onGo(Number(copies.length > 1 ? sel.value : copies[0].id)) }, label));
  };
  const post = async (body, msg) => { try { const r = await api("/api/board", { method: "POST", body }); say(typeof msg === "function" ? msg(r) : msg); showTrades(); } catch (e) { say(e.message); } };

  // request board: mine first
  const rq = $("rq-list");
  rq.textContent = "";
  const reqs = [...requests].sort((a, b) => (b.user_id === me.id) - (a.user_id === me.id));
  if (!reqs.length) rq.append(el("p", { class: "small" }, "No requests right now."));
  for (const r of reqs) {
    const mine = r.user_id === me.id;
    rq.append(el("div", { class: "entry board-row" },
      el("span", { class: "board-pic" }, bannerImg({ ...r })),
      el("span", {}, mine ? el("b", {}, "You") : who(r.user, r.is_bot), " wish for ", el("b", {}, wantLabel(r.name, r.foil)),
        el("span", { class: "small" }, ` · until ${fmtDate(r.expires_at)}`)),
      mine ? el("button", { type: "button", onclick: () => post({ action: "cancel_request", id: r.id }, "Request taken down.") }, "Take it down")
        : picker(r.can_fill, "Fill it!", async (copy) => {
          if (!(await ask(`Give your ${r.name} to ${r.user}? You'll get a sealed pack as thanks (one a day).`, { ok: "Give it!" }))) return;
          post({ action: "fill", id: r.id, copy }, (x) => x.pack ? "Filled! A sealed pack is on your shelf as thanks!" : "Filled! (You already got today's thank-you pack.)");
        })));
  }
  // post a request
  const rp = $("rq-post");
  rp.textContent = "";
  const rqSel = designSelect(seen, (d) => ["common", "uncommon"].includes(d.rarity)), rqFoil = foilSelect();
  rp.append(el("p", {}, "I wish I had ", rqSel, " in ", rqFoil, " ",
    el("button", { type: "button", onclick: () => rqSel.value ? post({ action: "request", design_id: rqSel.value, foil: rqFoil.value || null }, "Request posted!") : say("Pick a button first.") }, "Post it")),
    el("p", { class: "small" }, "Up to 3 at a time. They last a week."));

  // open trades: mine first
  const ol = $("ot-list");
  ol.textContent = "";
  const ots = [...open_trades].sort((a, b) => (b.from_user === me.id) - (a.from_user === me.id));
  if (!ots.length) ol.append(el("p", { class: "small" }, "No open trades right now."));
  for (const t of ots) {
    const mine = t.from_user === me.id;
    ol.append(el("div", { class: "entry" },
      el("p", { class: "small" }, mine ? el("b", {}, "Your open trade") : who(t.user, t.is_bot), ` · until ${fmtDate(t.expires_at)}`),
      el("p", {}, mine ? "You give " : "You get ", ...smallList(t.give)),
      el("p", {}, mine ? "for " : "for your ", el("b", {}, wantLabel(t.name, t.want_foil))),
      t.message ? el("p", { class: "small" }, `"${t.message}"`) : null,
      el("p", { class: "sign-buttons" }, mine ? el("button", { type: "button", onclick: () => post({ action: "cancel_trade", id: t.id }, "Trade taken down.") }, "Take it down")
        : picker(t.can_give, "Accept!", async (copy) => {
          if (!(await ask(`Trade your ${t.name} for ${t.give.map((g) => g.name).join(", ")}? It happens right away.`, { ok: "Deal!" }))) return;
          post({ action: "accept", id: t.id, copy }, "Trade done! Enjoy ur new buttons!");
        }) || (mine ? null : el("span", { class: "small" }, "(you don't have a matching copy)")))));
  }
  // post an open trade
  const op = $("ot-post");
  op.textContent = "";
  const give = new Set(), grid = el("div", { class: "grid" });
  const otSel = designSelect(seen, (d) => d.rarity !== "ultra"), otFoil = foilSelect();
  const note = el("input", { placeholder: "a little note (optional)", maxlength: "200" });
  try { pickGrid(grid, (await api("/api/collection")).banners, give, "to give"); } catch {}
  op.append(el("p", { class: "small" }, "Pick 1 to 3 of yours to offer:"), grid,
    el("p", {}, "for a ", otSel, " in ", otFoil),
    el("p", {}, note, " ", el("button", { type: "button", onclick: () => {
      if (!give.size) return say("Pick at least one of yours to offer.");
      if (!otSel.value) return say("Pick the button you want.");
      post({ action: "trade", give: [...give], design_id: otSel.value, foil: otFoil.value || null, message: note.value }, "Open trade posted!");
    } }, "Post it")));
}

// ---------- guestbook color themes ----------

const THEMES = [
  ["starry", "Starry Night"], ["geo", "Classic Gray"], ["hacker", "Hacker Green"], ["bubblegum", "Bubblegum"],
  ["ocean", "Deep Ocean"], ["goth", "Midnight Goth"], ["construction", "Under Construction"], ["vapor", "Vaporwave"],
];
function applyTheme(name) {
  const v = $("view-page");
  THEMES.forEach(([t]) => v.classList.remove("gb-" + t));
  v.classList.add("gb-" + (THEMES.some(([t]) => t === name) ? name : "starry"));
}
function renderSwatches(current) {
  const box = $("theme-swatches");
  box.textContent = "";
  for (const [t, label] of THEMES) {
    const b = el("button", { type: "button", class: `swatch sw-${t}` + (t === current ? " on" : ""), title: label }, label);
    b.onclick = async () => {
      applyTheme(t); renderSwatches(t);
      try { await api("/api/profile", { method: "POST", body: { theme: t } }); say(`Guestbook colors: ${label}!`); }
      catch (e) { say(e.message); }
    };
    box.append(b);
  }
}

// ---------- arrange my wall (drag to reorder; mouse and touch) ----------

let arranging = false, arrangeBefore = null, dragging = null;
function stopArranging(restore) {
  const grid = $("page-collection");
  if (restore && arrangeBefore) arrangeBefore.forEach((t) => grid.append(t));
  arranging = false; arrangeBefore = null; dragging = null;
  grid.classList.remove("arranging");
  $("arrange-btn").hidden = false;
  $("arrange-tools").hidden = true;
}
$("arrange-btn").onclick = () => {
  arranging = true;
  arrangeBefore = [...$("page-collection").children];
  $("page-collection").classList.add("arranging");
  $("arrange-btn").hidden = true;
  $("arrange-tools").hidden = false;
};
$("arrange-cancel").onclick = () => stopArranging(true);
$("arrange-save").onclick = async () => {
  const order = [...$("page-collection").querySelectorAll(".tile")].map((t) => Number(t.dataset.id));
  try {
    await api("/api/wall", { method: "POST", body: { order } });
    stopArranging(false);
    say("Wall saved! Looking good.");
  } catch (e) { say(e.message); }
};
const grid0 = $("page-collection");
grid0.addEventListener("click", (e) => { if (arranging) e.preventDefault(); }, true);
grid0.addEventListener("dragstart", (e) => { if (arranging) e.preventDefault(); });
grid0.addEventListener("pointerdown", (e) => {
  if (!arranging) return;
  const tile = e.target.closest(".tile");
  if (!tile) return;
  e.preventDefault();
  dragging = tile;
  tile.classList.add("dragging");
  grid0.setPointerCapture(e.pointerId);
});
grid0.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const target = over && over.closest(".tile");
  if (!target || target === dragging || target.parentNode !== grid0) return;
  const r = target.getBoundingClientRect();
  const after = e.clientX > r.left + r.width / 2;
  grid0.insertBefore(dragging, after ? target.nextSibling : target);
});
const endDrag = () => { if (dragging) { dragging.classList.remove("dragging"); dragging = null; } };
grid0.addEventListener("pointerup", endDrag);
grid0.addEventListener("pointercancel", endDrag);

// ---------- "Use this button" box on button pages ----------

function useBox(b) {
  const origin = location.origin;
  const mine = me && b.owner && b.owner.toLowerCase() === me.name.toLowerCase();
  const file = b.image_key.split("/").pop();
  const code = el("textarea", { class: "snippet", rows: "3", readonly: "readonly" });
  code.value = `<a href="${origin}/#banner/${b.id}"><img src="${mine ? file.replace(".gif", "-" + b.edition + ".gif") : origin + "/" + b.image_key}" width="88" height="31" alt="${b.name}"></a>`;
  return el("div", { class: "use-box" },
    el("h2", {}, "» Use this button «"),
    el("p", { class: "sign-buttons" },
      mine ? el("a", { class: "btn-link", href: `/api/download?id=${b.id}` }, "Download my copy (signed)") : null,
      el("a", { class: "btn-link", href: "/" + b.image_key, download: file }, mine ? "Plain picture" : "Download the picture")),
    mine ? el("p", { class: "small" }, "Your copy has a certificate hidden inside saying it's ",
      el("b", {}, `${b.name} ${edition(b)}`), ", issued to you. Upload that file to your site next to your page.") : null,
    el("p", { class: "small" }, "Copy this into your page:"), code,
    el("p", {}, el("button", { type: "button", onclick: async () => {
      try { await navigator.clipboard.writeText(code.value); say("Copied!"); } catch { code.select(); say("Press Ctrl+C to copy."); }
    } }, "Copy code")));
}

// ---------- Check a Button ----------

// Read GIF comment blocks in the browser (the image never leaves this computer).
function readGifComments(buf) {
  const g = new Uint8Array(buf), out = [], dec = new TextDecoder();
  if (g.length < 13 || String.fromCharCode(...g.slice(0, 3)) !== "GIF") return null;
  let p = 13;
  if (g[10] & 0x80) p += 3 * (1 << ((g[10] & 7) + 1));
  const skip = () => { while (p < g.length && g[p] !== 0) p += g[p] + 1; p++; };
  while (p < g.length) {
    const b = g[p];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = g[p + 1]; p += 2;
      if (label === 0xfe) {
        const bytes = [];
        while (p < g.length && g[p] !== 0) { for (let i = 1; i <= g[p]; i++) bytes.push(g[p + i]); p += g[p] + 1; }
        p++; out.push(dec.decode(new Uint8Array(bytes)));
      } else skip();
    } else if (b === 0x2c) {
      const packed = g[p + 9]; p += 10;
      if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
      p++; skip();
    } else break;
  }
  return out;
}

async function checkFile(file) {
  const box = $("check-result");
  box.textContent = "";
  if (!file) return;
  const pic = el("img", { src: URL.createObjectURL(file), class: "banner check-pic", alt: "your button" });
  box.append(el("p", { class: "center" }, pic));
  const comments = readGifComments(await file.arrayBuffer());
  if (comments === null) { box.append(el("p", { class: "bad-text" }, "That's not a GIF file.")); return; }
  const stamp = comments.find((c) => c.startsWith("88x31 cLuB certificate"));
  if (!stamp) {
    const credit = comments.find((c) => c.startsWith("88x31 game"));
    box.append(el("p", {}, el("b", {}, "No certificate in this file.")),
      el("p", { class: "small" }, "It might be a plain download, a screenshot, or re-saved by an app that strips hidden data. It just doesn't prove whose copy it is."),
      credit ? el("p", { class: "small" }, "It does carry the art credit: ", credit) : null);
    return;
  }
  try {
    const r = await api("/api/verify", { method: "POST", body: { stamp } });
    if (!r.genuine) {
      box.append(el("p", { class: "bad-text" }, el("b", {}, "✗ NOT GENUINE. ")), el("p", {}, "This certificate's signature doesn't match. Something in it was changed, or it wasn't made by the cLuB."));
      return;
    }
    const f = r.fields, n = r.now;
    box.append(
      el("p", { class: "ok-text" }, el("b", {}, "✓ GENUINE cLuB CERTIFICATE")),
      el("p", {}, el("b", {}, f.button), ` · copy #${f.copy}`),
      el("p", {}, "Issued to ", el("b", {}, f.issued_to), ` on ${new Date(f.issued_at).toLocaleString()}`),
      f.homepage && f.homepage !== "-" ? el("p", { class: "small" }, "Their homepage then: ", f.homepage) : null,
      el("p", {}, "Owned right now by: ",
        n && n.owner ? el("a", { href: "#u/" + encodeURIComponent(n.owner) }, el("b", {}, n.owner)) : el("b", {}, "nobody (retired)"),
        n && n.owner && n.owner !== f.issued_to ? " (it's changed hands since!)" : ""),
      el("p", { class: "small" }, r.ledger_ok ? "Its ledger entry checks out ✓" : r.ledger_ok === false ? "Hmm, its ledger entry doesn't match." : ""),
      n ? el("p", {}, el("a", { href: "#banner/" + n.id }, "See its travel log »")) : null);
  } catch (e) { say(e.message); }
}
$("check-file").onchange = (e) => checkFile(e.target.files[0]);
const drop = $("check-drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); checkFile(e.dataTransfer.files[0]); });

// "show bot messages" toggle, remembered in this browser.
function applyBotToggle() {
  $("page-guestbook").classList.toggle("hide-bots", !$("show-bots").checked);
}
try { $("show-bots").checked = localStorage.getItem("show-bots") !== "0"; } catch {}
applyBotToggle();
$("show-bots").onchange = () => {
  try { localStorage.setItem("show-bots", $("show-bots").checked ? "1" : "0"); } catch {}
  applyBotToggle();
};

// The gift picked with "Stamp a Gift!" (or null).
let giftPick = null;
function chooseGift(b) {
  giftPick = b;
  const box = $("gift-chosen");
  box.textContent = "";
  box.hidden = !b;
  $("stamp-btn").textContent = b ? "Change Gift" : "Stamp a Gift!";
  if (b) box.append("Stamping: ", bannerImg(b), ` ${b.name} ${edition(b)} `,
    el("button", { type: "button", class: "mini", onclick: () => chooseGift(null) }, "remove"));
}
$("stamp-btn").onclick = () => { $("gift-picker").hidden = !$("gift-picker").hidden; };

$("sign-form").onsubmit = async (e) => {
  e.preventDefault();
  say("");
  const f = e.target;
  const gift = giftPick ? giftPick.id : null;
  if (gift && !(await ask(`Stamp ${giftPick.name} ${edition(giftPick)} into ${f.dataset.user}'s guestbook? It'll be theirs to keep!`,
    { ok: "Send it!", cancel: "Wait, no", pic: bannerImg(giftPick, 2) }))) return;
  try {
    await api("/api/guestbook", { method: "POST", body: { user: f.dataset.user, message: f.message.value, instance_id: gift || null } });
    f.reset();
    chooseGift(null);
    say("Signed! Thanks 4 visiting!");
    await showPage(f.dataset.user);
  } catch (err) { say(err.message); }
};

// All player names feed the browser's own suggestion dropdown on name boxes
// ("Visit a guestbook" and the daily pull's "Send it to").
let players = [];
async function loadPlayers() {
  try { players = (await api("/api/players")).players; } catch { players = []; }
  const dl = $("player-names");
  dl.textContent = "";
  for (const p of players) dl.append(el("option", { value: p.name }));
  // webmasters' give-packs list: every player, then "everyone" last
  const gl = $("givepack-names");
  if (gl) { gl.textContent = ""; for (const p of players) gl.append(el("option", { value: p.name })); gl.append(el("option", { value: "everyone" })); }
}


$("visit-form").onsubmit = (e) => {
  e.preventDefault();
  const n = e.target.name.value.trim();
  if (n) location.hash = "u/" + encodeURIComponent(n);
  e.target.reset();
};


// ---------- banner detail ----------

async function showBanner(id) {
  const seq = ++loadSeq;
  showView("view-banner");
  $("banner-body").textContent = "Loading...";
  const { banner: b, design_entry: de, foil_entry: fe, history, chain } = await api("/api/banner?id=" + encodeURIComponent(id));
  if (seq !== loadSeq) return;
  const box = $("banner-body");
  box.textContent = "";
  const fp = (hash, ledgerId) => hash
    ? el("span", { class: "hash small", title: hash }, ` [ledger #${ledgerId} · ${hash.slice(0, 12)}…]`)
    : el("span", { class: "small" }, " [not sealed yet]");

  box.append(
    el("h2", {}, `» ${b.name} ${edition(b)} «`),
    el("p", { class: "center" }, bannerImg(b, 3)),
    variantLine(b),
    foilLine(b, fe),
    b.status === "removed" ? el("p", {}, el("b", {}, "Removed by request."), " This copy and its travel log stay, but the art is gone.") : null,
    el("p", {}, b.series ? `Series ${b.series} · ` : "", `Type: ${b.type} · Rarity: ${b.rarity === "ultra" ? "ULTRA RARE" : b.rarity}`,
      b.max_editions ? ` · ${b.minted} of ${b.max_editions} copies made` : ` · ${b.minted} copies so far`),
    ownedLine(b, history),

    el("h2", {}, "» Credits «"),
    b.tier === "original" && b.status !== "removed" ? useBox(b) : null,
    b.status === "removed" ? null : credit(b) || el("p", { class: "small" }, "No credit recorded."),
    tierNote(b, b.webmaster),
    adminBox(b.design_id, b.name, b.status, b.found_by, () => showBanner(id)),
    b.source_url ? el("p", { class: "small" }, "Original: ", el("a", { href: b.source_url, target: "_blank", rel: "noopener" }, b.source_url)) : null,
    b.tier === "original" ? el("p", { class: "small" }, "The credit is also written inside the button's GIF file.") : null,

    el("h2", {}, "» On the Ledger «"),
    el("p", {}, "Chain check: ", el("b", { class: chain.ok ? "ok-text" : "bad-text" }, chain.ok ? "ALL GOOD" : "BROKEN"),
      ` (${chain.entries} entries) · `, el("a", { href: "#about" }, "how this works")),
    el("p", { class: "small" }, "Design recorded: ",
      de ? `${fmtStamp(de.created_at)} as ledger entry #${de.id}` : "not sealed yet"),
    de ? el("p", { class: "small" }, "Design fingerprint: ", el("span", { class: "hash" }, de.hash)) : null,
    el("p", { class: "small" }, "Artwork fingerprint: ", el("span", { class: "hash" }, b.image_hash)),

    el("h2", {}, "» Travel Log «"),
    el("ol", { class: "log" }, history.map((h) => el("li", {},
      `${fmtStamp(h.created_at)}: ${HOW[h.reason] || h.reason}`,
      h.reason === "fusion"
        ? (h.to_name ? ` by ${h.to_name}: came out shinier` : " → used up")
        : h.reason === "pack" && h.ref_id
        ? [" ", el("a", { href: "#pack/" + h.ref_id }, `#${h.ref_id}`), ` → ${h.to_name || "a former player"}`]
        : [h.from_name ? ` from ${h.from_name}` : (GIFTY.includes(h.reason) ? " from a former player" : ""),
           ` → ${h.to_name || "a former player"}`],
      fp(h.hash, h.ledger_id)))),
    fuseBox(b));
}

// ---------- sealed packs ----------
// Earned packs (webmaster gifts, milestones, finished sets...) sit on your shelf until you open
// them. Opening shows 3 buttons and you keep 2. Every pack has a public page with its story.
const PACK_FROM = { welcome: "welcome to the cLuB!", webmaster: "a gift from the webmaster", milestone: "a visitor milestone", set: "finishing a set", request: "the request board" };
const packLabel = (p) => (p.special ? "Special " : "") + (p.source === "welcome" ? "Welcome" : p.series ? `Series ${p.series}` : "Mixed") + " Pack";

// Special packs: better odds, foils guaranteed, and a shinier wrapper.
function packTile(p, href) {
  const cls = "pack-tile" + (p.source === "welcome" ? " welcome" : "") + (p.special ? " special" : "") + (p.revealed ? " revealed" : "");
  return el("a", { href, class: cls, title: p.note || PACK_FROM[p.source] || "" },
    el("span", { class: "pack-top" }, "88x31 cLuB"),
    el("span", { class: "pack-name" }, p.special ? "SPECIAL" : p.source === "welcome" ? "WELCOME" : p.series ? `SERIES ${p.series.toUpperCase()}` : "MIXED"),
    el("span", { class: "pack-sub" }, p.revealed ? "opened!" : p.special ? (p.series ? `★ series ${p.series.toLowerCase()} ★` : "★ foils inside! ★") : "sealed pack"));
}

// The Packs section on your own page: today's daily packs and your sealed packs, side by side.
// Clicking one opens it right there.
async function loadPacksPanel(mine) {
  const panel = $("packs-panel");
  panel.hidden = !mine;
  if (!mine) return;
  const grid = $("packs-grid");
  try {
    const [sum, { packs }] = await Promise.all([api("/api/summary"), api("/api/packs")]);
    grid.textContent = "";
    const used = sum.pulls_per_day - sum.packs_left;
    for (let i = 1; i <= sum.pulls_per_day; i++) {
      const done = i <= used;
      const t = el("a", { href: "#", class: "pack-tile daily" + (done ? " used" : ""), title: done ? "Opened! New ones tomorrow." : "Today's daily pack" },
        el("span", { class: "pack-top" }, "88x31 cLuB"), el("span", { class: "pack-name" }, "DAILY"),
        el("span", { class: "pack-sub" }, done ? "back tomorrow!" : `pack ${i} of ${sum.pulls_per_day}`));
      t.onclick = (e) => { e.preventDefault(); if (!done) showPull().catch((err) => say(err.message)); };
      grid.append(el("div", { class: "pack-slot" }, t, el("span", { class: "small" }, done ? "opened today" : "keep 1")));
    }
    for (const p of packs) {
      const t = packTile(p, "#pack/" + p.id);
      t.onclick = (e) => { e.preventDefault(); openPackCards(p, $("pack-open"), afterOpening); };
      grid.append(el("div", { class: "pack-slot" }, t, el("span", { class: "small" }, p.note || PACK_FROM[p.source] || "")));
    }
  } catch {}
}
// after any pack is opened: refresh the packs and the collection under them
function afterOpening() { loadPacksPanel(true); if (me) showPage(me.name).catch(() => {}); }
const loadShelf = loadPacksPanel;

async function showPack(id) {
  const seq = ++loadSeq;
  showView("view-pack");
  const box = $("pack-body");
  box.textContent = "Loading...";
  const st = await api("/api/packs?id=" + encodeURIComponent(id));
  if (seq !== loadSeq) return;
  const p = st.pack;
  const mine = me && p.owner && p.owner.toLowerCase() === me.name.toLowerCase();
  box.textContent = "";
  box.append(el("h2", {}, `» ${packLabel(p)} #${p.id} «`),
    el("p", { class: "center" }, packTile({ ...p, revealed: !!p.opened_at }, "#pack/" + p.id)),
    el("p", { class: "center small" }, `Made ${fmtDate(p.created_at)} · ${p.note || PACK_FROM[p.source] || p.source} · keep ${p.keep} of 3`));

  if (!p.opened_at && mine) {
    const open = el("button", { type: "button" }, "Open it!");
    const give = el("form", { class: "pack-give" }, "or give it to ",
      el("input", { name: "to", placeholder: "player name", autocomplete: "off", list: "player-names" }), " ", el("button", {}, "Give"));
    give.onsubmit = async (e) => {
      e.preventDefault();
      const to = give.to.value.trim();
      if (!to) return;
      if (!(await ask(`Give this sealed pack to ${to}?`, { ok: "Give it!" }))) return;
      try { await api("/api/packs", { method: "POST", body: { action: "give", id: p.id, to } }); say(`Sent to ${to}!`); location.hash = "#u/" + encodeURIComponent(me.name); }
      catch (err) { say(err.message); }
    };
    open.onclick = () => openPackCards(p, box);
    box.append(el("p", { class: "center" }, open), el("p", { class: "center small" }, give));
    return;
  }
  if (!p.opened_at) {
    box.append(el("p", { class: "center" }, `Still sealed! Owned by `, p.owner ? el("a", { href: "#u/" + encodeURIComponent(p.owner) }, p.owner) : "nobody", "."));
  }
  // its story
  const fp = (hash, lid) => hash ? el("span", { class: "hash small", title: hash }, ` [ledger #${lid} · ${hash.slice(0, 12)}…]`) : null;
  box.append(el("h2", {}, "» Its Story «"),
    el("ol", { class: "log" }, st.history.map((h) => el("li", {}, `${fmtStamp(h.created_at)}: `,
      h.reason === "made" ? ["made for ", h.to_name || "a former player"] : ["given by ", h.from_name || "a former player", " to ", h.to_name || "a former player"],
      fp(h.hash, h.ledger_id)))));
  if (st.opening) {
    box.append(el("p", {}, `Opened ${fmtStamp(st.opening.at)} by `, st.opening.opened_by ? el("a", { href: "#u/" + encodeURIComponent(st.opening.opened_by) }, st.opening.opened_by) : "a former player", fp(st.opening.hash, st.opening.ledger_id)),
      el("p", {}, el("b", {}, "It held:")),
      el("div", { class: "pull-row" }, (st.held || []).map((d) => d ? el("div", { class: "card small-card" }, bannerImg(d, 2), el("b", {}, d.name), el("span", { class: "small" }, d.series ? `Series ${d.series}` : "found")) : el("div", { class: "card" }, "(gone)"))),
      el("p", {}, el("b", {}, "Kept:")),
      el("div", { class: "grid" }, st.kept.map((c) => el("a", { href: "#banner/" + c.id, class: "tile" }, bannerImg(c), el("span", { class: "small" }, `#${c.edition} ${finishName(c) || ""}`)))));
  }
}

// The opening: 3 cards, pick `keep` of them.
async function openPackCards(p, box, onDone = null) {
  let o;
  try { o = await api("/api/packs", { method: "POST", body: { action: "open", id: p.id } }); }
  catch (err) { return say(err.message); }
  box.textContent = "";
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  box.append(el("h3", { class: "center" }, `${packLabel(p)} #${p.id}`),
    o.special ? el("p", { class: "center small" }, "★ A special pack: better odds and real foils, already on the cards! ★") : null,
    el("p", { class: "center" }, el("b", {}, o.keep >= o.options.length ? "They're all yours!" : `Pick ${o.keep} to keep!`)));
  const all = o.keep >= o.options.length;
  const picked = new Set(all ? o.options.map((_, i) => i) : []);
  const go = el("button", { type: "button", ...(all ? {} : { disabled: "disabled" }) }, all ? `Keep all ${o.options.length}!` : `Keep these ${o.keep}!`);
  const cards = o.options.map((d, i) => {
    const c = card(d, i, { kept_index: null }, () => {
      if (picked.has(i)) picked.delete(i); else if (picked.size < o.keep) picked.add(i);
      cards.forEach((x, j) => x.classList.toggle("chosen", picked.has(j)));
      go.disabled = picked.size !== Math.min(o.keep, o.options.length);
    });
    if (d && d.series) c.append(el("span", { class: "small" }, `Series ${d.series}`));
    if (all) c.classList.add("chosen");
    return c;
  });
  box.append(el("div", { class: "pull-row" }, cards), el("p", { class: "center" }, go));
  go.onclick = async () => {
    go.disabled = true;
    try {
      const r = await api("/api/packs", { method: "POST", body: { action: "keep", id: p.id, picks: [...picked] } });
      say(r.sold_out ? "Kept! (One of them sold out a moment ago, sorry.)" : "Added to your collection!");
      loadSummary();
      if (onDone) { box.textContent = ""; onDone(); } else showPack(p.id);
    } catch (err) { say(err.message); go.disabled = false; }
  };
}

// Webmasters: hand out sealed packs to a player or everyone.
let givePacksReady = false;
async function setupGivePacks() {
  const form = $("givepacks-form");
  form.hidden = !(me && me.is_admin);
  if (form.hidden || givePacksReady) return;
  givePacksReady = true;
  try {
    const { series } = await api("/api/series");
    for (const x of series) form.series.append(el("option", { value: x.id }, `Series ${x.name}` + (x.status !== "active" ? ` (${x.status})` : "")));
  } catch {}
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim(), count = Number(form.count.value) || 1;
    const everyone = name.toLowerCase() === "everyone";
    if (!name) return say('Type a player\'s name, or "everyone".');
    const who = everyone ? "EVERYONE (bots too)" : name;
    const special = form.special.checked;
    if (!(await ask(`Give ${count}${special ? " SPECIAL" : ""} sealed pack${count === 1 ? "" : "s"} to ${who}?`, { ok: "Give!" }))) return;
    try {
      const r = await api("/api/admin", { method: "POST", body: { action: "give_packs", everyone, name, count, special, series_id: form.series.value || null, note: form.note.value } });
      say(`Gave out ${r.made} pack${r.made === 1 ? "" : "s"}!`);
      form.note.value = "";
      loadShelf(true);
    } catch (err) { say(err.message); }
  };
}

// ---------- Fuse: 3 copies of one button in, 1 shinier one out ----------
// Shown on your own copy's page when you have at least 3 copies of that button.
function fuseBox(b) {
  if (!me || !b.owner || b.consumed || b.owner.toLowerCase() !== me.name.toLowerCase() || b.rarity === "ultra") return null;
  const box = el("div", { class: "fuse-box", hidden: "hidden" });
  api("/api/collection").then(({ banners }) => {
    const others = banners.filter((c) => c.design_id === b.design_id && c.id !== b.id && !c.locked);
    if (others.length < 2) return;
    const picked = new Set();
    const go = el("button", { type: "button", disabled: "disabled" }, "Fuse!");
    const tiles = others.map((c) => {
      const t = el("button", { type: "button", class: "fuse-pick", title: `#${c.edition} · ${finishName(c) || "First Print"}` },
        bannerImg(c), el("span", { class: "small" }, `#${c.edition} ${finishName(c) || "First Print"}`));
      t.onclick = () => {
        if (picked.has(c)) picked.delete(c); else if (picked.size < 2) picked.add(c);
        t.classList.toggle("on", picked.has(c));
        go.disabled = picked.size !== 2;
      };
      return t;
    });
    go.onclick = async () => {
      const three = [b, ...picked];
      const keep = three.reduce((x, y) => (y.edition < x.edition ? y : x));
      const firsts = three.filter((c) => !c.foil).length;
      const msg = `Fuse these 3 into one shinier ${b.name}? #${keep.edition} stays and gets the new look; the other two are used up for good.`
        + (firsts ? `\n\nHeads up: ${firsts === 1 ? "one is a First Print" : firsts + " are First Prints"}. Those can never be made again!` : "");
      if (!(await ask(msg, { ok: "Fuse!", cancel: "Wait, no" }))) return;
      go.disabled = true;
      try {
        const r = await api("/api/fuse", { method: "POST", body: { ids: three.map((c) => c.id) } });
        say(`Fused! #${keep.edition} is now ${finishName(r)}!`);
        location.hash = "#banner/" + r.id;
        if (String(r.id) === String(b.id)) showBanner(b.id);
      } catch (e) { say(e.message); go.disabled = false; }
    };
    box.append(el("h2", {}, "» Fuse «"),
      el("p", { class: "small" }, `You have ${others.length + 1} of these. Fuse 3 into 1 shinier one! Pick 2 more to go with this one:`),
      el("div", { class: "fuse-grid" }, tiles), el("p", { class: "center" }, go));
    box.hidden = false;
  }).catch(() => {});
  return box;
}

// "Owned by space · received from SkAt3rDuDe-bot as a guestbook gift on 10/11/2026"
const GOT_HOW = {
  welcome: "in their welcome pack", daily: "in a daily pull", pass_on: "as a passed-on gift",
  guestbook: "as a guestbook gift", free_pack: "in their free pack", trade: "in a trade", open_trade: "in an open trade", request: "for their request", gift: "as a gift", fusion: "from a fusion", set_reward: "for finishing a set", found: "and added it to ~*~ tHe cLuB ~*~",
};
function ownedLine(b, history) {
  const who = (name) => el("a", { href: "#u/" + encodeURIComponent(name) }, name);
  if (b.consumed) return el("p", {}, "Used up in a fusion. It lives on in a shinier copy.");
  if (!b.owner) return el("p", {}, "Owned by nobody (retired).");
  const last = history[history.length - 1];
  const p = el("p", { class: "owned" }, "Owned by ", who(b.owner));
  if (!last) return p;
  const how = GOT_HOW[last.reason] || "";
  if (last.from_name) p.append(" · received from ", who(last.from_name), ` ${how} on ${fmtDate(last.created_at)}`);
  else if (GIFTY.includes(last.reason)) p.append(` · received from a former player ${how} on ${fmtDate(last.created_at)}`);
  else p.append(` · found ${how} on ${fmtDate(last.created_at)}`);
  return p;
}

function variantLine(b) {
  let st = {};
  try { st = JSON.parse(b.stats || "{}"); } catch {}
  if (!st.variant_of) return null;
  return el("p", { class: "variant" }, `✦ ${st.variant || "Special"} version of ${st.variant_of} ✦`);
}

// "Art: Blue Globe by jsmith (Openclipart) · CC0 1.0"
function credit(d) {
  const bits = [];
  if (d.source_title) bits.push(d.source_url ? el("a", { href: d.source_url, target: "_blank", rel: "noopener" }, d.source_title) : d.source_title);
  if (d.source_author) bits.push(d.source_author.startsWith("Origin unknown") ? (bits.length ? ` · ${d.source_author}` : d.source_author)
    : bits.length ? ` by ${d.source_author}` : `by ${d.source_author}`);
  if (d.license) bits.push(` · ${d.license === "Original" ? "original art" : d.license}`);
  return bits.length ? el("p", { class: "small credit" }, "Art: ", ...bits) : null;
}

// ---------- about / ledger ----------

// Webmaster entries on the ledger, said plainly (no names)
const ADMIN_SAYS = {
  give_packs: "handed out sealed packs!",
  series_create: "started planning something new...",
  series_status: "changed which series are in packs",
  remove_design: "a button was removed by request",
  restore_design: "a removed button came back",
  block_uploader: "someone's button finding was paused",
  unblock_uploader: "someone's button finding was switched back on",
};

// One ledger entry. Button names link to the copy's page (or the button's info on the Wall);
// mystery buttons come from the server as "a mystery button" with nothing to link.
const ledName = (h, name) => h.mystery ? el("span", { class: "mystery-name" }, "a mystery button ?")
  : h.copy_id && h.kind !== "design" ? el("a", { href: "#banner/" + h.copy_id }, name)
  : h.kind === "design" && h.design_id && me ? el("a", { href: "#wall/" + h.design_id }, name) : name;
function ledgerItem(h) {
    // line 1 (small): when + fingerprint · line 2: what happened
    const meta = el("div", { class: "led-meta" }, fmtStamp(h.created_at), " · ",
      el("span", { class: "hash", title: h.hash }, h.hash.slice(0, 12) + "…"));
    let what;
    if (h.kind === "design") {
      what = h.mystery ? el("div", { class: "led-what" }, el("b", {}, "NEW DESIGN "), ledName(h, ""), " joined ~*~ tHe cLuB ~*~")
        : el("div", { class: "led-what" }, el("b", {}, "NEW DESIGN "), ledName(h, h.design || "?"), ` (${h.rarity}`
        + `${h.max_editions ? ", " + h.max_editions + (h.max_editions === 1 ? " copy" : " copies") : ""}`
        + `${h.license ? ", " + (h.license === "Original" ? "original art" : h.license) : ""})`);
    } else if (h.kind === "fusion") {
      const name = h.fused_status === "removed" ? "a removed button" : h.fused_design || "a button";
      const fin = finishName({ foil: h.fused_foil, pattern: h.fused_pattern, effect: h.fused_effect });
      what = el("div", { class: "led-what" }, el("b", {}, "FUSION "), "3 copies of ", ledName(h, name), h.mystery ? " were fused!" : ` became #${h.fused_edition ?? "?"}, now ${fin}!`);
    } else if (h.kind === "foil") {
      const fin = finishName(h);
      const f = h.foil === "clear" && !h.effect ? "no foil" : !tierOf(h.foil) && !h.pattern && !h.effect ? `a ${fin.toLowerCase()} finish` : `a ${fin.toUpperCase()} finish!`;
      what = el("div", { class: "led-what" }, el("b", {}, "FOIL "), ledName(h, h.design || "a button"), h.mystery ? "" : ` #${h.edition ?? "?"}`, ` came with ${h.mystery ? "a finish" : f}`);
    } else if (h.kind === "request") {
      what = el("div", { class: "led-what" }, el("b", {}, "REQUEST "), "someone posted a wish on the request board");
    } else if (h.kind === "pack") {
      what = el("div", { class: "led-what" }, el("b", {}, "PACK "), "sealed pack ", el("a", { href: "#pack/" + h.pack_id }, `#${h.pack_id}`),
        h.pack_reason === "made" ? ` made for ${h.pack_to || "a former player"} (${PACK_FROM[h.pack_source] || h.pack_source})`
          : ` given by ${h.pack_from || "a former player"} to ${h.pack_to || "a former player"}`);
    } else if (h.kind === "pack_open") {
      what = el("div", { class: "led-what" }, el("b", {}, "PACK OPENED "), "sealed pack ", el("a", { href: "#pack/" + h.pack_id }, `#${h.pack_id}`), " was opened");
    } else if (h.kind === "admin") {
      what = el("div", { class: "led-what" }, el("b", {}, "WEBMASTER "), ADMIN_SAYS[h.admin_action] || "did some upkeep");
    } else {
      what = el("div", { class: "led-what" },
        ledName(h, h.design || "a button"), h.mystery ? "" : ` #${h.edition ?? "?"}`, `, ${HOW[h.reason] || h.reason}`,
        h.from_name ? ` from ${h.from_name}` : (GIFTY.includes(h.reason) ? " from a former player" : ""),
        ` → ${h.to_name || "a former player"}`);
    }
  return el("li", { value: h.id }, meta, what);
}

let ledgerLast = null, ledgerOldest = null;
async function showAbout() {
  const L = await api("/api/ledger?limit=15");
  $("ledger-ok").textContent = L.ok ? "ALL GOOD! The chain is unbroken." : `BROKEN at entry #${L.broken_at}!`;
  $("ledger-ok").className = L.ok ? "ok" : "bad";
  $("ledger-count").textContent = L.entries;
  $("ledger-head").textContent = L.head || "(none yet)";
  api("/api/pubkey").then((k) => { $("pubkey").textContent = k.key || "(not set up yet)"; }).catch(() => {});
  const list = $("ledger-recent");
  list.textContent = ""; $("ledger-older").textContent = "";
  if (!L.recent.length) list.append(el("li", {}, "Nothing yet!"));
  for (const h of L.recent) list.append(ledgerItem(h));
  ledgerOldest = L.oldest_id;
  ledgerLast = L.recent.length ? L.recent[L.recent.length - 1].id : null;
  ledgerButtons();
}
// "Show older entries": 100 more each time, all the way back to entry #1
function ledgerButtons() {
  const done = !ledgerLast || ledgerLast <= ledgerOldest;
  $("ledger-older-btn").hidden = done;
  $("ledger-start").hidden = !done || !ledgerLast;
}
$("ledger-older-btn").onclick = async () => {
  const btn = $("ledger-older-btn");
  btn.disabled = true;
  try {
    const L = await api(`/api/ledger?limit=100&before=${ledgerLast}`);
    for (const h of L.recent) $("ledger-older").append(ledgerItem(h));
    if (L.recent.length) ledgerLast = L.recent[L.recent.length - 1].id; else ledgerLast = ledgerOldest;
    ledgerButtons();
  } catch (e) { say(e.message); }
  btn.disabled = false;
};

// ---------- save codes ----------

async function showCodes() {
  showView("view-codes");
  const { codes } = await api("/api/codes");
  const list = $("codes");
  list.textContent = "";
  for (const c of codes) {
    const li = el("li", {}, `${c.label || "code"} (made ${fmtDate(c.created_at)})`);
    if (codes.length > 1) {
      li.append(el("button", { onclick: async () => {
        if (!(await ask(`Remove "${c.label || "this code"}"? It will stop working.`, { ok: "Remove it", cancel: "Keep it" }))) return;
        try { await api(`/api/codes?id=${c.id}`, { method: "DELETE" }); await showCodes(); say("Code removed."); }
        catch (e) { say(e.message); }
      } }, "remove"));
    }
    list.append(li);
  }
}

$("new-code").onclick = async () => {
  const label = await askText("Name this code (like 'phone' or 'notebook'):", "extra code", { ok: "Make code" });
  if (label === null) return;
  try { const { code } = await api("/api/codes", { method: "POST", body: { label } }); showCode(code); }
  catch (e) { say(e.message); }
};

$("delete-account").onclick = async () => {
  say("");
  const typed = await askText(`This deletes your account for good. Type your name (${me.name}) to confirm:`, "", { ok: "Delete forever", cancel: "No, keep it" });
  if (typed === null) return;
  try {
    await api("/api/account", { method: "DELETE", body: { confirm: typed } });
    me = null;
    location.hash = "";
    showTop("out");
    say("Your account has been deleted. Bye bye, thanx 4 visiting!");
  } catch (e) { say(e.message); }
};

// ---------- signup / login / save code card ----------

function showCode(code) {
  $("code-text").textContent = code;
  showTop("code-card");
}

// ---------- the front-page free pack ----------
// A visitor opens one card with no account. Signing it (typing a name) makes their account and
// the card theirs; then their save code is shown like any new sign-up.
let fpToken = null, fpTurnstile = false;
function loadTurnstile(sitekey, box) {
  const draw = () => window.turnstile.render(box, { sitekey, callback: (t) => { fpToken = t; }, "expired-callback": () => { fpToken = null; } });
  if (window.turnstile) return draw();
  if (fpTurnstile) return;
  fpTurnstile = true;
  const sc = el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", async: "async" });
  sc.onload = draw;
  document.head.append(sc);
}

async function renderFreePack() {
  const box = $("fp-body");
  if (!box) return;
  let st;
  try { st = await api("/api/freepack"); } catch { return; }
  box.textContent = "";
  if (st.state === "member") return;
  if (st.state === "claimed") {
    box.append(el("p", {}, "You've got your free pack! ", el("b", {}, "Log in"), " to see it."));
    return;
  }
  if (st.state === "none") {
    const fpOops = el("p", { class: "center sig-oops", role: "alert" });
    const tile = el("a", { href: "#", class: "pack-tile free glow" },
      el("span", { class: "pack-top" }, "88x31 cLuB"), el("span", { class: "pack-name" }, "FREE PACK"), el("span", { class: "pack-sub" }, "open me!"));
    tile.onclick = async (e) => {
      e.preventDefault();
      try { await api("/api/freepack", { method: "POST", body: { action: "open" } }); renderFreePack(); }
      catch (err) { fpOops.textContent = err.message; }
    };
    box.append(el("p", { class: "small" }, "Collect tiny 88x31 buttons from the old web! Your first one's on us."),
      el("p", { class: "center" }, tile), fpOops);
    return;
  }
  // waiting: the card, and the signature line
  const name = el("input", { name: "name", maxlength: "20", autocomplete: "off", "aria-label": "Your name", class: "sig-input" });
  const check = el("button", { type: "submit", class: "sig-check", title: "Sign it!", "aria-label": "Sign it" }, "✓");
  check.hidden = true;
  name.oninput = () => { check.hidden = !name.value.trim(); };
  const human = el("div", { class: "fp-human" });
  // what went wrong shows right under the signature line, where you're looking
  const oops = el("p", { class: "center sig-oops", role: "alert", "aria-live": "polite" });
  const form = el("form", { class: "sig-form" }, el("label", { class: "sig-line" }, "Your name: ", name, check), oops, human);
  name.addEventListener("input", () => { oops.textContent = ""; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!name.value.trim() || check.disabled) return;
    oops.textContent = "";
    check.disabled = true;           // greyed out while it signs, so it can't be pressed twice
    check.textContent = "…";
    try {
      const r = await api("/api/freepack", { method: "POST", body: { action: "sign", name: name.value, turnstile: fpToken } });
      me = r.user;
      afterCode = "u/" + encodeURIComponent(r.user.name); // land on your new page once the code is saved
      showCode(r.code);
    } catch (err) {
      oops.textContent = err.message;
      check.disabled = false;
      check.textContent = "✓";
      if (window.turnstile) { try { window.turnstile.reset(); } catch {} fpToken = null; }
    }
  };
  box.append(el("div", { class: "pull-row" }, card(st.card, 0, { kept_index: null })),
    el("p", { class: "center" }, "This one's yours to keep. Sign it to make it official!"),
    form,
    el("p", { class: "center small fp-note" }, "(This also creates your account)"));
  if (st.sitekey) loadTurnstile(st.sitekey, human);
}

$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  say("");
  try {
    await api("/api/login", { method: "POST", body: { code: e.target.code.value } });
    e.target.reset();
    await refresh();
  } catch (err) { say(err.message); }
};

$("print-code").onclick = () => { document.body.classList.add("printing-code"); window.print(); setTimeout(() => document.body.classList.remove("printing-code"), 500); };

$("copy-code").onclick = async () => {
  try { await navigator.clipboard.writeText($("code-text").textContent); say("Copied."); }
  catch { say("Couldn't copy. Select the code and copy it by hand."); }
};

$("download-code").onclick = () => {
  const text = `88x31 save code for ${me ? me.name : "your account"}\n\n${$("code-text").textContent}\n\nKeep this safe. It's the only way back into your account.\n`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = "88x31-save-code.txt";
  a.click();
  URL.revokeObjectURL(a.href);
};

let afterCode = null;
$("code-done").onclick = async () => {
  say("");
  // Set the address without triggering a route, then refresh routes once.
  if (afterCode) { history.replaceState(null, "", "#" + afterCode); afterCode = null; }
  await refresh();
};

const doLogout = async (e) => {
  e.preventDefault();
  await api("/api/logout", { method: "POST" }).catch(() => {});
  me = null;
  wallLoaded = false;
  say("");
  location.hash = "";
  showTop("out");
};
document.querySelectorAll(".logout-link").forEach((a) => (a.onclick = doLogout));

// Front-page ticker of recent trades, gifts and ultra finds (refreshes every few minutes).
async function loadTicker() {
  try {
    const { items } = await api("/api/feed");
    const t = $("ticker-text");
    t.textContent = items.length
      ? items.map((i) => i.text).join("  ***  ")
      : "No trades or gifts yet... be the first!";
    // keep the scroll speed steady no matter how long the text is
    t.style.animationDuration = Math.max(20, Math.round(t.textContent.length / 6)) + "s";
  } catch {}
}
loadTicker();
setInterval(loadTicker, 3 * 60 * 1000);

// Visitor counter: counted once per browser visit, so refreshing doesn't bump it.
(async () => {
  let counted = false;
  try { counted = sessionStorage.getItem("counted") === "1"; } catch {}
  try {
    const { visits } = await api("/api/hit", { method: counted ? "GET" : "POST" });
    try { sessionStorage.setItem("counted", "1"); } catch {}
    $("counter").textContent = String(visits).padStart(6, "0");
  } catch {}
})();

refresh().catch((e) => { say(e.message); showTop("out"); });
