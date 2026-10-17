// 88x31 front page: accounts, daily pull, player pages, guestbooks, save codes.
const $ = (id) => document.getElementById(id);
// Let code pass "maybe" pieces (null/undefined/false) to append() without them printing as text.
{
  const orig = Element.prototype.append;
  Element.prototype.append = function (...kids) { return orig.apply(this, kids.filter((k) => k != null && k !== false)); };
}
const say = (text) => ($("msg").textContent = text || "");

// Where this visitor first came from (just the site name), sent along when they make an account so
// the webmaster can see which places bring new players. Remembered from the very first visit.
const cameFrom = (() => {
  let saved = null;
  try { saved = localStorage.getItem("came_from"); } catch {}
  if (saved) return saved;
  let v = "direct";
  try {
    const ref = new URLSearchParams(location.search).get("ref");
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
    const outside = (h) => h && h !== location.hostname.replace(/^www\./, "");
    const framed = window.top !== window.self;
    const parent = (location.ancestorOrigins && location.ancestorOrigins.length) ? host(location.ancestorOrigins[0]) : host(document.referrer);
    if (ref && /^[a-z0-9_.-]{1,30}$/i.test(ref)) v = "ref:" + ref.toLowerCase();
    else if (framed && outside(parent)) v = parent + " (embedded)";
    else if (outside(host(document.referrer))) v = host(document.referrer);
  } catch {}
  try { localStorage.setItem("came_from", v); } catch {}
  return v;
})();
// iPhones only show :active styles (like a pack squishing when you press it) if a touch listener exists
document.addEventListener("touchstart", () => {}, { passive: true });
// letting go of a pack pops it bigger for a moment (see .pack-tile.pop)
document.addEventListener("pointerup", (e) => {
  const t = e.target.closest && e.target.closest(".pack-tile");
  if (!t) return;
  t.classList.remove("pop"); void t.offsetWidth; t.classList.add("pop");
});
document.addEventListener("animationend", (e) => { if (e.animationName === "pack-pop") e.target.classList.remove("pop"); });
const TOP = ["loading", "out", "in", "code-card", "howto", "fair", "check", "wall", "packs"];
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
// "Oct 13, 2026, 7:20 AM" in the viewer's own time zone (guestbook entries)
const fmtWhen = (t) => new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

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
  trade: "trade", gift: "gift", fusion: "fusion", away: "sent to visit 4Dungeon", home: "came home from 4Dungeon", starter: "starter", admin: "admin", set_reward: "set reward", found: "found & added", pack: "opened from a sealed pack", free_pack: "free pack", request: "request filled", open_trade: "open trade", trade_in: "traded in",
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
  const box = el("div", { class: "admin-box" }, el("p", { class: "small admin-head" }, el("b", {}, "☠ Webmaster")));
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
let fairScroll = 0;   // where you were on Fair Play, for coming back to it

// ---------- routing ----------

// clicked: got here from a link (not a page load), so a button's info box can scroll into view
async function route(clicked = false) {
  say("");
  setPageMode();
  const hash = decodeURIComponent(location.hash.slice(1));
  // How to Play and Fair Play are open to everyone; "#howto/faq" jumps to a section ("#about" is the old name)
  if (hash === "about") { location.replace("#howto"); return; }
  if (/^(howto|fair)(\/|$)/.test(hash)) {
    const [page, part] = hash.split("/");
    showTop(page);
    const jump = () => { const t = part && $((page === "howto" ? "ht-" : "fp-") + part); if (t) t.scrollIntoView({ block: "start" }); };
    jump();
    const back = page === "fair" && !part && fairScroll;   // coming back to Fair Play: same spot as before
    return (page === "howto" ? showHowto() : showFair()).then(() => { jump(); if (back) window.scrollTo(0, fairScroll); }).catch((e) => say(e.message));
  }
  if (hash === "check") { showTop("check"); return; }
  if (hash === "packs") { showTop("packs"); return showAllPacks().catch((e) => say(e.message)); }
  if (hash === "wall" || hash.startsWith("wall/")) {
    if (!me) { showFront(); return showWall(hash.slice(5)).catch((e) => say(e.message)); }
    showTop("wall");
    return showWall(hash.slice(5), clicked).catch((e) => say(e.message));
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
  if (onWall && /^wall\/\d+(\/c\/\d+)?$/.test(now) && wallLoaded) { openWallHash(now.slice(5), true).catch((err) => say(err.message)); return; }
  if (onWall && now === "wall" && wallLoaded) { closeInfo(); return; }
  if (/^fair(\/|$)/.test(was)) fairScroll = window.scrollY;   // remember where you were on Fair Play
  window.scrollTo(0, 0); route(true);
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
  $("pull-odds").textContent = `Odds for each button: common ${o.common}% · uncommon ${o.uncommon}% · rare ${o.rare}%${o.prototype != null ? ` · PROTOTYPE ${o.prototype}%` : ""} · ULTRA ${o.ultra}%. Only 4 of each prototype exist, and every ultra is one of a kind. About 1 in ${Math.round(1 / pull.bonus_chance)} packs has a BONUS PACK card.`;
  box.textContent = "";
  if (pull.bonus_pack) box.append(el("p", { class: "center bonus-head" }, el("b", {}, "★ BONUS PACK! ★")));
  else if (pull.pulls_per_day > 1) box.append(el("p", { class: "center" }, el("b", {}, `Pack ${pull.pull_number} of ${pull.pulls_per_day} today`)));

  if (pull.status === "done") { box.textContent = ""; openingKey = null; loadPacksPanel(true); return; } // all used up today
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
  const stage = openingStage(dailyTile(false, pull.bonus_pack ? "bonus pack!" : `pack ${pull.pull_number} of ${pull.pulls_per_day}`), cards, "reveal");
  box.append(stage.node);
  box.append(el("p", { class: "center small" }, "Click the one you want to keep."));
  stage.play();

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
    bannerImg(d, 2), el("b", {}, d.name), el("span", { class: "small" }, rarityTag(d.rarity), ` · ${d.type}`),
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
  if (col.owner.is_bot) $("sets-panel").hidden = true;
  else api("/api/sets?user=" + encodeURIComponent(owner)).then((r) => { if (seq === loadSeq) renderSets(owner, r); }).catch(() => {});
  $("page-name").textContent = owner;
  document.querySelectorAll(".page-name-2").forEach((x) => (x.textContent = owner));
  $("page-bot").hidden = !col.owner.is_bot;
  playerAdminBox(owner, col.owner);
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
    const away = b.locked === AWAY;   // visiting 4Dungeon (v0.36): still theirs, back when it's sent home
    grid.append(el("a", { href: "#banner/" + b.id, class: "tile" + (away ? " away" : ""), title: `${b.name} ${edition(b)}${away ? " (away in 4Dungeon)" : ""}`, "data-id": b.id },
      bannerImg(b), el("span", { class: "small" }, edition(b) + (away ? " · away" : ""))));
  }
  showVisitors(grid, mine, seq);

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
    // skip buttons tied up in a trade, and ultras when it's a bot's page (bots never get ultras)
    for (const b of mine.banners.filter((x) => !x.locked && !(col.owner.is_bot && x.rarity === "ultra"))) {   // prototypes can go to bots as gifts
      grid.append(el("button", { type: "button", class: "tile pick-tile", title: `${b.name} ${edition(b)}`,
        onclick: () => { chooseGift(b); $("gift-picker").hidden = true; } },
        bannerImg(b), el("span", { class: "small" }, edition(b))));
    }
    // sealed packs can be stamped too (v0.34); limited ones never go to bots
    try {
      const { packs } = await api("/api/packs");
      for (const p of packs.filter((x) => !x.revealed && !x.in_trade && !(col.owner.is_bot && x.special))) {
        grid.append(el("button", { type: "button", class: "tile pick-tile pack-pick", title: packTitle(p),
          onclick: () => { chooseGift({ pack: p }); $("gift-picker").hidden = true; } },
          packMini(p), el("span", { class: "small" }, "pack")));
      }
    } catch {}
  }

  // Trade panel: only on other people's pages.
  const tp = $("trade-panel");
  tp.hidden = !me || owner.toLowerCase() === me.name.toLowerCase();
  $("trade-builder").hidden = true;
  if (!tp.hidden) {
    document.querySelectorAll(".tb-name").forEach((n) => (n.textContent = owner));
    tp.dataset.user = owner;
    tp.dataset.bot = col.owner.is_bot ? "1" : "";
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
        el("a", { href: "#u/" + encodeURIComponent(g.author) }, g.author), g.author_is_bot ? el("span", { class: "bot-badge" }, " [BOT]") : null, ` wrote on ${fmtWhen(g.created_at)}:`),
      el("p", {}, g.message),
      g.gift_id ? el("p", { class: "stamp" },
        el("a", { href: "#banner/" + g.gift_id }, bannerImg({ image_key: g.gift_image, name: g.gift_name, rarity: g.gift_rarity, foil: g.gift_foil, foil_seed: g.gift_foil_seed, pattern: g.gift_pattern, effect: g.gift_effect })),
        el("span", { class: "small" }, ` stamped ${g.gift_name} #${g.gift_edition}${g.gift_max ? " of " + g.gift_max : ""}`)) : null,
      g.gift_pack ? el("p", { class: "stamp" }, ...(() => {
        const p = { id: g.gift_pack, source: g.pack_source, note: g.pack_note, keep: g.pack_keep, special: g.pack_special, special_no: g.pack_special_no,
          special_name: g.pack_special_name, special_limit: g.pack_special_limit, series: g.pack_series, revealed: !!g.pack_opened };
        return [el("a", { href: "#pack/" + p.id }, packMini(p)), el("span", { class: "small" }, ` stamped a sealed ${packTitle(p)}${p.revealed ? " (opened since!)" : ""}`)];
      })()) : null));
  }
}

// ---------- Wall of Buttons + info window ----------

const RARITY_LABEL = { common: "common", uncommon: "uncommon", rare: "rare", prototype: "PROTOTYPE", ultra: "ULTRA RARE", special: "set reward" };
// A rarity as shown on cards and info windows. Prototypes (v0.31) get a pencil-sketched paper tag.
const rarityTag = (r) => r === "prototype" ? el("span", { class: "proto-tag" }, "PROTOTYPE") : el("span", {}, RARITY_LABEL[r] || r);
let wallLoaded = false;

// The Wall of Buttons: shuffled every time it loads (mystery tiles always last), with a
// Show (all / cLuB originals / found) and Order (shuffle / rarity) choice remembered in this browser.
let wallDesigns = [];
const wallPref = (k, def) => { try { return localStorage.getItem("wall-" + k) || def; } catch { return def; } };
const setWallPref = (k, v) => { try { localStorage.setItem("wall-" + k, v); } catch {} };
function renderWallGrid() {
  // the Show/Order switches are webmaster-only; everyone else sees cLuB buttons first, then found ones
  const admin = !!(me && me.is_admin);
  const show = admin ? wallPref("show", "all") : "all", order = admin ? wallPref("order", "shuffle") : "shuffle";
  const RANK = { common: 0, uncommon: 1, rare: 2, prototype: 3, ultra: 4, special: 5 };
  const list = wallDesigns.filter((d) => show === "all" || (show === "found" ? d.tier === "archive" : d.tier !== "archive"));
  const shuffled = (arr) => arr.slice().sort((a, b) => a._r - b._r);
  let tiles;
  if (admin) {
    const known = list.filter((d) => !d.hidden), mystery = list.filter((d) => d.hidden);
    if (order === "rarity") known.sort((a, b) => (RANK[a.rarity] ?? 9) - (RANK[b.rarity] ?? 9) || a._r - b._r);
    else known.sort((a, b) => a._r - b._r);
    tiles = [...known, ...mystery];
  } else {
    // each group shuffled, with its mystery tiles at the end of that group
    const group = (arr) => [...shuffled(arr.filter((d) => !d.hidden)), ...shuffled(arr.filter((d) => d.hidden))];
    tiles = [...group(list.filter((d) => d.tier !== "archive")), ...group(list.filter((d) => d.tier === "archive"))];
  }
  const grid = $("wall-grid");
  grid.textContent = "";
  // logged out: just the pictures, nothing to click
  const tile = (d, inner) => (me ? el("a", { href: "#wall/" + d.id, class: "wall-tile", title: d.hidden ? "???" : d.name }, inner)
    : el("span", { class: "wall-tile still", title: d.hidden ? "???" : d.name }, inner));
  for (const d of tiles) grid.append(tile(d, d.hidden ? el("span", { class: "mystery-tile" }, "?") : bannerImg(d)));
  $("wall-count").textContent = `${list.length} buttons${show === "all" ? " and counting!" : ""}`;
  document.querySelectorAll("#wall-controls button").forEach((b) => b.classList.toggle("on", wallPref(b.dataset.k, b.dataset.k === "show" ? "all" : "shuffle") === b.dataset.v));
}
function wallControls() {
  const box = $("wall-controls");
  if (box.childElementCount) return;
  const btn = (k, v, label) => el("button", { type: "button", "data-k": k, "data-v": v, onclick: () => { setWallPref(k, v); renderWallGrid(); } }, label);
  box.append(el("span", {}, "Show ", btn("show", "all", "All"), btn("show", "original", "cLuB Originals"), btn("show", "found", "Found")),
    el("span", {}, "Order ", btn("order", "shuffle", "Shuffle"), btn("order", "rarity", "Rarity")));
}
// scroll: bring the info box into view (coming from a link elsewhere, like the Ledger; never on page load)
async function showWall(openId, scroll = false) {
  loadSeriesPanel();
  // logged out, the Wall is pictures only: no info box, no "click one" line
  $("info-win").hidden = !me;
  document.querySelectorAll(".wall-intro").forEach((x) => (x.hidden = !me));
  $("wall-controls").hidden = !(me && me.is_admin);   // sorting switches are webmaster-only
  if (!me) openId = null;
  if (!wallLoaded) {
    const { designs } = await api("/api/designs");
    wallDesigns = designs.map((d) => ({ ...d, _r: Math.random() }));   // a fresh shuffle each load
    wallControls();
    renderWallGrid();
    wallLoaded = true;
  }
  if (openId) await openWallHash(openId, scroll);
}

