const PROJECTS = [
  {
    github:         'JoachimVN/After-Hours',
    screenshotsDir: 'src/main/resources/images/screenshots',
    positions:      ['right top', 'center', 'left center'],
    logo:           'resources/images/logos/After_Hours_Logo.png',
    brandColor:     '#E7AB14',
  },
  {
    isVariant:  true,
    logo:       'resources/images/logos/CHORIDOR_Logo_Square.png',
    logoLarge:  true,
    brandColor: '#3e67a7',
    variants: [
      {
        label:          'Desktop',
        github:         'JoachimVN/CHORIDOR',
        screenshotsDir: 'docs/images/screenshots',
        positions:      ['center', 'center', 'right center'],
      },
      {
        label:          'Web',
        github:         'JoachimVN/CHORIDOR-web',
        playUrl:        '/choridor/',
        screenshotsDir: 'docs/screenshots',
        positions:      ['center', 'center', 'center'],
      },
    ],
  },
  {
    name:        'LEGO MINDSTORMS EV3',
    description: 'Two autonomous robots built at NTNU\'s IDATT1004 course. A competitive line follower and a waste sorting system programmed in Python.',
    language:    'Python',
    stars:       null,
    url:         null,
    pageUrl:     '/lego/',
    screenshots: [
      'resources/images/LEGO_Robot2.png',
      'resources/images/LEGO_Robot1.png',
    ],
    positions:   ['center top', 'center 35%'],
    logo:        'resources/images/logos/EV3_Logo.png',
    isProduct:   true,
    brandColor:  '#E3000B',
  },
];

const LANG_COLORS = {
  JavaScript:  '#f1e05a',
  TypeScript:  '#2b7489',
  Python:      '#3572A5',
  'C#':        '#178600',
  'C++':       '#f34b7d',
  C:           '#555555',
  HTML:        '#e34c26',
  CSS:         '#563d7c',
  Rust:        '#dea584',
  Go:          '#00ADD8',
  Java:        '#b07219',
  GDScript:    '#355570',
  Lua:         '#000080',
};

async function fetchRepo(slug) {
  const key = `gh_${slug}`;
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);
  const res = await fetch(`https://api.github.com/repos/${slug}`);
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  sessionStorage.setItem(key, JSON.stringify(data));
  return data;
}

function hexToRgb(hex) {
  return `${Number.parseInt(hex.slice(1, 3), 16)},${Number.parseInt(hex.slice(3, 5), 16)},${Number.parseInt(hex.slice(5, 7), 16)}`;
}

