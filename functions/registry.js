// GET /registry: the shared item registry's public ledger page (see lib/registry-view.js).
import { passThrough } from "../lib/registry-view.js";
export const onRequestGet = ({ request, env }) => passThrough(env, request, "/ledger");