// How many owners the info box lists: 12 in two columns, 6 on narrow screens (one column).
const OWNERS_SHOWN = () => (window.matchMedia("(min-width: 700px)").matches ? 12 : 6);

// "#wall/7" = design 7's info; "#wall/7/c/42" = copy 42 of it, shown in the same info box.
// scroll: bring the info box into view (only when a button was clicked, never on page load or reload)
function openWallHash(rest, scroll = false) {
  const m = /^(\d+)(?:\/c\/(\d+))?$/.exec(rest || "");
  if (!m) return closeInfo();
  return m[2] ? openCopyInfo(Number(m[1]), Number(m[2]), scroll) : openInfo(Number(m[1]), scroll);
}

// One specific copy, inside the Wall's info box, with a way back to the button's info.
async function openCopyInfo(designId, copyId, scroll = false) {
  const body = $("info-body");
  body.textContent = "Loading...";
  if (scroll) $("info-win").scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  const upload = async (file, batch) => {
    const fd = new FormData(); fd.append("file", file); if (batch) fd.append("batch", "1");
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
      if (!many || files.length === 1 && !$("add-batch").checked) {
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
      const batch = $("add-batch").checked;
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
      status(`Done! ${added} added · ${dupes} already in ~*~ tHe cLuB ~*~ · ${wrong} not 88x31` + (failed ? ` · ${failed} failed` : ""), !added);
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
  seriesOpen = null; $("series-detail").textContent = "";
  // a new series starts hidden ("upcoming"); Release puts it into packs. (No retire/hide here.)
  const release = async (x) => {
    if (!(await ask(`Release Series ${x.name}? It goes into packs right away and everyone can see it.`, { ok: "Release" }))) return;
    try {
      const res = await api("/api/series", { method: "POST", body: { action: "status", id: x.id, status: "active" } });
      sSay(res.warning || `Series ${x.name} is out!`);
      seriesPanelLoaded = false; wallLoaded = false; loadSeriesPanel();
    } catch (e) { sSay(e.message); }
  };
  const rows = $("series-rows");
  rows.textContent = "";
  // print run: set or raise it (never below what's printed)
  const setRun = async (x) => {
    const v = await askText(`Series ${x.name} print run: how many copies, all its buttons together? It has printed ${x.printed} so far.`, String(x.print_run ?? ""), { ok: "Set" });
    if (v === null || !v.trim()) return;
    try { await api("/api/series", { method: "POST", body: { action: "print_run", id: x.id, print_run: Number(v) } }); sSay(`Series ${x.name} prints ${Number(v)} copies.`); seriesPanelLoaded = false; loadSeriesPanel(); }
    catch (e) { sSay(e.message); }
  };
  const setSpecial = async (x) => {
    const v = await askText(`What are Series ${x.name}'s special packs called? (Like "Gold Master": "${x.name} Gold Master Pack #7 of 25")`, x.special_name || "", { ok: "Name them" });
    if (v === null || !v.trim()) return;
    try { await api("/api/series", { method: "POST", body: { action: "special_name", id: x.id, special_name: v } }); sSay(`${x.name} ${v.trim()} Packs it is!`); seriesPanelLoaded = false; loadSeriesPanel(); givePacksReady = false; setupGivePacks(); }
    catch (e) { sSay(e.message); }
  };
  for (const x of r.series) {
    const pct = x.print_run ? Math.min(100, Math.round((100 * x.printed) / x.print_run)) : 0;
    rows.append(el("tr", {},
      el("td", { class: "nw" }, el("b", {}, `Series ${x.name}`), el("br"), el("span", { class: "small" }, `${x.buttons} button${x.buttons === 1 ? "" : "s"}`)),
      el("td", { class: "nw" }, el("span", { class: "series-status st-" + (x.out_of_print ? "oop" : x.status) }, x.out_of_print ? "out of print" : x.status)),
      el("td", { class: "run-cell" }, x.print_run
        ? [el("span", { class: "run-bar", title: `${pct}% printed` }, el("span", { style: `width:${pct}%` })), ` ${x.printed} / ${x.print_run}`]
        : `${x.printed} printed · no run`),
      el("td", {}, el("span", { class: "small" }, `${x.special_name || "Special"} Packs: ${x.special_made} / ${x.special_limit}`)),
      el("td", { class: "nw" }, el("button", { type: "button", class: "mini series-look", "data-id": x.id, onclick: () => showSeriesDetail(x) }, "Look"),
        " ", el("button", { type: "button", class: "mini", onclick: () => setRun(x) }, "Run"),
        " ", el("button", { type: "button", class: "mini", onclick: () => setSpecial(x) }, "Pack name"),
        x.status === "upcoming" ? [" ", el("button", { type: "button", class: "mini", onclick: () => release(x) }, "Release")] : null)));
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
    try { await api("/api/series", { method: "POST", body: { action: "create", name, special_name: form.special.value, print_run: form.run.value } }); form.reset(); sSay(`Series ${name} made! It's hidden until you release it.`); seriesPanelLoaded = false; loadSeriesPanel(); }
    catch (err) { sSay(err.message); }
  };
}
let seriesOpen = null;   // which series' buttons are showing; clicking Look again closes it
async function showSeriesDetail(x) {
  const box = $("series-detail");
  const looks = () => document.querySelectorAll(".series-look").forEach((b) => b.classList.toggle("on", Number(b.dataset.id) === seriesOpen));
  if (seriesOpen === x.id) { seriesOpen = null; box.textContent = ""; looks(); return; }
  seriesOpen = x.id; looks();
  box.textContent = "Loading...";
  try {
    const { designs } = await api("/api/series?id=" + x.id);
    if (seriesOpen !== x.id) return;
    box.textContent = "";
    box.append(el("p", { class: "small center" }, el("b", {}, `Series ${x.name}`), ` · ${designs.length} buttons`),
      el("div", { class: "wall-grid" }, designs.map((d) => el("a", { href: "#wall/" + d.id, class: "wall-tile", title: `${d.name} (${d.rarity}${d.max_editions ? ", " + d.max_editions + " copies" : ""})` }, bannerImg(d)))));
  } catch (e) { box.textContent = e.message; }
}

// webmasters get multi-file drops and the batch switch
function setUploadMode() {
  const admin = !!(me && me.is_admin);
  $("add-batch-row").hidden = !admin;
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

async function openInfo(id, scroll = false) {
  const body = $("info-body");
  body.textContent = "Loading...";
  $("info-title").textContent = "Button info";
  document.querySelectorAll(".wall-tile").forEach((t) => t.classList.toggle("on", t.getAttribute("href") === "#wall/" + id));
  if (scroll) $("info-win").scrollIntoView({ behavior: "smooth", block: "nearest" }); // bring the info box into view
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
    el("p", {}, d.series ? el("b", { class: "series-tag" }, `Series ${d.series} · `) : null, el("b", {}, rarityTag(d.rarity)), ` · ${d.type}`),
    d.series_run ? el("p", { class: "small" }, d.series_out ? `Series ${d.series} is out of print! (${d.series_printed} printed)`
      : `Series ${d.series} print run: ${d.series_printed} of ${d.series_run} printed`) : null,
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
  dashExtras(s, list);
  // last gift in and out sit in the right-hand column, under "Visit a page"
  const gifts = $("dash-gifts");
  gifts.textContent = "";
  const giftBox = (title, g, dir) => el("div", { class: "dash-gift" }, el("span", { class: "small" }, title), pic(g),
    el("span", { class: "small" }, el("a", { href: "#banner/" + g.id }, label(g)), el("br"), `${dir} `, who(g.who), `, ${ago(g.at)}`));
  if (s.last_received) gifts.append(giftBox("Last gift you got:", s.last_received, "from"));
  if (s.last_given) gifts.append(giftBox("Last gift you gave:", s.last_given, "to"));
  if (s.sets_ready) li(el("b", { class: "hot" }, `★ ${s.sets_ready} set${s.sets_ready === 1 ? "" : "s"} complete!`), " Claim your reward on ",
    el("a", { href: "#u/" + encodeURIComponent(me.name) }, "your guestbook »"));
  li(`You have ${s.buttons} button${s.buttons === 1 ? "" : "s"} in your collection.`);
}

// v0.30: starter quests and the visit streak, at the top of the dashboard.
const STREAK_SAYS = { club: "a ~*~cLuB~*~ pack", club2: "2 ~*~cLuB~*~ packs", series: "a series pack" };
function dashExtras(s, list) {
  const top = [];
  const q = s.quests;
  if (q && !q.done) {
    top.push(el("li", { class: "quests dash-gap-after" }, el("b", {}, "★ Starter quests ★"), " (finish all 3 for a ~*~cLuB~*~ pack!)",
      el("ul", { class: "quest-list" }, q.steps.map((x) => el("li", { class: x.done ? "quest done" : "quest" }, x.done ? "☑ " : "☐ ", x.label)))));
  } else if (q && q.rewarded) {
    top.push(el("li", {}, el("b", { class: "hot" }, "★ Starter quests done! ★"), " A ~*~cLuB~*~ pack is on your shelf. Welcome 2 the cLuB!!"));
  }
  const st = s.streak;
  if (st) {
    // "Come back tomorrow for a ~*~cLuB~*~ pack!" / "Come back in 2 days for a Beta Series pack!" (v0.34.9)
    const says = (r) => r === "series" && st.series ? `a ${st.series} Series pack` : STREAK_SAYS[r];
    const wait = st.next ? st.next.day - Math.max(1, st.streak) : 0;
    const next = st.next ? ` Come back ${wait === 1 ? "tomorrow" : `in ${wait} days`} for ${says(st.next.reward)}!` : "";
    // day 1 is just your first visit: the streak starts when you come back (v0.34.8)
    top.push(el("li", { class: "dash-gap-after" }, streakChart(st),
      ...(st.streak <= 1 ? ["🔥 ", el("b", {}, "Start a visit streak!"), next]
        : ["🔥 ", el("b", {}, `Day ${st.streak} visit streak!`), st.given ? ` You got ${says(st.reward)} for coming back!` : "", next])));
  }
  list.prepend(...top);
  if ((st && st.given) || (q && q.rewarded)) loadPacksPanel(true);   // show the new packs on the shelf
}

// The streak week as a little track: 7 days, evenly spread, each with its pack above the day number.
// Week 1 is days 2-7 (v0.34.8: day 1 is just your first visit, so the streak starts at day 2); after
// that it shows the current week (days 8-14, 15-21...). v0.34.7: days you've been through show the real
// streak packs you got (gray once opened, each linking to its page), days before today are crossed out,
// and today is circled. Days ahead show what's coming.
function streakChart(st) {
  const n = st.streak;
  const start = n <= 7 ? 2 : n - ((n - 1) % 7);
  const got = Object.fromEntries((st.days || []).map((x) => [x.day, x]));
  const mini = (tile) => el("span", { class: "sk-mini" }, tile);
  const club = () => mini(packTile({ id: 0, source: "streak" }, "#"));
  const PICS = { club: () => [club()], club2: () => [club(), club()], series: () => [mini(packTile({ id: 0, source: "streak", series: st.series || STREAK_SERIES }, "#"))] };
  const TIPS = { club: "a ~*~cLuB~*~ pack", club2: "2 ~*~cLuB~*~ packs", series: "a series pack" };
  const cells = [];
  for (let d = start; d < (start === 2 ? 8 : start + 7); d++) {
    const r = streakDay(d);
    const state = d < n ? "past" : d === n ? "today" : "future";
    const g = got[d];
    let pics, tip = r ? `Day ${d}: ${TIPS[r]}` : `Day ${d}`;
    if (state !== "future" && g && g.packs.length) {
      // the real packs: click one for its page
      pics = g.packs.map((p) => {
        const t = packTile({ ...p, opened_at: p.opened ? 1 : null, revealed: !!p.revealed }, "#pack/" + p.id);
        t.title = `${packTitle(p)}${p.opened ? " (opened)" : " (still sealed)"}`;
        return el("span", { class: "sk-mini sk-real" }, t);
      });
    } else pics = r ? PICS[r]() : [el("span", { class: "sk-none" }, "·")];
    cells.push(el("span", { class: `sk-day sk-${state}` + (r ? " sk-" + r : ""), title: tip },
      el("span", { class: "sk-pack" + (pics.length > 1 ? " sk-stack" : "") }, pics),
      el("span", { class: "sk-num" }, String(d))));
  }
  return el("div", { class: "streak-chart", style: `grid-template-columns: repeat(${cells.length}, 1fr)` }, cells);
}
// the series pack shown on day 7: the current series' look
const STREAK_SERIES = "Beta";   // fallback: the server says which series is newest (st.series)
// same schedule as the server (lib/progress.js streakReward)
function streakDay(d) {
  if (d <= 1) return null;
  if (d <= 7) return { 2: "club", 3: "club", 5: "club2", 7: "series" }[d] || null;
  return { 3: "club", 5: "club", 7: "series" }[((d - 1) % 7) + 1] || null;
}

// ---------- trade in: 5 commons/uncommons for a sealed cLuB pack ----------
const TRADE_IN = 5;
let tradeInReady = false;
async function setupTradeIn() {
  const box = $("tradein-box"), grid = $("tradein-grid"), go = $("tradein-go"), count = $("tradein-count");
  if (!tradeInReady) { tradeInReady = true; box.addEventListener("toggle", () => { if (box.open) setupTradeIn(); }); }
  if (!box.open) return;
  const picked = new Set();
  const update = () => {
    const packs = Math.floor(picked.size / TRADE_IN);
    count.textContent = `${picked.size} picked` + (picked.size % TRADE_IN ? ` (${TRADE_IN - (picked.size % TRADE_IN)} more for the next pack)` : packs ? ` = ${packs} pack${packs === 1 ? "" : "s"}` : "");
    go.disabled = !packs || picked.size % TRADE_IN !== 0;
  };
  grid.textContent = "Loading...";
  let banners;
  try { ({ banners } = await api("/api/collection")); } catch (e) { grid.textContent = e.message; return; }
  const usable = banners.filter((b) => ["common", "uncommon"].includes(b.rarity) && !b.locked);
  grid.textContent = "";
  if (!usable.length) grid.append(el("p", { class: "small" }, "No commons or uncommons to trade in right now."));
  for (const b of usable) {
    const tile = el("button", { type: "button", class: "tile pick-tile", title: `${b.name} ${edition(b)}` }, bannerImg(b), el("span", { class: "small" }, edition(b)));
    tile.onclick = () => { picked.has(b.id) ? picked.delete(b.id) : picked.add(b.id); tile.classList.toggle("picked", picked.has(b.id)); update(); };
    grid.append(tile);
  }
  update();
  go.onclick = async () => {
    const n = picked.size / TRADE_IN;
    if (!(await ask(`Trade in ${picked.size} buttons for ${n} sealed ~*~cLuB~*~ pack${n === 1 ? "" : "s"}? They'll be gone for good!`, { ok: "Trade in!" }))) return;
    go.disabled = true;
    try {
      const r = await api("/api/tradein", { method: "POST", body: { copies: [...picked] } });
      say(`Traded in ${r.used} buttons for ${r.packs} sealed pack${r.packs === 1 ? "" : "s"}!`);
      loadPacksPanel(true); setupTradeIn(); loadSummary();
    } catch (e) { say(e.message); update(); }
  };
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

const smallList = (list, packs = []) => [
  ...list.map((b) => el("span", { class: "tr-item", title: `${b.name} ${edition(b)}` },
    el("a", { href: "#banner/" + b.id }, bannerImg(b)), el("span", { class: "small" }, ` ${b.name} ${edition(b)}`))),
  ...(packs || []).map((p) => el("span", { class: "tr-item", title: packTitle(p) },
    el("a", { href: "#pack/" + p.id }, packMini(p)), el("span", { class: "small" }, ` ${packTitle(p)}`)))];

// Sealed packs in trades and gifts (v0.34): a half-size copy of the real pack.
const packMini = (p) => el("span", { class: "pk-mini" }, packTile(p, "#"));

function tradeNote(t) {
  return el("div", { class: "entry trade-note" },
    el("p", { class: "small" }, `⇄ TRADE · ${fmtDate(t.at)}`),
    el("p", {}, el("a", { href: "#u/" + encodeURIComponent(t.from_name) }, t.from_name), " traded ",
      ...smallList(t.give, t.give_packs), " to ", el("a", { href: "#u/" + encodeURIComponent(t.to_name) }, t.to_name), " for ", ...smallList(t.want, t.want_packs)));
}

function pickGrid(box, list, picked, label) {
  box.textContent = "";
  const usable = list;   // ultras can be traded too (v0.30), just never to a bot
  if (!usable.length) { box.append(el("p", { class: "small" }, `No buttons ${label}.`)); return; }
  for (const b of usable) {
    const busy = b.locked && label === "to give";
    const tile = el("button", { type: "button", class: "tile pick-tile" + (picked.has(b.id) ? " picked" : "") + (busy ? " busy" : ""),
      title: busy ? "Already in another trade" : `${b.name} ${edition(b)}` },
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

// Sealed packs to pick for a trade (v0.34): up to 3 a side, on top of the buttons.
const pickedGiveP = new Set(), pickedWantP = new Set();
function packPickGrid(box, list, picked, giving, toBot) {
  box.textContent = "";
  box.hidden = !list.length;
  for (const p of list) {
    const busy = giving && p.in_trade, nope = giving && toBot && p.special;
    const tile = el("button", { type: "button", class: "tile pick-tile pack-pick" + (busy || nope ? " busy" : ""),
      title: busy ? "Already in another trade" : nope ? "Limited packs are for people, not bots" : packTitle(p) },
      packMini(p), el("span", { class: "small" }, busy ? "in a trade" : nope ? "not 4 bots" : "pack"));
    if (busy || nope) tile.disabled = true;
    tile.onclick = () => {
      if (picked.has(p.id)) picked.delete(p.id);
      else if (picked.size < 3) picked.add(p.id);
      else return say("Up to 3 packs on each side!");
      say("");
      tile.classList.toggle("picked", picked.has(p.id));
    };
    box.append(tile);
  }
}

$("trade-open").onclick = async () => {
  pickedGive.clear(); pickedWant.clear(); pickedGiveP.clear(); pickedWantP.clear();
  $("tb-note").value = "";
  const them = $("trade-panel").dataset.user, toBot = $("trade-panel").dataset.bot === "1";
  try {
    const [mine, myPacks, theirPacks] = await Promise.all([api("/api/collection"), api("/api/packs"),
      api("/api/packs?user=" + encodeURIComponent(them)).catch(() => ({ packs: [] }))]);
    pickGrid($("tb-give"), mine.banners, pickedGive, "to give");
    pickGrid($("tb-want"), tradeTheirs, pickedWant, "to ask for");
    packPickGrid($("tb-give-packs"), myPacks.packs.filter((p) => !p.revealed), pickedGiveP, true, toBot);
    packPickGrid($("tb-want-packs"), theirPacks.packs, pickedWantP, false, toBot);
    $("trade-builder").hidden = false;
  } catch (e) { say(e.message); }
};
$("tb-close").onclick = () => { $("trade-builder").hidden = true; };
$("tb-send").onclick = async () => {
  if (!(pickedGive.size + pickedGiveP.size) || !(pickedWant.size + pickedWantP.size)) return say("Pick at least one button or pack on each side!");
  try {
    await api("/api/trades", { method: "POST", body: {
      to: $("trade-panel").dataset.user, give: [...pickedGive], want: [...pickedWant],
      give_packs: [...pickedGiveP], want_packs: [...pickedWantP], message: $("tb-note").value } });
    $("trade-builder").hidden = true;
    say("Offer sent! Check the Trades page for their answer.");
  } catch (e) { say(e.message); }
};

async function showTrades() {
  showView("view-trades");
  setupTradeIn();
  const { incoming, outgoing, history } = await api("/api/trades");
  setTradeCount(incoming.length);
  const card = (t, buttons) => el("div", { class: "entry" },
    el("p", { class: "small" }, t.to_user === me.id
      ? el("span", {}, el("a", { href: "#u/" + encodeURIComponent(t.from_name) }, t.from_name), t.from_bot ? " [BOT]" : "", ` offered on ${fmtDate(t.created_at)}:`)
      : el("span", {}, "To ", el("a", { href: "#u/" + encodeURIComponent(t.to_name) }, t.to_name), t.to_bot ? " [BOT]" : "", ` on ${fmtDate(t.created_at)}:`)),
    el("p", {}, t.to_user === me.id ? "You get " : "You give ", ...smallList(t.give, t.give_packs)),
    el("p", {}, t.to_user === me.id ? "You give " : "You get ", ...smallList(t.want, t.want_packs)),
    t.message ? el("p", { class: "small" }, `"${t.message}"`) : null,
    t.status === "open" ? el("p", { class: "small" }, `Expires ${fmtDate(t.expires_at)}`) : null,
    buttons ? el("p", { class: "sign-buttons" }, buttons) : null);
  const act = (t, action, label) => el("button", { type: "button", onclick: async () => {
    if (action === "accept" && !(await ask("Accept this trade? Everything swaps right away.", { ok: "Deal!", cancel: "Hmm, wait" }))) return;
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

// Webmaster-only box on someone else's page: delete their account (bots and webmasters are protected).
function playerAdminBox(name, owner) {
  const box = $("page-admin");
  box.textContent = "";
  box.hidden = !(me && me.is_admin) || owner.is_bot || name.toLowerCase() === me.name.toLowerCase();
  if (box.hidden) return;
  box.append(el("p", { class: "small admin-head" }, el("b", {}, "☠ Webmaster")), el("button", { type: "button", onclick: async () => {
    const typed = await askText(`Delete ${name}'s account? Their buttons, packs, guestbook and wishes all go, and it can't be undone. Type their name to confirm:`, "", { ok: "Delete forever" });
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== name.toLowerCase()) return say("The name didn't match, so nothing was deleted.");
    try {
      await api("/api/admin", { method: "POST", body: { action: "delete_player", name, confirm: typed } });
      say(`${name}'s account was deleted.`);
      location.hash = "#u/" + encodeURIComponent(me.name);
    } catch (e) { say(e.message); }
  } }, "Delete this player"));
}

// ---------- request board ----------
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
// A grid of button pictures with names and a search box (v0.30). Only buttons you've seen get here.
function designPicker(designs) {
  let chosen = null;
  const label = el("b", {}, "(pick one below)");
  const grid = el("div", { class: "design-pick-grid" });
  const search = el("input", { type: "search", placeholder: "search buttons...", class: "design-search" });
  const sorted = [...designs].sort((a, b) => a.name.localeCompare(b.name));
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    grid.textContent = "";
    const list = sorted.filter((d) => !q || d.name.toLowerCase().includes(q));
    if (!list.length) grid.append(el("p", { class: "small" }, designs.length ? "Nothing matches." : "You haven't seen any buttons yet! Open packs and visit pages to find some."));
    for (const d of list) {
      const t = el("button", { type: "button", class: "tile pick-tile design-pick" + (chosen === d.id ? " picked" : ""), title: `${d.name} (${d.rarity})` },
        bannerImg(d), el("span", { class: "small" }, d.name), el("span", { class: "small rarity-" + d.rarity }, rarityTag(d.rarity)));
      t.onclick = () => { chosen = d.id; label.textContent = d.name; draw(); };
      grid.append(t);
    }
  };
  search.oninput = draw;
  draw();
  return { box: el("div", { class: "design-picker" }, search, grid), label, value: () => chosen };
}
function foilSelect() {
  const sel = el("select", {}, el("option", { value: "" }, "any finish"));
  for (const f of Object.values(FOILS).filter((f) => (f.kind || "foil") === "foil")) sel.append(el("option", { value: f.id }, f.id === "clear" ? "plain (no foil)" : f.name));
  return sel;
}

async function renderBoard() {
  const [{ requests }, { designs }] = await Promise.all([api("/api/board"), api("/api/designs")]);
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
          const thanks = r.rarity === "rare" ? "a series pack as thanks (one a day)" : "a sealed pack as thanks (one a day)";
          if (!(await ask(`Give your ${r.name} to ${r.user}? You'll get ${thanks}.`, { ok: "Give it!" }))) return;
          post({ action: "fill", id: r.id, copy }, (x) => x.pack === "series" ? "Filled! A series pack is on your shelf as thanks!"
            : x.pack ? "Filled! A sealed pack is on your shelf as thanks!" : "Filled! (You already got today's thank-you pack.)");
        })));
  }
  // post a request
  const rp = $("rq-post");
  rp.textContent = "";
  const rqPick = designPicker(seen.filter((d) => ["common", "uncommon", "rare"].includes(d.rarity))), rqFoil = foilSelect();
  rp.append(rqPick.box, el("p", {}, "I wish I had ", rqPick.label, " in ", rqFoil, " ",
    el("button", { type: "button", onclick: () => rqPick.value() ? post({ action: "request", design_id: rqPick.value(), foil: rqFoil.value || null }, "Request posted!") : say("Pick a button first.") }, "Post it")),
    el("p", { class: "small" }, "Up to 3 at a time. They last a week. Only buttons you've seen show up here!"));

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
  if (b) box.append("Stamping: ", ...(b.pack ? [packMini(b.pack), ` ${packTitle(b.pack)} `] : [bannerImg(b), ` ${b.name} ${edition(b)} `]),
    el("button", { type: "button", class: "mini", onclick: () => chooseGift(null) }, "remove"));
}
$("stamp-btn").onclick = () => { $("gift-picker").hidden = !$("gift-picker").hidden; };

$("sign-form").onsubmit = async (e) => {
  e.preventDefault();
  say("");
  const f = e.target;
  const pk = giftPick && giftPick.pack;
  const gift = giftPick && !pk ? giftPick.id : null;
  if (gift && !(await ask(`Stamp ${giftPick.name} ${edition(giftPick)} into ${f.dataset.user}'s guestbook? It'll be theirs to keep!`,
    { ok: "Send it!", cancel: "Wait, no", pic: bannerImg(giftPick, 2) }))) return;
  if (pk && !(await ask(`Stamp your sealed ${packTitle(pk)} into ${f.dataset.user}'s guestbook? They get to open it!`,
    { ok: "Send it!", cancel: "Wait, no", pic: packTile(pk, "#") }))) return;
  try {
    await api("/api/guestbook", { method: "POST", body: { user: f.dataset.user, message: f.message.value, instance_id: gift || null, pack_id: pk ? pk.id : null } });
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

// ---------- travel (v0.36) ----------
// Your buttons can visit your 4Dungeon (AWAY here: still yours, locked until it comes home) and your dungeon items
// can visit you here (text cards, display only for now). Same person in both games: one shared account.
const AWAY = -1;
function travelBox(b, reload) {
  if (!me || b.owner !== me.name || !b.registry_item || b.consumed) return null;
  if (b.locked === AWAY) return el("p", { class: "small" }, "✈ Away in your 4Dungeon. Still yours: it comes home when you send it back from 4Dungeon (Account → Inventory).");
  if (b.locked) return null;
  const go = el("button", { type: "button" }, "Send to my 4Dungeon");
  const msg = el("span", { class: "small" });
  go.onclick = async () => {
    if (!(await ask(`Send ${b.name} ${edition(b)} to visit your 4Dungeon? It stays yours, but can't be traded, fused or put on your wall until it comes home.`, { ok: "Send it", cancel: "Keep it here" }))) return;
    go.disabled = true; msg.textContent = " sending...";
    try { await api("/api/travel", { method: "POST", body: { action: "send", instance_id: b.id } }); reload(); }
    catch (e) { msg.textContent = " " + e.message; go.disabled = false; }
  };
  return el("p", {}, go, msg);
}
async function showVisitors(grid, mine, seq) {
  const old = document.getElementById("travel-box"); if (old) old.remove();
  if (!mine) return;
  let d; try { d = await api("/api/travel"); } catch (e) { return; }
  if (seq !== loadSeq || !d.visitors || !d.visitors.length) return;
  const box = el("div", { id: "travel-box" }, el("h2", {}, "» Visiting from 4Dungeon «"),
    el("p", { class: "small" }, "Dungeon items you sent here. Just visiting for now: send them back any time."));
  for (const v of d.visitors) {
    const back = el("button", { type: "button" }, "Send back");
    const card = el("div", { class: "visitor-card" }, el("b", {}, v.name), " ", rarityTag(v.rarity), ` #${v.copy}`,
      v.note ? el("div", { class: "small" }, v.note) : null, back);
    back.onclick = async () => {
      back.disabled = true;
      try { await api("/api/travel", { method: "POST", body: { action: "send_back", item_id: v.item_id, copy: v.copy } }); card.remove(); }
      catch (e) { back.disabled = false; alert(e.message); }
    };
    box.append(card);
  }
  grid.after(box);
}

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
    el("p", {}, b.series ? `Series ${b.series} · ` : "", `Type: ${b.type} · Rarity: `, rarityTag(b.rarity),
      b.max_editions ? ` · ${b.minted} of ${b.max_editions} copies made` : ` · ${b.minted} copies so far`),
    ownedLine(b, history),
    travelBox(b, () => showBanner(id)),

    el("h2", {}, "» Credits «"),
    b.tier === "original" && b.status !== "removed" ? useBox(b) : null,
    b.status === "removed" ? null : credit(b) || el("p", { class: "small" }, "No credit recorded."),
    tierNote(b, b.webmaster),
    adminBox(b.design_id, b.name, b.status, b.found_by, () => showBanner(id)),
    b.source_url ? el("p", { class: "small" }, "Original: ", el("a", { href: b.source_url, target: "_blank", rel: "noopener" }, b.source_url)) : null,
    b.tier === "original" ? el("p", { class: "small" }, "The credit is also written inside the button's GIF file.") : null,

    el("h2", {}, "» On the Ledger «"),
    el("p", {}, "Chain check: ", el("b", { class: chain.ok ? "ok-text" : "bad-text" }, chain.ok ? "ALL GOOD" : "BROKEN"),
      ` (${chain.entries} entries) · `, el("a", { href: "#fair/ledger" }, "how this works")),
    el("p", { class: "small" }, "Design recorded: ",
      de ? `${fmtStamp(de.created_at)} as ledger entry #${de.id}` : "not sealed yet"),
    de ? el("p", { class: "small" }, "Design fingerprint: ", el("span", { class: "hash" }, de.hash)) : null,
    el("p", { class: "small" }, "Artwork fingerprint: ", el("span", { class: "hash" }, b.image_hash)),

    el("h2", {}, "» Travel Log «"),
    el("ol", { class: "log" }, history.map((h) => el("li", {},
      `${fmtStamp(h.created_at)}: ${HOW[h.reason] || h.reason}`,
      h.reason === "fusion"
        ? (h.to_name ? ` by ${h.to_name}: came out shinier` : " → used up")
        : h.reason === "trade_in" ? [h.from_name ? ` by ${h.from_name}` : "", " for a sealed pack"]
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
const PACK_FROM = { welcome: "welcome to the cLuB!", webmaster: "a gift from the webmaster", milestone: "a visitor milestone", set: "finishing a set", request: "the request board", quest: "finishing the starter quests", streak: "a visit streak", trade_in: "a trade-in" };
const packLabel = (p) => (p.special ? "Special " : "") + (p.source === "welcome" ? "Welcome" : p.series ? `Series ${p.series}` : "~*~ cLuB ~*~") + " Pack";
// Limited special packs are numbered per series: "Beta Gold Master Pack #7 of 25". Others use the pack's id.
const limitedName = (p) => `${p.series} ${p.special_name || "Special"} Pack`;
const packTitle = (p) => (p.special_no ? `${limitedName(p)} #${p.special_no} of ${p.special_limit || 25}` : `${packLabel(p)} #${p.id}`);

// ---------- pack art (v0.27) ----------
// Series packs are crimped pouches with their series' own look (Alpha: night sky that twinkles,
// Beta: green terminal with a CRT refresh line; their limited packs: Cool Site of the Day rosette
// and the Gold Master disc). Shelf packs (daily, welcome, free, mixed) keep the rounded outline with a picture.
const PACK_TOP = "~*~ 88x31 cLuB ~*~";
const PACK_THEMES = new Set(["alpha", "beta"]);   // series with their own pack art
const spanC = (cls, ...kids) => el("span", { class: cls }, ...kids);
const packSparks = () => [[14, 22, 0, ""], [74, 40, .9, "s"], [30, 70, 1.7, ""], [80, 92, .4, "s"], [16, 110, 1.3, "s"], [60, 16, 2.1, "s"]]
  .map(([x, y, d, c]) => el("span", { class: "spark " + c, style: `left:${x}px;top:${y}px;animation-delay:${(d + Math.random() * .6).toFixed(2)}s` }));
const packRain = () => ["01ｱｲｳ10ｴｵ1", "ｶ0ｷ1ｸｹ0ｺ1", "1ｻｼ0ｽ1ｾｿ0", "0ﾀ1ﾁﾂ0ﾃ1ﾄ", "ﾅ1ﾆ0ﾇﾈ1ﾉ0", "1ﾊ0ﾋﾌ1ﾍ0ﾎ"]
  .map((t, i) => el("span", { class: "rain", style: `left:${4 + i * 16}px;animation-duration:${(3.2 + (i % 3) * 1.1).toFixed(1)}s;animation-delay:-${(i * .7).toFixed(1)}s` }, t));

function packArt({ shape, theme, parts, title = "", cls = "", href = "#" }) {
  return el("a", { href, class: `pack-tile ${shape} th-${theme}${cls ? " " + cls : ""}`, title },
    el("span", { class: "pack-art" }, shape === "pouch" ? spanC("crimp t") : null, ...parts, shape === "pouch" ? spanC("crimp b") : null));
}

function packTile(p, href) {
  const s = (p.series || "").toLowerCase(), themed = PACK_THEMES.has(s);
  const sub = p.revealed ? "opened!" : p.special_no ? `#${p.special_no} of ${p.special_limit || 25}`
    : p.special ? (p.series ? `★ series ${s} ★` : "★ foils inside! ★") : "sealed pack";
  const title = p.special_no ? packTitle(p) : p.note || PACK_FROM[p.source] || "";
  const top = (t = PACK_TOP) => spanC("pack-top", t);
  const name = (t) => spanC("pack-name" + (t.length > 11 ? " long" : ""), t);
  const special = p.special_no ? (p.special_name || "Special").toUpperCase() : "SPECIAL";
  let shape = "flat", theme, cls = "", parts;
  if (p.series) {
    shape = "pouch";
    const sTop = `~*~ cLuB ~*~ · ${p.series}`;
    if (p.special && s === "alpha") {
      theme = "alpha-sp"; cls = "glow-holo";
      parts = [...packSparks(), top(sTop), spanC("rosette", (p.special_name || "Special").toUpperCase()), spanC("pack-name", "SERIES ALPHA"), spanC("pack-sub", sub)];
    } else if (p.special && s === "beta") {
      theme = "beta-sp"; cls = "glow-gold";
      parts = [spanC("refresh gold"), top(sTop), spanC("disc"), spanC("pack-name", special), spanC("bar", "[███████] 100%"), spanC("ser2", "SERIES BETA"), spanC("pack-sub", sub)];
    } else if (p.special) {
      theme = "special"; cls = "glow-holo";
      parts = [spanC("gleam"), top(sTop), name(special), spanC("pack-sub", sub)];
    } else if (s === "alpha") {
      theme = "alpha";
      parts = [spanC("gleam"), ...packSparks(), top(), spanC("rainbow"), spanC("pack-name", "ALPHA"), spanC("pack-sub", p.revealed ? sub : "series alpha"), spanC("hazard")];
    } else if (s === "beta") {
      theme = "beta";
      parts = [...packRain(), spanC("scan"), spanC("refresh"), top(), spanC("win", el("img", { src: "banners/beta/beta-dos-prompt.gif", alt: "", width: "88", height: "31" })),
        spanC("pack-name", "BETA"), spanC("prompt", "C:\\>", spanC("cur", "█")), spanC("pack-sub", sub)];
    } else {
      theme = "series";
      parts = [spanC("gleam"), top(), name(`SERIES ${p.series.toUpperCase()}`), spanC("pack-sub", sub)];
    }
  } else if (p.special) {
    theme = "special";
    parts = [spanC("gleam"), top(), name("SPECIAL"), spanC("pack-sub", sub)];
  } else if (p.source === "welcome") {
    theme = "welcome";
    parts = [spanC("confetti"), spanC("gleam"), top(), spanC("script", "Welcome"), spanC("pack-sub", sub)];
  } else {
    // the ~*~ cLuB ~*~ pack: one of three looks, picked by its number so a pack always keeps its look
    // (v0.33: six looks, a-f, picked by pack number)
    const look = "abcdef"[(Number(p.id) || 0) % 6];
    theme = "club-" + look;
    const name = spanC("club-name", "~*~cLuB~*~ pack"), sealed = spanC("pack-sub", p.revealed ? "opened!" : look === "d" ? "Sealed Pack ♡" : look === "e" ? "$ealed Pack" : "Sealed Pack");
    const at = (node, style) => { node.setAttribute("style", style); return node; };
    parts = look === "d" ? [el("span", { class: "hearts" }, "♡ ♥ ♡ ♥ ♡\n".repeat(9)), spanC("gleam"), top(),
        el("span", { class: "kitty" }, "=^･ω･^=", el("i", { class: "l" }), el("i", { class: "r" })),
        at(spanC("twinkle", "✦"), "left:8px;top:30px"), at(spanC("twinkle t2", "✦"), "right:9px;top:44px"), at(spanC("twinkle t3", "✧"), "left:16px;top:96px"), name, sealed]
      : look === "e" ? [spanC("gems"), spanC("gleam"), top(), spanC("bling", "BLiNG"), spanC("gem"),
        at(spanC("sparkle"), "left:14px;top:26px"), at(spanC("sparkle"), "right:12px;top:58px;animation-delay:.5s"), at(spanC("sparkle"), "left:22px;bottom:30px;animation-delay:1s"), name, sealed]
      : look === "f" ? [spanC("gleam"), top(), el("span", { class: "holo-heart" }, el("b", {}, "88x31")), spanC("stk xo", "xoxo"), spanC("stk qt", "QT ♡"),
        at(spanC("star", "★"), "left:8px;top:20px"), at(spanC("star", "★"), "right:10px;top:82px;font-size:10px"), name, sealed]
      : look === "a" ? [spanC("gleam"), top(), spanC("sticker", "NEW!"), spanC("logo", "88x31"), name, sealed]
      : look === "b" ? [spanC("gleam"), top(), el("span", { class: "club-btn" }, el("i", {}, "~*~"), "\u00a0cLuB\u00a0", el("i", {}, "~*~")), name, spanC("stars3", "★★★"), sealed]
      : [spanC("gleam"), top(), el("span", { class: "win95" }, el("span", { class: "tb" }, "~*~ cLuB ~*~", el("i", {}, "x")), el("span", { class: "addr" }, "88x31.app"),
          el("span", { class: "pg" }, el("b", {}, "Welcome 2"), el("em", {}, "~*~ 88x31 cLuB ~*~"), spanC("uc"))), name, sealed];
  }
  return packArt({ shape, theme, parts, title, href, cls: cls + (p.revealed ? " revealed" : "") + (p.opened_at ? " spent" : "") });
}
function dailyTile(done, label) {
  return packArt({ shape: "flat", theme: "daily", cls: done ? "used" : "", title: done ? "Opened! New ones tomorrow." : "Today's daily pack",
    parts: [spanC("rays"), spanC("gleam"), spanC("pack-top", PACK_TOP), spanC("sun"), spanC("horizon"), spanC("pack-name", "DAILY"), spanC("pack-sub", done ? "back tomorrow!" : label)] });
}
function freeTile() {
  return packArt({ shape: "flat", theme: "free", cls: "glow",
    parts: [spanC("ribbon-v"), spanC("ribbon-h"), spanC("bow"), spanC("gleam"), spanC("pack-top", PACK_TOP), spanC("nmwrap", spanC("pack-name", "FREE PACK"), spanC("pack-sub", "open me!"))] });
}

// ---------- opening a pack (v0.27) ----------
// Series packs open (Alpha and new series: rip, then deal & flip; Beta: CRT power off/on).
// Shelf packs reveal (glow, then deal & flip). Rares and ultras flip last.
// openingStage(art, cards, kind) -> { node, play() }; append node, then call play().
const RANK_OF = { common: 0, uncommon: 1, rare: 2, prototype: 3, ultra: 4, special: 5 };
const openKind = (p) => (!p.series ? "reveal" : p.series.toLowerCase() === "beta" ? "tv" : "rip");
function openingStage(art, cards, kind) {
  const row = el("div", { class: "pull-row" });
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!art || still) { row.append(...cards); return { node: row, play() {} }; }
  const rank = (c) => RANK_OF[(/rarity-(\w+)/.exec(c.className) || [])[1]] ?? 0;
  const order = cards.map((c, i) => ({ i, r: rank(c) })).sort((a, b) => a.r - b.r || a.i - b.i);
  const turn = []; order.forEach((o, k) => (turn[o.i] = k));
  const flip = kind !== "tv";
  const items = cards.map((c, i) => {
    if (!flip) { c.classList.add("tv-card"); c.style.setProperty("--i", i); return c; }
    return el("div", { class: "flipcard" + (rank(c) >= 2 ? " is-rare" : ""), style: `--i:${i};--k:${turn[i]}` },
      el("div", { class: "flip-inner" }, c, el("div", { class: "card back flip-back", "aria-hidden": "true" }, "?")));
  });
  row.append(...items);
  art.removeAttribute("href"); art.tabIndex = -1;
  const box = el("div", { class: "packbox", "aria-hidden": "true" }, el("div", { class: "packbody" }, art));
  if (kind === "rip") box.append(el("div", { class: "tearpiece" }, art.cloneNode(true)));
  const stage = el("div", { class: `open-stage op-${kind} animating` }, row, box);
  const T = { rip: [.85, 2.1], reveal: [.65, 1.9], tv: [.75, 0] }[kind];
  stage.style.setProperty("--d0", T[0] + "s"); stage.style.setProperty("--f0", T[1] + "s");
  const n = items.length, rare = items.some((x) => x.classList.contains("is-rare"));
  const end = flip ? T[1] + (n - 1) * .85 + .8 + (rare ? 1.2 : 0) : T[0] + (n - 1) * .2 + .7;
  return { node: stage, play() {
    requestAnimationFrame(() => {
      // deal each card out from the middle, where the pack is
      const sr = stage.getBoundingClientRect(), cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
      for (const it of items) {
        const r = it.getBoundingClientRect();
        it.style.setProperty("--dx", Math.round(cx - (r.left + r.width / 2)) + "px");
        it.style.setProperty("--dy", Math.round(cy - (r.top + r.height / 2)) + "px");
      }
      stage.classList.add("go");
      setTimeout(() => stage.classList.remove("animating"), end * 1000);
    });
  } };
}

// The Packs section on your own page: today's daily packs and your sealed packs, side by side.
// Clicking one opens it right there.
async function loadPacksPanel(mine) {
  const panel = $("packs-panel");
  panel.hidden = !mine;
  if (!mine) return;
  const grid = $("packs-grid");
  try {
    let [sum, { packs }] = await Promise.all([api("/api/summary"), api("/api/packs")]);
    // that summary may have just handed out a streak or quest pack: fetch the shelf again
    if ((sum.streak && sum.streak.given) || (sum.quests && sum.quests.rewarded)) ({ packs } = await api("/api/packs"));
    grid.textContent = "";
    const used = sum.pulls_per_day - sum.packs_left;
    for (let i = 1; i <= sum.pulls_per_day; i++) {
      const done = i <= used;
      const t = dailyTile(done, `pack ${i} of ${sum.pulls_per_day}`);
      t.onclick = async (e) => {
        e.preventDefault();
        if (done) return;
        if (!(openingKey === "daily" && $("pack-open").childElementCount) && !(await holdToOpen({ daily: true }, t))) return;
        if (startOpening("daily", t)) showPull().catch((err) => say(err.message));
      };
      grid.append(el("div", { class: "pack-slot" }, t, el("span", { class: "small" }, done ? "opened today" : "keep 1")));
    }
    for (const p of packs) {
      const t = packTile(p, "#pack/" + p.id);
      if (p.in_trade) {   // offered in a trade (v0.34): sealed shut until the trade's answered
        t.classList.add("in-trade");
        t.onclick = (e) => { e.preventDefault(); say("That pack is in a trade offer. Cancel the offer on the Trades page to open it."); };
        grid.append(el("div", { class: "pack-slot" }, t, el("span", { class: "small" }, el("a", { href: "#trades" }, "in a trade"))));
        continue;
      }
      const go = () => { if (startOpening("pack" + p.id, t)) openPackCards(p, $("pack-open"), afterOpening); };
      t.onclick = async (e) => {
        e.preventDefault();
        if (t.dataset.tore) return;   // a tear just opened it
        const again = openingKey === "pack" + p.id && $("pack-open").childElementCount;
        if (!again && !p.revealed && !(await holdToOpen(p, t))) return;
        go();
      };
      if (!p.revealed) addTear(t, go);
      grid.append(el("div", { class: "pack-slot" }, t, el("span", { class: "small" }, p.note || PACK_FROM[p.source] || "")));
    }
  } catch {}
}
// Which pack is open right now. Clicking it again just takes you back to its cards instead of
// opening it all over again; the tile shows "opened!" while you pick.
let openingKey = null;
function startOpening(key, tile) {
  if (openingKey === key && $("pack-open").childElementCount) { $("pack-open").scrollIntoView({ behavior: "smooth", block: "nearest" }); return false; }
  openingKey = key;
  tile.classList.add("revealed");
  const sub = tile.querySelector(".pack-sub");
  if (sub) sub.textContent = "opened!";
  return true;
}
// after any pack is opened: refresh the packs and the collection under them
function afterOpening() { openingKey = null; loadPacksPanel(true); if (me) showPage(me.name).catch(() => {}); }
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
  box.append(el("h2", {}, `» ${packTitle(p)} «`),
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
    open.onclick = async () => {
      if (!(await holdToOpen(p, box.querySelector(".pack-tile") || open))) return;
      open.disabled = true; openPackCards(p, box);
    };
    const pageTile = box.querySelector(".pack-tile");
    if (pageTile) { pageTile.onclick = (e) => { e.preventDefault(); if (!pageTile.dataset.tore) open.click(); }; addTear(pageTile, () => { open.disabled = true; openPackCards(p, box); }); }
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
      h.reason === "made" ? ["made for ", h.to_name || "a former player"]
        : [h.reason === "trade" ? "traded by " : h.reason === "guestbook" ? "stamped by " : "given by ", h.from_name || "a former player",
           h.reason === "guestbook" ? " into the guestbook of " : " to ", h.to_name || "a former player"],
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
  box.append(el("h3", { class: "center" }, packTitle(p)),
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
  const stage = openingStage(packTile(p, "#"), cards, openKind(p));
  box.append(stage.node, el("p", { class: "center" }, go));
  stage.play();
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

// Webmasters: hand out sealed packs to a player or everyone. Special packs are the limited ones:
// numbered per series ("Beta Gold Master Pack #7 of 25"), never for bots.
let givePacksReady = false, giveSeries = [];
async function setupGivePacks() {
  const form = $("givepacks-form");
  form.hidden = !(me && me.is_admin);
  if (form.hidden || givePacksReady) return;
  givePacksReady = true;
  const msg = $("givepacks-msg");
  const gSay = (t) => { msg.textContent = t || ""; };
  try {
    giveSeries = (await api("/api/series")).series;
    const keep = form.series.value;
    form.series.textContent = "";
    form.series.append(el("option", { value: "" }, "~*~ cLuB ~*~ pack"),
      ...giveSeries.map((x) => el("option", { value: x.id }, `Series ${x.name}` + (x.out_of_print ? " (out of print)" : x.status !== "active" ? ` (${x.status})` : ""))));
    form.series.value = keep;
  } catch {}
  const hint = () => {
    const x = giveSeries.find((g) => String(g.id) === form.series.value);
    $("givepacks-hint").textContent = !form.special.checked ? ""
      : !x ? "Pick a series: special packs belong to one."
      : `${x.name} ${x.special_name || "Special"} Packs: ${x.special_limit - x.special_made} of ${x.special_limit} left`;
  };
  form.special.onchange = hint; form.series.onchange = hint; hint();
  form.onsubmit = async (e) => {
    e.preventDefault();
    gSay("");
    const name = form.name.value.trim(), count = Number(form.count.value) || 1;
    const everyone = name.toLowerCase() === "everyone";
    if (!name) return gSay('Type a player\'s name, or "everyone".');
    const special = form.special.checked;
    const x = giveSeries.find((g) => String(g.id) === form.series.value);
    if (special && !x) return gSay("Special packs belong to a series. Pick one!");
    const who = everyone ? (special ? "EVERYONE (people only)" : "EVERYONE (bots too)") : name;
    const what = special ? `${x.name} ${x.special_name || "Special"} Pack` : "sealed pack";
    if (!(await ask(`Give ${count} ${what}${count === 1 ? "" : "s"} to ${who}?`, { ok: "Give!" }))) return;
    try {
      const r = await api("/api/admin", { method: "POST", body: { action: "give_packs", everyone, name, count, special, series_id: form.series.value || null, note: form.note.value } });
      gSay(`Gave out ${r.made} ${special ? what : "pack"}${r.made === 1 ? "" : "s"}!`);
      form.note.value = "";
      loadShelf(true);
      givePacksReady = false; setupGivePacks();
    } catch (err) { gSay(err.message); }
  };
}

// ---------- Fuse: 3 copies of one button in, 1 shinier one out ----------
// Shown on your own copy's page when you have at least 3 copies of that button.
function fuseBox(b) {
  if (!me || !b.owner || b.consumed || b.owner.toLowerCase() !== me.name.toLowerCase() || (b.rarity === "ultra" || b.rarity === "prototype")) return null;
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
  guestbook: "as a guestbook gift", free_pack: "in their free pack", trade: "in a trade", open_trade: "in an open trade", request: "for their request", gift: "as a gift", fusion: "from a fusion", set_reward: "for finishing a set", found: "and added it to ~*~ tHe cLuB ~*~", trade_in: "",
};
function ownedLine(b, history) {
  const who = (name) => el("a", { href: "#u/" + encodeURIComponent(name) }, name);
  if (b.consumed) return el("p", {}, (history[history.length - 1] || {}).reason === "trade_in"
    ? "Traded in for a sealed pack. Gone, but not forgotten!" : "Used up in a fusion. It lives on in a shinier copy.");
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
  if (st.prototype_of) return el("p", { class: "variant proto-note" }, `✎ ${st.variant || "Draft"} prototype of ${st.prototype_of} ✎`);
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
  delete_player: "a player's account was deleted",
  give_packs: "handed out sealed packs!",
  series_create: "started planning something new...",
  series_status: "changed which series are in packs",
  series_run: "changed a series' print run",
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
// who did it (v0.34.2): their page, or "a former player" once the account is gone
const ledWho = (h) => h.who ? el("a", { href: "#u/" + encodeURIComponent(h.who) }, h.who) : "a former player";
// (v0.37) Every line starts with the button or pack, then who: "LUNA.GIF #5 was pulled by kura",
// "Sealed pack #12 was opened by kura!" The card is the main thing.
const ledUser = (n) => (n ? el("a", { href: "#u/" + encodeURIComponent(n) }, n) : "a former player");
// a copy changing hands: c = the copy, to = who got it, from = who gave it (if anyone)
const MOVED = {
  welcome: (c, to) => [c, " went to ", to, " in a welcome pack"],
  daily: (c, to) => [c, " was pulled by ", to],
  starter: (c, to) => [c, " went to ", to, " to start with"],
  free_pack: (c, to) => [c, " was pulled by ", to, " from a free pack"],
  pack: (c, to) => [c, " was opened by ", to, " from a sealed pack"],
  set_reward: (c, to) => [c, " was earned by ", to, " for finishing a set"],
  found: (c, to) => [c, " was found by ", to, " and added to the cLuB"],
  admin: (c, to) => [c, " was given to ", to, " by the webmaster"],
  fusion: (c, to) => [c, " was made by ", to, " in a fusion"],
  away: (c, to) => [c, " was sent by ", to, " to visit 4Dungeon"],
  home: (c, to) => [c, " came home to ", to, " from 4Dungeon"],
  pass_on: (c, to, from) => [c, " was passed on to ", to, " by ", from],
  guestbook: (c, to, from) => [c, " was given to ", to, " by ", from, " as a guestbook gift"],
  gift: (c, to, from) => [c, " was given to ", to, " by ", from],
  trade: (c, to, from) => [c, " was traded to ", to, " by ", from],
  open_trade: (c, to, from) => [c, " went to ", to, " in an open trade with ", from],
  request: (c, to, from) => [c, " was given to ", to, " by ", from, ", filling their request"],
  trade_in: (c, to, from) => [c, " was traded in by ", from, " for a sealed pack"],
};
function ledgerItem(h) {
    // line 1 (small): when + fingerprint · line 2: what happened
    const meta = el("div", { class: "led-meta" }, fmtStamp(h.created_at), " · ",
      el("span", { class: "hash", title: h.hash }, h.hash.slice(0, 12) + "…"));
    const line = (...kids) => el("div", { class: "led-what" }, ...kids);
    const packName = () => (h.pack_special_no
      ? el("a", { href: "#pack/" + h.pack_id }, `${h.pack_series} ${h.pack_special_name || "Special"} Pack #${h.pack_special_no} of ${h.pack_special_limit || 25}`)
      : ["Sealed pack ", el("a", { href: "#pack/" + h.pack_id }, `#${h.pack_id}`)]);
    const copy = () => [ledName(h, h.design || "a button"), h.mystery ? "" : ` #${h.edition ?? "?"}`];
    let what;
    if (h.kind === "design") {
      const info = h.mystery ? "" : ` (${h.rarity}`
        + `${h.max_editions ? ", " + h.max_editions + (h.max_editions === 1 ? " copy" : " copies") : ""}`
        + `${h.license ? ", " + (h.license === "Original" ? "original art" : h.license) : ""})`;
      const name = h.mystery ? ledName(h, "") : ledName(h, h.design || "?");
      what = h.who ? line(name, info, " was found by ", ledWho(h), " and joined ~*~ tHe cLuB ~*~")
        : line(name, info, " joined ~*~ tHe cLuB ~*~ as a new design");
    } else if (h.kind === "fusion") {
      const name = h.fused_status === "removed" ? "a removed button" : h.fused_design || "a button";
      const fin = finishName({ foil: h.fused_foil, pattern: h.fused_pattern, effect: h.fused_effect });
      what = line(ledName(h, name), h.mystery ? "" : ` #${h.fused_edition ?? "?"}`, " was fused from 3 copies by ", ledWho(h), h.mystery ? "!" : `, now ${fin}!`);
    } else if (h.kind === "foil") {
      const fin = finishName(h);
      const plain = h.foil === "clear" && !h.effect, dull = !tierOf(h.foil) && !h.pattern && !h.effect;
      const f = plain ? "no foil" : dull ? `a ${fin.toLowerCase()} finish` : `a ${fin.toUpperCase()} finish`;
      what = line(...copy(), ` came with ${h.mystery ? "a finish" : f}`, h.who ? [" for ", ledWho(h)] : null, !h.mystery && !plain && !dull ? "!" : "");
    } else if (h.kind === "request") {
      what = line(h.mystery ? ledName(h, "") : [h.request_foil ? `A ${foilName(h.request_foil) === "None" ? "plain" : foilName(h.request_foil)} ` : "", ledName(h, h.design || "a button")],
        " was wished for by ", ledWho(h), " on the request board");
    } else if (h.kind === "pack") {
      what = h.pack_reason === "made" ? line(packName(), " was made for ", ledUser(h.pack_to), ` (${PACK_FROM[h.pack_source] || h.pack_source})`)
        : line(packName(), ` was ${h.pack_reason === "trade" ? "traded" : h.pack_reason === "guestbook" ? "stamped" : "given"} to `, ledUser(h.pack_to), " by ", ledUser(h.pack_from));
    } else if (h.kind === "pack_open") {
      what = line(packName(), " was opened by ", ledWho(h), "!");
    } else if (h.kind === "admin") {
      what = line(el("b", {}, "WEBMASTER "), ADMIN_SAYS[h.admin_action] || "did some upkeep");
    } else {
      const say = MOVED[h.reason];
      what = say ? line(...say(copy(), ledUser(h.to_name), ledUser(h.from_name)).flat())
        : line(...copy(), ` went to `, ledUser(h.to_name), ` (${h.reason})`);
    }
  return el("li", { value: h.id }, meta, what);
}

let ledgerLast = null, ledgerOldest = null;
// The ledger stays as you left it (older pages and all) when you pop over to a button and come back.
let ledgerShownAt = 0;
async function showLedger(force = false) {
  if (!force && ledgerShownAt && Date.now() - ledgerShownAt < 10 * 60 * 1000 && $("ledger-recent").childElementCount) return;
  ledgerShownAt = Date.now();
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
// ---------- How to Play & Fair Play ----------
// Every number on both pages comes from /api/odds, which reads the game's own settings.
let oddsCache = null;
const getOdds = async () => (oddsCache ||= await api("/api/odds"));
const pathGet = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
// percent, without trailing zeros: 69.9%, 0.1%, 0.263%
const pctTxt = (n) => (n == null ? "-" : `${n >= 1 ? +n.toFixed(2) : +n.toFixed(3)}%`);
function fillNumbers(root, o) {
  for (const b of root.querySelectorAll("[data-n]")) {
    const v = pathGet(o, b.dataset.n);
    if (v != null) b.textContent = (typeof v === "number" ? +v.toFixed(3) : v) + (b.dataset.suf || "");
  }
}
async function showHowto() { try { fillNumbers($("howto"), await getOdds()); } catch {} }

const RARITIES = ["common", "uncommon", "rare", "prototype", "ultra"];
const cell = (tag, ...kids) => el(tag, {}, ...kids);
function table(head, rows) {
  return el("table", { class: "odds-table" }, el("thead", {}, el("tr", {}, head.map((h) => cell("th", h)))),
    el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c, i) => el(i ? "td" : "th", i ? {} : { scope: "row" }, c))))));
}
async function showFair() {
  showLedger().catch(() => {});
  let o;
  try { o = await getOdds(); } catch (e) { $("fair-oops").textContent = "Couldn't load the numbers right now. Try again in a minute!"; return; }
  fillNumbers($("fair"), o);
  const R = o.rarity, P = o.packs, F = o.foils;
  const live = o.series.filter((s) => s.status === "active");
  const cap = (r) => r[0].toUpperCase() + r.slice(1);

  // what "Limited" means, and each series' limited pack by name (v0.34.11)
  const named = o.series.filter((s) => s.special_name);
  const limitedNote = el("p", { class: "small" }, el("b", {}, "Limited packs: "),
    `every series has one Limited pack, a numbered run of ${named[0]?.special_limit || 25}, with a guaranteed rare and better foils.`,
    named.length ? [" ", ...named.flatMap((s, i) => [i ? " · " : "", `Series ${s.name}: `, el("b", {}, `${s.special_name} Pack`)])] : []);

  // rarity chances, per card
  $("fair-odds").replaceChildren(
    table(["Rarity", "Most packs", "Limited packs", "Free pack"],
      RARITIES.map((r) => [cap(r), pctTxt(R.normal[r]), pctTxt(R.special[r]), R.free[r] == null ? "none" : pctTxt(R.free[r])])),
    limitedNote,
    live.length > 1 ? el("p", { class: "small" }, "Newer series show up more often: ",
      live.flatMap((s, i) => [i ? ", " : "", `Series ${s.name} ${pctTxt(s.pack_share)}`]), ".") : null);

  // packs: cards and keeps
  $("fair-packs").replaceChildren(table(["Pack", "Cards", "You keep", "Good to know"], [
    ["Daily", "3", String(P.daily.keep), `${P.daily.per_day} a day. ${pctTxt(P.daily.found_chance)} have a found button, ${pctTxt(P.daily.bonus_chance)} have a BONUS PACK card!`],
    ["Welcome & ~*~cLuB~*~", "3", String(P.sealed.keep), `${pctTxt(P.daily.found_chance)} have a found button`],
    ["Series", "3", String(P.sealed.keep), "Only that series"],
    [named.length ? [document.createTextNode("Limited"), el("small", {}, `(${named.map((s) => s.special_name).join(", ")})`)] : "Limited", "3", String(P.sealed.keep), "Only that series, 1 rare guaranteed, always at least 1 foil, numbered"],
    ["Free", "1", "1", "No prototypes or ultras"],
  ]));

  // foils, by tier
  const anyFoil = (t) => 100 - (t[0] || 0);
  const tierRow = (label, k) => [label, pctTxt(F.normal.tiers[k]), pctTxt(F.special.tiers[k])];
  $("fair-foils").replaceChildren(
    table(["Finish", "Most packs", "Limited packs"], [
      tierRow("Plain, Glitter or Sheen", 0), tierRow("Tier 1 (Holo, Galaxy, Ripple)", 1),
      tierRow("Tier 2 (Chrome, Gold, Oil Slick)", 2), tierRow("Tier 3 (Prismatic, ???, ???)", 3),
      ["Any real foil", pctTxt(anyFoil(F.normal.tiers)), pctTxt(anyFoil(F.special.tiers))],
    ]),
    limitedNote.cloneNode(true),
    el("p", { class: "small" }, `Some real foils also get a pattern (${pctTxt(F.pattern_chance)}), and ${pctTxt(F.effect_chance)} of new buttons do something strange on screen. Finding a button first gives you a ${pctTxt(anyFoil(F.finder.tiers))} foil chance on copy #1!`));

  // print runs and limited packs, live
  const bar = (done, total) => el("span", { class: "fair-bar", title: `${done} of ${total}` }, el("span", { style: `width:${total ? Math.min(100, (done / total) * 100) : 0}%` }));
  // each series with pictures of its two packs (v0.34.3): the regular pouch and its limited pack
  const still = (p, sub) => {   // a pack picture that just sits there (no link, no tear)
    const t = packTile(p, "#");
    t.classList.add("still");
    t.onclick = (e) => e.preventDefault();
    if (sub) { const x = t.querySelector(".pack-sub"); if (x) x.textContent = sub; }
    return t;
  };
  const RN = { common: "common", uncommon: "uncommon", rare: "rare", prototype: "prototype", ultra: "ultra" };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const lineup = (b) => Object.keys(RN).filter((r) => b[r]).map((r) => plural(b[r].count, RN[r])
    + (r === "prototype" && b[r].cap ? ` (${b[r].cap} copies each)` : r === "ultra" && b[r].cap === 1 ? " (1 of 1)" : "")).join(" · ");
  $("fair-runs").replaceChildren(...(o.series.length ? o.series.map((s) => el("div", { class: "fair-series" },
    el("div", { class: "fs-packs" },
      el("figure", {}, still({ id: 0, series: s.name }), el("figcaption", { class: "small" }, "Series pack")),
      el("figure", {}, still({ id: 0, series: s.name, special: 1, special_no: 1, special_name: s.special_name, special_limit: s.special_limit }, `only ${s.special_limit} ever`),
        el("figcaption", { class: "small" }, `${s.special_name} Pack`, el("br"), el("b", { class: "limited-tag" }, `LIMITED · only ${s.special_limit} ever`)))),
    el("div", { class: "fs-info" },
      el("h3", {}, `Series ${s.name} `, s.out_of_print ? el("span", { class: "series-status st-oop" }, "out of print")
        : el("span", { class: "series-status st-active" }, "in print")),
      s.released_at ? el("p", { class: "small fs-date" }, `Came out ${new Date(s.released_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`) : null,
      s.print_run != null ? el("p", {}, bar(s.printed, s.print_run), ` ${s.left} of ${s.print_run} copies left`) : el("p", {}, `${s.printed} copies printed · no print run limit`),
      el("p", {}, bar(s.special_made, s.special_limit), ` Limited packs (${s.special_name}): ${s.special_left} of ${s.special_limit} left`),
      Object.keys(s.buttons || {}).length ? el("p", { class: "small" }, "In this series: ", lineup(s.buttons)) : null,
      s.pack_share ? el("p", { class: "small" }, `${pctTxt(s.pack_share)} of the cLuB's own cards in daily and ~*~cLuB~*~ packs come from Series ${s.name}.`) : null,
      el("p", { class: "small" }, `Series packs hold 3 Series ${s.name} buttons, keep ${o.packs.sealed.keep}. Its Limited pack, the ${s.special_name} Pack: one guaranteed rare, better odds and foils, numbered #1 to #${s.special_limit}.`)))) : [el("p", {}, "No series yet!")]));
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
  showPasskeys();
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

// ---------- passkeys ----------
// The browser speaks WebAuthn in ArrayBuffers; the server speaks base64url. These convert both ways.
const pkSupported = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
const fromB64 = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(t + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer; };
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deviceName = () => {
  const u = navigator.userAgent;
  return /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows PC" : /Linux/.test(u) ? "Linux" : "this device";
};
const pkOops = (e) => (e && e.name === "NotAllowedError" ? "Passkey cancelled (or it timed out)." : e && e.name === "InvalidStateError" ? "This device already has a passkey for you!" : (e && e.message) || "The passkey didn't work.");

async function addPasskey() {
  const o = await api("/api/passkey", { method: "POST", body: { action: "register_options" } });
  const cred = await navigator.credentials.create({ publicKey: {
    ...o, challenge: fromB64(o.challenge), user: { ...o.user, id: fromB64(o.user.id) },
    excludeCredentials: o.excludeCredentials.map((c) => ({ ...c, id: fromB64(c.id) })),
  } });
  await api("/api/passkey", { method: "POST", body: { action: "register", label: deviceName(), credential: {
    id: cred.id, response: { clientDataJSON: toB64(cred.response.clientDataJSON), attestationObject: toB64(cred.response.attestationObject) },
  } } });
}

async function loginWithPasskey() {
  const o = await api("/api/passkey", { method: "POST", body: { action: "login_options" } });
  const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: fromB64(o.challenge) } });
  return api("/api/passkey", { method: "POST", body: { action: "login", credential: {
    id: cred.id, response: { clientDataJSON: toB64(cred.response.clientDataJSON), authenticatorData: toB64(cred.response.authenticatorData),
      signature: toB64(cred.response.signature) },
  } } });
}

async function showPasskeys() {
  const list = $("passkeys"), msg = $("pk-msg");
  list.textContent = "";
  $("pk-add").hidden = !pkSupported();
  if (!pkSupported()) msg.textContent = "This browser can't do passkeys. Your save code works everywhere!";
  let keys = [];
  try { keys = (await api("/api/passkey")).passkeys; } catch { return; }
  if (!keys.length) list.append(el("li", { class: "small" }, "No passkeys yet."));
  for (const k of keys) {
    list.append(el("li", {}, `${k.label || "passkey"} (added ${fmtDate(k.created_at)}${k.last_used_at ? ", last used " + fmtDate(k.last_used_at) : ""}) `,
      el("button", { onclick: async () => {
        if (!(await ask(`Remove the passkey for "${k.label || "this device"}"? It stops working here. (Also delete it from that device's passwords if you like.)`, { ok: "Remove it", cancel: "Keep it" }))) return;
        try { await api("/api/passkey", { method: "POST", body: { action: "remove", id: k.id } }); msg.textContent = "Passkey removed."; showPasskeys(); }
        catch (e) { msg.textContent = e.message; }
      } }, "remove")));
  }
}
$("pk-add").onclick = async () => {
  const msg = $("pk-msg"); msg.textContent = "";
  $("pk-add").disabled = true;
  try { await addPasskey(); msg.textContent = "Passkey saved! Next time, log in with it."; showPasskeys(); }
  catch (e) { msg.textContent = pkOops(e); }
  finally { $("pk-add").disabled = false; }
};
$("pk-card-add").onclick = async () => {
  const b = $("pk-card-add"), m = $("pk-card-msg");
  b.disabled = true;
  try { await addPasskey(); b.textContent = "✓ Passkey saved!"; m.textContent = "Next time, log in with it. Keep the code too, as your backup!"; }
  catch (e) { m.textContent = pkOops(e); b.disabled = false; }
};
$("pk-login").onclick = async () => {
  const b = $("pk-login"), oops = $("login-oops");
  oops.textContent = ""; b.disabled = true;
  try { await loginWithPasskey(); await refresh(); }
  catch (e) { oops.textContent = pkOops(e); }
  finally { b.disabled = false; }
};
$("pk-login-row").hidden = !pkSupported();

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

// name is passed only for a brand-new member (signing the free pack), who gets a welcome on top
function showCode(code, name) {
  $("code-text").textContent = code;
  $("code-welcome").hidden = !name;
  $("code-welcome-name").textContent = name || "";
  $("code-title").textContent = name ? "Here's your save code:" : "~ Your Save Code ~";
  $("code-intro").innerHTML = name
    ? "It's your key to get back in, so <b>keep it somewhere safe</b>: write it down, print it, hide it under your keyboard. It won't be shown again!"
    : "This code is how you get back in, so <b>keep it somewhere safe</b>: write it down, print it, or hide it under your keyboard. It won't be shown again!";
  $("pk-card-row").hidden = !pkSupported();
  $("pk-card-add").disabled = false; $("pk-card-add").textContent = "🔑 Also add a passkey on this device";
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

let fpJustOpened = false;   // set when the free pack was opened just now (plays the reveal)
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
    const tile = freeTile();
    tile.onclick = async (e) => {
      e.preventDefault();
      if (!(await holdToOpen({ free: true }, tile))) return;
      try { await api("/api/freepack", { method: "POST", body: { action: "open" } }); fpJustOpened = true; renderFreePack(); }
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
      const r = await api("/api/freepack", { method: "POST", body: { action: "sign", name: name.value, turnstile: fpToken, came_from: cameFrom } });
      me = r.user;
      afterCode = "u/" + encodeURIComponent(r.user.name); // land on your new page once the code is saved
      showCode(r.code, r.user.name);
    } catch (err) {
      oops.textContent = err.message;
      check.disabled = false;
      check.textContent = "✓";
      if (window.turnstile) { try { window.turnstile.reset(); } catch {} fpToken = null; }
    }
  };
  // just opened: the free pack glows away and the card is dealt and flips over
  const stage = openingStage(fpJustOpened ? freeTile() : null, [card(st.card, 0, { kept_index: null })], "reveal");
  fpJustOpened = false;
  box.append(stage.node,
    el("p", { class: "center" }, "This one's yours to keep. Sign it to make it official!"),
    form,
    el("p", { class: "center small fp-note" }, "(This also creates your account)"));
  stage.play();
  if (st.sitekey) loadTurnstile(st.sitekey, human);
}

$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  $("login-oops").textContent = "";
  try {
    await api("/api/login", { method: "POST", body: { code: e.target.code.value } });
    e.target.reset();
    await refresh();
  } catch (err) { $("login-oops").textContent = err.message; }
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

// "***" with a little room on each side (non-breaking spaces, so they don't squish into one)
const TICK_SEP = "\u00a0\u00a0\u00a0***\u00a0\u00a0\u00a0";

// Front-page ticker of recent trades, gifts and ultra finds (refreshes every few minutes).
async function loadTicker() {
  try {
    const { items } = await api("/api/feed");
    const t = $("ticker-text");
    t.textContent = items.length
      ? items.map((i) => i.text).join(TICK_SEP)
      : "No trades or gifts yet... be the first!";
    // keep the scroll speed steady no matter how long the text is
    t.style.animationDuration = Math.max(20, Math.round(t.textContent.length / 6)) + "s";
  } catch {}
}
loadTicker();
setInterval(loadTicker, 3 * 60 * 1000);

// Top marquee: the webmaster's news, live print runs and Request Board nudges (from /api/news),
// with some 90s flavor sprinkled in between.
const MARQUEE_NEWS = ["LATEST DROP:\u00a0\u00a0BETA SERIES"];
const MARQUEE_HOME = ["WELCOME 2 MY HOMEPAGE", "COLLECT THEM ALL", "TRADE WITH FRIENDS", "SIGN MY GUESTBOOK", "THANX 4 VISITING"];
const MARQUEE_90S = ["BEST VIEWED IN NETSCAPE 4.0 AT 800x600", "NO FRAMES WERE HARMED IN THE MAKING OF THIS SITE",
  "DON'T 4GET 2 SIGN MY GUESTBOOK", "THIS PAGE IS Y2K COMPLIANT", "PLZ DON'T PICK UP THE PHONE, I'M ONLINE"];
const MARQUEE_SIZE = 5;   // how many things scroll by
async function loadMarquee() {
  let live = [];
  try { live = (await api("/api/news")).items || []; } catch {}
  // a short mix each page load: the news, one live line (if any), then a few random picks
  const pick = (arr) => arr.splice(Math.floor(Math.random() * arr.length), 1)[0];
  const liveLeft = live.slice(), pool = [...MARQUEE_HOME, ...MARQUEE_90S];
  const lines = [...MARQUEE_NEWS];
  if (liveLeft.length) lines.push(pick(liveLeft));
  pool.push(...liveLeft);   // any other live lines can still turn up as random picks
  while (lines.length < MARQUEE_SIZE && pool.length) lines.push(pick(pool));
  const t = $("marquee-text");
  t.textContent = "***" + TICK_SEP + lines.join(TICK_SEP) + TICK_SEP + "***";
  t.style.animationDuration = Math.max(18, Math.round(t.textContent.length / 6)) + "s";
}
loadMarquee();   // once per page load, so it stays put while you read it

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


// ---------- every pack ever made (v0.31.2) ----------
async function showAllPacks() {
  const { packs } = await api("/api/packs?all=1");
  const sealed = $("allpacks-sealed"), opened = $("allpacks-opened");
  sealed.textContent = ""; opened.textContent = "";
  for (const p of packs) {
    const who = p.owner ? [p.opened_at ? "opened by " : "held by ", p.owner + (p.owner_bot ? " [BOT]" : "")] : ["a former player"];
    const slot = el("div", { class: "pack-slot" }, packTile(p, "#pack/" + p.id),
      el("span", { class: "small" }, p.special_no ? `#${p.special_no} of ${p.special_limit || 25}` : `#${p.id}`, el("br"), ...who));
    (p.opened_at ? opened : sealed).append(slot);
  }
  if (!sealed.childElementCount) sealed.append(el("p", { class: "small" }, "No sealed packs right now."));
  if (!opened.childElementCount) opened.append(el("p", { class: "small" }, "None opened yet."));
}

// ---------- hold to open, and tearing pouches (v0.32) ----------
// Clicking a pack opens a little 90s window; hold "Open Pack" (or Space) until the bar fills.
// Let go early and it drains back: nothing opens. Each kind of pack has its own loader:
//   daily = dial-up · ~*~cLuB~*~ = download · welcome & free = setup · Alpha & limited = MS-DOS · Beta = cassette
// Crimped pouches (series and limited packs) can also be torn open: drag across the top.
const HOLD_MS = 1600, DRAIN_MS = 500;
function loaderKind(p) {
  if (p.daily) return "dialup";
  if (p.free || p.source === "welcome") return "setup";
  if (p.special) return "dos";
  const s = (p.series || "").toLowerCase();
  if (s === "beta") return "tape";
  if (s) return "dos";
  return "download";
}
const LOADER = {
  dialup: { title: "Connect To ~*~cLuB~*~", lines: [[0, "Ready to dial 88x31..."], [.1, "Dialing https://88x31.app..."], [.5, "Verifying buttons and foiling..."], [.97, "Connected! Your daily pack is here!"]] },
  download: { title: "Saving: clubpack.zip", lines: [[0, "Location: 88x31.app/packs/clubpack.zip"], [.1, "Receiving buttons..."], [.55, "Polishing the shiny ones..."], [.97, "Download complete! 3 buttons saved."]] },
  setup: { title: "~*~cLuB~*~ Pack Setup", lines: [[0, "Setup is ready to unpack your ~*~cLuB~*~ pack."], [.1, "Setup is copying your buttons..."], [.55, "Checking for holos..."], [.97, "Setup is complete! Welcome 2 the cLuB!"]] },
  dos: { title: "MS-DOS Prompt", lines: [] },
  tape: { title: "Series Beta · Side A", lines: [] },
};
const CASSETTE_SVG = `<svg class="ho-cassette" viewBox="0 0 300 190" role="img" aria-label="A cassette tape winding from one reel to the other">
<rect x="4" y="4" width="292" height="182" rx="12" fill="#2a2a30" stroke="#0e0e12" stroke-width="3"/>
<circle cx="16" cy="16" r="4" fill="#55555f"/><circle cx="284" cy="16" r="4" fill="#55555f"/><circle cx="16" cy="174" r="4" fill="#55555f"/><circle cx="284" cy="174" r="4" fill="#55555f"/>
<rect x="22" y="18" width="256" height="118" rx="6" fill="#efe6cf"/><rect x="22" y="18" width="256" height="20" rx="6" fill="#3ad0ff"/><rect x="22" y="30" width="256" height="8" fill="#3ad0ff"/>
<text x="34" y="33" font-family="monospace" font-size="15" fill="#0e0e12">~*~cLuB~*~ SERIES BETA</text><text x="266" y="33" text-anchor="end" font-family="monospace" font-size="15" fill="#0e0e12">A</text>
<line x1="34" y1="52" x2="266" y2="52" stroke="#c9bfa5"/><line x1="34" y1="128" x2="266" y2="128" stroke="#c9bfa5"/>
<text class="ho-tlabel" x="150" y="49" text-anchor="middle" font-family="monospace" font-size="13" fill="#5a4a2a">PRESS PLAY</text>
<rect x="70" y="58" width="160" height="62" rx="20" fill="#16161b"/><rect x="118" y="78" width="64" height="22" fill="#3a2e22" opacity=".85"/>
<circle class="ho-tl" cx="104" cy="89" r="26" fill="#3a2e22"/><circle class="ho-tr" cx="196" cy="89" r="12" fill="#3a2e22"/>
<g class="ho-hl"><circle cx="104" cy="89" r="10" fill="#efe6cf"/><path d="M104 79v20M94 89h20" stroke="#16161b" stroke-width="3"/></g>
<g class="ho-hr"><circle cx="196" cy="89" r="10" fill="#efe6cf"/><path d="M196 79v20M186 89h20" stroke="#16161b" stroke-width="3"/></g>
<text class="ho-tcount" x="150" y="148" text-anchor="middle" font-family="monospace" font-size="17" fill="#ffcf3a">000</text>
<path d="M70 186 L86 156 H214 L230 186 Z" fill="#1d1d22" stroke="#0e0e12" stroke-width="2"/><circle cx="112" cy="172" r="5" fill="#0e0e12"/><circle cx="188" cy="172" r="5" fill="#0e0e12"/></svg>`;

// Show the window for this pack, right over the pack (anchor). Resolves true once the bar fills, false if closed.
function holdToOpen(p, anchor = null) {
  return new Promise((resolve) => {
    const kind = loaderKind(p), L = LOADER[kind];
    const dosFile = p.special && p.special_no ? `${(p.special_name || "SPECIAL").replace(/[^A-Za-z]/g, "").slice(0, 8).toUpperCase()}.ZIP` : "PACK.ZIP";
    const status = el("div", { class: "ho-status", "aria-live": "polite" });
    const fill = el("div", { class: "ho-fill" });
    const pct = el("span", {}, "0%"), side = el("span", {}, "");
    const btn = el("button", { type: "button", class: "ho-btn" }, "Open Pack");
    const close = el("button", { type: "button", class: "ho-x", "aria-label": "Close" }, "x");
    let art = null;
    if (kind === "tape") { art = el("div", { class: "ho-tape" }); art.innerHTML = CASSETTE_SVG; }
    if (kind === "dialup") art = el("div", { class: "ho-modem", "aria-hidden": "true" }, [0, 1, 2, 3, 4].map(() => el("span")));
    const term = kind === "dos" ? el("div", { class: "ho-term" + (p.special ? " gold" : "") }) : null;
    const win = el("div", { class: "ho-win" + (kind === "dos" && p.special ? " gold" : ""), role: "dialog", "aria-modal": "true", "aria-label": L.title },
      el("div", { class: "ho-tb" }, el("span", {}, kind === "dos" && p.special_no ? `${limitedName(p)} #${p.special_no}` : L.title), close),
      el("div", { class: "ho-body" }, art, term, kind !== "dos" ? status : null,
        kind === "tape" ? null : el("div", { class: "ho-well" + (kind === "download" ? "" : " blocks") }, fill),
        el("div", { class: "ho-pct" }, pct, side),
        el("div", { class: "ho-row" }, btn, el("span", { class: "small" }, "hold, don't click"))));
    const shade = el("div", { class: "ho-shade" }, win);
    document.body.append(shade);
    // sit over the pack itself, kept on screen
    if (anchor) {
      const a = anchor.getBoundingClientRect(), w = win.getBoundingClientRect(), pad = 8;
      const left = Math.max(pad, Math.min(window.innerWidth - w.width - pad, a.left + a.width / 2 - w.width / 2));
      const top = Math.max(pad, Math.min(window.innerHeight - w.height - pad, a.top + a.height / 2 - w.height / 2));
      Object.assign(win.style, { position: "fixed", left: left + "px", top: top + "px" });
    }
    btn.focus();
    const files = ["BUTTON1.GIF", "BUTTON2.GIF", "BUTTON3.GIF"];
    let v = 0, holding = false, last = 0, raf = 0, done = false, spin = 0;
    const draw = () => {
      const n = Math.min(100, Math.floor(v * 100));
      fill.style.width = `calc(${v * 100}% - ${v * 4}px)`;
      pct.textContent = n + "%";
      if (L.lines.length) { let t = L.lines[0][1]; for (const [at, line] of L.lines) if (v >= at) t = line; status.textContent = t; }
      if (kind === "dialup") { side.textContent = Math.round(v * 28800).toLocaleString() + " bps"; art.querySelectorAll("span").forEach((s, i) => s.classList.toggle("on", v > i / 5 && (i < 2 || Math.random() > .3))); }
      if (kind === "download") side.textContent = `${Math.round(v * 88)} KB of 88 KB`;
      if (kind === "setup") side.textContent = files[Math.min(2, Math.floor(v * 3))];
      if (kind === "dos") {
        side.textContent = p.special_no ? `#${p.special_no} of ${p.special_limit || 25}` : "3 files";
        term.textContent = `C:\\CLUB> pkunzip ${dosFile}\n` + files.slice(0, Math.floor(v * 3.2)).map((f) => `  Inflating: ${f}`).join("\n") + (v >= 1 ? "\nC:\\CLUB> " : "") + "_";
      }
      if (kind === "tape") {
        const R2 = 676, r2 = 144, q = (sel) => art.querySelector(sel);
        q(".ho-tl").setAttribute("r", Math.sqrt(R2 - (R2 - r2) * v).toFixed(1));
        q(".ho-tr").setAttribute("r", Math.sqrt(r2 + (R2 - r2) * v).toFixed(1));
        spin = (spin + (holding ? 9 : -6)) % 360;
        if (v > 0 && v < 1) { q(".ho-hl").setAttribute("transform", `rotate(${spin} 104 89)`); q(".ho-hr").setAttribute("transform", `rotate(${spin} 196 89)`); }
        q(".ho-tcount").textContent = String(Math.floor(v * 30)).padStart(3, "0");
        q(".ho-tlabel").textContent = v >= 1 ? "PACK OPENED!" : v > .5 ? "3 BUTTONS ON SIDE A" : v > 0 ? "PLAYING..." : "PRESS PLAY";
        status.textContent = v >= 1 ? "Rewinding... just kidding! Here they are." : v > .5 ? "Loading 3 buttons from tape..." : v > 0 ? "Playing side A..." : "Hold Open Pack to play side A.";
        side.textContent = "C-30 · 3 buttons";
      }
    };
    const finish = (ok) => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      setTimeout(() => { shade.remove(); resolve(ok); }, ok ? 350 : 0);
    };
    const tick = (now) => {
      const dt = now - last; last = now;
      v = holding ? Math.min(1, v + dt / HOLD_MS) : Math.max(0, v - dt / DRAIN_MS);
      draw();
      if (v >= 1) { btn.disabled = true; btn.classList.remove("down"); return finish(true); }
      raf = holding || v > 0 ? requestAnimationFrame(tick) : 0;
    };
    const startHold = () => { if (done) return; holding = true; btn.classList.add("down"); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    const stopHold = () => { if (!holding) return; holding = false; btn.classList.remove("down"); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); startHold(); });
    btn.addEventListener("pointerup", stopHold); btn.addEventListener("pointercancel", stopHold); btn.addEventListener("lostpointercapture", stopHold);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); startHold(); } });
    btn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") stopHold(); });
    const onKey = (e) => { if (e.key === "Escape") finish(false); };
    document.addEventListener("keydown", onKey);
    close.onclick = () => finish(false);
    shade.addEventListener("pointerdown", (e) => { if (e.target === shade) finish(false); });
    draw();
  });
}

