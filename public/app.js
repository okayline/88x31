// 88x31 front page: accounts, daily pull, player pages, guestbooks, save codes.
const $ = (id) => document.getElementById(id);
const say = (text) => ($("msg").textContent = text || "");
const TOP = ["loading", "out", "in", "code-card", "about", "check"];
const showTop = (id) => {
  TOP.forEach((s) => ($(s).hidden = s !== id));
  const on = !!me && id !== "code-card";
  $("top-nav").hidden = !on;   // one-line menu at the very top
  $("dash").hidden = !on;      // "Hi, space!" dashboard under the rainbow
};
const VIEWS = ["view-pull", "view-page", "view-banner", "view-codes", "view-trades"];
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
  trade: "trade", gift: "gift", fusion: "fusion", starter: "starter", admin: "admin",
};

function bannerImg(design, scale = 1) {
  return el("img", {
    src: design.image_key, alt: design.name, width: 88 * scale, height: 31 * scale,
    class: "banner rarity-" + design.rarity, title: `${design.name} (${design.rarity})`,
  });
}

const GIFTY = ["pass_on", "guestbook", "trade", "gift"]; // reasons that always have a giver

let me = null;

// ---------- routing ----------

async function route() {
  say("");
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === "about") {
    showTop("about");
    return showAbout().catch((e) => say(e.message));
  }
  if (hash === "check") { showTop("check"); return; }
  if (!me) return showTop("out");
  showTop("in");
  if (!hash) loadSummary(); // refresh the dashboard when coming back Home
  try {
    if (hash.startsWith("u/")) return await showPage(hash.slice(2));
    if (hash.startsWith("banner/")) return await showBanner(hash.slice(7));
    if (hash === "codes") return await showCodes();
    if (hash === "trades") return await showTrades();
    return await showPull();
  } catch (e) { say(e.message); }
}
window.addEventListener("hashchange", () => { window.scrollTo(0, 0); route(); });

async function refresh() {
  const { user, trades_waiting } = await api("/api/me");
  me = user;
  if (!me) return route();
  setTradeCount(trades_waiting || 0);
  loadSummary();
  $("who").textContent = me.name;
  $("nav-mine").href = "#u/" + encodeURIComponent(me.name);
  loadPlayers();
  await route();
}

// ---------- daily pull ----------

