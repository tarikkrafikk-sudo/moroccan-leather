/* ===================================================================
   MOROCCAN LEATHER — confirmation.js
   Page confirmation.html : affichée uniquement après une commande
   "Paiement à la livraison" passée sur checkout.html (voir checkout.js,
   qui écrit la commande dans localStorage["ml_last_order"] avant de
   rediriger ici). Un accès direct sans commande récente affiche un repli.
   =================================================================== */

(() => {
  'use strict';

  const ORDER_KEY = 'ml_last_order';
  const CART_KEY = 'ml_cart';
  const $ = (sel) => document.querySelector(sel);
  const formatPrice = (n) => `${Number(n).toLocaleString('fr-FR')} DH`;

  document.addEventListener('DOMContentLoaded', () => {
    // Le panier a été vidé par checkout.js au moment de la commande COD ;
    // on reflète ce "0" dans le badge du header de cette page.
    let cartTotal = 0;
    try { cartTotal = (JSON.parse(localStorage.getItem(CART_KEY)) || []).reduce((s, i) => s + i.qty, 0); } catch { /* noop */ }
    document.querySelectorAll('.cart-count').forEach((el) => { el.textContent = cartTotal; });

    let order = null;
    try { order = JSON.parse(localStorage.getItem(ORDER_KEY)); } catch { /* noop */ }

    const contentEl = $('#confirmationContent');
    const emptyEl = $('#confirmationEmpty');

    if (!order || order.paymentMethod !== 'cod') {
      if (emptyEl) emptyEl.hidden = false;
      if (contentEl) contentEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (contentEl) contentEl.hidden = false;

    const msgEl = $('#confMessage');
    if (msgEl) msgEl.textContent = `Merci, ${order.firstName} ! Votre commande est confirmée`;

    const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
    set('#confOrderNumber', order.orderNumber || '—');
    set('#confName', `${order.firstName || ''} ${order.lastName || ''}`.trim() || '—');
    set('#confAddress', [order.address, order.city].filter(Boolean).join(', ') || '—');
    set('#confPhone', order.phone || '—');
    set('#confDeliveryLabel', order.deliveryLabel || 'Livraison');
    set('#confDeliveryFee', typeof order.deliveryFee === 'number' ? formatPrice(order.deliveryFee) : '—');
    set('#confTotal', typeof order.total === 'number' ? formatPrice(order.total) : '—');
  });
})();
