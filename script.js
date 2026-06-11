// Projects config — github repos are fetched live, manual entries are used as-is
const PROJECTS = [
  {
    github:     'JoachimVN/After-Hours',
    screenshot: 'resources/images/screenshots/After_Hours_Screenshot1.png',
    logo:       'resources/images/logos/After_Hours_Logo.png',
  },
  {
    github:     'JoachimVN/CHORIDOR',
    screenshot: 'resources/images/screenshots/CHORIDOR_Screenshot1.png',
    logo:       'resources/images/logos/CHORIDOR_Logo_Square.png',
  },
  {
    name:        'LEGO MINDSTORMS EV3',
    description: 'A robotics project built with the LEGO MINDSTORMS EV3 platform at NTNU\'s course IDATT1004.',
    language:    'Python',
    stars:       null,
    url:         null,
    screenshot:  'resources/images/LEGO_Robot1.png',
    logo:        null,
    isProduct:   true,
  },
];

// GitHub language colors
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

function renderCard({ name, description, language, stars, url, screenshot, logo, isProduct }, index = 0) {
  const color = LANG_COLORS[language] || '#888';

  return `
    <div class="card${isProduct ? ' card--product' : ''}" style="animation-delay:${index * 0.12 + 0.08}s">
      <div class="card-bg" style="background-image:url('${screenshot}')"></div>
      <div class="card-overlay"></div>
      ${logo ? `<img class="card-logo" src="${logo}" alt="${name}">` : ''}
      <div class="card-content">
        <h3 class="card-title">${name}</h3>
        <p class="card-desc">${description || 'No description available.'}</p>
        <div class="card-meta">
          ${language ? `<span class="card-lang"><span class="lang-dot" style="background:${color}"></span>${language}</span>` : ''}
          ${stars !== null ? `<span class="card-stars">${starSVG()} ${stars}</span>` : ''}
          ${url ? `<a class="card-link" href="${url}" target="_blank" rel="noopener">GitHub ↗</a>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function loadProjects() {
  const grid = document.getElementById('projects-grid');

  // Fetch all GitHub repos in parallel; keep manual entries as-is
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
        // Fall back to a minimal card if the API call fails
        return {
          name:        project.github.split('/')[1],
          description: 'Could not load project data.',
          language:    null,
          stars:       null,
          url:         `https://github.com/${project.github}`,
        };
      }
    })
  );

  grid.innerHTML = cards.map((card, i) => renderCard(card, i)).join('');
}

document.addEventListener('DOMContentLoaded', loadProjects);
