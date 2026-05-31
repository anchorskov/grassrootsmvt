(function () {
  function injectBanner() {
    if (document.getElementById('us-campaign-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'us-campaign-banner';
    banner.className = 'us-banner';
    banner.setAttribute('role', 'banner');
    banner.setAttribute('aria-label', 'Untrammeled Suffrage campaign banner');
    banner.innerHTML =
      '<div class="us-banner-inner">' +
        '<div class="us-left">' +
          '<span class="us-brand">Untrammeled Suffrage</span>' +
          '<span class="us-definition"> — the unrestricted right to vote</span>' +
        '</div>' +
        '<div class="us-right">' +
          '<span class="us-support">Support Jimmy &middot; ' +
            '<a href="https://skovgard2026.org" target="_blank" rel="noopener">skovgard2026.org</a>' +
          '</span>' +
        '</div>' +
      '</div>';

    document.body.insertBefore(banner, document.body.firstChild);
    // Expose banner height so fixed overlays (logout pill, etc.) can offset below it
    document.documentElement.style.setProperty('--us-banner-height', banner.offsetHeight + 'px');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }
})();