function starSVG() {
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
  </svg>`;
}

function renderVariantCard({ variants, logo, logoLarge, brandColor }, index = 0) {
  const v = variants[0];
  const color    = LANG_COLORS[v.language] || '#888';
  const multiShot = (v.screenshots?.length ?? 0) > 1;

  const dotButtons = multiShot
    ? v.screenshots.map((_, i) => `<button class="dot${i === 0 ? ' active' : ''}" data-index="${i}"></button>`).join('')
    : '';
  const dots = dotButtons ? `<div class="card-dots">${dotButtons}</div>` : '';
  const logoClass = `card-logo${logoLarge ? ' card-logo--lg' : ''}`;

  const toggle = `<div class="card-toggle">
    ${variants.map((va, i) => `<button class="card-toggle-btn${i === 0 ? ' active' : ''}" data-variant="${i}">${va.label}</button>`).join('')}
  </div>`;

  const playLabel = v.playUrl
    ? `<span class="card-play-btn" onclick="event.preventDefault();event.stopPropagation();window.open('${v.playUrl}','_blank')"><span>▶ Play</span></span>`
    : '';
  const ctaLabel = v.url
    ? `<a class="card-link" href="${v.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">GitHub ↗</a>`
    : '';

  const inner = `
    <div class="card-bg" style="background-image:url('${v.screenshots[0]}');background-position:${v.positions?.[0] || 'center'}"></div>
    <div class="card-overlay"></div>
    <div class="card-shine"></div>
    ${dots}
    ${toggle}
    ${logo ? `<img class="${logoClass}" src="${logo}" alt="CHORIDOR">` : ''}
    <div class="card-content">
      <h3 class="card-title">${v.name || 'CHORIDOR'}</h3>
      <p class="card-desc">${v.description || 'No description available.'}</p>
      <div class="card-meta">
        ${v.language ? `<span class="card-lang"><span class="lang-dot" style="background:${color}"></span>${v.language}</span>` : ''}
        ${v.stars == null ? '' : `<span class="card-stars">${starSVG()} ${v.stars}</span>`}
        ${playLabel}
        ${ctaLabel}
      </div>
    </div>
  `;

  const brand    = brandColor || 'var(--accent)';
  const brandRgb = brandColor ? hexToRgb(brandColor) : '201,149,42';
  const delay    = `animation-delay:${index * 0.12 + 0.08}s;--brand-color:${brand};--brand-color-rgb:${brandRgb}`;
  const data     = `data-screenshots='${JSON.stringify(v.screenshots)}' data-positions='${JSON.stringify(v.positions || [])}' data-variants='${JSON.stringify(variants)}' data-active-variant="0"`;

  return `<div class="card" style="${delay}" ${data}>${inner}</div>`;
}

function renderCard({ name, description, language, stars, url, pageUrl, playUrl, screenshots = [], positions, logo, logoLarge, isProduct, brandColor, isVariant, variants }, index = 0) {
  if (isVariant) return renderVariantCard({ variants, logo, logoLarge, brandColor }, index);
  const color    = LANG_COLORS[language] || '#888';
  const mainShot = screenshots[0];
  const mainPos  = positions?.[0] || 'center';
  const multiShot = screenshots.length > 1;

  const dotButtons = multiShot
    ? screenshots.map((_, i) => `<button class="dot${i === 0 ? ' active' : ''}" data-index="${i}"></button>`).join('')
    : '';
  const dots = dotButtons ? `<div class="card-dots">${dotButtons}</div>` : '';


  const logoClass = `card-logo${logoLarge ? ' card-logo--lg' : ''}`;

  let ctaLabel = '';
  if (url) {
    ctaLabel = `<span class="card-link">GitHub ↗</span>`;
  } else if (pageUrl) {
    ctaLabel = `<span class="card-link">View project ↗</span>`;
  }
  const playLabel = playUrl
    ? `<span class="card-play-btn" onclick="event.preventDefault();event.stopPropagation();window.open('${playUrl}','_blank')"><span>▶ Play</span></span>`
    : '';

  const inner = `
    <div class="card-bg" style="background-image:url('${mainShot}');background-position:${mainPos}"></div>
    <div class="card-overlay"></div>
    <div class="card-shine"></div>
    ${dots}
    ${logo ? `<img class="${logoClass}" src="${logo}" alt="${name}">` : ''}
    <div class="card-content">
      <h3 class="card-title">${name}</h3>
      <p class="card-desc">${description || 'No description available.'}</p>
      <div class="card-meta">
        ${language ? `<span class="card-lang"><span class="lang-dot" style="background:${color}"></span>${language}</span>` : ''}
        ${stars ? `<span class="card-stars">${starSVG()} ${stars}</span>` : ''}
        ${playLabel}
        ${ctaLabel}
      </div>
    </div>
  `;

  const classes   = `card${isProduct ? ' card--product' : ''}`;
  const brand     = brandColor || 'var(--accent)';
  const brandRgb  = brandColor ? hexToRgb(brandColor) : '201,149,42';
  const delay     = `animation-delay:${index * 0.12 + 0.08}s;--brand-color:${brand};--brand-color-rgb:${brandRgb}`;
  const data      = `data-screenshots='${JSON.stringify(screenshots)}' data-positions='${JSON.stringify(positions || [])}'`;

  if (url) {
    return `<a class="${classes}" href="${url}" target="_blank" rel="noopener" style="${delay}" ${data}>${inner}</a>`;
  }
  if (pageUrl) {
    return `<a class="${classes}" href="${pageUrl}" style="${delay}" ${data}>${inner}</a>`;
  }
  return `<div class="${classes}" style="${delay}" ${data}>${inner}</div>`;
}

const SLIDE_DURATION = 3500;
const cardSlideshows = new WeakMap();

function goToSlide(card, idx) {
  const dots = [...card.querySelectorAll('.dot')];
  const bg   = card.querySelector('.card-bg');

  // crossfade — dataset is read inside the timeout so a variant toggle
  // mid-fade can't stamp a stale screenshot onto the new variant
  bg.style.opacity = '0';
  setTimeout(() => {
    const screenshots = JSON.parse(card.dataset.screenshots);
    const positions   = JSON.parse(card.dataset.positions || '[]');
    if (screenshots[idx]) {
      bg.style.backgroundImage    = `url('${screenshots[idx]}')`;
      bg.style.backgroundPosition = positions[idx] || 'center';
    }
    bg.style.opacity = '1';
  }, 320);

  // restart dot progress animation
  dots.forEach(d => d.classList.remove('active'));
  dots[idx]?.classList.add('active');
}

function startSlideshow(card) {
  const prev = cardSlideshows.get(card);
  if (prev) clearInterval(prev);

  const screenshots = JSON.parse(card.dataset.screenshots || '[]');
  if (screenshots.length <= 1) { cardSlideshows.set(card, null); return; }

  let idx = 0;
  const advance = () => { idx = (idx + 1) % screenshots.length; goToSlide(card, idx); };
  let timer = setInterval(advance, SLIDE_DURATION);
  cardSlideshows.set(card, timer);

  card.querySelectorAll('.dot').forEach((dot, i) => {
    dot.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      clearInterval(cardSlideshows.get(card));
      idx = i;
      goToSlide(card, idx);
      timer = setInterval(advance, SLIDE_DURATION);
      cardSlideshows.set(card, timer);
    });
  });
}

function initNavigation() {
  document.querySelectorAll('.card').forEach(card => startSlideshow(card));
}

async function fetchScreenshots(slug, dir) {
  const key = `gh_shots_${slug}`;
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);
  const res = await fetch(`https://api.github.com/repos/${slug}/contents/${dir}`);
  if (!res.ok) throw new Error(res.status);
  const files = await res.json();
  const urls = files
    .filter(f => f.type === 'file' && /\.(png|jpe?g|gif|webp)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => f.download_url);
  sessionStorage.setItem(key, JSON.stringify(urls));
  return urls;
}

