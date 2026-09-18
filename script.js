/* ===================================================================
   MOROCCAN LEATHER — script.js
   Application mono-page : routage par hash, panier LocalStorage,
   filtres boutique, page produit dynamique, commande WhatsApp.
   =================================================================== */

(() => {
  'use strict';

  const SCRIPT_VERSION = '20260904t';
  console.log('%c[Moroccan Leather] script.js version ' + SCRIPT_VERSION + ' chargé', 'color:#D4AF37;font-weight:bold;');

  /* ---------- Configuration ---------- */
  // Numéro WhatsApp de la boutique (format international, sans "+" ni espaces :
  // 0648092229 → 212648092229)
  const WHATSAPP_NUMBER = '212648092229';
  // TODO: remplacer par votre propre endpoint Formspree pour que les inscriptions
  // à la newsletter arrivent vraiment dans votre boîte mail :
  // 1) Créez un compte gratuit sur https://formspree.io
  // 2) Créez un formulaire → Formspree vous donne une URL du type
  //    https://formspree.io/f/xxxxxxxx
  // 3) Collez cette URL ci-dessous à la place du placeholder
  const NEWSLETTER_FORMSPREE_ENDPOINT = 'https://formspree.io/f/VOTRE_ID_FORMSPREE';
  const CART_KEY = 'ml_cart';
  // Image de secours (SVG inline en data-URI, ne dépend d'aucun fichier externe) :
  // utilisée quand un article du panier n'a pas d'image, ou pointe vers une image
  // introuvable, pour que le panier n'affiche jamais une case vide/cassée.
  const FALLBACK_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">'
    + '<rect width="120" height="120" fill="#F5F5DC"/>'
    + '<path d="M30 85 L48 60 L62 75 L78 50 L95 85 Z" fill="#D4AF37" opacity="0.6"/>'
    + '<circle cx="42" cy="42" r="9" fill="#D4AF37" opacity="0.6"/>'
    + '</svg>'
  );
  // Livraison payante à 2 paliers : même ville (Fès) ou reste du Maroc.
  const DELIVERY_FEES = { same_city: 15, other_city: 45 };

  /* ---------- État global ---------- */
  let PRODUCTS = [];
  let currentGalleryIndex = 0;
  let currentProductSelection = { color: null, size: null, qty: 1 };
  // Le sélecteur du header propose FR / EN / AR.
  let currentLang = (() => {
    const stored = localStorage.getItem('ml_lang');
    return (stored === 'fr' || stored === 'en' || stored === 'ar') ? stored : 'fr';
  })();
  let selectedDeliveryZone = localStorage.getItem('ml_delivery_zone') || 'same_city';

  /* ---------- Utilitaires ---------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const formatPrice = (n) => `${n.toLocaleString('fr-FR')} ${t('common.currency')}`;
  // Certains produits (ex : les poufs) ont un prix qui dépend de la taille
  // choisie (product.size_prices = { "Petite": 349, "Grande": 479, ... }).
  // Si le produit ne définit pas ce champ, on retombe sur product.price
  // (comportement inchangé pour tous les autres produits du catalogue).
  const priceForSize = (product, size) => (product.size_prices && product.size_prices[size] != null)
    ? product.size_prices[size]
    : product.price;

  /* ---------- i18n : traduction (voir i18n.js) ---------- */
  function t(key, vars) {
    const dict = (typeof I18N !== 'undefined' && I18N[currentLang]) || {};
    const fallback = (typeof I18N !== 'undefined' && I18N.fr) || {};
    let str = dict[key] ?? fallback[key] ?? key;
    if (vars) {
      Object.keys(vars).forEach((k) => { str = str.replace(`{${k}}`, vars[k]); });
    }
    return str;
  }
  // Nom / description / badge d'un produit dans la langue active
  const pName = (p) => (currentLang === 'ar' && p.name_ar) ? p.name_ar : (currentLang === 'en' && p.name_en) ? p.name_en : p.name;
  const pDesc = (p) => (currentLang === 'ar' && p.description_ar) ? p.description_ar : (currentLang === 'en' && p.description_en) ? p.description_en : p.description;
  const pBadge = (p) => (currentLang === 'ar' ? (p.badge_ar ?? p.badge) : currentLang === 'en' ? (p.badge_en ?? p.badge) : p.badge);
  // Couleur / taille traduites (voir COLOR_AR/SIZE_AR et COLOR_EN/SIZE_EN dans i18n.js)
  const tColor = (c) => {
    if (currentLang === 'ar' && typeof COLOR_AR !== 'undefined' && COLOR_AR[c]) return COLOR_AR[c];
    if (currentLang === 'en' && typeof COLOR_EN !== 'undefined' && COLOR_EN[c]) return COLOR_EN[c];
    return c;
  };
  const tSize = (s) => {
    if (currentLang === 'ar' && typeof SIZE_AR !== 'undefined' && SIZE_AR[s]) return SIZE_AR[s];
    if (currentLang === 'en' && typeof SIZE_EN !== 'undefined' && SIZE_EN[s]) return SIZE_EN[s];
    return s;
  };
  const CATEGORY_LABEL_KEYS = {
    sacs: 'product.category_bag',
    ceintures: 'product.category_belt',
    portefeuilles: 'product.category_wallet',
    vestes: 'product.category_jacket',
    poufs: 'product.category_pouf',
    babouches: 'product.category_babouche',
  };
  const catLabel = (cat) => t(CATEGORY_LABEL_KEYS[cat] || 'product.category_bag');
  // Nom d'un article du panier (le panier stocke le nom FR + AR + EN au moment de l'ajout)
  const cName = (item) => (currentLang === 'ar' && item.name_ar) ? item.name_ar : (currentLang === 'en' && item.name_en) ? item.name_en : item.name;

  /* ---------- i18n : application des traductions statiques + changement de langue ---------- */
  function applyStaticTranslations() {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.title = t('meta.title');

    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    $$('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });

    const langSelect = $('#language-switcher');
    if (langSelect) langSelect.value = currentLang;

    updateWhatsappFloat();
  }

  function updateWhatsappFloat() {
    const wa = $('#waFloat');
    if (!wa) return;
    wa.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t('whatsapp_float.wa_text'))}`;
  }

  function setupLangSwitch() {
    const select = $('#language-switcher');
    if (!select) return;
    if (currentLang !== 'fr' && currentLang !== 'en' && currentLang !== 'ar') currentLang = 'fr';
    select.value = currentLang;
    select.addEventListener('change', () => {
      currentLang = (select.value === 'en' || select.value === 'ar') ? select.value : 'fr';
      localStorage.setItem('ml_lang', currentLang);
      applyStaticTranslations();
      rerenderRoute();
      initFadeIn();
    });
  }

  const getCart = () => {
    let cart;
    try {
      cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
      if (!Array.isArray(cart)) cart = [];
    } catch (e) {
      cart = [];
    }
    // Répare/nettoie les anciennes entrées du panier (ex : ajoutées avant
    // l'existence du champ lineId, ou entrées corrompues/nulles) pour que
    // l'affichage et Supprimer / + / - fonctionnent toujours, même avec un
    // panier enregistré par une ancienne version du site.
    try {
      const originalLength = cart.length;
      cart = cart.filter((item) => item && typeof item === 'object');
      let repaired = cart.length !== originalLength;
      cart.forEach((item, idx) => {
        if (!item.lineId) {
          item.lineId = `${item.id ?? 'x'}-${item.color ?? 'na'}-${item.size ?? 'na'}-${idx}`;
          repaired = true;
        }
        if (typeof item.price !== 'number' || Number.isNaN(item.price)) {
          item.price = Number(item.price) || 0;
          repaired = true;
        }
        if (typeof item.qty !== 'number' || Number.isNaN(item.qty) || item.qty < 1) {
          item.qty = 1;
          repaired = true;
        }
        if (!item.name) {
          item.name = 'Article';
          repaired = true;
        }
        if (!item.image || typeof item.image !== 'string') {
          item.image = FALLBACK_IMAGE;
          repaired = true;
        }
      });
      // Sécurité supplémentaire : si deux lignes finissent avec le même
      // lineId (panier legacy), Supprimer / + / - agiraient sur la mauvaise
      // ligne (toujours la première trouvée). On force l'unicité ici.
      const seenLineIds = new Set();
      cart.forEach((item, idx) => {
        if (seenLineIds.has(item.lineId)) {
          item.lineId = `${item.lineId}-dup${idx}`;
          repaired = true;
        }
        seenLineIds.add(item.lineId);
      });
      if (repaired) saveCart(cart);
    } catch (e) {
      // En dernier recours, si le panier stocké est irrécupérable, on repart
      // d'un panier vide plutôt que de bloquer toute la page.
      cart = [];
      saveCart(cart);
    }
    return cart;
  };
  const saveCart = (cart) => localStorage.setItem(CART_KEY, JSON.stringify(cart));
  const clearCart = () => saveCart([]);

  /* ---------- Chargement des produits ---------- */
  // Garde-fou anti "faux produits" : un produit n'est affiché QUE s'il a au
  // moins une image réelle, hébergée localement dans /images/produits/
  // (jamais une URL distante de type Unsplash/placeholder, et jamais vide).
  // Cela évite qu'une fiche produit non finalisée (sans photo réellement
  // uploadée) n'apparaisse sur le site.
  function hasRealLocalImage(p) {
    const first = Array.isArray(p.images) ? p.images[0] : p.image;
    if (!first || typeof first !== 'string' || !first.trim()) return false;
    if (/^https?:\/\//i.test(first)) return false; // image distante/placeholder → refusé
    return first.startsWith('images/produits/');
  }

  async function loadProducts() {
    try {
      const res = await fetch('products.json', { cache: 'no-store' });
      const raw = await res.json();
      const rejected = raw.filter((p) => !hasRealLocalImage(p));
      if (rejected.length) {
        console.warn(
          '[Moroccan Leather] Produit(s) ignoré(s) car sans image locale réelle :',
          rejected.map((p) => `#${p.id} ${p.name}`)
        );
      }
      PRODUCTS = raw.filter(hasRealLocalImage);
    } catch (err) {
      console.error('Impossible de charger products.json — assurez-vous de servir le site via un serveur HTTP (Render, Hostinger, ou "npx serve").', err);
      PRODUCTS = [];
    }
  }

  /* ==================================================================
     ROUTAGE (hash-based)
     Formats : home | shop | shop:sacs | shop:ceintures | product:<id> | about | cart
     ================================================================== */
  function parseHash() {
    const raw = (location.hash || '#home').replace('#', '');
    const [route, param] = raw.split(':');
    return { route: route || 'home', param };
  }

  function navigateTo(hash) {
    location.hash = hash;
  }

  function handleRoute() {
    const { route, param } = parseHash();
    const sections = $$('.page-section');
    sections.forEach((s) => s.classList.remove('active'));

    const target = document.getElementById(route) || document.getElementById('home');
    target.classList.add('active');

    // Navigation active state
    $$('.nav-link').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === route);
    });

    rerenderRoute();
    updateCartCount();

    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    closeMobileMenu();
    initFadeIn();
  }

  // Ré-affiche le contenu dynamique de la page courante (utilisé aussi lors
  // du changement de langue, sans scroller ni fermer le menu mobile).
  function rerenderRoute() {
    const { route, param } = parseHash();
    if (route === 'home') renderHome();
    if (route === 'shop') renderShop(param);
    if (route === 'product') renderProduct(Number(param));
    if (route === 'cart') renderCart();
  }

  /* ==================================================================
     HOME — produits vedettes
     ================================================================== */
  function renderHome() {
    const grid = $('#bestSellersContainer');
    if (!grid) return;
    // Les vidéos produit ont été retirées (déplacées dans "Notre Atelier à Fès") ;
    // les Best-sellers redeviennent une sélection manuelle via "featured": true.
    const featured = PRODUCTS.filter((p) => p.featured).slice(0, 6);
    grid.innerHTML = featured.map(productCardHTML).join('');
  }

  /* ==================================================================
     CARTE PRODUIT (réutilisée dans Home, Boutique, Produits liés)
     ================================================================== */
  function productCardHTML(p) {
    const hasVideo = !!p.video;
    return `
      <div class="product-card fade-in">
        <div class="product-thumb"${hasVideo ? ` data-has-video="1"` : ''}>
          ${pBadge(p) ? `<span class="product-badge">${pBadge(p)}</span>` : ''}
          <a href="#product:${p.id}" class="product-quick" title="${t('product.quick_view')}" data-route="product" data-id="${p.id}">👁</a>
          <a href="#product:${p.id}" data-route="product" data-id="${p.id}">
            <img class="product-image" src="${p.images[0]}" alt="${pName(p)}" loading="lazy">
          </a>
          ${hasVideo ? `
            <video class="product-video" muted loop playsinline preload="none">
              <source src="${p.video}" type="video/mp4">
            </video>
            <button type="button" class="video-play-btn" aria-label="${t('product.play_video')}">▶</button>
          ` : ''}
        </div>
        <div class="product-info">
          <div class="product-cat">${catLabel(p.category)}</div>
          <h3 class="product-name"><a href="#product:${p.id}" data-route="product" data-id="${p.id}">${pName(p)}</a></h3>
          <div class="product-price">${formatPrice(p.price)}</div>
          <button class="btn btn-outline btn-sm btn-block add-quick-btn" data-id="${p.id}">${t('product.add_to_cart')}</button>
        </div>
      </div>`;
  }

  /* ==================================================================
     HOVER IMAGE → VIDÉO sur les cartes produit
     Desktop : survol souris = lecture en boucle, muet.
     Mobile / tactile : bouton "lire" visible (pas de :hover fiable),
     un tap lance la vidéo, un second tap (sur la vidéo) revient à l'image.
     ================================================================== */
  function bindProductVideos(container = document) {
    $$('.product-thumb[data-has-video]', container).forEach((thumb) => {
      const video = thumb.querySelector('.product-video');
      const playBtn = thumb.querySelector('.video-play-btn');
      if (!video) return;

      const playVideo = () => {
        thumb.classList.add('video-active');
        video.currentTime = 0;
        video.play().catch(() => {
          // Lecture bloquée (ex : réseau lent) — on revient simplement à l'image.
          thumb.classList.remove('video-active');
        });
      };
      const stopVideo = () => {
        thumb.classList.remove('video-active');
        video.pause();
      };

      thumb.addEventListener('mouseenter', playVideo);
      thumb.addEventListener('mouseleave', stopVideo);

      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          thumb.classList.contains('video-active') ? stopVideo() : playVideo();
        });
      }
      video.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        stopVideo();
      });
    });
  }

  /* ==================================================================
     BOUTIQUE — grille filtrable
     ================================================================== */
  function renderShop(presetCategory) {
    const shopSection = $('#shop');
    if (!shopSection) return;

    // Pré-cocher la catégorie si on arrive depuis une carte "catégorie",
    // sinon (lien "Boutique" simple) on affiche tout le catalogue.
    if (presetCategory) {
      $$('.filter-category').forEach((cb) => { cb.checked = cb.value === presetCategory; });
    } else {
      $$('.filter-category').forEach((cb) => { cb.checked = true; });
    }

    applyShopFilters();
  }

  function getCheckedCategories() {
    const checked = $$('.filter-category:checked').map((cb) => cb.value);
    // Si rien n'est coché, on retombe sur TOUTES les catégories disponibles
    // (déduites dynamiquement des cases à cocher) plutôt qu'une liste figée,
    // pour que les nouvelles catégories restent visibles automatiquement.
    return checked.length ? checked : $$('.filter-category').map((cb) => cb.value);
  }

  function applyShopFilters() {
    const grid = $('#shopGrid');
    if (!grid) return;

    const categories = getCheckedCategories();

    // Reflète la catégorie active sur #shop (data-category) : permet en CSS
    // de personnaliser le fond par catégorie (ex : #shop[data-category="portefeuilles"]).
    // "all" quand plusieurs catégories sont cochées à la fois.
    const shopSection = $('#shop');
    if (shopSection) shopSection.dataset.category = categories.length === 1 ? categories[0] : 'all';

    const min = Number($('#priceMin')?.value || 0);
    const max = Number($('#priceMax')?.value || 7000);
    const sort = $('#sortSelect')?.value || 'default';

    let list = PRODUCTS.filter((p) => categories.includes(p.category) && p.price >= min && p.price <= max);

    if (sort === 'price-asc') list = list.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') list = list.sort((a, b) => b.price - a.price);
    if (sort === 'name-asc') list = list.sort((a, b) => pName(a).localeCompare(pName(b)));

    $('#resultCount').textContent = t('shop.result_count', { n: list.length });

    grid.innerHTML = list.length
      ? list.map(productCardHTML).join('')
      : `<div class="empty-state">${t('shop.empty')} <br><span class="filter-reset" id="emptyReset">${t('filters.reset')}</span></div>`;

    const emptyReset = $('#emptyReset');
    if (emptyReset) emptyReset.addEventListener('click', resetFilters);

    initFadeIn();
  }

  function resetFilters() {
    $$('.filter-category').forEach((cb) => (cb.checked = true));
    if ($('#priceMin')) $('#priceMin').value = 0;
    if ($('#priceMax')) $('#priceMax').value = 7000;
    if ($('#sortSelect')) $('#sortSelect').value = 'default';
    applyShopFilters();
  }

  /* ==================================================================
     GALERIE PRODUIT — grande image + miniatures cliquables + lightbox
     Fonctionne avec n'importe quel nombre de photos (1 à N) : la bande de
     miniatures ne s'affiche que s'il y a au moins 2 images. Un produit qui
     n'a qu'1 photo montre juste cette photo, sans miniature ni case vide.
     ================================================================== */
  function productGalleryHTML(p) {
    const imgs = p.images;
    const thumbs = imgs.length > 1
      ? `
        <div class="thumbnail-container">
          ${imgs.map((src, i) => `<img class="thumbnail${i === 0 ? ' active' : ''}" src="${src}" alt="${pName(p)} ${i + 1}" data-full="${src}">`).join('')}
        </div>`
      : '';
    return `
      <div class="product-gallery-new fade-in">
        <div class="main-image-container">
          <img id="mainProductImage" src="${imgs[0]}" alt="${pName(p)}">
          <div class="zoom-pane" id="zoomPane"></div>
        </div>
        ${thumbs}
      </div>
      <div id="lightbox" class="lightbox">
        <span class="close" id="lightboxClose">&times;</span>
        <img class="lightbox-content" id="lightboxImg" alt="${pName(p)}">
      </div>`;
  }

  function renderProduct(id) {
    const product = PRODUCTS.find((p) => p.id === id);
    const container = $('#productDetail');
    if (!container) return;

    if (!product) {
      container.innerHTML = `<p>${t('product.not_found')} <a href="#shop" data-route="shop">${t('product.back_to_shop')}</a></p>`;
      $('#relatedGrid').innerHTML = '';
      return;
    }

    currentGalleryIndex = 0;
    currentProductSelection = { color: product.colors[0], size: product.sizes[0], qty: 1 };

    $('#breadcrumbCurrent').textContent = pName(product);

    container.innerHTML = `
      ${productGalleryHTML(product)}
      <div class="product-summary fade-in">
        <div class="pd-cat">${catLabel(product.category)}</div>
        <h1 class="pd-title">${pName(product)}</h1>
        <div class="pd-price" id="pdPrice">${formatPrice(priceForSize(product, product.sizes[0]))}</div>
        <p class="pd-desc">${pDesc(product)}</p>

        <div class="pd-option">
          <div class="pd-option-label">${t('product.color_label')} <span class="val" id="selectedColor">${tColor(product.colors[0])}</span></div>
          <div class="swatches" id="colorSwatches">
            ${product.colors.map((c, i) => `<div class="swatch ${i === 0 ? 'active' : ''}" data-color="${c}">${tColor(c)}</div>`).join('')}
          </div>
        </div>

        <div class="pd-option">
          <div class="pd-option-label">${product.category === 'ceintures' ? t('product.size_label_cm') : t('product.size_label')} <span class="val" id="selectedSize">${tSize(product.sizes[0])}</span></div>
          <div class="swatches" id="sizeSwatches">
            ${product.sizes.map((s, i) => `<div class="swatch ${i === 0 ? 'active' : ''}" data-size="${s}">${tSize(s)}</div>`).join('')}
          </div>
        </div>

        <div class="qty-row">
          <div class="qty-control">
            <button type="button" id="qtyMinus">−</button>
            <input type="number" id="qtyInput" value="1" min="1" max="10">
            <button type="button" id="qtyPlus">+</button>
          </div>
        </div>

        <div class="pd-actions">
          <button class="btn btn-primary btn-block" id="addToCartBtn">${t('product.add_to_cart')}</button>
        </div>

        <div class="pd-note">
          💵 <span>${t('product.payment_note')}</span>
        </div>

        <div class="pd-meta">
          <div><strong>${t('product.meta_material_label')}</strong> ${t('product.meta_material_value')}</div>
          <div><strong>${t('product.meta_making_label')}</strong> ${t('product.meta_making_value')}</div>
          <div><strong>${t('product.meta_delivery_label')}</strong> ${t('product.meta_delivery_value')}</div>
          <div><strong>${t('product.meta_returns_label')}</strong> ${t('product.meta_returns_value')}</div>
        </div>
      </div>
    `;

    // Galerie : clic sur une miniature = change l'image principale
    $$('.thumbnail-container .thumbnail').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        $$('.thumbnail-container .thumbnail').forEach((t) => t.classList.remove('active'));
        thumb.classList.add('active');
        $('#mainProductImage').src = thumb.dataset.full;
      });
    });

    // Galerie : clic sur l'image principale = ouvre le lightbox (zoom)
    const mainImg = $('#mainProductImage');
    const lightbox = $('#lightbox');
    const lightboxImg = $('#lightboxImg');
    if (mainImg && lightbox && lightboxImg) {
      mainImg.addEventListener('click', () => {
        lightboxImg.src = mainImg.src;
        lightbox.classList.add('open');
      });
      const closeLightbox = () => lightbox.classList.remove('open');
      $('#lightboxClose').addEventListener('click', closeLightbox);
      // Clic sur le fond sombre (en dehors de la photo) = ferme aussi
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });
    }

    // Galerie : zoom direct sur l'image principale au survol (desktop),
    // façon Amazon — pas de loupe/carré séparé. Un calque plein cadre
    // (#zoomPane, même taille que l'image) affiche la MÊME image en
    // background-image agrandie (x2.5), et son background-position suit
    // le curseur en pourcentage : le point survolé reste sous la souris,
    // agrandi et net (technique background-image = pas de flou lié à un
    // transform CSS). Le calque relit mainImg.src à chaque mousemove, donc
    // il suit automatiquement le changement d'image quand on clique une
    // miniature. pointer-events:none laisse le clic passer à travers pour
    // ouvrir le lightbox plein écran normalement.
    const zoomPane = $('#zoomPane');
    const ZOOM_FACTOR = 2.5; // x2.5 minimum — augmenter encore si besoin de plus net
    if (mainImg && zoomPane) {
      mainImg.addEventListener('mousemove', (e) => {
        const rect = mainImg.getBoundingClientRect();
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
        zoomPane.style.backgroundImage = `url(${mainImg.src})`;
        zoomPane.style.backgroundSize = `${ZOOM_FACTOR * 100}% ${ZOOM_FACTOR * 100}%`;
        zoomPane.style.backgroundPosition = `${xPercent}% ${yPercent}%`;
        zoomPane.classList.add('active');
      });
      mainImg.addEventListener('mouseleave', () => { zoomPane.classList.remove('active'); });
    }

    // Couleurs
    $$('#colorSwatches .swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        $$('#colorSwatches .swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        currentProductSelection.color = sw.dataset.color;
        $('#selectedColor').textContent = tColor(sw.dataset.color);
      });
    });

    // Tailles
    $$('#sizeSwatches .swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        $$('#sizeSwatches .swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        currentProductSelection.size = sw.dataset.size;
        $('#selectedSize').textContent = tSize(sw.dataset.size);
        // Le prix dépend de la taille pour certains produits (ex : poufs
        // Petite/Grande à prix différents) : on le met à jour en direct.
        const pdPrice = $('#pdPrice');
        if (pdPrice) pdPrice.textContent = formatPrice(priceForSize(product, sw.dataset.size));
      });
    });

    // Quantité
    const qtyInput = $('#qtyInput');
    $('#qtyMinus').addEventListener('click', () => {
      qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
      currentProductSelection.qty = Number(qtyInput.value);
    });
    $('#qtyPlus').addEventListener('click', () => {
      qtyInput.value = Math.min(10, Number(qtyInput.value) + 1);
      currentProductSelection.qty = Number(qtyInput.value);
    });
    qtyInput.addEventListener('change', () => {
      currentProductSelection.qty = Math.max(1, Math.min(10, Number(qtyInput.value) || 1));
      qtyInput.value = currentProductSelection.qty;
    });

    // Ajouter au panier
    $('#addToCartBtn').addEventListener('click', () => {
      addToCart(product, currentProductSelection.color, currentProductSelection.size, currentProductSelection.qty);
    });

    renderRelated(product);
    initFadeIn();
  }

  function renderRelated(product) {
    const grid = $('#relatedGrid');
    if (!grid) return;
    const related = PRODUCTS.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 3);
    grid.innerHTML = related.map(productCardHTML).join('');
  }

  /* ==================================================================
     PANIER
     ================================================================== */
  function addToCart(product, color, size, qty) {
    const cart = getCart();
    const lineId = `${product.id}-${color}-${size}`;
    const existing = cart.find((item) => item.lineId === lineId);

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        lineId,
        id: product.id,
        name: product.name,
        name_ar: product.name_ar || '',
        name_en: product.name_en || '',
        price: priceForSize(product, size),
        image: product.images[0],
        color,
        size,
        qty,
      });
    }
    saveCart(cart);
    updateCartCount();
    showToast(`${pName(product)} ${t('toast.added_suffix')}`);
  }

  function updateCartCount() {
    const cart = getCart();
    const total = cart.reduce((sum, item) => sum + item.qty, 0);
    $$('.cart-count').forEach((el) => (el.textContent = total));
  }

  function renderCart() {
    const container = $('#cartContainer');
    if (!container) return;
    const cart = getCart();

    if (!cart.length) {
      container.innerHTML = `
        <div class="cart-empty fade-in visible">
          <div class="icon">🛍️</div>
          <h3>${t('cart.empty_title')}</h3>
          <p>${t('cart.empty_text')}</p>
          <a href="#shop" data-route="shop" class="btn btn-primary">${t('cart.view_shop')}</a>
        </div>`;
      return;
    }

    try {
      renderCartContent(container, cart);
    } catch (err) {
      // Filet de sécurité : si une donnée inattendue empêche l'affichage du
      // panier, on ne laisse jamais la page vide — on propose de le vider.
      console.error('Erreur affichage panier :', err);
      container.innerHTML = `
        <div class="cart-empty fade-in visible">
          <div class="icon">⚠️</div>
          <h3>${t('cart.error_title')}</h3>
          <p>${t('cart.error_text')}</p>
          <button type="button" class="btn btn-primary" id="cartClearBtn">${t('cart.clear')}</button>
        </div>`;
      const clearBtn = $('#cartClearBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          clearCart();
          renderCart();
          updateCartCount();
          showToast(t('cart.cleared_toast'));
        });
      }
    }
  }

  function renderCartContent(container, cart) {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const deliveryFee = DELIVERY_FEES[selectedDeliveryZone] ?? DELIVERY_FEES.same_city;
    const total = subtotal + deliveryFee;

    container.innerHTML = `
      <div class="cart-layout">
        <div class="cart-items fade-in visible">
          <table class="cart-table">
            <thead>
              <tr><th>${t('cart.table_product')}</th><th>${t('cart.table_price')}</th><th>${t('cart.table_qty')}</th><th>${t('cart.table_total')}</th></tr>
            </thead>
            <tbody id="cartRows">
              ${cart.map((item) => `
                <tr class="cart-row" data-line="${item.lineId}">
                  <td>
                    <div class="cart-product">
                      <img src="${item.image}" alt="${cName(item)}" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}';">
                      <div>
                        <div class="cart-product-name">${cName(item)}</div>
                        <div class="cart-product-meta">${t('cart.color_label')} : ${tColor(item.color)} · ${t('cart.size_label')} : ${tSize(item.size)}</div>
                        <span class="cart-remove" data-line="${item.lineId}">${t('cart.remove')}</span>
                      </div>
                    </div>
                  </td>
                  <td>${formatPrice(item.price)}</td>
                  <td>
                    <div class="cart-qty">
                      <button type="button" class="cart-qty-minus" data-line="${item.lineId}">−</button>
                      <input type="number" value="${item.qty}" min="1" max="10" class="cart-qty-input" data-line="${item.lineId}">
                      <button type="button" class="cart-qty-plus" data-line="${item.lineId}">+</button>
                    </div>
                  </td>
                  <td class="cart-line-total">${formatPrice(item.price * item.qty)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="cart-summary fade-in visible">
          <h3>${t('cart.summary_title')}</h3>
          <div class="delivery-zone-select">
            <p class="delivery-zone-label">${t('cart.delivery_zone_title')}</p>
            <label class="delivery-zone-option">
              <input type="radio" name="deliveryZone" value="same_city" ${selectedDeliveryZone === 'same_city' ? 'checked' : ''}>
              <span>${t('cart.delivery_same_city')} — ${formatPrice(DELIVERY_FEES.same_city)}</span>
            </label>
            <label class="delivery-zone-option">
              <input type="radio" name="deliveryZone" value="other_city" ${selectedDeliveryZone === 'other_city' ? 'checked' : ''}>
              <span>${t('cart.delivery_other_city')} — ${formatPrice(DELIVERY_FEES.other_city)}</span>
            </label>
          </div>
          <div class="summary-row"><span>${t('cart.subtotal')}</span><span>${formatPrice(subtotal)}</span></div>
          <div class="summary-row"><span>${t('cart.delivery')}</span><span>${formatPrice(deliveryFee)}</span></div>
          <div class="summary-row total"><span>${t('cart.total')}</span><span>${formatPrice(total)}</span></div>
          <a href="checkout.html" class="btn btn-primary btn-block" id="codOrderBtn" style="margin-top:20px;">${t('cart.order_cod')}</a>
          <button class="btn whatsapp-order-btn" id="whatsappOrderBtn" style="margin-top:12px;">${t('cart.order_whatsapp')}</button>
          <p style="font-size:13px;color:var(--gray);margin-top:14px;">${t('cart.order_note')}</p>
          <button type="button" id="cartClearLink" style="display:block;width:100%;margin-top:14px;padding:10px;background:transparent;border:1px solid #c0392b;color:#c0392b;border-radius:6px;cursor:pointer;font-size:13px;">${t('cart.clear')}</button>
        </div>
      </div>
    `;

    // Suppression
    $$('.cart-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const newCart = getCart().filter((item) => item.lineId !== btn.dataset.line);
        saveCart(newCart);
        renderCart();
        updateCartCount();
      });
    });

    // Quantité +/-
    $$('.cart-qty-minus').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQty(btn.dataset.line, -1));
    });
    $$('.cart-qty-plus').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQty(btn.dataset.line, 1));
    });
    $$('.cart-qty-input').forEach((input) => {
      input.addEventListener('change', () => setCartQty(input.dataset.line, Number(input.value)));
    });

    // Zone de livraison
    $$('input[name="deliveryZone"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        selectedDeliveryZone = radio.value;
        localStorage.setItem('ml_delivery_zone', selectedDeliveryZone);
        renderCart();
      });
    });

    // Commande WhatsApp
    $('#whatsappOrderBtn').addEventListener('click', sendOrderToWhatsApp);

    // Vider le panier (filet de sécurité manuel)
    const clearLink = $('#cartClearLink');
    if (clearLink) {
      clearLink.addEventListener('click', () => {
        clearCart();
        renderCart();
        updateCartCount();
        showToast(t('cart.cleared_toast'));
      });
    }
  }

  function changeCartQty(lineId, delta) {
    const cart = getCart();
    const item = cart.find((i) => i.lineId === lineId);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty < 1) {
      // Cliquer sur "-" quand la quantité est déjà à 1 retire l'article du panier
      // (au lieu de rester bloqué à 1 sans rien faire).
      const newCart = cart.filter((i) => i.lineId !== lineId);
      saveCart(newCart);
      showToast(t('cart.item_removed_toast'));
    } else {
      item.qty = Math.min(10, newQty);
      saveCart(cart);
    }
    renderCart();
    updateCartCount();
  }

  function setCartQty(lineId, qty) {
    const cart = getCart();
    const item = cart.find((i) => i.lineId === lineId);
    if (!item) return;
    item.qty = Math.max(1, Math.min(10, qty || 1));
    saveCart(cart);
    renderCart();
    updateCartCount();
  }

  function sendOrderToWhatsApp() {
    const cart = getCart();
    if (!cart.length) return;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const deliveryFee = DELIVERY_FEES[selectedDeliveryZone] ?? DELIVERY_FEES.same_city;
    const total = subtotal + deliveryFee;
    const zoneLabel = selectedDeliveryZone === 'same_city' ? t('cart.delivery_same_city') : t('cart.delivery_other_city');

    let message = `${t('cart.wa_greeting')}\n\n`;
    cart.forEach((item) => {
      message += `• ${cName(item)} (${t('cart.color_label')} : ${tColor(item.color)}, ${t('cart.size_label')} : ${tSize(item.size)}) x${item.qty} — ${formatPrice(item.price * item.qty)}\n`;
    });
    message += `\n${t('cart.subtotal')} : ${formatPrice(subtotal)}`;
    message += `\n${t('cart.delivery')} (${zoneLabel}) : ${formatPrice(deliveryFee)}`;
    message += `\n${t('cart.wa_total_label')} : ${formatPrice(total)}\n${t('cart.wa_cod')}`;

    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    const win = window.open(waUrl, '_blank');
    // Si le navigateur bloque la pop-up (bloqueur de fenêtres), on retombe sur
    // une navigation directe dans le même onglet plutôt que de rester bloqué.
    if (!win || win.closed || typeof win.closed === 'undefined') {
      window.location.href = waUrl;
    }
  }

  /* ==================================================================
     TOAST
     ================================================================== */
  let toastTimer = null;
  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.innerHTML = `<span class="tick">✓</span> ${message}`;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  /* ==================================================================
     NAVIGATION — clic global délégué (liens data-route)
     ================================================================== */
  function setupDelegatedNav() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-route]');
      if (!link) return;

      // Boutons "Ajouter au panier" rapide depuis une carte produit
      if (e.target.classList.contains('add-quick-btn')) return;

      e.preventDefault();
      const route = link.dataset.route;
      const id = link.dataset.id;
      navigateTo(id ? `${route}:${id}` : route);
    });

    // Ajout rapide au panier depuis les cartes produit (délégation séparée)
    document.addEventListener('click', (e) => {
      if (!e.target.classList.contains('add-quick-btn')) return;
      const id = Number(e.target.dataset.id);
      const product = PRODUCTS.find((p) => p.id === id);
      if (product) addToCart(product, product.colors[0], product.sizes[0], 1);
    });

    // Cartes catégorie sur la home
    $$('.category-card').forEach((card) => {
      card.addEventListener('click', () => {
        const cat = card.dataset.category;
        navigateTo(cat ? `shop:${cat}` : 'shop');
      });
    });
  }

  /* ==================================================================
     MENU MOBILE
     ================================================================== */
  function setupMobileMenu() {
    const burger = $('#burgerBtn');
    const nav = $('#mainNav');
    if (!burger || !nav) return;
    burger.addEventListener('click', () => nav.classList.toggle('open'));
  }
  function closeMobileMenu() {
    $('#mainNav')?.classList.remove('open');
  }

  /* ==================================================================
     HEADER PREMIUM — rétrécit au scroll avec transition douce
     ================================================================== */
  function setupHeaderScroll() {
    const header = $('#siteHeader');
    if (!header) return;
    const toggleScrolled = () => {
      header.classList.toggle('scrolled', window.scrollY > 40);
    };
    toggleScrolled();
    window.addEventListener('scroll', toggleScrolled, { passive: true });
  }

  /* ==================================================================
     RECHERCHE (overlay) — recherche en direct par nom de produit
     ================================================================== */
  function openSearch() {
    const overlay = $('#searchOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    renderSearchResults('');
    setTimeout(() => $('#searchInput')?.focus(), 50);
  }

  function closeSearch() {
    const overlay = $('#searchOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    const input = $('#searchInput');
    if (input) input.value = '';
  }

  function renderSearchResults(query) {
    const container = $('#searchResults');
    if (!container) return;
    const q = query.trim().toLowerCase();

    if (!q) {
      container.innerHTML = '';
      return;
    }

    const matches = PRODUCTS.filter((p) => {
      const name = (pName(p) || '').toLowerCase();
      const nameFr = (p.name || '').toLowerCase();
      const nameAr = (p.name_ar || '').toLowerCase();
      const nameEn = (p.name_en || '').toLowerCase();
      return name.includes(q) || nameFr.includes(q) || nameAr.includes(q) || nameEn.includes(q);
    }).slice(0, 8);

    if (!matches.length) {
      container.innerHTML = `<div class="search-empty">${t('header.search_no_results')}</div>`;
      return;
    }

    container.innerHTML = matches.map((p) => `
      <div class="search-result-item" data-id="${p.id}">
        <img src="${p.images[0]}" alt="${pName(p)}">
        <div>
          <div class="search-result-name">${pName(p)}</div>
          <div class="search-result-price">${formatPrice(p.price)}</div>
        </div>
      </div>
    `).join('');

    $$('.search-result-item', container).forEach((item) => {
      item.addEventListener('click', () => {
        closeSearch();
        navigateTo(`product:${item.dataset.id}`);
      });
    });
  }

  function setupSearch() {
    const searchBtn = $('#searchBtn');
    const overlay = $('#searchOverlay');
    const input = $('#searchInput');
    const closeBtn = $('#searchCloseBtn');
    if (!searchBtn || !overlay) return;

    searchBtn.addEventListener('click', openSearch);
    closeBtn?.addEventListener('click', closeSearch);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
    input?.addEventListener('input', () => renderSearchResults(input.value));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeSearch();
    });
  }

  /* ==================================================================
     FILTRES BOUTIQUE — écouteurs
     ================================================================== */
  function setupShopFilters() {
    $$('.filter-category').forEach((cb) => cb.addEventListener('change', applyShopFilters));
    $('#priceMin')?.addEventListener('input', applyShopFilters);
    $('#priceMax')?.addEventListener('input', applyShopFilters);
    $('#sortSelect')?.addEventListener('change', applyShopFilters);
    $('#filterResetBtn')?.addEventListener('click', resetFilters);
  }

  /* ==================================================================
     NEWSLETTER — envoi réel.
     Si NEWSLETTER_FORMSPREE_ENDPOINT est configuré (voir Configuration
     ci-dessus), l'email est envoyé automatiquement via Formspree (liste
     d'emails, aucune action du visiteur après le clic).
     Tant que ce n'est pas configuré, ça marche déjà MAINTENANT sans aucune
     inscription à un service tiers : ça ouvre WhatsApp avec l'email du
     visiteur pré-rempli, envoyé à votre numéro (WHATSAPP_NUMBER). Le
     visiteur n'a plus qu'à appuyer sur "Envoyer" dans WhatsApp.
     ================================================================== */
  function setupNewsletter() {
    const form = $('#newsletterForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = $('#newsletterEmail');
      const email = emailInput.value.trim();
      const msg = $('#newsletterMsg');
      const btn = form.querySelector('button[type="submit"]');

      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        msg.textContent = t('newsletter.msg_invalid');
        msg.classList.remove('success');
        msg.classList.add('error');
        return;
      }

      if (!NEWSLETTER_FORMSPREE_ENDPOINT || NEWSLETTER_FORMSPREE_ENDPOINT.includes('VOTRE_ID_FORMSPREE')) {
        // Pas de service de liste configuré : on envoie quand même l'email
        // quelque part de réel, via WhatsApp, sans aucune configuration.
        const waMessage = encodeURIComponent(`${t('newsletter.wa_text')} ${email}`);
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`, '_blank');
        msg.textContent = t('newsletter.msg_whatsapp_success');
        msg.classList.remove('error');
        msg.classList.add('success');
        form.reset();
        return;
      }

      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = t('newsletter.sending');

      try {
        const res = await fetch(NEWSLETTER_FORMSPREE_ENDPOINT, {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: new FormData(form)
        });
        if (res.ok) {
          msg.textContent = t('newsletter.msg_success');
          msg.classList.remove('error');
          msg.classList.add('success');
          form.reset();
        } else {
          msg.textContent = t('newsletter.msg_fail');
          msg.classList.remove('success');
          msg.classList.add('error');
        }
      } catch (err) {
        msg.textContent = t('newsletter.msg_fail_network');
        msg.classList.remove('success');
        msg.classList.add('error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  }

  /* ==================================================================
     FADE-IN AU SCROLL (IntersectionObserver)
     ================================================================== */
  let observer = null;
  function initFadeIn() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    $$('.fade-in').forEach((el) => observer.observe(el));
    bindProductVideos();
  }

  /* ==================================================================
     INITIALISATION
     ================================================================== */
  // Fermer le lightbox avec la touche Échap. Écouteur global posé une seule
  // fois (pas à chaque renderProduct) : #lightbox est recréé dans le DOM à
  // chaque changement de page produit, donc on le recherche à chaque frappe
  // plutôt que de garder une référence qui deviendrait obsolète.
  function setupLightboxEscape() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const lightbox = $('#lightbox');
      if (lightbox) lightbox.classList.remove('open');
    });
  }

  async function init() {
    const versionTag = document.getElementById('buildVersionTag');
    if (versionTag) versionTag.textContent = 'build ' + SCRIPT_VERSION;
    await loadProducts();
    applyStaticTranslations();
    setupDelegatedNav();
    setupLightboxEscape();
    setupMobileMenu();
    setupHeaderScroll();
    setupSearch();
    setupShopFilters();
    setupNewsletter();
    setupLangSwitch();
    updateCartCount();
    handleRoute();
  }

  window.addEventListener('hashchange', handleRoute);

  // Synchronise le panier entre onglets : si le panier change dans un autre
  // onglet (vidé, quantité modifiée...), on met à jour le badge et, si on
  // est sur la page panier, son contenu — sans avoir besoin de recharger.
  window.addEventListener('storage', (e) => {
    if (e.key !== CART_KEY) return;
    updateCartCount();
    if (parseHash().route === 'cart') renderCart();
  });

  document.addEventListener('DOMContentLoaded', init);
})();
