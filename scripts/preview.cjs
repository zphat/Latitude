const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://127.0.0.1");
  } catch {
    res.writeHead(400).end();
    return;
  }
  const relative =
    url.pathname === "/"
      ? "src/index.html"
      : decodeURIComponent(url.pathname).replace(/^\//, "");
  const file = path.resolve(root, relative);
  if (
    !file.startsWith(root + path.sep) ||
    !["src", "audio", "assets"].some((d) =>
      file.startsWith(path.join(root, d) + path.sep),
    )
  ) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (e, data) => {
    if (e) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});
server.listen(Number(process.env.TAKE_PREVIEW_PORT) || 4173, "127.0.0.1", () =>
  console.log("Latitude interface preview: http://127.0.0.1:4173"),
);
