'use client';

import type { Receipt } from './types';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  QRIS: 'QRIS',
  DEBIT_CARD: 'Debit Card',
  CREDIT_CARD: 'Credit Card',
  EWALLET: 'E-Wallet',
  BANK_TRANSFER: 'Bank Transfer',
  VOUCHER: 'Voucher',
};

/**
 * Builds an 80mm thermal-printer receipt.
 * Every interpolated value is HTML-escaped — product names and notes are
 * operator-supplied and must never be treated as markup.
 */
export function buildReceiptHtml(receipt: Receipt): string {
  const { order, store } = receipt;
  const fmt = new Intl.NumberFormat(store.locale || 'id-ID', {
    style: 'currency',
    currency: store.currency || 'IDR',
    minimumFractionDigits: (store.currency || 'IDR') === 'IDR' ? 0 : 2,
  });

  const money = (value: number) => escapeHtml(fmt.format(value ?? 0));

  const row = (label: string, value: string, bold = false) =>
    `<div class="row${bold ? ' bold' : ''}"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;

  const items = order.items
    .map((item) => {
      const name = escapeHtml(item.variantName ? `${item.productName} (${item.variantName})` : item.productName);
      const note = item.note ? `<div class="note">↳ ${escapeHtml(item.note)}</div>` : '';
      const discount = item.discountAmount > 0 ? `<div class="note">Discount −${money(item.discountAmount)}</div>` : '';
      return `
        <div class="item">
          <div class="item-name">${name}</div>
          <div class="row">
            <span>${item.quantity} × ${money(item.unitPrice)}</span>
            <span>${money(item.lineTotal)}</span>
          </div>
          ${discount}${note}
        </div>`;
    })
    .join('');

  const payments = order.payments
    .map((payment) =>
      row(
        METHOD_LABELS[payment.method] ?? payment.method,
        money(payment.amount) + (payment.referenceNo ? ` <small>#${escapeHtml(payment.referenceNo)}</small>` : ''),
      ),
    )
    .join('');

  const voidBanner =
    order.status !== 'COMPLETED'
      ? `<div class="void-banner">*** ${escapeHtml(order.status)} ***</div>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt ${escapeHtml(order.orderNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body {
    width: 74mm; margin: 0 auto; padding: 2mm 0;
    font-family: "Courier New", ui-monospace, monospace;
    font-size: 11px; line-height: 1.45; color: #000; background: #fff;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .store-name { font-size: 15px; font-weight: 700; letter-spacing: .5px; }
  .muted { font-size: 10px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row span:last-child { text-align: right; white-space: nowrap; }
  .item { margin-bottom: 5px; }
  .item-name { font-weight: 600; }
  .note { font-size: 10px; padding-left: 8px; font-style: italic; }
  .total { font-size: 14px; font-weight: 700; }
  .void-banner { text-align: center; font-weight: 700; letter-spacing: 2px; border: 2px solid #000; padding: 4px; margin: 6px 0; }
  .footer { margin-top: 8px; font-size: 10px; white-space: pre-line; }
  @media print { body { width: auto; } }
</style>
</head>
<body>
  <div class="center">
    <div class="store-name">${escapeHtml(store.name)}</div>
    ${store.address ? `<div class="muted">${escapeHtml(store.address)}</div>` : ''}
    ${store.phone ? `<div class="muted">${escapeHtml(store.phone)}</div>` : ''}
  </div>

  <hr>

  ${row('Receipt', escapeHtml(order.orderNumber))}
  ${row('Date', escapeHtml(new Date(order.createdAt).toLocaleString(store.locale || 'id-ID')))}
  ${row('Cashier', escapeHtml(order.cashier.fullName))}
  ${row('Type', escapeHtml(order.channel.replace('_', ' ')))}
  ${order.tableNumber ? row('Table', escapeHtml(order.tableNumber)) : ''}
  ${order.customer ? row('Customer', escapeHtml(order.customer.name)) : ''}

  ${voidBanner}
  <hr>

  ${items}

  <hr>

  ${row('Subtotal', money(order.subtotal))}
  ${order.discountAmount > 0 ? row('Discount', `−${money(order.discountAmount)}`) : ''}
  ${order.serviceAmount > 0 ? row('Service charge', money(order.serviceAmount)) : ''}
  ${order.taxAmount > 0 ? row(store.taxInclusive ? 'Tax (included)' : 'Tax', money(order.taxAmount)) : ''}
  ${order.roundingAmount !== 0 ? row('Rounding', money(order.roundingAmount)) : ''}

  <hr>
  <div class="row total"><span>TOTAL</span><span>${money(order.total)}</span></div>
  <hr>

  ${payments}
  ${order.changeAmount > 0 ? row('Change', money(order.changeAmount), true) : ''}

  ${
    order.customer
      ? `<hr>${row('Loyalty points', String(order.customer.loyaltyPoints))}`
      : ''
  }

  <hr>
  <div class="center footer">${escapeHtml(store.footer || 'Thank you!')}</div>
  <div class="center muted" style="margin-top:6px">Powered by Kopi POS</div>
</body>
</html>`;
}

/**
 * Opens the receipt in a hidden iframe and triggers the print dialog. An iframe
 * avoids the pop-up blocker problems of `window.open`.
 */
export function printReceipt(receipt: Receipt): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(buildReceiptHtml(receipt));
  doc.close();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = triggerPrint;
  // Fallback for browsers that never fire `load` on a document-written iframe.
  setTimeout(triggerPrint, 500);
}
