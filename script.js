const PROJECTS = [
  {
    github:      'JoachimVN/After-Hours',
    screenshots: [
      'resources/images/screenshots/After_Hours_Screenshot1.png',
      'resources/images/screenshots/After_Hours_Screenshot2.png',
      'resources/images/screenshots/After_Hours_Screenshot3.png',
    ],
    positions: ['left center', 'center', 'left center'],
    logo: 'resources/images/logos/After_Hours_Logo.png',
  },
  {
    github:      'JoachimVN/CHORIDOR',
    screenshots: [
      'resources/images/screenshots/CHORIDOR_Screenshot1.png',
      'resources/images/screenshots/CHORIDOR_Screenshot2.png',
      'resources/images/screenshots/CHORIDOR_Screenshot3.png',
    ],
    logo:      'resources/images/logos/CHORIDOR_Logo_Square.png',
    positions: ['center', 'center', 'right center'],
    logoLarge: true,
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
    positions: ['center top', 'center 35%'],
    logo:      null,
    isProduct: true,
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

function starSVG() {
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
  </svg>`;
}

function renderCard({ name, description, language, stars, url, pageUrl, screenshots, positions, logo, logoLarge, isProduct }, index = 0) {
  const color    = LANG_COLORS[language] || '#888';
  const mainShot = screenshots[0];
  const mainPos  = (positions && positions[0]) || 'center';
  const multiShot = screenshots.length > 1;

  const dots = multiShot
    ? `<div class="card-dots">${screenshots.map((_, i) => `<button class="dot${i === 0 ? ' active' : ''}" data-index="${i}"></button>`).join('')}</div>`
    : '';


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
    ${dots}
    ${logo ? `<img class="${logoClass}" src="${logo}" alt="${name}">` : ''}
    <div class="card-content">
      <h3 class="card-title">${name}</h3>
      <p class="card-desc">${description || 'No description available.'}</p>
      <div class="card-meta">
        ${language ? `<span class="card-lang"><span class="lang-dot" style="background:${color}"></span>${language}</span>` : ''}
        ${stars !== null ? `<span class="card-stars">${starSVG()} ${stars}</span>` : ''}
        ${ctaLabel}
      </div>
    </div>
  `;

  const classes = `card${isProduct ? ' card--product' : ''}`;
  const delay   = `animation-delay:${index * 0.12 + 0.08}s`;
  const data    = `data-screenshots='${JSON.stringify(screenshots)}' data-positions='${JSON.stringify(positions || [])}'`;

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
  void dots[idx]?.offsetWidth; // trigger reflow so animation restarts
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
          name:        data.name,
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
}

function calcAge(year, month, day) {
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && today.getDate() < day)) age--;
  return age;
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

document.addEventListener('DOMContentLoaded', () => {
  loadProjects();
  initScrollFadeIn();
  const ageEl = document.getElementById('age');
  if (ageEl) ageEl.textContent = calcAge(2006, 6, 26);
});
