// GET /api/items: the shared item list, active items (?source= ?rarity= ?all=1) (see lib/registry-view.js).
import { passThrough } from "../../lib/registry-view.js";
export const onRequestGet = ({ request, env }) => passThrough(env, request, "/api/items");
