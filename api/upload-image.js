// OPTIONAL BONUS — only needed if admin.html lets you upload product photos
// from the admin panel itself (not just edit text/prices).
//
// Why this exists: on Vercel, writing a file to /images/produits on disk
// does NOT persist (read-only filesystem, and even /tmp is wiped between
// deployments/invocations). Uploaded images must be stored in Vercel Blob
// instead, exactly like products.json.
//
// POST /api/upload-image
// Headers: x-admin-password: <ADMIN_PASSWORD>
// Body (JSON): { "filename": "sac-noir-1.jpg", "dataBase64": "<base64 data, no prefix>", "contentType": "image/jpeg" }
// Response: { ok: true, url: "https://<...>.public.blob.vercel-storage.com/..." }
//
// On the frontend (admin.html), read the <input type="file"> with a
// FileReader as a data URL, strip the "data:image/jpeg;base64," prefix,
// and POST the rest here. Use the returned `url` as the product's image
// path instead of a local "images/produits/..." path.
//
// This file is a template: wire it up once you show me admin.html's current
// upload code so the request/response shape matches exactly what the UI
// expects.

const { put } = require('@vercel/blob');
const { readJsonBody, sendJson, checkAdminPassword } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const auth = checkAdminPassword(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.reason });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(res, 500, {
      error:
        'BLOB_READ_WRITE_TOKEN is not set. Create/connect a Vercel Blob store to this project (Storage tab) and redeploy.',
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Invalid JSON body' });
  }

  const { filename, dataBase64, contentType } = body || {};
  if (!filename || !dataBase64) {
    return sendJson(res, 400, { error: 'filename and dataBase64 are required' });
  }

  try {
    const buffer = Buffer.from(dataBase64, 'base64');
    const blob = await put(`produits/${filename}`, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: contentType || 'application/octet-stream',
    });
    return sendJson(res, 200, { ok: true, url: blob.url });
  } catch (err) {
    console.error('[api/upload-image] Blob write failed:', err);
    return sendJson(res, 500, { error: 'Failed to upload image' });
  }
};
