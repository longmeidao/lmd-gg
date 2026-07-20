const SITE_URL = 'https://lmd.gg';
const REQUEST_TIMEOUT_MS = Number(
  process.env.HEALTHCHECK_TIMEOUT_MS || 15_000,
);

const ALGOLIA = {
  appId: process.env.ALGOLIA_APP_ID || 'K3HL1E7WTZ',
  apiKey:
    process.env.ALGOLIA_SEARCH_API_KEY ||
    'e9e6758cf004bd93db4ca97d7aec2e96',
  indexName: process.env.ALGOLIA_INDEX_NAME || 'lmd',
};

const checks = [];
const MAX_REQUEST_ATTEMPTS = 3;

function addCheck(name, check) {
  checks.push({ name, check });
}

async function request(url, options = {}, expectedStatuses = [200]) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'user-agent': 'lmd-gg-health-check/1.0 (+https://lmd.gg)',
          ...options.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await response.text();

      if (expectedStatuses.includes(response.status)) return { response, body };

      const statusError = new Error(
        `${url} returned ${response.status}; expected ${expectedStatuses.join(' or ')}`,
      );
      if (response.status !== 429 && response.status < 500) throw statusError;
      lastError = statusError;
    } catch (error) {
      lastError = error;
      if (error.message?.includes('returned 4')) throw error;
    }

    if (attempt < MAX_REQUEST_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  const cause = lastError?.cause?.message;
  throw new Error(
    `${url} failed after ${MAX_REQUEST_ATTEMPTS} attempts: ${lastError?.message || lastError}${cause ? ` (${cause})` : ''}`,
  );
}

function parseJson(body, label) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

function extractLocations(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) =>
    match[1].replaceAll('&amp;', '&'),
  );
}

async function getProductionPageUrls() {
  const { body: indexXml } = await request(`${SITE_URL}/sitemap-index.xml`);
  const sitemapUrls = extractLocations(indexXml);
  if (sitemapUrls.length === 0)
    throw new Error('Production sitemap index contains no sitemap URLs');

  const sitemapBodies = await Promise.all(
    sitemapUrls.map(async (url) => (await request(url)).body),
  );
  const locations = sitemapBodies.flatMap(extractLocations);

  return new Set(
    locations.filter((location) => {
      const url = new URL(location);
      return (
        url.origin === SITE_URL &&
        (url.pathname === '/' ||
          url.pathname === '/about/' ||
          url.pathname.startsWith('/blog/'))
      );
    }),
  );
}

addCheck('Production site and About integration', async () => {
  const [{ body: home }, { body: about }] = await Promise.all([
    request(`${SITE_URL}/`),
    request(`${SITE_URL}/about/`),
  ]);

  if (!home.includes('三墩冰室'))
    throw new Error('Production homepage is missing the expected site title');
  if (!about.includes('https://api.bgm.tv'))
    throw new Error('Production About page is missing the Bangumi API config');
  if (!about.includes('/scripts/bangumi.js'))
    throw new Error('Production About page is missing the Bangumi script');
});

addCheck('Umami tracker', async () => {
  const { body } = await request('https://umami.lmd.gg/script.js');
  if (body.length < 500)
    throw new Error('Umami tracker response is unexpectedly small');
});

