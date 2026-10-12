// POST /api/save-products
// Called from admin.html to persist an edited product catalog.
// Requires header:  x-admin-password: <ADMIN_PASSWORD env var>
// Body: the full products array (same shape as products.json today).

const { put } = require('@vercel/blob');
const { BLOB_KEY, readJsonBody, sendJson, checkAdminPassword } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const auth = checkAdminPassword(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.reason });
  }

  let products;
  try {
    products = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Invalid JSON body' });
  }

  if (!Array.isArray(products)) {
    return sendJson(res, 400, { error: 'Body must be a JSON array of products' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(res, 500, {
      error:
        'BLOB_READ_WRITE_TOKEN is not set. Create/connect a Vercel Blob store to this project (Storage tab) and redeploy.',
    });
  }

  try {
    const blob = await put(BLOB_KEY, JSON.stringify(products, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    return sendJson(res, 200, { ok: true, count: products.length, url: blob.url });
  } catch (err) {
    console.error('[api/save-products] Blob write failed:', err);
    return sendJson(res, 500, { error: 'Failed to save products' });
  }
};