async function showPull() {
  showView("view-pull");
  const box = $("pull-body");
  box.textContent = "Loading...";
  const pull = await api("/api/pull");
  const o = pull.odds;
  $("pull-odds").textContent = `Odds for each button: common ${o.common}% · uncommon ${o.uncommon}% · rare ${o.rare}% · ULTRA ${o.ultra}%. Rares are limited editions, and every ultra is one of a kind. About 1 in ${Math.round(1 / pull.bonus_chance)} packs has a BONUS PACK card.`;
  box.textContent = "";
  if (pull.bonus_pack) box.append(el("p", { class: "center bonus-head" }, el("b", {}, "★ BONUS PACK! ★")));
  else if (pull.pulls_per_day > 1) box.append(el("p", { class: "center" }, el("b", {}, `Pack ${pull.pull_number} of ${pull.pulls_per_day} today`)));

  if (pull.status === "done") {
    const kept = pull.options[pull.kept_index];
    box.append(el("p", {}, kept && kept.bonus ? "You took the BONUS PACK!" : "You kept: ", kept && kept.bonus ? null : el("b", {}, kept ? kept.name : "?")));
    if (pull.passed_to) {
      const passed = pull.options[pull.passed_index];
      box.append(el("p", {}, "You passed ", el("b", {}, passed ? passed.name : "?"), " on to ",
        el("a", { href: "#u/" + encodeURIComponent(pull.passed_to) }, pull.passed_to), "."));
    }
    box.append(el("div", { class: "pull-row" }, pull.options.map((d, i) => card(d, i, pull))));
    box.append(el("p", { class: "center" }, "That's all your packs for today. Come back tomorrow!"));
    return;
  }

  // Not opened yet in this visit: show the pack closed until clicked.
  const opened = sessionStorage.getItem("opened-" + pull.day) === "1";
  if (!opened) {
    box.append(el("div", { class: "pull-row" }, [0, 1, 2].map(() => el("div", { class: "card back" }, "?"))));
    box.append(el("p", { class: "center" }, el("button", {
      onclick: () => { try { sessionStorage.setItem("opened-" + pull.day, "1"); } catch {} showPull(); },
    }, "Open Today's Pack!")));
    return;
  }

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
      await showPull();
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
    left ? el("span", { class: "small" }, left) : null);
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
  $("page-collection").textContent = "Loading...";
  $("page-guestbook").textContent = "";
  const [col, gb] = await Promise.all([
    api("/api/collection?user=" + encodeURIComponent(name)),
    api("/api/guestbook?user=" + encodeURIComponent(name)),
  ]);
  if (seq !== loadSeq) return;
  const owner = col.owner.name;
  applyTheme(col.owner.theme);
  $("page-name").textContent = owner;
  $("page-bot").hidden = !col.owner.is_bot;
  $("page-seen").hidden = !col.owner.last_seen;
  if (col.owner.last_seen) $("page-seen").textContent = `${owner} was last online ${ago(col.owner.last_seen)}`;

  // homepage link (everyone sees it) and the editor (only on your own page)
  const mine = owner.toLowerCase() === me.name.toLowerCase();
  const home = $("page-home");
  home.textContent = "";
  home.hidden = !col.owner.homepage;
  if (col.owner.homepage) home.append("★ Visit my homepage: ",
    el("a", { href: col.owner.homepage, target: "_blank", rel: "noopener nofollow ugc" }, col.owner.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")), " ★");
  $("home-form").hidden = !mine;
  if (mine) $("home-form").homepage.value = col.owner.homepage || "";

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
  form.hidden = owner.toLowerCase() === me.name.toLowerCase();
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
  tp.hidden = owner.toLowerCase() === me.name.toLowerCase();
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
        el("a", { href: "#banner/" + g.gift_id }, bannerImg({ image_key: g.gift_image, name: g.gift_name, rarity: g.gift_rarity })),
        el("span", { class: "small" }, ` stamped ${g.gift_name} #${g.gift_edition}${g.gift_max ? " of " + g.gift_max : ""}`)) : null));
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
    ? el("span", {}, el("b", {}, `${s.packs_left} pack${s.packs_left === 1 ? "" : "s"}`), " left to open today! ", el("a", { href: "#pull" }, "Open them »"))
    : "You've opened all your packs today. New ones tomorrow!");
  li(s.trades_waiting
    ? el("span", {}, el("b", {}, `${s.trades_waiting} trade offer${s.trades_waiting === 1 ? "" : "s"}`), " waiting for you. ", el("a", { href: "#trades" }, "Take a look »"))
    : "No trade offers waiting.");
  if (s.guestbook_today) li(el("b", {}, `${s.guestbook_today} new guestbook message${s.guestbook_today === 1 ? "" : "s"}`), " today. ",
    el("a", { href: "#u/" + encodeURIComponent(me.name) }, "Read »"));
  if (s.last_received) li("Last gift you got: ", el("a", { href: "#banner/" + s.last_received.id }, label(s.last_received)),
    " from ", who(s.last_received.who), `, ${ago(s.last_received.at)}`);
  if (s.last_given) li("Last thing you gave: ", el("a", { href: "#banner/" + s.last_given.id }, label(s.last_given)),
    " to ", who(s.last_given.who), `, ${ago(s.last_given.at)}`);
  li(`You have ${s.buttons} button${s.buttons === 1 ? "" : "s"} in your collection.`);
}

// ---------- trading ----------

let tradeTheirs = [];
const pickedGive = new Set(), pickedWant = new Set();

