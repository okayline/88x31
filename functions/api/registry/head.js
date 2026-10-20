// GET /api/registry/head: the shared registry ledger's newest hash and entry count (see lib/registry-view.js).
import { passThrough } from "../../../lib/registry-view.js";
export const onRequestGet = ({ request, env }) => passThrough(env, request, "/api/registry/head");
