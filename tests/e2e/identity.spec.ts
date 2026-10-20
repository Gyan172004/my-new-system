import { test, expect } from '@playwright/test';
test('sign-in has the selected shell and a usable disabled state, without credential fields', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/sign-in?returnTo=https://foreign.example');
  await expect(
    page.getByRole('heading', { name: 'Sign in to continue' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'Sign-in is temporarily unavailable',
  );
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Continue with GitHub')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'DSA Interview home' }),
  ).toBeFocused();
  await expect(page.getByRole('link', { name: 'Return home' })).toHaveAttribute(
    'href',
    '/',
  );
  expect(errors).toEqual([]);
});
test('public health stays uncached and independent of sign-in', async ({
  request,
}) => {
  const response = await request.get('/api/v1/health/live', {
    headers: { Authorization: 'Bearer INVALID_CANARY' },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.text()).not.toContain('CANARY');
});
test('entry works at narrow widths and links to embedded sign-in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Practice the reasoning behind your code.',
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('account boundary clears private UI and aborts a late response on switch and sign-out', async ({
  page,
}) => {
  await page.goto('/identity-fixture');
  await page.getByRole('button', { name: 'Load private response' }).click();
  await expect(page.getByTestId('private')).toHaveText('private:alice');
  await page.getByRole('button', { name: 'Load private response' }).click();
  await page.getByRole('button', { name: 'Switch account' }).click();
  await expect(page.getByTestId('owner')).toHaveText('bob');
  await expect(page.getByTestId('private')).toHaveText('empty');
  await expect(page.getByTestId('cancelled')).toHaveText('1');
  await page.waitForTimeout(700);
  await expect(page.getByTestId('private')).toHaveText('empty');
  await page.getByRole('button', { name: 'Load private response' }).click();
  await expect(page.getByTestId('private')).toHaveText('private:bob');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByTestId('private')).toHaveText('empty');
});

test('loads local IBM Plex faces for body and terminal text', async ({
  page,
}) => {
  const remoteFonts: string[] = [];
  page.on('request', (request) => {
    if (
      request.resourceType() === 'font' &&
      new URL(request.url()).origin !== new URL(page.url()).origin
    )
      remoteFonts.push(new URL(request.url()).host);
  });
  await page.goto('/sign-in');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const bodyFamily = getComputedStyle(document.body).fontFamily;
    const monoFamily = getComputedStyle(
      document.querySelector('.topbar')!,
    ).fontFamily;
    const loaded = [...document.fonts]
      .filter((font) => font.status === 'loaded')
      .map((font) => font.family.replaceAll('"', ''));
    return { bodyFamily, monoFamily, loaded };
  });
  expect(fonts.loaded.some((family) => fonts.bodyFamily.includes(family))).toBe(
    true,
  );
  expect(fonts.loaded.some((family) => fonts.monoFamily.includes(family))).toBe(
    true,
  );
  expect(fonts.bodyFamily).not.toEqual(fonts.monoFamily);
  expect(remoteFonts).toEqual([]);
});
