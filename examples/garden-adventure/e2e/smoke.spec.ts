import { expect, test } from '@playwright/test';

test('production build opens the title and initializes the village canvas', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'باغ قصه‌ها' })).toBeVisible();
  await page.getByTestId('garden-start').click();

  const canvas = page.getByTestId('garden-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('active-map')).toHaveText('روستای آرام');
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const renderedCanvas =
          element instanceof HTMLCanvasElement ? element : element.querySelector('canvas');
        return (renderedCanvas?.getContext('webgl2') ?? null) !== null;
      }),
    )
    .toBe(true);
  expect(pageErrors).toEqual([]);
});
