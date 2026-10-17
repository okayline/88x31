// Buttons visiting your 4Dungeon, and dungeon items visiting you (lib/travel.js). Same person, both games on one account.
//   GET  /api/travel                                  -> { visitors: [{ item_id, copy, name, note, rarity, from }], available }
//        (also brings home any of your away buttons that 4Dungeon has sent back)
//   POST /api/travel { action: "send", instance_id }  -> send your button to your 4Dungeon (it's AWAY here until it returns)
//   POST /api/travel { action: "send_back", item_id, copy } -> send a visiting dungeon item back to your 4Dungeon
import { json, readJson, currentUser } from "../../lib/auth.js";
import { sendButton, sendVisitor, travelView, Nope } from "../../lib/travel.js";

const fail = (e) => {
  if (e instanceof Nope) return json({ error: e.message }, e.status);
  console.log("travel failed", e);
  return json({ error: "Something broke. Nothing moved; try again in a moment." }, 500);
};

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  try { return json(await travelView(env, me.id)); } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  if (me.is_bot) return json({ error: "Bots stay home." }, 403);
  const b = await readJson(request);
  try {
    if (b.action === "send") return json(await sendButton(env, me.id, Number(b.instance_id)));
    if (b.action === "send_back") return json(await sendVisitor(env, me.id, Number(b.item_id), Number(b.copy)));
    return json({ error: "Unknown action." }, 400);
  } catch (e) { return fail(e); }
}
