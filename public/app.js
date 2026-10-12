// 88x31 front page: accounts, daily pull, player pages, guestbooks, save codes.
const $ = (id) => document.getElementById(id);
const say = (text) => ($("msg").textContent = text || "");
const TOP = ["loading", "out", "in", "code-card"];
const showTop = (id) => TOP.forEach((s) => ($(s).hidden = s !== id));
const VIEWS = ["view-pull", "view-page", "view-banner", "view-codes"];
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

let me = null;

// ---------- routing ----------

async function route() {
  if (!me) return;
  say("");
  const hash = decodeURIComponent(location.hash.slice(1));
  try {
    if (hash.startsWith("u/")) return await showPage(hash.slice(2));
    if (hash.startsWith("banner/")) return await showBanner(hash.slice(7));
    if (hash === "codes") return await showCodes();
    return await showPull();
  } catch (e) { say(e.message); }
}
window.addEventListener("hashchange", route);

async function refresh() {
  const { user } = await api("/api/me");
  me = user;
  if (!me) return showTop("out");
  $("who").textContent = me.name;
  $("nav-mine").href = "#u/" + encodeURIComponent(me.name);
  showTop("in");
  await route();
}

// ---------- daily pull ----------

async function showPull() {
  showView("view-pull");
  const box = $("pull-body");
  box.textContent = "Loading...";
  const pull = await api("/api/pull");
  const o = pull.odds;
  $("pull-odds").textContent = `Odds for each button: common ${o.common}% · uncommon ${o.uncommon}% · rare ${o.rare}%. Rares are limited editions.`;
  box.textContent = "";

  if (pull.status === "done") {
    const kept = pull.options[pull.kept_index];
    box.append(el("p", {}, "You kept: ", el("b", {}, kept ? kept.name : "?")));
    if (pull.passed_to) {
      const passed = pull.options[pull.passed_index];
      box.append(el("p", {}, "You passed ", el("b", {}, passed ? passed.name : "?"), " on to ",
        el("a", { href: "#u/" + encodeURIComponent(pull.passed_to) }, pull.passed_to), "."));
    }
    box.append(el("div", { class: "pull-row" }, pull.options.map((d, i) => card(d, i, pull))));
    box.append(el("p", { class: "center" }, "Come back tomorrow for a new pull!"));
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
  const cards = pull.options.map((d, i) => card(d, i, pull, () => {
    keep = i;
    cards.forEach((c, j) => c.classList.toggle("chosen", j === i));
    passSel.innerHTML = "";
    passSel.append(el("option", { value: "" }, "(let them go)"));
    pull.options.forEach((d2, j) => { if (j !== i && d2) passSel.append(el("option", { value: j }, d2.name)); });
    form.hidden = false;
  }));
  box.append(el("div", { class: "pull-row" }, cards));
  box.append(el("p", { class: "center small" }, "Click the one you want to keep."));

  const passSel = el("select", { name: "pass" });
  const toInput = el("input", { name: "to", placeholder: "friend's name", autocomplete: "off" });
  const form = el("form", { class: "pull-form" },
    el("label", {}, "Pass one on to a friend? ", passSel),
    el("label", {}, "Send it to: ", toInput),
    el("button", {}, "Keep it!"));
  form.hidden = true;
  form.onsubmit = async (e) => {
    e.preventDefault();
    say("");
    const pass = passSel.value;
    if (pass !== "" && !toInput.value.trim()) return say("Type the name of who to pass it to, or let them go.");
    try {
      const r = await api("/api/pull", { method: "POST", body: { keep, pass: pass === "" ? null : Number(pass), to: toInput.value } });
      say(pass !== "" && !r.passed ? "Kept! (The one you passed on sold out, sorry.)" : "Added to your collection!");
      await showPull();
    } catch (err) { say(err.message); }
  };
  box.append(form);
}

function card(d, i, pull, onPick) {
  if (!d) return el("div", { class: "card" }, "(gone)");
  const left = d.max_editions ? `${Math.max(0, d.max_editions - d.minted)} of ${d.max_editions} left` : "";
  const c = el("div", { class: "card rarity-" + d.rarity + (pull.kept_index === i ? " chosen" : "") },
    bannerImg(d, 2), el("b", {}, d.name), el("span", { class: "small" }, `${d.rarity} · ${d.type}`),
    left ? el("span", { class: "small" }, left) : null);
  if (onPick) { c.tabIndex = 0; c.onclick = onPick; c.onkeydown = (e) => { if (e.key === "Enter") onPick(); }; c.classList.add("pickable"); }
  return c;
}

// ---------- player page ----------

async function showPage(name) {
  showView("view-page");
  const [col, gb] = await Promise.all([
    api("/api/collection?user=" + encodeURIComponent(name)),
    api("/api/guestbook?user=" + encodeURIComponent(name)),
  ]);
  const owner = col.owner.name;
  $("page-name").textContent = owner;

  const grid = $("page-collection");
  grid.textContent = "";
  if (!col.banners.length) grid.append(el("p", {}, "No buttons yet!"));
  for (const b of col.banners) {
    grid.append(el("a", { href: "#banner/" + b.id, class: "tile", title: `${b.name} ${edition(b)}` },
      bannerImg(b), el("span", { class: "small" }, edition(b))));
  }

  // Sign form: only on other people's pages.
  const form = $("sign-form");
  form.hidden = owner.toLowerCase() === me.name.toLowerCase();
  if (!form.hidden) {
    form.dataset.user = owner;
    const sel = $("gift-select");
    sel.innerHTML = "";
    sel.append(el("option", { value: "" }, "(no gift)"));
    const mine = await api("/api/collection");
    for (const b of mine.banners) sel.append(el("option", { value: b.id }, `${b.name} ${edition(b)}`));
  }

  const list = $("page-guestbook");
  list.textContent = "";
  if (!gb.entries.length) list.append(el("p", { class: "small" }, "No one has signed yet. Be the first!"));
  for (const g of gb.entries) {
    list.append(el("div", { class: "entry" },
      el("p", { class: "small" },
        el("a", { href: "#u/" + encodeURIComponent(g.author) }, g.author), ` wrote on ${fmtDate(g.created_at)}:`),
      el("p", {}, g.message),
      g.gift_id ? el("p", { class: "stamp" },
        el("a", { href: "#banner/" + g.gift_id }, bannerImg({ image_key: g.gift_image, name: g.gift_name, rarity: g.gift_rarity })),
        el("span", { class: "small" }, ` stamped ${g.gift_name} #${g.gift_edition}${g.gift_max ? " of " + g.gift_max : ""}`)) : null));
  }
}

$("sign-form").onsubmit = async (e) => {
  e.preventDefault();
  say("");
  const f = e.target;
  const gift = f.gift.value;
  if (gift && !confirm("Your stamped banner will be given to them. Send it?")) return;
  try {
    await api("/api/guestbook", { method: "POST", body: { user: f.dataset.user, message: f.message.value, instance_id: gift || null } });
    f.reset();
    say("Signed! Thanks 4 visiting!");
    await showPage(f.dataset.user);
  } catch (err) { say(err.message); }
};

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
  showView("view-banner");
  const { banner: b, history } = await api("/api/banner?id=" + encodeURIComponent(id));
  const box = $("banner-body");
  box.textContent = "";
  box.append(
    el("h2", {}, `» ${b.name} ${edition(b)} «`),
    el("p", { class: "center" }, bannerImg(b, 3)),
    el("p", {}, `Type: ${b.type} · Rarity: ${b.rarity}`),
    el("p", {}, "Owned by ", b.owner ? el("a", { href: "#u/" + encodeURIComponent(b.owner) }, b.owner) : "nobody"),
    el("h2", {}, "Travel log"),
    el("ol", { class: "log" }, history.map((h) => el("li", {},
      `${fmtDate(h.created_at)}: ${HOW[h.reason] || h.reason}`,
      h.from_name ? ` from ${h.from_name}` : "",
      h.to_name ? ` → ${h.to_name}` : ""))));
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
        if (!confirm("Remove this code? It will stop working.")) return;
        try { await api(`/api/codes?id=${c.id}`, { method: "DELETE" }); await showCodes(); say("Code removed."); }
        catch (e) { say(e.message); }
      } }, "remove"));
    }
    list.append(li);
  }
}

$("new-code").onclick = async () => {
  const label = prompt("Name this code (e.g. 'phone', 'notebook'):", "extra code");
  if (label === null) return;
  try { const { code } = await api("/api/codes", { method: "POST", body: { label } }); showCode(code); }
  catch (e) { say(e.message); }
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
    location.hash = "u/" + encodeURIComponent(user.name); // land on your new collection after saving the code
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

$("code-done").onclick = async () => { say(""); await refresh(); };

$("logout").onclick = async (e) => {
  e.preventDefault();
  await api("/api/logout", { method: "POST" }).catch(() => {});
  me = null;
  say("");
  location.hash = "";
  showTop("out");
};

refresh().catch((e) => { say(e.message); showTop("out"); });
