// Creates a VAPID key pair for push reminders and uploads both halves as Worker secrets (nothing is written to disk).
// Usage: npm run vapid   (once; running it again makes every device re-subscribe before it gets reminders)
//        npm run vapid -- --print   prints .dev.vars lines for local development instead of uploading
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
const secrets = { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: jwk.d };

if (process.argv.includes("--print")) {
  for (const [k, v] of Object.entries(secrets)) console.log(`${k}="${v}"`);
  process.exit(0);
}

const r = spawnSync("npx", ["wrangler", "secret", "bulk"], { input: JSON.stringify(secrets), stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
if (r.status !== 0) {
  console.error("\nFailed to set the VAPID secrets. Deploy first (npm run deploy) and make sure you're logged in (npx wrangler login).");
  process.exit(r.status ?? 1);
}
console.log("\nPush reminders are configured.");
