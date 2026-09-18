/* ===================================================================
   MOROCCAN LEATHER — checkout.js
   Page checkout.html : récapitulatif du panier (localStorage "ml_cart"),
   formulaire client, choix du mode de paiement (COD ou WhatsApp).
   Fichier autonome (n'importe pas script.js) : la page checkout n'utilise
   pas le routage par hash du site, donc aucune dépendance croisée.
   =================================================================== */

(() => {
  'use strict';

  // Mêmes clés / constantes que script.js, pour lire le panier déjà rempli
  // par le reste du site (bouton "Ajouter au panier", etc.).
  const CART_KEY = 'ml_cart';
  const ORDER_KEY = 'ml_last_order';
  const WHATSAPP_NUMBER = '212648092229';
  const DELIVERY_FEES = { same_city: 15, other_city: 45 };

  // ---------- Email de notification (commande "Paiement à la livraison") ----------
  // Le site n'a pas de serveur : on utilise Formspree (déjà utilisé pour la
  // newsletter dans script.js) pour recevoir un email à CHAQUE commande COD,
  // à l'adresse rafikk.tarikk@gmail.com.
  // À faire une seule fois :
  //   1) Créez un compte gratuit sur https://formspree.io avec l'adresse
  //      rafikk.tarikk@gmail.com
  //   2) Créez un formulaire → Formspree vous donne une URL du type
  //      https://formspree.io/f/xxxxxxxx
  //   3) Collez cette URL ci-dessous à la place du placeholder
  //   4) Formspree envoie un email de confirmation à cette adresse : cliquez
  //      sur le lien qu'il contient (étape obligatoire une seule fois, sinon
  //      Formspree ne livre jamais aucun message).
  // Tant que ce n'est pas configuré, les commandes COD continuent de
  // fonctionner normalement (localStorage + confirmation.html) : seul
  // l'email de notification est ignoré (un avertissement s'affiche dans la
  // console du navigateur pour le signaler).
  const ORDER_NOTIFY_FORMSPREE_ENDPOINT = 'https://formspree.io/f/VOTRE_ID_FORMSPREE';
  const FALLBACK_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">'
    + '<rect width="120" height="120" fill="#F5F5DC"/>'
    + '<path d="M30 85 L48 60 L62 75 L78 50 L95 85 Z" fill="#D4AF37" opacity="0.6"/>'
    + '<circle cx="42" cy="42" r="9" fill="#D4AF37" opacity="0.6"/>'
    + '</svg>'
  );

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const getCart = () => {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  };
  const formatPrice = (n) => `${Number(n).toLocaleString('fr-FR')} DH`;

  // Respecte la langue déjà choisie sur le site (fr par défaut) pour afficher
  // le bon nom de produit, comme le fait script.js sur les autres pages.
  const currentLang = (() => {
    const stored = localStorage.getItem('ml_lang');
    return (stored === 'fr' || stored === 'en' || stored === 'ar') ? stored : 'fr';
  })();
  const cName = (item) => (currentLang === 'ar' && item.name_ar) ? item.name_ar
    : (currentLang === 'en' && item.name_en) ? item.name_en
    : item.name;

  // Zone de livraison déjà sélectionnée dans le panier (page #cart) ; par
  // défaut "même ville" si l'acheteur n'est jamais passé par cette étape.
  const selectedZone = localStorage.getItem('ml_delivery_zone') === 'other_city' ? 'other_city' : 'same_city';
  const zoneLabel = selectedZone === 'same_city' ? 'Livraison (Fès)' : 'Livraison (autres villes)';

  function updateCartCountBadge() {
    const total = getCart().reduce((sum, i) => sum + i.qty, 0);
    $$('.cart-count').forEach((el) => { el.textContent = total; });
  }

  /* ---------- Récapitulatif du panier ---------- */
  function renderSummary() {
    const cart = getCart();
    const itemsEl = $('#checkoutItems');
    const emptyEl = $('#checkoutEmpty');
    const formEl = $('#checkoutForm');

    if (!cart.length) {
      if (emptyEl) emptyEl.hidden = false;
      // Le formulaire porte display:grid via .cart-layout : on force son
      // display en JS plutôt que [hidden], sans quoi la règle CSS (même
      // spécificité, feuille auteur) l'emporterait sur l'attribut hidden.
      if (formEl) formEl.style.display = 'none';
      return { cart, subtotal: 0, deliveryFee: 0, total: 0 };
    }
    if (emptyEl) emptyEl.hidden = true;
    if (formEl) formEl.style.display = '';

    const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const deliveryFee = DELIVERY_FEES[selectedZone];
    const total = subtotal + deliveryFee;

    if (itemsEl) {
      itemsEl.innerHTML = cart.map((item) => `
        <div class="cart-product" style="margin-bottom:18px;">
          <img src="${item.image}" alt="${cName(item)}" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}';">
          <div style="flex:1;">
            <div class="cart-product-name">${cName(item)}</div>
            <div class="cart-product-meta">${item.color || ''}${item.size ? ' · ' + item.size : ''} · Qté : ${item.qty}</div>
          </div>
          <div class="cart-line-total">${formatPrice(item.price * item.qty)}</div>
        </div>
      `).join('');
    }

    const subtotalEl = $('#ckSubtotal');
    const deliveryLabelEl = $('#ckDeliveryLabel');
    const deliveryEl = $('#ckDelivery');
    const totalEl = $('#ckTotal');
    if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
    if (deliveryLabelEl) deliveryLabelEl.textContent = zoneLabel;
    if (deliveryEl) deliveryEl.textContent = formatPrice(deliveryFee);
    if (totalEl) totalEl.textContent = formatPrice(total);

    return { cart, subtotal, deliveryFee, total };
  }

  /* ---------- Mode de paiement : bascule les 2 boutons ---------- */
  function setupPaymentToggle() {
    const options = $$('.payment-option');
    const codBtn = $('#codSubmitBtn');
    const waBtn = $('#waSubmitBtn');

    function applyMethod(method) {
      options.forEach((opt) => opt.classList.toggle('selected', opt.dataset.method === method));
      // .btn définit display:inline-flex (règle auteur) : ça l'emporterait sur
      // l'attribut [hidden] (règle UA), qui perd toujours face à une règle
      // auteur même de spécificité égale. On neutralise donc l'attribut hidden
      // et on pilote la visibilité uniquement via style.display en JS (source
      // unique de vérité), comme pour #checkoutForm plus haut.
      if (codBtn) { codBtn.hidden = false; codBtn.style.display = method === 'cod' ? '' : 'none'; }
      if (waBtn) { waBtn.hidden = false; waBtn.style.display = method === 'whatsapp' ? '' : 'none'; }
    }

    $$('input[name="paymentMethod"]').forEach((radio) => {
      radio.addEventListener('change', () => { if (radio.checked) applyMethod(radio.value); });
    });

    const checked = $('input[name="paymentMethod"]:checked');
    applyMethod(checked ? checked.value : 'cod');
  }

  /* ---------- Formulaire "Vos informations" ---------- */
  function readFormValues() {
    return {
      email: $('#ckEmail').value.trim(),
      firstName: $('#ckFirstName').value.trim(),
      lastName: $('#ckLastName').value.trim(),
      address: $('#ckAddress').value.trim(),
      city: $('#ckCity').value.trim(),
      phone: $('#ckPhone').value.trim(),
    };
  }

  function validateForm(values) {
    return Boolean(values.email && values.firstName && values.lastName && values.address && values.city && values.phone);
  }

  function showError(msg) {
    const err = $('#checkoutError');
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
  }
  function clearError() {
    const err = $('#checkoutError');
    if (err) err.hidden = true;
  }

  function buildOrderNumber() {
    const d = new Date();
    const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ML-${datePart}-${rand}`;
  }

  /* ---------- Email de notification au propriétaire (commande COD) ---------- */
  function notifyShopOwnerByEmail(order) {
    if (!ORDER_NOTIFY_FORMSPREE_ENDPOINT || ORDER_NOTIFY_FORMSPREE_ENDPOINT.includes('VOTRE_ID_FORMSPREE')) {
      console.warn('[Moroccan Leather] Formspree non configuré : aucun email de commande envoyé. Voir ORDER_NOTIFY_FORMSPREE_ENDPOINT en haut de checkout.js.');
      return;
    }

    const itemsText = order.items
      .map((item) => `${item.name} x${item.qty} — ${formatPrice(item.price * item.qty)}`)
      .join('\n');

    const body = new FormData();
    body.append('_subject', `🛍️ Nouvelle commande ${order.orderNumber} — ${formatPrice(order.total)}`);
    body.append('Numéro de commande', order.orderNumber);
    body.append('Client', `${order.firstName} ${order.lastName}`);
    body.append('Email client', order.email);
    body.append('Téléphone', order.phone);
    body.append('Adresse de livraison', `${order.address}, ${order.city}`);
    body.append('Mode de paiement', 'Paiement à la livraison (COD)');
    body.append('Articles commandés', itemsText);
    body.append('Sous-total', formatPrice(order.subtotal));
    body.append(order.deliveryLabel || 'Livraison', formatPrice(order.deliveryFee));
    body.append('Total à encaisser', formatPrice(order.total));
    body.append('_replyto', order.email);

    // keepalive:true laisse la requête se terminer même si la page change
    // juste après (on redirige vers confirmation.html tout de suite après).
    fetch(ORDER_NOTIFY_FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body,
      keepalive: true,
    }).catch((err) => {
      // Un souci réseau ne doit jamais bloquer la confirmation de commande
      // du client : COD + confirmation.html fonctionnent déjà sans ça.
      console.error("[Moroccan Leather] Échec de l'envoi de l'email de commande :", err);
    });
  }

  /* ---------- Option 1 : Paiement à la livraison → confirmation.html ---------- */
  function submitCodOrder(cart, totals, values) {
    const order = {
      orderNumber: buildOrderNumber(),
      date: new Date().toISOString(),
      paymentMethod: 'cod',
      ...values,
      items: cart,
      subtotal: totals.subtotal,
      deliveryFee: totals.deliveryFee,
      deliveryLabel: zoneLabel,
      total: totals.total,
    };
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* stockage indisponible : on continue quand même */ }
    try { localStorage.setItem(CART_KEY, JSON.stringify([])); } catch { /* idem */ }
    notifyShopOwnerByEmail(order);
    window.location.href = 'confirmation.html';
  }

  /* ---------- Option 2 : Commander via WhatsApp ---------- */
  function sendWhatsAppOrder(cart, totals, values) {
    const itemsText = cart.map((item) => `${cName(item)} x${item.qty}`).join(', ');
    let message = `Bonjour, je souhaite commander: ${itemsText}\n`;
    message += `Total: ${totals.total} MAD\n`;
    message += `Nom: ${values.firstName} ${values.lastName}\n`;
    message += `Adresse: ${values.address}, ${values.city}\n`;
    message += `Téléphone: ${values.phone}`;

    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    const win = window.open(waUrl, '_blank');
    // Si le navigateur bloque la pop-up, on retombe sur une navigation directe
    // (même logique que le bouton WhatsApp existant du panier, script.js).
    if (!win || win.closed || typeof win.closed === 'undefined') {
      window.location.href = waUrl;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateCartCountBadge();
    let totals = renderSummary();
    setupPaymentToggle();

    const form = $('#checkoutForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        clearError();
        const values = readFormValues();
        if (!validateForm(values)) {
          showError('Merci de remplir tous les champs obligatoires.');
          return;
        }
        totals = renderSummary();
        if (!totals.cart.length) {
          showError('Votre panier est vide.');
          return;
        }
        submitCodOrder(totals.cart, totals, values);
      });
    }

    const waBtn = $('#waSubmitBtn');
    if (waBtn) {
      waBtn.addEventListener('click', () => {
        clearError();
        const values = readFormValues();
        if (!validateForm(values)) {
          showError('Merci de remplir tous les champs obligatoires.');
          return;
        }
        totals = renderSummary();
        if (!totals.cart.length) {
          showError('Votre panier est vide.');
          return;
        }
        sendWhatsAppOrder(totals.cart, totals, values);
      });
    }
  });
})();
