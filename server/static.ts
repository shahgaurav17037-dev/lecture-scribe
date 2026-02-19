import path from "path";
import fs from "fs";
import express from "express";

export function serveStatic(app: express.Express) {
  const publicPath = path.join(process.cwd(), "client/dist/public");

  if (!fs.existsSync(publicPath)) {
    console.error("Public directory not found:", publicPath);
    return;
  }

  app.use(express.static(publicPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });
}