async function resolveScreenshots(entry) {
  if (!entry.screenshotsDir || !entry.github) return {};
  try {
    const screenshots = await fetchScreenshots(entry.github, entry.screenshotsDir);
    const positions = screenshots.map((_, i) => (entry.positions?.[i] ?? 'center'));
    return { screenshots, positions };
  } catch {
    return { screenshots: [], positions: [] };
  }
}

async function loadProjects() {
  const grid = document.getElementById('projects-grid');

  const cards = await Promise.all(
    PROJECTS.map(async (project) => {
      if (project.isVariant) {
        const fetchedVariants = await Promise.all(
          project.variants.map(async v => {
            const [repoResult, shotsResult] = await Promise.allSettled([
              fetchRepo(v.github),
              resolveScreenshots(v),
            ]);
            const shots = shotsResult.status === 'fulfilled' ? shotsResult.value : {};
            if (repoResult.status === 'fulfilled') {
              const data = repoResult.value;
              return { ...v, ...shots, name: data.name.replaceAll('-', ' '), description: data.description, language: data.language, stars: data.stargazers_count, url: data.html_url };
            }
            return { ...v, ...shots, name: v.github.split('/')[1], description: 'Could not load project data.', url: `https://github.com/${v.github}` };
          })
        );
        return { ...project, variants: fetchedVariants };
      }
      if (!project.github) return project;
      const [repoResult, shotsResult] = await Promise.allSettled([
        fetchRepo(project.github),
        resolveScreenshots(project),
      ]);
      const shots = shotsResult.status === 'fulfilled' ? shotsResult.value : {};
      if (repoResult.status === 'fulfilled') {
        const data = repoResult.value;
        return {
          ...project,
          ...shots,
          name:        project.name ?? data.name.replaceAll('-', ' '),
          description: data.description,
          language:    data.language,
          stars:       data.stargazers_count,
          url:         data.html_url,
        };
      }
      return {
        ...project,
        ...shots,
        name:        project.github.split('/')[1],
        description: 'Could not load project data.',
        url:         `https://github.com/${project.github}`,
      };
    })
  );

  grid.innerHTML = cards.map((card, i) => renderCard(card, i)).join('');
  initNavigation();
  initVariantToggles();
  initCardTilt();
}

