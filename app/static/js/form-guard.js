(function () {
  'use strict';

  const GUARD_TIMEOUT_MS = 30000;
  const SUBMITTING_ATTR = 'data-submitting';
  const OVERLAY_ID = '__form_guard_overlay__';
  const STYLE_ID = '__form_guard_style__';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0,0,0,0.15);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: not-allowed;
      }
      #${OVERLAY_ID} .fg-spinner-box {
        background: white;
        border-radius: 12px;
        padding: 20px 28px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        color: #374151;
      }
      #${OVERLAY_ID} .fg-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #e5e7eb;
        border-top-color: #DC2626;
        border-radius: 50%;
        animation: fg-spin 0.7s linear infinite;
        flex-shrink: 0;
      }
      @keyframes fg-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  function showOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="fg-spinner-box">
        <div class="fg-spinner"></div>
        <span>Memproses...</span>
      </div>
    `;
    overlay.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); });
    document.body.appendChild(overlay);
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
  }

  function markSubmitting(form) {
    form.setAttribute(SUBMITTING_ATTR, '1');

    // Disable & update teks semua tombol submit dalam form
    form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(function (btn) {
      btn.disabled = true;
      if (btn.tagName === 'BUTTON') {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `
          <span style="display:inline-flex;align-items:center;gap:8px;">
            <svg style="width:16px;height:16px;animation:fg-spin 0.7s linear infinite;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            Memproses...
          </span>`;
      }
    });

    showOverlay();

    // Auto-release fallback setelah timeout
    return setTimeout(function () {
      releaseSubmitting(form);
    }, GUARD_TIMEOUT_MS);
  }

  function releaseSubmitting(form) {
    form.removeAttribute(SUBMITTING_ATTR);
    form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(function (btn) {
      btn.disabled = false;
      if (btn.tagName === 'BUTTON' && btn.dataset.originalText) {
        btn.innerHTML = btn.dataset.originalText;
        delete btn.dataset.originalText;
      }
    });
    hideOverlay();
  }

  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;

    // Hanya proteksi form POST
    const method = (form.getAttribute('method') || 'get').toLowerCase();
    if (method !== 'post') return;

    // Izinkan opt-out per form dengan atribut data-no-guard
    if (form.hasAttribute('data-no-guard')) return;

    // Sudah dalam proses submit — blokir submit kedua
    if (form.hasAttribute(SUBMITTING_ATTR)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // Jika ada validator lain yang batalkan submit (misal validasi custom), jangan intercept
    if (e.defaultPrevented) return;

    markSubmitting(form);
  }, true);

  // Patch HTMLFormElement.prototype.submit untuk tangkap submit programatik (bukan via event)
  const _nativeSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    const method = (this.getAttribute('method') || 'get').toLowerCase();
    if (method === 'post' && !this.hasAttribute('data-no-guard') && !this.hasAttribute(SUBMITTING_ATTR)) {
      markSubmitting(this);
    }
    _nativeSubmit.call(this);
  };

})();