(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Garde-fou : le panneau admin DOIT être ouvert via le serveur
  // (http://localhost:3000/admin.html), pas en double-cliquant sur le
  // fichier admin.html. Dans ce dernier cas, le navigateur charge la page
  // avec le protocole "file://" et les appels fetch() vers /api/admin/...
  // échouent instantanément avec l'erreur générique "Failed to fetch"
  // (bloqués par la politique CORS des navigateurs pour les fichiers
  // locaux). On détecte ce cas tout de suite et on affiche un message
  // clair au lieu de laisser échouer la connexion silencieusement.
  // ---------------------------------------------------------------------
  if (window.location.protocol === 'file:') {
    document.addEventListener('DOMContentLoaded', () => {
      const loginError = document.getElementById('loginError');
      const loginScreen = document.getElementById('loginScreen');
      if (loginScreen) {
        loginScreen.innerHTML = `
          <div class="login-card" style="max-width:460px;text-align:left;">
            <h1 style="text-align:center;">⚠️ Mauvaise façon d'ouvrir la page</h1>
            <p style="color:var(--black);font-size:14px;line-height:1.6;">
              Cette page a été ouverte directement depuis un fichier
              (<code>file://...</code>), mais le panneau admin a besoin du
              petit serveur pour fonctionner.
            </p>
            <p style="color:var(--black);font-size:14px;line-height:1.6;">
              <strong>Pour l'ouvrir correctement :</strong><br>
              1. Démarre le serveur avec <code>npm start</code> (ou
              <code>node server.js</code>) dans le dossier du projet.<br>
              2. Dans le navigateur, va sur l'adresse&nbsp;:
              <br><code>http://localhost:3000/admin.html</code>
              <br>(ne double-clique pas sur le fichier admin.html).
            </p>
          </div>`;
      } else if (loginError) {
        loginError.textContent = "Ouvre cette page via http://localhost:3000/admin.html (pas en double-cliquant sur le fichier).";
      }
    });
    return; // n'exécute pas le reste du script dans ce cas
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const TOKEN_KEY = 'ml_admin_token';
  let products = [];

  const loginScreen = $('#loginScreen');
  const adminApp = $('#adminApp');
  const loginForm = $('#loginForm');
  const loginError = $('#loginError');
  const grid = $('#productGrid');
  const toastEl = $('#toast');

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toastEl.classList.remove('show'); }, 3200);
  }

  async function api(path, options = {}) {
    const token = getToken();
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status === 401) {
      clearToken();
      showLogin('Session expirée, reconnecte-toi.');
      throw new Error('UNAUTHORIZED');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  }

  function showLogin(errorMsg) {
    loginScreen.classList.remove('hidden');
    adminApp.classList.add('hidden');
    if (errorMsg) loginError.textContent = errorMsg;
  }

  function showApp() {
    loginScreen.classList.add('hidden');
    adminApp.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------
  // Connexion
  // ---------------------------------------------------------------------
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const password = $('#loginPassword').value;
    try {
      const data = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Échec de connexion.');
        return body;
      });
      setToken(data.token);
      showApp();
      await loadProducts();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
    clearToken();
    showLogin();
  });

  // ---------------------------------------------------------------------
  // Chargement + rendu des produits
  // ---------------------------------------------------------------------
  async function loadProducts() {
    products = await api('/api/admin/products');
    renderGrid();
  }

  function currentFilters() {
    return {
      search: $('#searchInput').value.trim().toLowerCase(),
      category: $('#categoryFilter').value,
    };
  }

  function renderGrid() {
    const { search, category } = currentFilters();
    grid.innerHTML = '';
    const filtered = products.filter((p) => {
      if (category && p.category !== category) return false;
      if (search && !(`${p.name} ${p.name_ar || ''}`.toLowerCase().includes(search))) return false;
      return true;
    });
    for (const product of filtered) {
      grid.appendChild(buildCard(product));
    }
    if (!filtered.length) {
      grid.innerHTML = '<p style="color:var(--gray);grid-column:1/-1;">Aucun produit ne correspond à ta recherche.</p>';
    }
  }

  function buildCard(product) {
    const tpl = $('#productCardTemplate').content.cloneNode(true);
    const card = tpl.querySelector('.product-admin-card');
    card.dataset.id = product.id;

    card.querySelector('.pac-name').value = product.name || '';
    card.querySelector('.pac-category').value = product.category || 'sacs';
    card.querySelector('.pac-price').value = product.price ?? 0;
    card.querySelector('.pac-badge').value = product.badge || '';
    card.querySelector('.pac-description').value = product.description || '';
    card.querySelector('.pac-id').textContent = `ID #${product.id}`;

    renderImages(card, product);

    card.querySelector('.pac-save').addEventListener('click', () => saveProduct(product.id, card));
    card.querySelector('.pac-delete').addEventListener('click', () => deleteProduct(product.id, product.name));

    return card;
  }

  function renderImages(card, product) {
    const wrap = card.querySelector('.pac-images');
    wrap.innerHTML = '';
    const images = product.images || [];
    const slotCount = Math.max(images.length, 2) + (images.length < 3 ? 1 : 0);
    const totalSlots = Math.min(Math.max(slotCount, 3), 6);

    for (let i = 0; i < totalSlots; i++) {
      const src = images[i];
      const slot = document.createElement('div');
      slot.className = 'pac-image-slot' + (src ? '' : ' empty');

      if (src) {
        const img = document.createElement('img');
        img.src = `/${src}?t=${Date.now()}`;
        img.alt = product.name || '';
        slot.appendChild(img);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'pac-image-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Supprimer cette photo';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeImage(product.id, i, card);
        });
        slot.appendChild(removeBtn);

        const overlay = document.createElement('div');
        overlay.className = 'pac-image-overlay';
        overlay.textContent = 'Cliquer pour remplacer';
        slot.appendChild(overlay);
      } else {
        slot.textContent = '+';
      }

      slot.addEventListener('click', () => triggerUpload(product.id, src ? i : 'add', card));
      wrap.appendChild(slot);
    }
  }

  function triggerUpload(productId, slot, card) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) uploadImage(productId, slot, file, card);
    });
    input.click();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(productId, slot, file, card) {
    const wrap = card.querySelector('.pac-images');
    wrap.classList.add('pac-image-uploading');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Image trop lourde (max 10 Mo).');
      const dataUrl = await fileToDataUrl(file);
      const updated = await api(`/api/admin/products/${productId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl, filename: file.name, slot }),
      });
      const idx = products.findIndex((p) => p.id === productId);
      if (idx !== -1) products[idx] = updated;
      renderImages(card, updated);
      showToast('Photo enregistrée ✓');
    } catch (err) {
      showToast(err.message || "Impossible d'envoyer la photo.", 'error');
    } finally {
      wrap.classList.remove('pac-image-uploading');
    }
  }

  async function removeImage(productId, slotIdx, card) {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      const updated = await api(`/api/admin/products/${productId}/image/${slotIdx}`, { method: 'DELETE' });
      const idx = products.findIndex((p) => p.id === productId);
      if (idx !== -1) products[idx] = updated;
      renderImages(card, updated);
      showToast('Photo supprimée ✓');
    } catch (err) {
      showToast(err.message || 'Impossible de supprimer la photo.', 'error');
    }
  }

  async function saveProduct(productId, card) {
    const payload = {
      name: card.querySelector('.pac-name').value.trim(),
      category: card.querySelector('.pac-category').value,
      price: Number(card.querySelector('.pac-price').value) || 0,
      badge: card.querySelector('.pac-badge').value.trim(),
      description: card.querySelector('.pac-description').value.trim(),
    };
    try {
      const updated = await api(`/api/admin/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const idx = products.findIndex((p) => p.id === productId);
      if (idx !== -1) products[idx] = { ...products[idx], ...updated };
      showToast('Produit enregistré ✓');
    } catch (err) {
      showToast(err.message || "Impossible d'enregistrer.", 'error');
    }
  }

  async function deleteProduct(productId, name) {
    if (!confirm(`Supprimer définitivement "${name || 'ce produit'}" ?`)) return;
    try {
      await api(`/api/admin/products/${productId}`, { method: 'DELETE' });
      products = products.filter((p) => p.id !== productId);
      renderGrid();
      showToast('Produit supprimé ✓');
    } catch (err) {
      showToast(err.message || 'Impossible de supprimer.', 'error');
    }
  }

  $('#addProductBtn').addEventListener('click', async () => {
    try {
      const newProduct = await api('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nouveau produit', category: 'sacs', price: 0 }),
      });
      products.unshift(newProduct);
      renderGrid();
      showToast('Nouveau produit créé — ajoute une photo et un nom, puis enregistre.');
      const card = grid.querySelector(`[data-id="${newProduct.id}"]`);
      if (card) {
        card.classList.add('new-product');
        card.querySelector('.pac-name').focus();
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (err) {
      showToast(err.message || 'Impossible de créer le produit.', 'error');
    }
  });

  $('#searchInput').addEventListener('input', renderGrid);
  $('#categoryFilter').addEventListener('change', renderGrid);

  // ---------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------
  (async function init() {
    if (getToken()) {
      try {
        await loadProducts();
        showApp();
        return;
      } catch {
        // jeton invalide/expiré -> retombe sur l'écran de connexion
      }
    }
    showLogin();
  })();
})();
