// GET /api/registry/ledger: the shared registry's ledger, newest first (see lib/registry-view.js).
import { passThrough } from "../../../lib/registry-view.js";
export const onRequestGet = ({ request, env }) => passThrough(env, request, "/api/registry/ledger");
