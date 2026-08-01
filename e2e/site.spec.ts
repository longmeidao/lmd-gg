import { expect, test } from '@playwright/test';

test('home uses canonical links without trailing slashes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-hero-title')).toContainText('三墩冰室');
  const hrefs = await page
    .locator('.home-nav a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs.every((href) => href === '/' || !href?.endsWith('/'))).toBe(
    true,
  );
  const pagination = page.locator('.feed-pagination');
  if ((await pagination.count()) > 0) {
    await expect(pagination.locator('a[rel="next"]')).toHaveAttribute(
      'href',
      /^\/.+[^/]$/,
    );
  }
});

test('wide layout centers the bounded site shell', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.goto('/');
  const margins = await page.locator('.site-shell').evaluate((shell) => {
    const style = getComputedStyle(shell);
    return {
      left: Number.parseFloat(style.marginLeft),
      right: Number.parseFloat(style.marginRight),
    };
  });
  expect(Math.abs(margins.left - margins.right)).toBeLessThan(1);
});

test('theme selector hydrates and switches the document theme', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const darkTheme = page.getByRole('radio', { name: 'dark' });
  await darkTheme.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(darkTheme).toHaveAttribute('aria-checked', 'true');
  expect(pageErrors).toEqual([]);
});

test('archive exposes formats and authenticated drafts', async ({ page }) => {
  await page.goto('/archive');
  const visibility = page.locator('[data-chip-select="visibility"]');
  await expect(visibility).toBeVisible();
  await expect(page.locator('[data-slug="ikiro"]').first()).toBeVisible();

  await page.locator('[data-chip-select="kind"] [data-chip-trigger]').click();
  await expect(
    page.locator('[data-chip-select="kind"] [data-chip-value]'),
  ).toHaveCount(6);
});

test('local write page bypasses production authentication', async ({
  page,
}) => {
  await page.goto('/write');
  await expect(page.locator('[data-writer-window]')).toBeVisible();
  await expect(
    page.locator('[data-writer-items] textarea').first(),
  ).toBeVisible();
});

test('local preview data renders related posts', async ({ page }) => {
  await page.goto('/a-chuni-manifesto');
  await expect(page.locator('.related-post')).toHaveCount(3);
  await expect(page.locator('.related-post-rule')).toHaveCount(3);
  await expect(page.locator('.related-posts-divider')).toHaveCount(1);
  await expect(page.locator('.related-posts')).toHaveCSS(
    'border-top-style',
    'none',
  );
  await expect(
    page.locator('.related-post-date heti-spacing').first(),
  ).toBeAttached();
  await expect(page.locator('.related-post').first()).toHaveAttribute(
    'href',
    /^\/.+[^/]$/,
  );
  await expect(page.locator('.related-post').first()).toHaveCSS(
    'border-bottom-style',
    'none',
  );
  const firstRelatedPost = page.locator('.related-post').first();
  await firstRelatedPost.hover();
  const surfaces = await firstRelatedPost.evaluate((post) => {
    const collection = post.querySelector<HTMLElement>(
      '.related-post-collections',
    );
    const tag = collection?.querySelector<HTMLElement>('span');
    const date = post.querySelector<HTMLElement>('.related-post-date');
    return {
      post: getComputedStyle(post).backgroundColor,
      tag: tag ? getComputedStyle(tag).backgroundColor : '',
      postPaddingBottom: getComputedStyle(post).paddingBottom,
      collectionMarginLeft: collection
        ? getComputedStyle(collection).marginLeft
        : '',
      tagPaddingLeft: tag ? getComputedStyle(tag).paddingLeft : '',
      dateFontSize: date ? getComputedStyle(date).fontSize : '',
    };
  });
  expect(surfaces.tag).not.toBe(surfaces.post);
  expect(surfaces.postPaddingBottom).toBe('16px');
  expect(surfaces.collectionMarginLeft).toBe('4px');
  expect(surfaces.tagPaddingLeft).toBe('12px');
  expect(surfaces.dateFontSize).toBe('14.4px');
});
