import express from "express";
import crypto from "crypto";
import http from "http";

export function startMockBackend(secret: string) {
  const app = express();
  app.use(express.json());

  const received: any[] = [];

  app.post("/admin/pending-actions", (req, res) => {
    const body = JSON.stringify(req.body);
    const sig = req.header("X-AI-Signature") || "";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    if (sig !== expected) return res.status(401).send("bad signature");
    const id = `test-${received.length + 1}`;
    received.push({ id, body: req.body });
    res.status(201).json({ id });
  });

  const server = http.createServer(app);
  return new Promise<{
    url: string;
    close: () => Promise<void>;
    received: any[];
  }>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as any;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        received,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