// Tear a crimped pouch open: press at a top corner (left or right notch) and drag across. The last stretch is stiffer, and
// past the line the pack shakes. The rip only happens when you LET GO with the cut all the way across, so you can always drag back and let go early to keep it sealed.
// A drag never counts as a click, so it can't pop up the Open Pack window either. (v0.33.1)
function addTear(tile, onTorn) {
  if (!tile.classList.contains("pouch")) return;
  const cut = el("span", { class: "tear-cut", "aria-hidden": "true" }), hint = el("span", { class: "tear-hint", "aria-hidden": "true" }, "✂ - - - -");
  const art = tile.querySelector(".pack-art");
  art.append(cut, hint);
  // the torn part of the top fades away as the cut runs along, and comes back if you go back
  const STRIP = 15;   // % of the pack's height above the cut
  const setCurl = (f, dir) => {
    if (f <= 0.01) { art.style.webkitMask = art.style.mask = ""; return; }
    // the top strip fades out behind the cut: gone where you started, soft fade up to the cut's tip
    const tip = f * 100, soft = Math.max(0, tip - 7);   // a short fade right at the cut, so it keeps up
    const fade = `linear-gradient(to ${dir === 1 ? "right" : "left"}, transparent ${soft.toFixed(1)}%, #000 ${tip.toFixed(1)}%)`;
    const keep = `${fade} left top / 100% ${STRIP + 0.5}% no-repeat, linear-gradient(#000 0 0) left bottom / 100% ${100 - STRIP}% no-repeat`;
    art.style.webkitMask = art.style.mask = keep;
  };
  const LINE = 1;   // the cut has to reach all the way across before it can rip
  let x0 = null, id = null, moved = false, f = 0, dir = 1;
  tile.addEventListener("pointerdown", (e) => {
    if (tile.dataset.tore) return;
    const r = tile.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    // a tear starts at a corner notch: the top strip, near the left or right edge (not the middle)
    if (e.clientY - r.top > r.height * 0.22 || (x > 0.25 && x < 0.75)) return;
    x0 = e.clientX; id = e.pointerId; moved = false; f = 0; dir = x <= 0.25 ? 1 : -1;   // tear toward the other side
  });
  tile.addEventListener("pointermove", (e) => {
    if (x0 == null || e.pointerId !== id) return;
    const r = tile.getBoundingClientRect(), dx = Math.max(0, (e.clientX - x0) * dir);
    if (dx > 6 && !moved) { moved = true; tile.setPointerCapture(id); tile.classList.add("tearing"); }
    if (!moved) return;
    // the last stretch fights back: past 60% the cut moves slower than your drag
    const raw = dx / r.width;
    f = Math.min(1, raw < 0.6 ? raw : 0.6 + (raw - 0.6) * 0.7);
    cut.style.width = (f * 100) + "%";
    setCurl(f, dir);
    cut.style.left = dir === 1 ? "0" : "auto"; cut.style.right = dir === 1 ? "auto" : "0";
    const ready = f >= LINE;
    if (ready && !tile.classList.contains("tear-ready")) { try { navigator.vibrate && navigator.vibrate(30); } catch {} }
    tile.classList.toggle("tear-ready", ready);   // past the line: the pack shakes, let go to rip
  });
  const up = () => {
    if (x0 == null) return;
    const wasDrag = moved, rip = moved && f >= LINE;
    x0 = null; moved = false; tile.classList.remove("tearing", "tear-ready");
    if (!wasDrag) return;                              // a plain click: the Open Pack window handles it
    tile.dataset.tore = rip ? "1" : "skip";            // swallow the click that follows this drag
    if (rip) { tile.classList.add("torn"); setTimeout(() => { delete tile.dataset.tore; onTorn(); }, 450); }
    else { cut.style.width = "0"; setCurl(0, dir); setTimeout(() => { if (tile.dataset.tore === "skip") delete tile.dataset.tore; }, 50); }
  };
  tile.addEventListener("pointerup", up);
  tile.addEventListener("pointercancel", () => { x0 = null; moved = false; cut.style.width = "0"; setCurl(0, dir); tile.classList.remove("tearing", "tear-ready"); });
  tile.addEventListener("dragstart", (e) => e.preventDefault());
}
