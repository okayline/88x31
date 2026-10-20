// GET /api/registry/copy: one copy's story from the shared registry (see lib/registry-view.js).
import { passThrough } from "../../../lib/registry-view.js";
export const onRequestGet = ({ request, env }) => passThrough(env, request, "/api/registry/copy");