function setTradeCount(n) {
  $("nav-trades").textContent = n ? `Trades (${n})` : "Trades";
  $("nav-trades").classList.toggle("has-offers", !!n);
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
  const past = $("tr-past");
  past.textContent = "";
  if (!history.length) past.append(el("p", { class: "small" }, "No trades yet."));
  for (const t of history) {
    const other = t.to_user === me.id ? t.from_name : t.to_name;
    past.append(el("p", { class: "small" }, `${fmtDate(t.resolved_at || t.created_at)}: with `,
      el("a", { href: "#u/" + encodeURIComponent(other) }, other), ` · ${t.status.toUpperCase()}`));
  }
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

// ---------- homepage ----------

$("home-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("/api/profile", { method: "POST", body: { homepage: e.target.homepage.value } });
    say("Homepage saved!");
    await showPage(me.name);
  } catch (err) { say(err.message); }
};

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
  const linkTo = (useHome) => (useHome && b.owner_homepage) ? b.owner_homepage : `${origin}/#banner/${b.id}`;
  const snippet = (useHome) => `<a href="${linkTo(useHome)}"><img src="${mine ? file.replace(".gif", "-" + b.edition + ".gif") : origin + "/" + b.image_key}" width="88" height="31" alt="${b.name}"></a>`;
  const code = el("textarea", { class: "snippet", rows: "3", readonly: "readonly" });
  let useHome = !!(mine && b.owner_homepage);
  const refresh = () => { code.value = snippet(useHome); };
  refresh();
  const box = el("div", { class: "use-box" },
    el("h2", {}, "» Use this button «"),
    el("p", { class: "small" }, "The art is CC0: free for anyone to use anywhere, no credit needed."),
    el("p", { class: "sign-buttons" },
      mine ? el("a", { class: "btn-link", href: `/api/download?id=${b.id}` }, "Download my copy (signed)") : null,
      el("a", { class: "btn-link", href: "/" + b.image_key, download: file }, mine ? "Plain picture" : "Download the picture")),
    mine ? el("p", { class: "small" }, "Your copy has a certificate hidden inside saying it's ",
      el("b", {}, `${b.name} ${edition(b)}`), ", issued to you", b.owner_homepage ? " with your homepage" : "", ". Upload that file to your site next to your page.") : null);
  if (mine && b.owner_homepage) {
    const pick = (v, label) => {
      const r = el("input", { type: "radio", name: "linkto", value: v });
      r.checked = (v === "home") === useHome;
      r.onchange = () => { useHome = v === "home"; refresh(); };
      return el("label", { class: "radio" }, r, label);
    };
    box.append(el("div", { class: "gift-choices" }, el("span", { class: "small" }, "Clicking it goes to:"), pick("home", "my homepage"), pick("page", "this button's cLuB page")));
  }
  box.append(el("p", { class: "small" }, "Copy this into your page:"), code,
    el("p", {}, el("button", { type: "button", onclick: async () => {
      try { await navigator.clipboard.writeText(code.value); say("Copied!"); } catch { code.select(); say("Press Ctrl+C to copy."); }
    } }, "Copy code")));
  return box;
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
      el("p", { class: "small" }, "It might be a plain download, a screenshot, or re-saved by an app that strips hidden data. Totally fine to use (the art is CC0), it just doesn't prove whose copy it is."),
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
}


$("visit-form").onsubmit = (e) => {
  e.preventDefault();
  const n = e.target.name.value.trim();
  if (n) location.hash = "u/" + encodeURIComponent(n);
  e.target.reset();
};

// Footer links: "View" opens your guestbook; "Sign" jumps to the form on the guestbook you're viewing.
$("foot-view").onclick = (e) => {
  e.preventDefault();
  if (!me) return say("Log in to see your guestbook!");
  location.hash = "u/" + encodeURIComponent(me.name);
};
$("foot-sign").onclick = (e) => {
  e.preventDefault();
  if (!me) return say("Log in to sign guestbooks!");
  if ($("view-page").hidden) return say("Visit someone's guestbook to sign it!");
  if ($("sign-form").hidden) return say("You can't sign your own guestbook. Visit a friend's!");
  $("guestbook-panel").scrollIntoView();
  $("sign-form").message.focus();
};

// ---------- banner detail ----------

async function showBanner(id) {
  const seq = ++loadSeq;
  showView("view-banner");
  $("banner-body").textContent = "Loading...";
  const { banner: b, design_entry: de, history, chain } = await api("/api/banner?id=" + encodeURIComponent(id));
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
    el("p", {}, `Type: ${b.type} · Rarity: ${b.rarity === "ultra" ? "ULTRA RARE" : b.rarity}`,
      b.max_editions ? ` · ${b.minted} of ${b.max_editions} copies made` : ` · ${b.minted} copies so far`),
    ownedLine(b, history),

    el("h2", {}, "» Credits «"),
    useBox(b),
    credit(b) || el("p", { class: "small" }, "No credit recorded."),
    b.source_url ? el("p", { class: "small" }, "Original: ", el("a", { href: b.source_url, target: "_blank", rel: "noopener" }, b.source_url)) : null,
    el("p", { class: "small" }, "The credit is also written inside the button's GIF file."),

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
      h.from_name ? ` from ${h.from_name}` : (GIFTY.includes(h.reason) ? " from a former player" : ""),
      ` → ${h.to_name || "a former player"}`,
      fp(h.hash, h.ledger_id)))));
}

