/**
 * cPanel / Phusion Passenger entry point.
 *
 * In Setup Node.js App set:
 *   Application startup file = app.js
 *   Application mode       = Production
 *
 * Requires a production build first: npm run build
 */

const fs = require("fs");
const path = require("path");
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dir = __dirname;
const nextDir = path.join(dir, ".next");

if (!fs.existsSync(nextDir)) {
  console.error(
    "[audio-attic] Missing .next build. In the Application root run:\n" +
      "  npm run build\n" +
      "Then Restart the Node.js app in cPanel.",
  );
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV || "production";

const hostname = process.env.HOSTNAME || "0.0.0.0";
// Passenger sets PORT; the value is often ignored (Unix socket) but listen() is required.
const port = Number.parseInt(process.env.PORT || "3000", 10);

const app = next({
  dev: false,
  hostname,
  port,
  dir,
});
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("[audio-attic] request error", req.url, err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }).listen(port, hostname, () => {
      console.log(`[audio-attic] listening on ${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error("[audio-attic] failed to start", err);
    process.exit(1);
  });
