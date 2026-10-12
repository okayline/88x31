// 88x31 front page: signup, login, save codes.
const $ = (id) => document.getElementById(id);
const show = (id) => ["loading", "out", "in", "code-card"].forEach((s) => ($(s).hidden = s !== id));
const say = (text) => ($("msg").textContent = text || "");

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

let me = null;

async function refresh() {
  const { user } = await api("/api/me");
  me = user;
  if (!me) return show("out");
  $("who").textContent = me.name;
  await loadCodes();
  show("in");
}

async function loadCodes() {
  const { codes } = await api("/api/codes");
  const list = $("codes");
  list.innerHTML = "";
  for (const c of codes) {
    const li = document.createElement("li");
    const made = new Date(c.created_at * 1000).toLocaleDateString();
    li.textContent = `${c.label || "code"} (made ${made})`;
    if (codes.length > 1) {
      const rm = document.createElement("button");
      rm.textContent = "remove";
      rm.onclick = async () => {
        if (!confirm("Remove this code? It will stop working.")) return;
        try { await api(`/api/codes?id=${c.id}`, { method: "DELETE" }); await loadCodes(); say("Code removed."); }
        catch (e) { say(e.message); }
      };
      li.append(rm);
    }
    list.append(li);
  }
}

function showCode(code) {
  $("code-text").textContent = code;
  show("code-card");
}

$("signup-form").onsubmit = async (e) => {
  e.preventDefault();
  say("");
  try {
    const { user, code } = await api("/api/signup", { method: "POST", body: { name: e.target.name.value } });
    me = user;
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

$("logout").onclick = async () => {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  me = null;
  say("");
  show("out");
};

$("new-code").onclick = async () => {
  const label = prompt("Name this code (e.g. 'phone', 'notebook'):", "extra code");
  if (label === null) return;
  try { const { code } = await api("/api/codes", { method: "POST", body: { label } }); showCode(code); }
  catch (e) { say(e.message); }
};

refresh().catch((e) => { say(e.message); show("out"); });