function calcAge(year, month, day) {
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && today.getDate() < day)) age--;
  return age;
}

function initParallax() {
  const photoWrap = document.querySelector('.hero-photo-wrap');
  if (!photoWrap) return;

  let scrollY = window.scrollY;
  let mx = 0, my = 0, cx = 0, cy = 0;
  let rafId = null;

  const update = () => {
    photoWrap.style.transform = `translateY(${scrollY * 0.25}px) translate(${cx}px, ${cy}px)`;
  };

  const tick = () => {
    cx += (mx - cx) * 0.09;
    cy += (my - cy) * 0.09;
    update();
    if (Math.abs(mx - cx) > 0.05 || Math.abs(my - cy) > 0.05) {
      rafId = requestAnimationFrame(tick);
    } else {
      cx = mx; cy = my;
      update();
      rafId = null;
    }
  };

  const startTick = () => { if (!rafId) rafId = requestAnimationFrame(tick); };

  window.addEventListener('scroll', () => { scrollY = window.scrollY; update(); }, { passive: true });

  photoWrap.addEventListener('mousemove', e => {
    mx = (e.clientX / window.innerWidth  - 0.5) * 20;
    my = (e.clientY / window.innerHeight - 0.5) * 12;
    startTick();
  });
  photoWrap.addEventListener('mouseleave', () => {
    mx = 0; my = 0;
    startTick();
  });
}

function initSectionReveal() {
  const pairs = [
    { trigger: '.about-section', title: '.about-heading' },
    { trigger: '.projects',      title: '.section-title' },
    { trigger: '.lego-header',   title: '.lego-title'    },
  ];
  pairs.forEach(({ trigger, title }) => {
    const triggerEl = document.querySelector(trigger);
    const titleEl   = document.querySelector(title);
    if (!triggerEl || !titleEl) return;
    titleEl.style.clipPath = 'inset(0 100% 0 0)';
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      titleEl.classList.add('reveal-run');
      obs.disconnect();
    }, { threshold: 0.1 });
    obs.observe(triggerEl);
  });
}

function initSkillsReveal() {
  const skills = document.querySelector('.about-skills');
  if (!skills) return;
  const obs = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    skills.classList.add('skills-visible');
    obs.disconnect();
  }, { threshold: 0.3 });
  obs.observe(skills);
}

function initScrollFadeIn() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.about-section, .projects, .footer').forEach(el => {
    el.classList.add('fade-in-scroll');
    observer.observe(el);
  });
}

