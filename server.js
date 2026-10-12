// LOCAL DEV ONLY — this file is never used on Vercel.
// Vercel ignores server.js entirely: it serves your static files directly
// and runs api/products.js / api/save-products.js as separate serverless
// functions. This file exists only so you can run `npm run dev` and test
// on your own machine with the exact same /api/products and
// /api/save-products routes, without needing a Vercel Blob store — locally
// it just reads/writes a plain products.json file on disk.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const LOCAL_PRODUCTS_FILE = path.join(ROOT, 'products.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function ensureLocalProductsFile() {
  if (!fs.existsSync(LOCAL_PRODUCTS_FILE)) {
    const seed = fs.readFileSync(path.join(ROOT, 'api', 'products.seed.json'), 'utf8');
    fs.writeFileSync(LOCAL_PRODUCTS_FILE, seed);
  }
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, pathname === '/' ? '/index.html' : pathname);

  // Basic traversal guard.
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  // --- Local-dev stand-in for GET /api/products ---
  if (pathname === '/api/products' && req.method === 'GET') {
    ensureLocalProductsFile();
    try {
      const raw = fs.readFileSync(LOCAL_PRODUCTS_FILE, 'utf8');
      return sendJson(res, 200, JSON.parse(raw));
    } catch (err) {
      return sendJson(res, 500, { error: 'Unable to load products' });
    }
  }

  // --- Local-dev stand-in for POST /api/save-products ---
  if (pathname === '/api/save-products' && req.method === 'POST') {
    const expected = process.env.ADMIN_PASSWORD || 'admin123'; // local-only default
    const provided = req.headers['x-admin-password'];
    if (!provided || provided !== expected) {
      return sendJson(res, 401, { error: 'Invalid admin password' });
    }
    let products;
    try {
      products = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }
    if (!Array.isArray(products)) {
      return sendJson(res, 400, { error: 'Body must be a JSON array of products' });
    }
    fs.writeFileSync(LOCAL_PRODUCTS_FILE, JSON.stringify(products, null, 2));
    return sendJson(res, 200, { ok: true, count: products.length });
  }

  // --- Everything else: serve static files (index.html, admin.html, images, etc.) ---
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  ensureLocalProductsFile();
  console.log(`Local dev server running at http://localhost:${PORT}`);
  console.log(`(local ADMIN_PASSWORD is "${process.env.ADMIN_PASSWORD || 'admin123'}" unless you set the env var)`);
});
