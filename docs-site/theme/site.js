// rbac-fs docs site — client behavior. No framework, no build step needed
// to run this file itself (plain browser JS). Static site, no backend:
// search runs entirely against the prebuilt search-index.json.
(function () {
  'use strict';

  // ---------- Copy-to-clipboard ----------
  document.querySelectorAll('.code-wrap').forEach(function (wrap) {
    var btn = wrap.querySelector('.copy-btn');
    var code = wrap.querySelector('.code-block');
    if (!btn || !code) return;
    btn.addEventListener('click', function () {
      var text = code.innerText;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        btn.setAttribute('aria-label', 'Copied');
        setTimeout(function () {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
          btn.setAttribute('aria-label', 'Copy code');
        }, 1800);
      });
    });
  });

  // ---------- Mobile nav (hamburger drawer) ----------
  var hamburger = document.querySelector('.nav-hamburger');
  var overlay = document.querySelector('.mobile-overlay');
  if (hamburger) {
    hamburger.addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', function () {
      document.body.classList.remove('nav-open');
    });
  }

  // ---------- TOC scroll-spy ----------
  var tocLinks = document.querySelectorAll('.toc-list a');
  var sections = Array.prototype.map.call(tocLinks, function (a) {
    var id = a.getAttribute('href').replace('#', '');
    return { link: a, el: document.getElementById(id) };
  }).filter(function (s) { return s.el; });

  if (sections.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var match = sections.find(function (s) { return s.el === entry.target; });
          if (!match) return;
          if (entry.isIntersecting) {
            tocLinks.forEach(function (l) { l.classList.remove('active'); });
            match.link.classList.add('active');
          }
        });
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    sections.forEach(function (s) { observer.observe(s.el); });
  }

  // ---------- Search ----------
  var searchTrigger = document.querySelector('.nav-search');
  var searchOverlay = document.getElementById('search-overlay');
  var searchInput = document.getElementById('search-input');
  var searchResults = document.getElementById('search-results');
  var searchIndex = null;

  function loadIndex() {
    if (searchIndex) return Promise.resolve(searchIndex);
    var base = document.body.getAttribute('data-base') || '';
    return fetch(base + 'search-index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        searchIndex = data;
        return data;
      });
  }

  function openSearch() {
    if (!searchOverlay) return;
    searchOverlay.classList.add('open');
    loadIndex().then(function () {
      searchInput.focus();
    });
  }
  function closeSearch() {
    if (!searchOverlay) return;
    searchOverlay.classList.remove('open');
    searchInput.value = '';
    searchResults.innerHTML = '';
  }

  if (searchTrigger) {
    searchTrigger.addEventListener('click', openSearch);
  }
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearch();
    }
    if (e.key === 'Escape') closeSearch();
  });
  if (searchOverlay) {
    searchOverlay.addEventListener('click', function (e) {
      if (e.target === searchOverlay) closeSearch();
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      searchResults.innerHTML = '';
      if (!q || !searchIndex) return;
      var matches = searchIndex
        .filter(function (page) {
          return (
            page.title.toLowerCase().indexOf(q) !== -1 ||
            page.excerpt.toLowerCase().indexOf(q) !== -1 ||
            page.headings.some(function (h) { return h.toLowerCase().indexOf(q) !== -1; })
          );
        })
        .slice(0, 8);
      matches.forEach(function (page) {
        var a = document.createElement('a');
        a.href = page.url;
        a.className = 'search-result';
        a.innerHTML =
          '<strong>' + page.title + '</strong><span>' + page.excerpt.slice(0, 90) + '…</span>';
        searchResults.appendChild(a);
      });
      if (!matches.length) {
        var empty = document.createElement('p');
        empty.className = 'search-empty';
        empty.textContent = 'No results for “' + searchInput.value + '”.';
        searchResults.appendChild(empty);
      }
    });
  }
})();