// "Owned by space · received from SkAt3rDuDe-bot as a guestbook gift on 10/11/2026"
const GOT_HOW = {
  welcome: "in their welcome pack", daily: "in a daily pull", pass_on: "as a passed-on gift",
  guestbook: "as a guestbook gift", trade: "in a trade", gift: "as a gift", fusion: "from a fusion",
};
function ownedLine(b, history) {
  const who = (name) => el("a", { href: "#u/" + encodeURIComponent(name) }, name);
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
  if (d.source_author) bits.push(bits.length ? ` by ${d.source_author}` : `by ${d.source_author}`);
  if (d.license) bits.push(` · ${d.license === "Original" ? "original art" : d.license}`);
  return bits.length ? el("p", { class: "small credit" }, "Art: ", ...bits) : null;
}

// ---------- about / ledger ----------

async function showAbout() {
  const L = await api("/api/ledger");
  $("ledger-ok").textContent = L.ok ? "ALL GOOD! The chain is unbroken." : `BROKEN at entry #${L.broken_at}!`;
  $("ledger-ok").className = L.ok ? "ok" : "bad";
  $("ledger-count").textContent = L.entries;
  $("ledger-head").textContent = L.head || "(none yet)";
  const list = $("ledger-recent");
  list.textContent = "";
  if (!L.recent.length) list.append(el("li", {}, "Nothing yet!"));
  for (const h of L.recent) {
    // line 1 (small): when + fingerprint · line 2: what happened
    const meta = el("div", { class: "led-meta" }, fmtStamp(h.created_at), " · ",
      el("span", { class: "hash", title: h.hash }, h.hash.slice(0, 12) + "…"));
    let what;
    if (h.kind === "design") {
      what = el("div", { class: "led-what" }, el("b", {}, "NEW DESIGN "), `${h.design || "?"} (${h.rarity}`
        + `${h.max_editions ? ", " + h.max_editions + (h.max_editions === 1 ? " copy" : " copies") : ""}`
        + `${h.license ? ", " + (h.license === "Original" ? "original art" : h.license) : ""})`);
    } else {
      what = el("div", { class: "led-what" },
        `${h.design || "a button"} #${h.edition ?? "?"}, ${HOW[h.reason] || h.reason}`,
        h.from_name ? ` from ${h.from_name}` : (GIFTY.includes(h.reason) ? " from a former player" : ""),
        ` → ${h.to_name || "a former player"}`);
    }
    list.append(el("li", { value: h.id }, meta, what));
  }

  api("/api/pubkey").then((k) => { $("pubkey").textContent = k.key || "(not set up yet)"; }).catch(() => {});
  const { designs } = await api("/api/credits");
  const credits = $("credits");
  credits.textContent = "";
  for (const d of designs) {
    credits.append(el("li", {}, bannerImg(d), el("span", {}, el("b", {}, d.name), " ", credit(d) || "")));
  }
}

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

$("signup-form").onsubmit = async (e) => {
  e.preventDefault();
  say("");
  try {
    const { user, code } = await api("/api/signup", { method: "POST", body: { name: e.target.name.value } });
    me = user;
    afterCode = "u/" + encodeURIComponent(user.name); // land on your new guestbook once the code is saved
    showCode(code);
  } catch (err) { say(err.message); }
};

$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  say("");
  try {
    await api("/api/login", { method: "POST", body: { code: e.target.code.value } });
    e.target.reset();
    await refresh();
  } catch (err) { say(err.message); }
};

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

$("logout").onclick = async (e) => {
  e.preventDefault();
  await api("/api/logout", { method: "POST" }).catch(() => {});
  me = null;
  say("");
  location.hash = "";
  showTop("out");
};

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
