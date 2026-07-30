const SITE_URL = 'https://lmd.gg';
const REQUEST_TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 15_000);

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
    throw new Error(
      `Bangumi API has an unexpected CORS origin: ${allowOrigin}`,
    );
});

addCheck('Production RSS', async () => {
  const { body } = await request(`${SITE_URL}/rss.xml`);
  if (!body.includes('<rss'))
    throw new Error('Production RSS is not valid RSS');
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
