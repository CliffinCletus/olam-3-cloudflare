// Sets the Worker secrets on Cloudflare: a random JWT_SECRET plus your chosen INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD.
// Usage: npm run secrets   (run once, right after the first `npm run deploy`)
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

function bulk(secrets) {
  const r = spawnSync("npx", ["wrangler", "secret", "bulk"], { input: JSON.stringify(secrets), stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error("\nFailed to set secrets. Deploy first (npm run deploy) and make sure you're logged in (npx wrangler login).");
    process.exit(r.status ?? 1);
  }
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question("Main admin email: ")).trim().toLowerCase();
const pw = (await rl.question("Bootstrap admin password (10+ chars, letters and numbers; you'll change it at first sign-in): ")).trim();
rl.close();
if (!/^[^@s]+@[^@s]+.[^@s]+$/.test(email)) {
  console.error("That doesn't look like an email address.");
  process.exit(1);
}
if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
  console.error("Password must be at least 10 characters with letters and numbers.");
  process.exit(1);
}

const keepJwt = process.argv.includes("--keep-jwt");
const secrets = { INITIAL_ADMIN_EMAIL: email, INITIAL_ADMIN_PASSWORD: pw };
if (!keepJwt) secrets.JWT_SECRET = randomBytes(48).toString("base64url");
console.log(`\nUploading ${Object.keys(secrets).join(" + ")}…`);
bulk(secrets);
console.log(`\nDone. Sign in at /staff/login as ${email} with that password.`);
if (!keepJwt) console.log("(Changing JWT_SECRET signs everyone out and invalidates existing QR passes — run with --keep-jwt to only change the admin email or password.)");
