/**
 * Moroccan Leather — serveur du site + panneau d'administration.
 *
 * Écrit uniquement avec les modules intégrés de Node.js (aucune dépendance
 * à installer) : il suffit de lancer `node server.js` (ou `npm start`).
 *
 * - Sert le site statique (index.html, boutique, etc.) exactement comme avant.
 * - Sert le panneau d'admin protégé par mot de passe (/admin.html) et son API
 *   (/api/admin/*) pour modifier les prix, textes et photos des produits
 *   directement dans products.json.
 *
 * IMPORTANT — mot de passe admin :
 *   Par défaut le mot de passe est "moroccanleather2026". Change-le avant de
 *   mettre le site en ligne publiquement, soit en définissant la variable
 *   d'environnement ADMIN_PASSWORD, soit en modifiant la ligne ci-dessous.
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PRODUCTS_PATH = path.join(ROOT, 'products.json');
const IMAGES_DIR = path.join(ROOT, 'images', 'produits');
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'moroccanleather2026';

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Authentification simple par jeton en mémoire (pas de base de données).
// Un seul mot de passe admin ; se reconnecter si le serveur redémarre.
// ---------------------------------------------------------------------------
const validTokens = new Set();

function getToken(req) {
  const authHeader = req.headers['authorization'] || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

function isAuthed(req) {
  const token = getToken(req);
  return !!(token && validTokens.has(token));
}

// ---------------------------------------------------------------------------
// Petits utilitaires HTTP (remplacent express)
// ---------------------------------------------------------------------------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf-8'));
  } catch {
    throw new Error('INVALID_JSON');
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  // Empêche toute sortie du dossier racine du site (path traversal)
  const safePath = path.normalize(path.join(ROOT, decodeURIComponent(pathname))).replace(/^(\.\.[/\\])+/, '');
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  let filePath = safePath;
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 — Introuvable');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
      });
      res.end(data);
    });
  });
}

// ---------------------------------------------------------------------------
// Lecture / écriture de products.json
// ---------------------------------------------------------------------------
async function readProducts() {
  const raw = await fsp.readFile(PRODUCTS_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeProducts(products) {
  await fsp.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), 'utf-8');
}

function nextId(products) {
  return products.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
}

// Décode une image envoyée en data URL (base64) et l'enregistre dans images/produits/
function saveBase64Image(dataUrl, originalName) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('IMAGE_INVALIDE');
  const mime = match[1];
  const base64 = match[2];
  const extFromMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[mime];
  const ext = extFromMime || (path.extname(originalName || '') || '.jpg');
  const safeBase = path
    .basename(originalName || 'photo', path.extname(originalName || ''))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'photo';
  const unique = crypto.randomBytes(4).toString('hex');
  const filename = `${safeBase}-${unique}${ext}`;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 10 * 1024 * 1024) throw new Error('IMAGE_TROP_LOURDE');
  fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer);
  return path.posix.join('images', 'produits', filename);
}

function deleteProductImageFile(relPath) {
  if (!relPath) return;
  const filePath = path.join(ROOT, relPath);
  if (filePath.startsWith(IMAGES_DIR) && fs.existsSync(filePath)) {
    fs.unlink(filePath, () => {});
  }
}

// ---------------------------------------------------------------------------
// Routes API admin
// ---------------------------------------------------------------------------
const ALLOWED_FIELDS = [
  'name', 'name_ar', 'name_en',
  'category', 'price',
  'badge', 'badge_ar', 'badge_en',
  'colors', 'sizes',
  'description', 'description_ar', 'description_en',
  'featured',
];

async function handleApi(req, res, pathname) {
  // --- Login (pas besoin d'être authentifié) ---
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    if (body.password !== ADMIN_PASSWORD) {
      return sendJson(res, 401, { error: 'Mot de passe incorrect.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    validTokens.add(token);
    return sendJson(res, 200, { token });
  }

  // --- Tout le reste nécessite un jeton valide ---
  if (!isAuthed(req)) {
    return sendJson(res, 401, { error: 'Non autorisé. Merci de vous reconnecter.' });
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    validTokens.delete(getToken(req));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/products' && req.method === 'GET') {
    const products = await readProducts();
    return sendJson(res, 200, products);
  }

  if (pathname === '/api/admin/products' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => null);
    if (!body) return sendJson(res, 400, { error: 'Requête invalide.' });
    const products = await readProducts();
    const id = nextId(products);
    const newProduct = {
      id,
      name: body.name || 'Nouveau produit',
      name_ar: body.name_ar || '',
      category: body.category || 'sacs',
      price: Number(body.price) || 0,
      badge: body.badge || '',
      badge_ar: body.badge_ar || '',
      colors: body.colors || [],
      sizes: body.sizes || ['Taille unique'],
      images: [],
      description: body.description || '',
      description_ar: body.description_ar || '',
      featured: false,
    };
    products.push(newProduct);
    await writeProducts(products);
    return sendJson(res, 201, newProduct);
  }

  // /api/admin/products/:id
  let m = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (m && (req.method === 'PUT' || req.method === 'DELETE')) {
    const id = Number(m[1]);
    const products = await readProducts();
    const idx = products.findIndex((p) => Number(p.id) === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Produit introuvable.' });

    if (req.method === 'PUT') {
      const body = await readJsonBody(req).catch(() => null);
      if (!body) return sendJson(res, 400, { error: 'Requête invalide.' });
      for (const field of ALLOWED_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          products[idx][field] = body[field];
        }
      }
      await writeProducts(products);
      return sendJson(res, 200, products[idx]);
    }

    if (req.method === 'DELETE') {
      const [removed] = products.splice(idx, 1);
      await writeProducts(products);
      for (const img of removed.images || []) deleteProductImageFile(img);
      return sendJson(res, 200, { ok: true });
    }
  }

  // /api/admin/products/:id/image  (POST = ajouter/remplacer via data URL base64)
  m = pathname.match(/^\/api\/admin\/products\/(\d+)\/image$/);
  if (m && req.method === 'POST') {
    const id = Number(m[1]);
    const body = await readJsonBody(req).catch((err) => {
      throw err;
    });
    const products = await readProducts();
    const idx = products.findIndex((p) => Number(p.id) === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Produit introuvable.' });

    let relPath;
    try {
      relPath = saveBase64Image(body.imageDataUrl, body.filename);
    } catch (err) {
      return sendJson(res, 400, { error: "Image invalide ou trop lourde (max 10 Mo)." });
    }

    const product = products[idx];
    product.images = product.images || [];
    const slot = body.slot; // nombre (index) ou 'add'
    let oldFileToDelete = null;
    if (slot === 'add' || slot === undefined || slot === null) {
      product.images.push(relPath);
    } else {
      const slotIdx = Number(slot);
      if (Number.isInteger(slotIdx) && slotIdx >= 0 && slotIdx < product.images.length) {
        oldFileToDelete = product.images[slotIdx];
        product.images[slotIdx] = relPath;
      } else {
        product.images.push(relPath);
      }
    }
    await writeProducts(products);
    if (oldFileToDelete) deleteProductImageFile(oldFileToDelete);
    return sendJson(res, 200, product);
  }

  // /api/admin/products/:id/image/:slot  (DELETE)
  m = pathname.match(/^\/api\/admin\/products\/(\d+)\/image\/(\d+)$/);
  if (m && req.method === 'DELETE') {
    const id = Number(m[1]);
    const slotIdx = Number(m[2]);
    const products = await readProducts();
    const idx = products.findIndex((p) => Number(p.id) === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Produit introuvable.' });
    const product = products[idx];
    if (!product.images || slotIdx < 0 || slotIdx >= product.images.length) {
      return sendJson(res, 400, { error: 'Image introuvable.' });
    }
    const [removed] = product.images.splice(slotIdx, 1);
    await writeProducts(products);
    deleteProductImageFile(removed);
    return sendJson(res, 200, product);
  }

  return sendJson(res, 404, { error: 'Route API introuvable.' });
}

// ---------------------------------------------------------------------------
// Serveur HTTP
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname);
    } catch (err) {
      const msg = err && err.message === 'PAYLOAD_TOO_LARGE'
        ? 'Fichier trop volumineux.'
        : "Une erreur est survenue sur le serveur.";
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: msg });
    }
    return;
  }

  // Permet d'accéder au panneau admin via /admin (sans ".html")
  if (pathname === '/admin' || pathname === '/admin/') {
    return serveStatic(req, res, '/admin.html');
  }

  serveStatic(req, res, pathname === '/' ? '/index.html' : pathname);
});

server.listen(PORT, () => {
  console.log(`Moroccan Leather — serveur démarré sur http://localhost:${PORT}`);
  console.log(`Panneau admin : http://localhost:${PORT}/admin.html`);
});
