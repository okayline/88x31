// Makes the cLuB's signing key and prints it (private, as JSON) for Cloudflare.
// Run once, piped straight into Cloudflare so you never have to see or copy it:
//   node make_key.mjs | npx wrangler pages secret put SIGNING_KEY --project-name 88x31
// Keep it secret: anyone with it could forge button certificates.
const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
process.stdout.write(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x }));
