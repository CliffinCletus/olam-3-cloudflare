// OLAM 3.0 API — Cloudflare Worker (Hono) on D1. Every route lives under /api;
// all other paths are served from ./dist (the React PWA) by Workers Static Assets.
import { Hono } from "hono";
import type { AppEnv } from "./lib/ctx";
import { ApiError } from "./lib/util";
import admin from "./routes/admin";
import auth from "./routes/auth";
import push from "./routes/push";
import registrations from "./routes/registrations";
import reports from "./routes/reports";
import scan from "./routes/scan";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", c.res.headers.get("Cache-Control") || "no-store");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", auth);
app.route("/", admin);
app.route("/", registrations);
app.route("/", scan);
app.route("/", reports);
app.route("/", push);

app.notFound((c) => c.json({ detail: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ detail: err.detail }, err.status as any);
  console.error("Unhandled error", err);
  return c.json({ detail: "Something went wrong. Please try again." }, 500);
});

export default app;
