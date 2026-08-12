#!/usr/bin/env node
/**
 * rbac-fs docs site — static site generator.
 *
 * Hand-authored markdown -> static HTML. No third-party markdown/SSG
 * dependency (see docs/backlog/adr-docs-site.md §2) — the page count is
 * fixed and small (13 pages), so a ~small template layer here is less
 * overhead than a full framework, and it keeps the docs build fully
 * decoupled from the package's own build/test/verify pipeline (ADR §5:
 * this script never imports from src/, only reads examples/*.ts as text
 * when a content file links out to one).
 *
 * Usage: node docs-site/build.js
 * Output: _site/ at the repo root (gitignored, uploaded by CI as the
 * GitHub Pages artifact — see .github/workflows/docs.yml).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(__dirname, 'content');
const THEME_DIR = path.join(__dirname, 'theme');
const OUT_DIR = path.join(ROOT, '_site');

// GitHub Pages project sites (no custom domain) serve at
// https://<user>.github.io/<repo>/ — every root-absolute internal link
// and asset path needs this prefix. Override via DOCS_BASE_PATH for a
// custom domain (where it should be '/').
const BASE_PATH = process.env.DOCS_BASE_PATH || '/rbac-fs/';
const SITE_ORIGIN = process.env.DOCS_SITE_ORIGIN || 'https://imchintoo.github.io';
const CONTENT_DIR_BLOG = path.join(CONTENT_DIR, 'blog');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------
// Tiny markdown -> HTML converter. Deliberately not general-purpose —
// covers exactly what docs-site/content/*.md actually uses: #/##/###
// headings, fenced code blocks, tables, unordered lists, bold/inline
// code/links, and raw HTML block passthrough (for <div class="callout">).
// ---------------------------------------------------------------------

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function renderInlineText(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, label, url) {
    return '<a href="' + url + '">' + label + '</a>';
  });
  return out;
}

function renderBlocks(md) {
  const lines = md.split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const code = codeLines.join('\n');
      html.push(
        '<div class="code-wrap"><button class="copy-btn" aria-label="Copy code">Copy</button>' +
          '<pre class="code-block"><code class="lang-' +
          (lang || 'text') +
          '">' +
          escapeHtml(code) +
          '</code></pre></div>'
      );
      continue;
    }

    // raw HTML block passthrough (e.g. <div class="callout ...">)
    if (line.trim().startsWith('<')) {
      const htmlLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        htmlLines.push(lines[i]);
        i++;
      }
      html.push(htmlLines.join('\n'));
      continue;
    }

    // heading (### / ##, # handled separately at the page level)
    const headingMatch = line.match(/^(#{2,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length; // 2 or 3
      const text = headingMatch[2].trim();
      const id = slugify(text);
      html.push('<h' + level + (level === 2 ? ' id="' + id + '"' : '') + '>' + renderInlineText(text) + '</h' + level + '>');
      i++;
      continue;
    }

    // table
    if (line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter(function (l) {
        return !/^\|[\s-:|]+\|$/.test(l.trim());
      });
      const cells = rows.map(function (r) {
        return r
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map(function (c) {
            return c.trim();
          });
      });
      const [head, ...body] = cells;
      let t = '<table><thead><tr>';
      head.forEach(function (h) {
        t += '<th>' + renderInlineText(h) + '</th>';
      });
      t += '</tr></thead><tbody>';
      body.forEach(function (row) {
        t += '<tr>';
        row.forEach(function (c) {
          t += '<td>' + renderInlineText(c) + '</td>';
        });
        t += '</tr>';
      });
      t += '</tbody></table>';
      html.push(t);
      continue;
    }

    // unordered list
    if (/^-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s+/, ''));
        i++;
      }
      html.push('<ul>' + items.map(function (it) { return '<li>' + renderInlineText(it) + '</li>'; }).join('') + '</ul>');
      continue;
    }

    // paragraph — collect until blank line
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('```') && !lines[i].trim().startsWith('<') && !/^#{2,3}\s/.test(lines[i]) && !lines[i].trim().startsWith('|') && !/^-\s+/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    html.push('<p>' + renderInlineText(paraLines.join(' ')) + '</p>');
  }

  return html.join('\n');
}

/** Parses one content markdown file into { title, leadHtml, sections }. */
function parsePage(md) {
  const lines = md.split('\n');
  if (!lines[0].startsWith('# ')) {
    throw new Error('Every content file must start with "# Title" — got: ' + lines[0]);
  }
  const title = lines[0].slice(2).trim();
  const rest = lines.slice(1).join('\n');

  // Split remaining content on "## " boundaries (section starts)
  const parts = rest.split(/\n(?=## )/);
  const leadMd = parts[0].trim();
  const sectionParts = parts.slice(1);

  const leadHtml = renderBlocks(leadMd);

  const sections = sectionParts.map(function (part) {
    const headingLine = part.split('\n')[0];
    const heading = headingLine.replace(/^##\s+/, '').trim();
    const id = slugify(heading);
    const bodyMd = part.split('\n').slice(1).join('\n');
    return { id: id, title: heading, bodyHtml: renderBlocks(bodyMd) };
  });

  return { title: title, leadHtml: leadHtml, sections: sections };
}

/**
 * Blog posts (docs/backlog/adr-blog.md §1): flat `---`-delimited
 * frontmatter, not a full YAML parser — 5 flat key:value fields never
 * need real nesting, and a hand-rolled parser matches this project's
 * existing zero-dependency stance (adr-docs-site.md §2).
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new Error('Blog post is missing its --- frontmatter block');
  }
  const meta = {};
  match[1].split('\n').forEach(function (line) {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Optional surrounding quotes (needed when a value itself contains a
    // ":", e.g. a title with a subtitle) — stripped, not preserved.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  });
  meta.tags = (meta.tags || '')
    .split(',')
    .map(function (t) { return t.trim(); })
    .filter(Boolean);
  const body = raw.slice(match[0].length);
  return { meta: meta, body: body };
}

function readingTime(bodyMd) {
  const words = bodyMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function formatDate(iso) {
  const parts = iso.split('-').map(Number);
  const y = parts[0], m = parts[1], d = parts[2];
  return MONTHS[m - 1] + ' ' + d + ', ' + y;
}

function loadBlogPosts() {
  if (!fs.existsSync(CONTENT_DIR_BLOG)) return [];
  const files = fs.readdirSync(CONTENT_DIR_BLOG).filter(function (f) { return f.endsWith('.md'); });
  const posts = files.map(function (file) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR_BLOG, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const slug = file.replace(/\.md$/, '');
    const requiredFields = ['title', 'date', 'excerpt'];
    requiredFields.forEach(function (field) {
      if (!meta[field]) throw new Error('Blog post "' + file + '" is missing required frontmatter field: ' + field);
    });
    return {
      slug: slug,
      title: meta.title,
      date: meta.date,
      excerpt: meta.excerpt,
      tags: meta.tags,
      bodyMd: body,
      bodyHtml: renderBlocks(body),
      readTime: readingTime(body),
    };
  });
  // newest first — directory scan order is filesystem-dependent, sort explicitly
  posts.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  return posts;
}

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------

// Rewrites every href="/docs/..." / href="/assets/..." / src="/assets/..."
// occurrence in a full HTML document string to carry BASE_PATH. Must scan
// the whole string (content-authored links like "/docs/x.html#anchor"
// aren't built through docUrl()/asset()) — a single anchored regex only
// matching the string's start would silently no-op, which is exactly the
// bug this comment is here to prevent regressing.
function withBase(html) {
  return html.replace(/(href|src)="\/(docs|assets|blog)\//g, function (_m, attr, seg) {
    return attr + '="' + BASE_PATH + seg + '/';
  });
}

function asset(p) {
  return BASE_PATH + 'assets/' + p;
}

function docUrl(slug) {
  return BASE_PATH + 'docs/' + slug + '.html';
}

function blogListUrl() {
  return BASE_PATH + 'blog/';
}

function blogUrl(slug) {
  return BASE_PATH + 'blog/' + slug + '.html';
}

function baseHead(title, description) {
  return (
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' +
    escapeHtml(title) +
    ' · rbac-fs</title>' +
    '<meta name="description" content="' +
    escapeHtml(description) +
    '">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="' +
    asset('tokens.css') +
    '">' +
    '<link rel="stylesheet" href="' +
    asset('site.css') +
    '">'
  );
}

function navHtml(section) {
  // section: 'docs' | 'blog' | undefined — controls the nav-right active
  // state only (docs.yml sidebar's own active state is separate, see
  // sidebarHtml()). Kept as a distinct param from the docs sidebar's
  // activeSlug per adr-blog.md §6: blog is a peer nav section, not part
  // of the docs tree.
  const docsClass = section === 'docs' ? ' class="active"' : '';
  const blogClass = section === 'blog' ? ' class="active"' : '';
  return (
    '<nav class="site-nav">' +
    '<div class="nav-left">' +
    '<button class="nav-hamburger" aria-label="Toggle navigation"><span></span><span></span><span></span></button>' +
    '<a class="brand" href="' +
    BASE_PATH +
    '">rbac-fs</a>' +
    '<span class="version-badge">v1.0.0</span>' +
    '</div>' +
    '<button class="nav-search" type="button" aria-haspopup="dialog"><span class="visually-hidden">Search docs</span><span aria-hidden="true">Search docs…</span><kbd>⌘K</kbd></button>' +
    '<div class="nav-right">' +
    '<a' + docsClass + ' href="' + BASE_PATH + 'docs/quick-start.html">Docs</a>' +
    '<a' + blogClass + ' href="' + blogListUrl() + '">Blog</a>' +
    '<a class="nav-github" href="https://github.com/imchintoo/rbac-fs">GitHub</a>' +
    '<a href="https://www.npmjs.com/package/rbac-fs">npm</a>' +
    '</div>' +
    '</nav>' +
    '<div class="mobile-overlay"></div>' +
    '<div class="search-overlay" id="search-overlay">' +
    '<div class="search-panel" role="dialog" aria-label="Search documentation">' +
    '<label class="visually-hidden" for="search-input">Search docs</label>' +
    '<input id="search-input" type="text" placeholder="Search docs…" autocomplete="off">' +
    '<div class="search-results" id="search-results"></div>' +
    '</div>' +
    '</div>'
  );
}

function sidebarHtml(nav, activeSlug) {
  let html = '<aside class="docs-sidebar" aria-label="Documentation navigation">';
  nav.groups.forEach(function (group) {
    html += '<div class="sidebar-group"><span class="sidebar-group-label">' + escapeHtml(group.label) + '</span>';
    group.items.forEach(function (item) {
      const isActive = item.slug === activeSlug;
      html +=
        '<a class="sidebar-link' +
        (isActive ? ' active' : '') +
        '" href="' +
        docUrl(item.slug) +
        '"' +
        (isActive ? ' aria-current="page"' : '') +
        '>' +
        escapeHtml(item.title) +
        '</a>';
    });
    html += '</div>';
  });
  html += '</aside>';
  return html;
}

function tocHtml(sections, nextItem) {
  let html = '<aside class="docs-toc" aria-label="On this page">';
  if (sections.length) {
    html += '<p class="toc-label">On this page</p><ul class="toc-list">';
    sections.forEach(function (s) {
      html += '<li><a href="#' + s.id + '">' + escapeHtml(s.title) + '</a></li>';
    });
    html += '</ul>';
  }
  if (nextItem) {
    html +=
      '<a class="next-card" href="' +
      docUrl(nextItem.slug) +
      '"><span>Next</span><strong>' +
      escapeHtml(nextItem.title) +
      ' →</strong></a>';
  }
  html += '</aside>';
  return html;
}

function docsPageHtml(page, groupLabel, nav, activeSlug, nextItem) {
  const sectionsHtml = page.sections
    .map(function (s) {
      return '<section class="doc-section" id="' + s.id + '"><h2>' + escapeHtml(s.title) + '</h2>' + s.bodyHtml + '</section>';
    })
    .join('\n');

  const body =
    navHtml('docs') +
    '<div class="docs-shell">' +
    sidebarHtml(nav, activeSlug) +
    '<main class="docs-content">' +
    '<p class="breadcrumb">Docs / ' +
    escapeHtml(groupLabel) +
    '</p>' +
    '<h1>' +
    escapeHtml(page.title) +
    '</h1>' +
    page.leadHtml.replace('<p>', '<p class="docs-lead">') +
    sectionsHtml +
    '</main>' +
    tocHtml(page.sections, nextItem) +
    '</div>';

  const html =
    '<!doctype html><html lang="en"><head>' +
    baseHead(page.title, page.title + ' — rbac-fs documentation') +
    '</head><body data-base="' +
    BASE_PATH +
    '">' +
    body +
    '<script src="' +
    asset('site.js') +
    '"></script></body></html>';

  return withBase(html);
}

function footerHtml() {
  return (
    '<footer class="site-footer"><span>MIT License · rbac-fs</span><span><a href="' +
    docUrl('quick-start') +
    '">Docs</a> · <a href="' +
    blogListUrl() +
    '">Blog</a> · <a href="https://github.com/imchintoo/rbac-fs">GitHub</a> · <a href="https://www.npmjs.com/package/rbac-fs">npm</a></span></footer>'
  );
}

function landingPageHtml() {
  const nav =
    navHtml();

  const hero =
    '<section class="hero">' +
    '<div>' +
    '<p class="eyebrow">Zero-database · File-based · Multi-tenant</p>' +
    '<h1>Git-friendly RBAC,<br>in the open.</h1>' +
    '<p class="hero-lead">Roles and permissions live as human-readable JSON files under <code>.rbac/</code> — no database, no opaque policy blob. Every change is a normal, reviewable diff in your PR.</p>' +
    '<div class="hero-actions">' +
    '<a class="btn btn-primary" href="' + docUrl('quick-start') + '">Get Started →</a>' +
    '<a class="btn btn-secondary" href="https://github.com/imchintoo/rbac-fs">View on GitHub</a>' +
    '</div>' +
    '</div>' +
    '<div class="diff-card">' +
    '<div class="diff-card-header"><span class="diff-filename">.rbac/tenants/acme-corp/roles/manager.json</span><span class="diff-badge">PR #482</span></div>' +
    '<div class="diff-body">' +
    '<div class="line">  "name": "manager",</div>' +
    '<div class="line">  "permissions": [</div>' +
    '<div class="line">    { "resource": "invoice", "actions": ["view", "approve"] },</div>' +
    '<div class="line add">+   { "resource": "invoice.line-items", "actions": ["edit"] },</div>' +
    '<div class="line rm">-   { "resource": "vendor", "actions": ["delete"] },</div>' +
    '<div class="line">  ]</div>' +
    '</div></div>' +
    '</section>';

  const features = [
    ['01', 'File-based, PR-reviewable', 'Roles are JSON on disk — every permission change is a normal git diff, not an opaque policy blob.'],
    ['02', 'Multi-tenant, folder-isolated', 'Tenant separation is structural, not a WHERE clause you can forget.'],
    ['03', 'Node + browser, one package', 'Full read/write core on the server; a synchronous, read-only snapshot client in the browser.'],
    ['04', '8 framework adapters, built in', 'NestJS, Express, Fastify, Koa, React, Vue, Angular, Svelte — thin, zero duplicated logic.'],
  ];
  const featureBand =
    '<section class="feature-band">' +
    '<h2 class="section-title">Built to be trusted, not just used.</h2>' +
    '<div class="feature-grid">' +
    features
      .map(function (f) {
        return '<div class="feature-card"><span class="feature-num">' + f[0] + '</span><h3>' + f[1] + '</h3><p>' + f[2] + '</p></div>';
      })
      .join('') +
    '</div></section>';

  const adapters = [
    ['NestJS', 'rbac-fs/nestjs', 'nestjs'],
    ['Express', 'rbac-fs/express', 'express'],
    ['Fastify', 'rbac-fs/fastify', 'fastify'],
    ['Koa', 'rbac-fs/koa', 'koa'],
    ['React', 'rbac-fs/react', 'react'],
    ['Vue', 'rbac-fs/vue', 'vue'],
    ['Angular', 'rbac-fs/angular', 'angular'],
    ['Svelte', 'rbac-fs/svelte', 'svelte'],
  ];
  const adapterSection =
    '<section class="adapter-section">' +
    '<h2 class="section-title">One install. Pick your framework.</h2>' +
    '<p class="section-sub">Every adapter is a thin subpath export — none re-implement permission logic, all call straight into RBAC.can().</p>' +
    '<div class="adapter-grid">' +
    adapters
      .map(function (a) {
        return '<a class="adapter-card" href="' + docUrl('adapters/' + a[2]) + '"><strong>' + a[0] + '</strong><span>' + a[1] + '</span></a>';
      })
      .join('') +
    '</div></section>';

  const footer = footerHtml();

  const html =
    '<!doctype html><html lang="en"><head>' +
    baseHead('rbac-fs', 'Git-friendly, zero-database RBAC — roles and permissions as JSON files, multi-tenant by default, works in Node and the browser, in JS or TS.') +
    '</head><body data-base="' +
    BASE_PATH +
    '">' +
    nav +
    hero +
    featureBand +
    adapterSection +
    footer +
    '<script src="' +
    asset('site.js') +
    '"></script></body></html>';

  return withBase(html);
}

// ---------------------------------------------------------------------
// Blog templates (docs/backlog/adr-blog.md, design-spec-blog.md)
// ---------------------------------------------------------------------

function tagPillsHtml(tags) {
  return '<div class="tag-row">' + tags.map(function (t) { return '<span class="tag-pill">' + escapeHtml(t) + '</span>'; }).join('') + '</div>';
}

function blogListPageHtml(posts) {
  const rows = posts
    .map(function (post, idx) {
      return (
        '<a class="post-row' +
        (idx === 0 ? ' first' : '') +
        '" href="' +
        blogUrl(post.slug) +
        '">' +
        '<p class="post-meta">' +
        formatDate(post.date) +
        ' &middot; ' +
        post.readTime +
        ' min read</p>' +
        '<h2 class="post-title">' +
        escapeHtml(post.title) +
        '</h2>' +
        '<p class="post-excerpt">' +
        escapeHtml(post.excerpt) +
        '</p>' +
        tagPillsHtml(post.tags) +
        '</a>'
      );
    })
    .join('');

  const body =
    navHtml('blog') +
    '<header class="blog-header">' +
    '<p class="eyebrow">Notes on RBAC, architecture, and transparency</p>' +
    '<h1>Blog</h1>' +
    '</header>' +
    '<div class="post-list-wrap"><div class="post-list">' +
    rows +
    '</div></div>' +
    footerHtml();

  const html =
    '<!doctype html><html lang="en"><head>' +
    baseHead('Blog', 'Notes on file-based RBAC, multi-tenant architecture, and building rbac-fs in the open.') +
    '<link rel="canonical" href="' + SITE_ORIGIN + blogListUrl() + '">' +
    '<link rel="alternate" type="application/rss+xml" title="rbac-fs Blog" href="' + SITE_ORIGIN + BASE_PATH + 'blog/rss.xml">' +
    '</head><body data-base="' +
    BASE_PATH +
    '">' +
    body +
    '<script src="' +
    asset('site.js') +
    '"></script></body></html>';

  return withBase(html);
}

function jsonLdScript(post, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Person', name: 'Chintan Goswami' },
    publisher: { '@type': 'Organization', name: 'rbac-fs' },
    description: post.excerpt,
    mainEntityOfPage: url,
  };
  // Escape "<" so a stray "</script>"-like substring in any field can
  // never break out of the script tag (defense in depth — current
  // content is all hand-authored/trusted, but this is free to get right).
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">' + json + '</script>';
}

function blogDetailPageHtml(post, allPosts) {
  const url = SITE_ORIGIN + blogUrl(post.slug);
  const related = allPosts.filter(function (p) { return p.slug !== post.slug; }).slice(0, 2);

  const relatedHtml = related.length
    ? '<section class="related-band"><p class="related-label-band">Keep reading</p><div class="related-grid">' +
      related
        .map(function (p) {
          return (
            '<a class="related-card" href="' +
            blogUrl(p.slug) +
            '"><span class="related-card-date">' +
            formatDate(p.date) +
            '</span><strong>' +
            escapeHtml(p.title) +
            '</strong></a>'
          );
        })
        .join('') +
      '</div></section>'
    : '';

  const article =
    '<article class="article">' +
    '<p class="breadcrumb"><a href="' + blogListUrl() + '">Blog</a> / ' + escapeHtml(post.title) + '</p>' +
    tagPillsHtml(post.tags) +
    '<h1>' + escapeHtml(post.title) + '</h1>' +
    '<div class="byline">' +
    '<span class="avatar" aria-hidden="true"></span>' +
    '<span class="byline-name">Chintan Goswami</span>' +
    '<span class="byline-dot">&middot;</span>' +
    '<time class="byline-date" datetime="' + post.date + '">' + formatDate(post.date) + '</time>' +
    '<span class="byline-dot">&middot;</span>' +
    '<span>' + post.readTime + ' min read</span>' +
    '</div>' +
    post.bodyHtml +
    '</article>';

  const body = navHtml('blog') + '<div class="article-wrap">' + article + '</div>' + relatedHtml + footerHtml();

  const html =
    '<!doctype html><html lang="en"><head>' +
    baseHead(post.title, post.excerpt) +
    '<link rel="canonical" href="' + url + '">' +
    '<meta property="og:title" content="' + escapeHtml(post.title) + '">' +
    '<meta property="og:description" content="' + escapeHtml(post.excerpt) + '">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:url" content="' + url + '">' +
    '<meta property="og:site_name" content="rbac-fs">' +
    '<meta property="article:published_time" content="' + post.date + '">' +
    '<meta name="twitter:card" content="summary">' +
    '<meta name="twitter:title" content="' + escapeHtml(post.title) + '">' +
    '<meta name="twitter:description" content="' + escapeHtml(post.excerpt) + '">' +
    jsonLdScript(post, url) +
    '</head><body data-base="' +
    BASE_PATH +
    '">' +
    body +
    '<script src="' +
    asset('site.js') +
    '"></script></body></html>';

  return withBase(html);
}

function blogRss(posts) {
  const items = posts
    .map(function (post) {
      const url = SITE_ORIGIN + blogUrl(post.slug);
      return (
        '<item>' +
        '<title>' + escapeHtml(post.title) + '</title>' +
        '<link>' + url + '</link>' +
        '<guid>' + url + '</guid>' +
        '<pubDate>' + new Date(post.date + 'T00:00:00Z').toUTCString() + '</pubDate>' +
        '<description>' + escapeHtml(post.excerpt) + '</description>' +
        '</item>'
      );
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"><channel>' +
    '<title>rbac-fs Blog</title>' +
    '<link>' + SITE_ORIGIN + blogListUrl() + '</link>' +
    '<description>Notes on file-based RBAC, multi-tenant architecture, and building rbac-fs in the open.</description>' +
    items +
    '</channel></rss>\n'
  );
}

// ---------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------

function main() {
  const nav = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'nav.json'), 'utf8'));

  // flatten for prev/next + search index
  const flat = [];
  nav.groups.forEach(function (group) {
    group.items.forEach(function (item) {
      flat.push(Object.assign({}, item, { group: group.label }));
    });
  });

  // Best-effort clean rebuild. Some sandboxed/mounted filesystems reject
  // unlinking a file that was freshly written in the same session (see
  // docs/backlog/lessons.md's tsup temp-file EPERM entry for the same
  // root cause) — every file below is overwritten unconditionally
  // regardless, so a failed cleanup here just leaves stale files from a
  // *previous* page set, never stale content for a page that still
  // exists. Harmless on a normal filesystem/CI, where rmSync succeeds.
  try {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  } catch (err) {
    console.warn('docs:build — skipping clean (' + err.code + '), overwriting in place instead');
  }
  fs.mkdirSync(path.join(OUT_DIR, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'docs', 'adapters'), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'blog'), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'assets'), { recursive: true });

  const searchIndex = [];

  flat.forEach(function (item, idx) {
    const md = fs.readFileSync(path.join(CONTENT_DIR, item.file), 'utf8');
    const page = parsePage(md);
    const nextItem = flat[idx + 1] || null;
    const html = docsPageHtml(page, item.group, nav, item.slug, nextItem);
    const outPath = path.join(OUT_DIR, 'docs', item.slug + '.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);

    const excerptSource = page.leadHtml.replace(/<[^>]+>/g, '').trim() || (page.sections[0] ? page.sections[0].bodyHtml.replace(/<[^>]+>/g, '') : '');
    searchIndex.push({
      title: page.title,
      url: docUrl(item.slug),
      excerpt: excerptSource.slice(0, 220),
      headings: page.sections.map(function (s) { return s.title; }),
    });
  });

  // ---- Blog ----
  const posts = loadBlogPosts();
  posts.forEach(function (post) {
    const html = blogDetailPageHtml(post, posts);
    fs.writeFileSync(path.join(OUT_DIR, 'blog', post.slug + '.html'), html);
    searchIndex.push({
      title: post.title,
      url: blogUrl(post.slug),
      excerpt: post.excerpt,
      headings: [],
    });
  });
  fs.writeFileSync(path.join(OUT_DIR, 'blog', 'index.html'), blogListPageHtml(posts));
  fs.writeFileSync(path.join(OUT_DIR, 'blog', 'rss.xml'), blogRss(posts));

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), landingPageHtml());
  fs.writeFileSync(path.join(OUT_DIR, 'search-index.json'), JSON.stringify(searchIndex, null, 2));

  ['tokens.css', 'site.css', 'site.js'].forEach(function (f) {
    fs.copyFileSync(path.join(THEME_DIR, f), path.join(OUT_DIR, 'assets', f));
  });

  const urls = [BASE_PATH, blogListUrl()]
    .concat(flat.map(function (item) { return docUrl(item.slug); }))
    .concat(posts.map(function (post) { return blogUrl(post.slug); }));
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(function (u) { return '  <url><loc>' + SITE_ORIGIN + u + '</loc></url>'; }).join('\n') +
    '\n</urlset>\n';
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemap);
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: ' + SITE_ORIGIN + BASE_PATH + 'sitemap.xml\n');

  console.log(
    'Built ' + flat.length + ' doc pages + ' + posts.length + ' blog posts + landing/blog-list -> ' + path.relative(ROOT, OUT_DIR) + '/'
  );
}

main();
