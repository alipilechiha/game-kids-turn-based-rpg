import { expect, test } from '@playwright/test';

test('commits a waypoint only after the rendered player reaches it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__gardenProbe?.activeAnchor))
    .toBe('village-square');

  await page.getByTestId('target-fountain').click();
  await expect(page.getByTestId('movement-status')).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = window.__gardenProbe as
          | (NonNullable<typeof window.__gardenProbe> & {
              readonly arrivalReports?: readonly {
                readonly committedAnchor: string;
                readonly targetAnchor: string;
                readonly nextIndex: number;
                readonly playerAtTarget: boolean;
                readonly renderedFrameGap: number;
              }[];
            })
          | undefined;
        return probe?.arrivalReports?.some(
          (report) =>
            report.committedAnchor === 'village-square' &&
            report.targetAnchor === 'village-fountain' &&
            report.playerAtTarget,
        );
      }),
    )
    .toBe(true);

  await expect
    .poll(() => page.evaluate(() => window.__gardenProbe?.activeAnchor))
    .toBe('village-fountain');
  await expect(page.getByTestId('target-fountain')).toHaveAttribute('data-nearby', 'true');

  await page.getByTestId('target-seed-basket').click();
  await expect
    .poll(() => page.evaluate(() => window.__gardenProbe?.activeAnchor))
    .toBe('village-basket');
  const basketPathReports = await page.evaluate(
    () =>
      window.__gardenProbe?.arrivalReports.filter(
        (report) =>
          report.targetAnchor === 'village-square' ||
          report.targetAnchor === 'village-market' ||
          report.targetAnchor === 'village-basket',
      ) ?? [],
  );
  expect(basketPathReports).toEqual([
    expect.objectContaining({
      committedAnchor: 'village-fountain',
      targetAnchor: 'village-square',
      nextIndex: 1,
      playerAtTarget: true,
    }),
    expect.objectContaining({
      committedAnchor: 'village-square',
      targetAnchor: 'village-market',
      nextIndex: 2,
      playerAtTarget: true,
    }),
    expect.objectContaining({
      committedAnchor: 'village-market',
      targetAnchor: 'village-basket',
      nextIndex: 3,
      playerAtTarget: true,
    }),
  ]);
  expect(new Set(basketPathReports.map((report) => report.routeId)).size).toBe(1);
  expect(basketPathReports.every((report) => report.renderedFrameGap >= 1)).toBe(true);
});