function escHtml(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const PY_KW = new Set([
  'and','as','assert','async','await','break','class','continue',
  'def','del','elif','else','except','finally','for','from','global',
  'if','import','in','is','lambda','nonlocal','not','or','pass',
  'raise','return','try','while','with','yield',
]);
const PY_KW_LIT = new Set(['True', 'False', 'None', 'self']);

function classifyName(token, isCall) {
  if (PY_KW.has(token))     return `<span class="py-k">${token}</span>`;
  if (PY_KW_LIT.has(token)) return `<span class="py-kl">${token}</span>`;
  if (isCall || /^[A-Z]/.test(token)) return `<span class="py-f">${token}</span>`;
  return token;
}

function highlightPython(code) {
  const STR  = String.raw`"[^"\n]*"|'[^'\n]*'`;
  const CMT  = String.raw`#[^\n]*`;
  const NUM  = String.raw`\d+\.?\d*`;
  const DEC  = String.raw`@[A-Za-z_]\w*`;
  const BRK  = String.raw`[()[{}\]]`;
  const ATR  = String.raw`\.[A-Za-z_]\w*`;
  const FN   = String.raw`[A-Za-z_]\w*(?=\s*\()`;
  const NAME = String.raw`[A-Za-z_]\w*`;
  const REST = String.raw`[\s\S]`;
  const re = new RegExp(`(${STR})|(${CMT})|(${NUM})|(${DEC})|(${BRK})|(${ATR})|(${FN})|(${NAME})|(${REST})`, 'g');
  let out = '';
  let m;
  while ((m = re.exec(code)) !== null) {
    const [, str, comment, num, dec, bracket, attr, fn, name, other] = m;
    if (str)          out += `<span class="py-s">${escHtml(str)}</span>`;
    else if (comment) out += `<span class="py-c">${escHtml(comment)}</span>`;
    else if (num)     out += `<span class="py-n">${escHtml(num)}</span>`;
    else if (dec)     out += `<span class="py-d">${escHtml(dec)}</span>`;
    else if (bracket) out += `<span class="py-p">${escHtml(bracket)}</span>`;
    else if (attr)    out += escHtml(attr);
    else if (fn)      out += classifyName(fn, true);
    else if (name)    out += classifyName(name, false);
    else              out += escHtml(other);
  }
  return out;
}

function renderHighlighted(el, code) {
  const lines = code.split('\n');
  if (lines.at(-1) === '') lines.pop();
  el.innerHTML = lines.map(line =>
    `<span class="line">${highlightPython(line) || '​'}</span>`
  ).join('');
}

function initCodeHighlight() {
  document.querySelectorAll('.lego-code code[data-src]').forEach(el => {
    fetch(el.dataset.src)
      .then(r => r.text())
      .then(code => renderHighlighted(el, code))
      .catch(() => { el.textContent = 'Could not load source file.'; });
  });
}

function initFooter() {
  const footer = document.querySelector('.footer');
  if (!footer) return;

  const year = new Date().getFullYear();

  footer.innerHTML = `
    <p class="footer-label">Get in touch</p>
    <a href="mailto:joachim.v.nilsen@gmail.com" class="footer-email">joachim.v.nilsen@gmail.com</a>
    <div class="footer-icons">
      <a class="icon-linkedin" href="https://www.linkedin.com/in/joachim-valdersnes-nilsen/" target="_blank" rel="noopener" aria-label="LinkedIn">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      </a>
      <a class="icon-github" href="https://www.github.com/JoachimVN" target="_blank" rel="noopener" aria-label="GitHub">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
      </a>
      <a class="icon-instagram" href="https://www.instagram.com/joa.2006" target="_blank" rel="noopener" aria-label="Instagram">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
      </a>
    </div>
    <p class="footer-copy">© ${year} Joachim Valdersnes Nilsen</p>
  `;

  // ensure the Instagram gradient SVG is available on this page
  if (!document.getElementById('ig-grad')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;overflow:hidden';
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#f09433"/>
      <stop offset="25%"  stop-color="#e6683c"/>
      <stop offset="50%"  stop-color="#dc2743"/>
      <stop offset="75%"  stop-color="#cc2366"/>
      <stop offset="100%" stop-color="#bc1888"/>
    </linearGradient></defs>`;
    document.body.appendChild(svg);
  }
}

function updateToggleIndicator(card) {
  const toggle = card.querySelector('.card-toggle');
  const active = toggle?.querySelector('.card-toggle-btn.active');
  if (!toggle || !active) return;
  toggle.style.setProperty('--toggle-pill-x', `${active.offsetLeft}px`);
  toggle.style.setProperty('--toggle-pill-w', `${active.offsetWidth}px`);
}

// Swaps dots, title, description and meta to the given variant, then restarts the slideshow
function swapVariantContent(card, v) {
  const color = LANG_COLORS[v.language] || '#888';

  // Dots
  let dotsContainer = card.querySelector('.card-dots');
  if (v.screenshots.length > 1) {
    const html = v.screenshots.map((_, i) => `<button class="dot${i === 0 ? ' active' : ''}" data-index="${i}"></button>`).join('');
    if (dotsContainer) { dotsContainer.innerHTML = html; }
    else {
      dotsContainer = document.createElement('div');
      dotsContainer.className = 'card-dots';
      dotsContainer.innerHTML = html;
      card.querySelector('.card-content').before(dotsContainer);
    }
  } else {
    dotsContainer?.remove();
  }

  // Text
  card.querySelector('.card-title').textContent = v.name || 'CHORIDOR';
  card.querySelector('.card-desc').textContent  = v.description || 'No description available.';

  // Meta
  const meta    = card.querySelector('.card-meta');
  const langEl  = meta.querySelector('.card-lang');
  const starsEl = meta.querySelector('.card-stars');
  let   playEl  = meta.querySelector('.card-play-btn');
  let   linkEl  = meta.querySelector('.card-link');

  if (langEl)  langEl.innerHTML  = `<span class="lang-dot" style="background:${color}"></span>${v.language || ''}`;
  if (starsEl) starsEl.innerHTML = `${starSVG()} ${v.stars ?? 0}`;

  if (v.playUrl) {
    if (!playEl) {
      playEl = document.createElement('span');
      playEl.className = 'card-play-btn';
      playEl.innerHTML = '<span>▶ Play</span>';
      linkEl.before(playEl);
    }
    playEl.onclick = e => { e.preventDefault(); e.stopPropagation(); window.open(v.playUrl, '_blank'); };
  } else {
    playEl?.remove();
  }

  if (v.url) {
    if (!linkEl) {
      linkEl = document.createElement('a');
      linkEl.className   = 'card-link';
      linkEl.target      = '_blank';
      linkEl.rel         = 'noopener';
      linkEl.textContent = 'GitHub ↗';
      linkEl.onclick     = e => e.stopPropagation();
      meta.appendChild(linkEl);
    }
    linkEl.href = v.url;
  } else {
    linkEl?.remove();
  }

  startSlideshow(card);
}

// Instantly finishes any in-flight wipe reveal so a new one can start clean
function commitVariantReveal(card) {
  const bg     = card.querySelector('.card-bg:not(.card-bg--reveal)');
  const reveal = card.querySelector('.card-bg--reveal');
  if (reveal) {
    bg.style.backgroundImage    = reveal.style.backgroundImage;
    bg.style.backgroundPosition = reveal.style.backgroundPosition;
    bg.style.opacity            = '1';
  }
  // release the push on the old screenshot in the same frame the reveal layer
  // is removed, so the committed image lands with no visible jump
  bg.getAnimations().forEach(a => a.cancel());
  card.querySelectorAll('.card-bg--reveal, .card-bg--edge').forEach(el => {
    el.getAnimations().forEach(a => a.cancel());
    el.remove();
  });
}

const variantSwapTokens = new WeakMap();

function applyVariantSwap(card, v, fromRight) {
  const token = (variantSwapTokens.get(card) ?? 0) + 1;
  variantSwapTokens.set(card, token);

  const isStale  = () => variantSwapTokens.get(card) !== token;
  const bg       = card.querySelector('.card-bg');
  const content  = card.querySelector('.card-content');
  const reduced  = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let exitX  = 0;
  let enterX = 0;
  if (!reduced) {
    exitX  = fromRight ? -10 : 10;
    enterX = fromRight ? 14 : -14;
  }

  // Content fades out toward the exit side, swaps, then eases in from the entry side
  content.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
  content.style.opacity    = '0';
  content.style.transform  = `translateX(${exitX}px)`;

  function applyContentIn() {
    if (isStale()) return;
    content.style.transition = 'opacity 0.3s ease, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)';
    content.style.opacity    = '1';
    content.style.transform  = '';
  }

  setTimeout(() => {
    if (isStale()) return;
    swapVariantContent(card, v);
    content.style.transition = 'none';
    content.style.transform  = `translateX(${enterX}px)`;
    requestAnimationFrame(() => requestAnimationFrame(applyContentIn));
  }, 220);

  if (reduced) {
    bg.style.opacity = '0';
    setTimeout(() => {
      if (isStale()) return;
      bg.style.backgroundImage    = `url('${v.screenshots[0]}')`;
      bg.style.backgroundPosition = v.positions?.[0] || 'center';
      bg.style.opacity = '1';
    }, 280);
    return;
  }

  // Slash wipe: new screenshot sweeps in from the side of the clicked button
  // behind a slanted brand-glow edge; old screenshot is pushed the opposite way.
  // poly(t) describes the revealed region whose slanted edge sits at t% across the card.
  const slant = 12;
  const lead  = fromRight ? -6 : 6;
  const t0    = fromRight ? 116 : -16;
  const t1    = fromRight ? -16 : 116;
  const poly  = t => fromRight
    ? `polygon(${t + slant}% 0%, 100% 0%, 100% 100%, ${t - slant}% 100%)`
    : `polygon(0% 0%, ${t + slant}% 0%, ${t - slant}% 100%, 0% 100%)`;

  const edge = document.createElement('div');
  edge.className  = 'card-bg--edge';
  edge.style.clipPath = poly(fromRight ? 130 : -30);

  const reveal = document.createElement('div');
  reveal.className = 'card-bg card-bg--reveal';
  reveal.style.backgroundImage    = `url('${v.screenshots[0]}')`;
  reveal.style.backgroundPosition = v.positions?.[0] || 'center';
  reveal.style.clipPath = poly(t0);

  bg.after(edge, reveal);

  const D    = 560;
  const ease = 'cubic-bezier(0.7, 0, 0.25, 1)';

  edge.animate(
    { clipPath: [poly(t0 + lead), poly(t1 + lead)] },
    { duration: D, easing: ease, fill: 'forwards' }
  );
  const sweep = reveal.animate(
    { clipPath: [poly(t0), poly(t1)] },
    { duration: D, easing: ease, fill: 'forwards' }
  );
  // composite: 'add' so the push stacks on top of the hover zoom
  bg.animate(
    { transform: ['translateX(0%)', `translateX(${fromRight ? -3.5 : 3.5}%)`] },
    { duration: D, easing: ease, composite: 'add', fill: 'forwards' }
  );
  sweep.onfinish = () => commitVariantReveal(card);
}

function handleVariantClick(card, e) {
  e.preventDefault();
  e.stopPropagation();

  const btn     = e.currentTarget;
  const idx     = Number(btn.dataset.variant);
  const prevIdx = Number(card.dataset.activeVariant);
  if (idx === prevIdx) return;

  const variants = JSON.parse(card.dataset.variants);
  const v = variants[idx];

  card.dataset.activeVariant = idx;
  card.dataset.screenshots   = JSON.stringify(v.screenshots);
  card.dataset.positions     = JSON.stringify(v.positions || []);

  card.querySelectorAll('.card-toggle-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  updateToggleIndicator(card);

  clearInterval(cardSlideshows.get(card));
  commitVariantReveal(card);

  applyVariantSwap(card, v, idx > prevIdx);
}

function initVariantToggles() {
  document.querySelectorAll('.card[data-variants]').forEach(card => {
    requestAnimationFrame(() => updateToggleIndicator(card));
    card.querySelectorAll('.card-toggle-btn').forEach(btn => {
      btn.addEventListener('click', e => handleVariantClick(card, e));
    });
  });
}


function initTypewriter() {
  const el = document.querySelector('.hero-label');
  if (!el) return;
  el.textContent = '';
  el.classList.add('typewriter-active');

  // Type "Developer & Studnet" (n/e swap typo), catch it, fix it
  const rand = (a, b) => a + (crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * (b - a);
  const script = [
    ...'Developer & Stud'.split('').map(c => ({ c, d: rand(55, 120) })),
    { c: 'n', d: rand(55, 100) },   // typo: 'n' before 'e'
    { c: 'e', d: rand(55, 100) },
    { c: 't', d: rand(55, 100) },
    { c: null, d: 480 },             // pause — noticing it's wrong
    { c: '\b', d: 70 },              // backspace 'net'
    { c: '\b', d: 65 },
    { c: '\b', d: 60 },
    { c: null, d: 120 },             // tiny pause before retyping
    ...'ent'.split('').map(c => ({ c, d: rand(55, 90) })),
    { c: null, d: 1000 },             // pause before period
    { c: '.', d: rand(55, 90) },     // period
    { c: null, d: 300 },             // done
  ];

  let current = '';
  let i = 0;

  function step() {
    if (i >= script.length) { el.classList.remove('typewriter-active'); return; }
    const { c, d } = script[i++];
    setTimeout(() => {
      if (c === '\b')      current = current.slice(0, -1);
      else if (c !== null) current += c;
      el.textContent = current;
      step();
    }, d);
  }

  setTimeout(step, 900);
}

function initScrollProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.prepend(bar);
  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = `${(window.scrollY / max) * 100}%`;
  }, { passive: true });
}

function initCardTilt() {
  document.querySelectorAll('.card').forEach(card => {
    const shine = card.querySelector('.card-shine');

    const rgb = getComputedStyle(card).getPropertyValue('--brand-color-rgb').trim() || '201,149,42';

    card.addEventListener('mouseenter', () => {
      card.style.transition = 'transform 0.1s ease-out, box-shadow 0.3s ease';
    });

    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform  = `perspective(900px) rotateY(${x * 12}deg) rotateX(${-y * 8}deg) scale(1.02)`;
      card.style.boxShadow  = `0 0 0 1px rgba(${rgb},0.25), 0 8px 24px rgba(${rgb},0.08)`;
      if (shine) {
        const px = (e.clientX - r.left) / r.width * 100;
        const py = (e.clientY - r.top) / r.height * 100;
        shine.style.background = `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,0.02) 0%, transparent 55%)`;
      }
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.6s ease-out, box-shadow 0.5s ease';
      card.style.transform  = '';
      card.style.boxShadow  = '';
      if (shine) shine.style.background = '';
    });
  });
}






// View-transition direction: lego → index should wipe the opposite way.
// Strategy: set a sessionStorage flag on departure, read it synchronously
// on arrival (before any paint), and clean up after the transition.
;(function initViewTransitionDirection() {
  const isLego = location.pathname.startsWith('/lego');

  if (isLego) {
    // Link clicks away from lego (nav bar, etc.)
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (a && !new URL(a.href).pathname.startsWith('/lego')) {
        sessionStorage.setItem('vt-dir', 'back');
      }
    });
    // Browser back button — pageswap fires on the outgoing page
    globalThis.addEventListener('pageswap', e => {
      if (e.viewTransition) sessionStorage.setItem('vt-dir', 'back');
    });
  } else if (sessionStorage.getItem('vt-dir') === 'back') {
    // Synchronous check — runs before any paint, before pagereveal
    sessionStorage.removeItem('vt-dir');
    document.documentElement.classList.add('vt-back');
    // Clean up after the transition so the next index → lego is still forward
    globalThis.addEventListener('pagereveal', e => {
      (e.viewTransition?.finished ?? Promise.resolve()).then(() => {
        document.documentElement.classList.remove('vt-back');
      });
    }, { once: true });
  }
}());

document.addEventListener('DOMContentLoaded', () => {
  loadProjects();
  initParallax();
  initScrollFadeIn();
  initSectionReveal();
  initSkillsReveal();
  initTypewriter();
  initScrollProgress();
  initCodeHighlight();
  initFooter();
  const ageEl = document.getElementById('age');
  if (ageEl) ageEl.textContent = calcAge(2006, 6, 26);
});
