const PROJECTS = [
  {
    github:      'JoachimVN/After-Hours',
    screenshots: [
      'resources/images/screenshots/After_Hours_Screenshot1.png',
      'resources/images/screenshots/After_Hours_Screenshot2.png',
      'resources/images/screenshots/After_Hours_Screenshot3.png',
    ],
    positions:   ['right top', 'center', 'left center'],
    logo:        'resources/images/logos/After_Hours_Logo.png',
    brandColor:  '#E7AB14',
  },
  {
    github:      'JoachimVN/CHORIDOR',
    screenshots: [
      'resources/images/screenshots/CHORIDOR_Screenshot1.png',
      'resources/images/screenshots/CHORIDOR_Screenshot2.png',
      'resources/images/screenshots/CHORIDOR_Screenshot3.png',
    ],
    logo:        'resources/images/logos/CHORIDOR_Logo_Square.png',
    positions:   ['center', 'center', 'right center'],
    logoLarge:   true,
    brandColor:  '#3e67a7',
  },
  {
    name:        'LEGO MINDSTORMS EV3',
    description: 'Two autonomous robots built at NTNU. A competitive line follower and a waste sorting system programmed in Python.',
    language:    'Python',
    stars:       null,
    url:         null,
    pageUrl:     'lego.html',
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
  const res = await fetch(`https://api.github.com/repos/${slug}`);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function hexToRgb(hex) {
  return `${Number.parseInt(hex.slice(1, 3), 16)},${Number.parseInt(hex.slice(3, 5), 16)},${Number.parseInt(hex.slice(5, 7), 16)}`;
}

function starSVG() {
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
  </svg>`;
}

function renderCard({ name, description, language, stars, url, pageUrl, screenshots, positions, logo, logoLarge, isProduct, brandColor }, index = 0) {
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
    ctaLabel = `<a class="card-link" href="${url}" target="_blank" rel="noopener">GitHub ↗</a>`;
  } else if (pageUrl) {
    ctaLabel = `<span class="card-link">View project ↗</span>`;
  }

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
    return `<div class="${classes}" style="${delay}" ${data}>${inner}</div>`;
  }
  if (pageUrl) {
    return `<a class="${classes}" href="${pageUrl}" style="${delay}" ${data}>${inner}</a>`;
  }
  return `<div class="${classes}" style="${delay}" ${data}>${inner}</div>`;
}

const SLIDE_DURATION = 3500;

function goToSlide(card, idx) {
  const screenshots = JSON.parse(card.dataset.screenshots);
  const positions   = JSON.parse(card.dataset.positions || '[]');
  const dots        = [...card.querySelectorAll('.dot')];
  const bg          = card.querySelector('.card-bg');

  // crossfade
  bg.style.opacity = '0';
  setTimeout(() => {
    bg.style.backgroundImage    = `url('${screenshots[idx]}')`;
    bg.style.backgroundPosition = positions[idx] || 'center';
    bg.style.opacity = '1';
  }, 320);

  // restart dot progress animation
  dots.forEach(d => d.classList.remove('active'));
  dots[idx]?.classList.add('active');
}

function initNavigation() {
  document.querySelectorAll('.card').forEach(card => {
    const screenshots = JSON.parse(card.dataset.screenshots || '[]');
    if (screenshots.length <= 1) return;

    let idx = 0;

    const advance = () => {
      idx = (idx + 1) % screenshots.length;
      goToSlide(card, idx);
    };

    let timer = setInterval(advance, SLIDE_DURATION);

    card.querySelectorAll('.dot').forEach((dot, i) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearInterval(timer);
        idx = i;
        goToSlide(card, idx);
        timer = setInterval(advance, SLIDE_DURATION);
      });
    });
  });
}

async function loadProjects() {
  const grid = document.getElementById('projects-grid');

  const cards = await Promise.all(
    PROJECTS.map(async (project) => {
      if (!project.github) return project;
      try {
        const data = await fetchRepo(project.github);
        return {
          ...project,
          name:        project.name ?? data.name.replaceAll('-', ' '),
          description: data.description,
          language:    data.language,
          stars:       data.stargazers_count,
          url:         data.html_url,
        };
      } catch {
        return {
          ...project,
          name:        project.github.split('/')[1],
          description: 'Could not load project data.',
          url:         `https://github.com/${project.github}`,
        };
      }
    })
  );

  grid.innerHTML = cards.map((card, i) => renderCard(card, i)).join('');
  initNavigation();
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
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    photoWrap.style.transform = `translateY(${scrollY * 0.25}px)`;
  });
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

function preloadScreenshots() {
  PROJECTS.forEach(p => p.screenshots.forEach(url => {
    const img = new Image();
    img.src = url;
  }));
}

function initTypewriter() {
  const el = document.querySelector('.hero-label');
  if (!el) return;
  el.textContent = '';
  el.classList.add('typewriter-active');

  // Type "Developer & Studnet" (n/e swap typo), catch it, fix it
  const rand = (a, b) => a + Math.random() * (b - a);
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

    card.addEventListener('mouseenter', () => {
      card.style.transition = 'transform 0.1s ease-out';
    });

    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${x * 12}deg) rotateX(${-y * 8}deg) scale(1.02)`;
      if (shine) {
        const px = (e.clientX - r.left) / r.width * 100;
        const py = (e.clientY - r.top) / r.height * 100;
        shine.style.background = `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,0.01) 0%, transparent 40%)`;
      }
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.6s ease-out';
      card.style.transform  = '';
      if (shine) shine.style.background = '';
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  preloadScreenshots();
  loadProjects();
  initParallax();
  initScrollFadeIn();
  initTypewriter();
  initScrollProgress();
  initCodeHighlight();
  initFooter();
  const ageEl = document.getElementById('age');
  if (ageEl) ageEl.textContent = calcAge(2006, 6, 26);
});
