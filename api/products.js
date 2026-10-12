// GET /api/products
// Returns the current product catalog.
// Reads it from Vercel Blob storage if an admin save has happened before;
// otherwise falls back to the bundled products.seed.json.

const { head } = require('@vercel/blob');
const { BLOB_KEY, sendJson, loadSeedProducts } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (hasBlobToken) {
    try {
      const meta = await head(BLOB_KEY).catch(() => null);
      if (meta && meta.url) {
        const blobRes = await fetch(meta.url, { cache: 'no-store' });
        if (blobRes.ok) {
          const products = await blobRes.json();
          return sendJson(res, 200, products);
        }
      }
    } catch (err) {
      console.error('[api/products] Blob read failed, falling back to seed:', err);
    }
  }

  try {
    const seed = loadSeedProducts();
    return sendJson(res, 200, seed);
  } catch (err) {
    console.error('[api/products] Failed to load seed products:', err);
    return sendJson(res, 500, { error: 'Unable to load products' });
  }
};
