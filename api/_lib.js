// Shared helpers used by the serverless functions in /api.
// Works both on Vercel (Node serverless runtime) and when called directly
// from the local dev server.js (plain http.createServer).

const fs = require('fs');
const path = require('path');

const BLOB_KEY = 'products.json';

/**
 * Read the raw JSON body of a request.
 * On Vercel, req.body is already parsed for application/json requests.
 * On a plain Node http server (local dev), we have to read the stream.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) {
      // Vercel already parsed it (object) or left it as a string.
      if (typeof req.body === 'string') {
        try {
          resolve(JSON.parse(req.body));
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      } else {
        resolve(req.body);
      }
      return;
    }
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
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

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function checkAdminPassword(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    // Fail closed: if no password is configured on the server, refuse writes
    // instead of silently allowing anyone to overwrite the catalog.
    return { ok: false, reason: 'ADMIN_PASSWORD is not configured on the server' };
  }
  const provided = req.headers['x-admin-password'];
  if (!provided || provided !== expected) {
    return { ok: false, reason: 'Invalid admin password' };
  }
  return { ok: true };
}

/**
 * Fallback product list used the very first time the site runs, before any
 * admin save has ever happened (so no Blob exists yet). Replace the content
 * of products.seed.json with your real product catalog export.
 */
function loadSeedProducts() {
  const seedPath = path.join(__dirname, 'products.seed.json');
  const raw = fs.readFileSync(seedPath, 'utf8');
  return JSON.parse(raw);
}

module.exports = {
  BLOB_KEY,
  readJsonBody,
  sendJson,
  checkAdminPassword,
  loadSeedProducts,
};