addCheck('Bangumi public collection API', async () => {
  const url = new URL('/v0/users/longmeidao/collections', 'https://api.bgm.tv');
  url.searchParams.set('subject_type', '2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('offset', '0');

  const { response, body } = await request(url, {
    headers: { origin: SITE_URL },
  });
  const payload = parseJson(body, 'Bangumi API');
  if (!Number.isFinite(payload.total) || payload.total < 1)
    throw new Error('Bangumi API returned no public anime collections');
  if (!Array.isArray(payload.data) || payload.data.length < 1)
    throw new Error('Bangumi API response is missing collection data');

  const allowOrigin = response.headers.get('access-control-allow-origin');
  if (allowOrigin !== '*' && allowOrigin !== SITE_URL)
    throw new Error(`Bangumi API has an unexpected CORS origin: ${allowOrigin}`);
});

addCheck('Algolia index matches production sitemap', async () => {
  const endpoint = `https://${ALGOLIA.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(ALGOLIA.indexName)}/query`;
  const [{ body }, expectedUrls] = await Promise.all([
    request(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-algolia-application-id': ALGOLIA.appId,
        'x-algolia-api-key': ALGOLIA.apiKey,
      },
      body: JSON.stringify({ query: '', hitsPerPage: 1_000 }),
    }),
    getProductionPageUrls(),
  ]);
  const payload = parseJson(body, 'Algolia');
  if (!Array.isArray(payload.hits))
    throw new Error('Algolia response is missing hits');

  const indexedUrls = new Set(
    payload.hits.map((hit) => hit.url_without_anchor || hit.url).filter(Boolean),
  );
  const invalidUrls = [...indexedUrls].filter((url) => {
    try {
      return new URL(url).origin !== SITE_URL || url.includes('undefined');
    } catch {
      return true;
    }
  });
  const missingUrls = [...expectedUrls].filter((url) => !indexedUrls.has(url));
  const staleUrls = [...indexedUrls].filter((url) => !expectedUrls.has(url));

  if (invalidUrls.length > 0)
    throw new Error(`Algolia contains invalid URLs: ${invalidUrls.join(', ')}`);
  if (missingUrls.length > 0)
    throw new Error(`Algolia is missing production pages: ${missingUrls.join(', ')}`);
  if (staleUrls.length > 0)
    throw new Error(`Algolia contains stale pages: ${staleUrls.join(', ')}`);
});

addCheck('Decap CMS assets and configuration', async () => {
  const [config, decap, identityWidget] = await Promise.all([
    request(`${SITE_URL}/admin/config.yml`),
    request('https://cdn.jsdmirror.com/npm/decap-cms/dist/decap-cms.js'),
    request(
      'https://cdn.jsdmirror.com/npm/netlify-identity-widget/build/netlify-identity-widget.js',
    ),
  ]);

  if (!config.body.includes('repo: longmeidao/lmd-gg'))
    throw new Error('Production CMS config points to the wrong repository');
  if (decap.body.length < 10_000)
    throw new Error('Decap CMS bundle response is unexpectedly small');
  if (identityWidget.body.length < 10_000)
    throw new Error('Netlify Identity widget response is unexpectedly small');
});

addCheck('Netlify Identity and Git Gateway', async () => {
  const [identity, gitGateway] = await Promise.all([
    request(`${SITE_URL}/.netlify/identity/settings`),
    request(`${SITE_URL}/.netlify/git/settings`, {}, [401]),
  ]);
  const identitySettings = parseJson(identity.body, 'Netlify Identity');
  const gitGatewayResponse = parseJson(gitGateway.body, 'Git Gateway');

  if (identitySettings.external?.email !== true)
    throw new Error('Netlify Identity email login is not enabled');
  if (gitGatewayResponse.code !== 401)
    throw new Error('Git Gateway did not return the expected auth challenge');
});

addCheck('Production RSS', async () => {
  const { body } = await request(`${SITE_URL}/rss.xml`);
  if (!body.includes('<rss')) throw new Error('Production RSS is not valid RSS');
  if (body.includes('/undefined'))
    throw new Error('Production RSS contains an undefined article URL');
});

const results = await Promise.allSettled(
  checks.map(async ({ name, check }) => {
    await check();
    return name;
  }),
);

let failureCount = 0;
for (const [index, result] of results.entries()) {
  const name = checks[index].name;
  if (result.status === 'fulfilled') {
    console.log(`PASS ${name}`);
  } else {
    failureCount += 1;
    console.error(`FAIL ${name}: ${result.reason?.message || result.reason}`);
  }
}

if (failureCount > 0) {
  console.error(`\n${failureCount} of ${checks.length} health checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${checks.length} health checks passed.`);
}
