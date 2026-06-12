const PROJECTS = [
  {
    github:      'JoachimVN/After-Hours',
    screenshots: [
      'resources/images/screenshots/After_Hours_Screenshot1.png',
      'resources/images/screenshots/After_Hours_Screenshot2.png',
      'resources/images/screenshots/After_Hours_Screenshot3.png',
    ],
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
    logoLarge: true,
  },
  {
    name:        'LEGO MINDSTORMS EV3',
    description: 'Two autonomous robots built at NTNU. A competitive line follower and a waste sorting system — both programmed in Python.',
    language:    'Python',
    stars:       null,
    url:         null,
    pageUrl:     'lego.html',
    screenshots: [
      'resources/images/LEGO_Robot1.png',
      'resources/images/LEGO_Robot2.png',
    ],
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

function renderCard({ name, description, language, stars, url, pageUrl, screenshots, logo, logoLarge, isProduct }, index = 0) {
  const color = LANG_COLORS[language] || '#888';
  const mainShot = screenshots[0];
  const multiShot = screenshots.length > 1;

  const dots = multiShot
    ? `<div class="card-dots">
        ${screenshots.map((_, i) => `<button class="dot${i === 0 ? ' active' : ''}" data-index="${i}"></button>`).join('')}
      </div>`
    : '';

  const logoClass = `card-logo${logoLarge ? ' card-logo--lg' : ''}`;

  // "View project" label — use span (not <a>) when the whole card is already a link
  const ctaLabel = url
    ? `<a class="card-link" href="${url}" target="_blank" rel="noopener">GitHub ↗</a>`
    : pageUrl
      ? `<span class="card-link">View project ↗</span>`
      : '';

  const inner = `
    <div class="card-bg" style="background-image:url('${mainShot}')"></div>
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
  const data    = `data-screenshots='${JSON.stringify(screenshots)}'`;

  return pageUrl && !url
    ? `<a class="${classes}" href="${pageUrl}" style="${delay}" ${data}>${inner}</a>`
    : `<div class="${classes}" style="${delay}" ${data}>${inner}</div>`;
}

function initDots() {
  document.addEventListener('click', (e) => {
    const dot = e.target.closest('.dot');
    if (!dot) return;
    e.preventDefault();
    e.stopPropagation();

    const card        = dot.closest('.card');
    const screenshots = JSON.parse(card.dataset.screenshots);
    const index       = parseInt(dot.dataset.index);

    card.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    card.querySelector('.card-bg').style.backgroundImage = `url('${screenshots[index]}')`;
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
  initDots();
}

document.addEventListener('DOMContentLoaded', loadProjects);
