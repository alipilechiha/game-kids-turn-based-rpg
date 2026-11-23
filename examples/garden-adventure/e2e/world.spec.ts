import { expect, test } from '@playwright/test';

test('walks through both registered scenes and returns through the village gate', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.getByTestId('garden-start').focus();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = window.__gardenProbe;
        return (
          probe?.activeMap === 'village' &&
          probe.cameraKind === 'orthographic' &&
          probe.visibleMeshCount > 10 &&
          probe.frameCount > 0
        );
      }),
    )
    .toBe(true);

  const canvas = page.getByTestId('garden-canvas');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const fountainPoint = await page.evaluate(() => window.__gardenProbe?.targetPoints['fountain']);
  expect(fountainPoint).toBeDefined();
  await page.mouse.click(canvasBox!.x + fountainPoint!.x, canvasBox!.y + fountainPoint!.y);
  const fountain = page.getByTestId('target-fountain');
  await expect(fountain).toHaveAttribute('data-nearby', 'true');
  const nearbyFountainPoint = await page.evaluate(
    () => window.__gardenProbe?.targetPoints['fountain'],
  );
  await page.mouse.click(
    canvasBox!.x + nearbyFountainPoint!.x,
    canvasBox!.y + nearbyFountainPoint!.y,
  );
  await expect(page.getByTestId('movement-status')).toContainText('آب‌نمای میدان');

  const gardenGate = page.getByTestId('target-garden-gate');
  await gardenGate.focus();
  await page.keyboard.press('Enter');
  await expect(gardenGate).toHaveAttribute('data-nearby', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect(page.getByTestId('active-map')).toHaveText('باغ خاموش');
  await expect.poll(() => page.evaluate(() => window.__gardenProbe?.activeMap)).toBe('garden');
  await expect
    .poll(() => page.evaluate(() => window.__gardenProbe?.cleanupCount))
    .toBeGreaterThan(0);

  const villageGate = page.getByTestId('target-village-gate');
  await expect(villageGate).toHaveAttribute('data-nearby', 'true');
  await villageGate.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await expect(page.getByTestId('active-map')).toHaveText('روستای آرام');
  await expect.poll(() => page.evaluate(() => window.__gardenProbe?.activeMap)).toBe('village');
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('recovers the active rendered scene after a software-WebGL context restore', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__gardenProbe?.frameCount)).toBeGreaterThan(0);

  const initialFrameCount = await page.evaluate(() => window.__gardenProbe?.frameCount ?? 0);
  const canLoseContext = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-testid="garden-canvas"]');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    Object.defineProperty(window, '__gardenContextExtension', {
      configurable: true,
      value: extension,
    });
    extension?.loseContext();
    return true;
  });
  expect(canLoseContext, 'Chromium software WebGL must expose context-loss testing').toBe(true);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          'canvas[data-testid="garden-canvas"]',
        );
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        return gl?.isContextLost() ?? false;
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const windowWithExtension = window as typeof window & {
      __gardenContextExtension?: { restoreContext(): void };
    };
    windowWithExtension.__gardenContextExtension?.restoreContext();
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          'canvas[data-testid="garden-canvas"]',
        );
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        return gl !== null && gl !== undefined && !gl.isContextLost();
      }),
    )
    .toBe(true);
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__gardenProbe?.frameCount ?? 0))
    .toBeGreaterThan(initialFrameCount);
});

test('keeps keyboard and touch navigation responsive with reduced motion enabled', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('garden-start').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('scene-village')).toBeVisible();

  const gate = page.getByTestId('target-garden-gate');
  await gate.focus();
  await page.keyboard.press('Enter');
  await expect(gate).toHaveAttribute('data-nearby', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('scene-garden')).toBeVisible();

  const returnGate = page.getByTestId('target-village-gate');
  await expect(returnGate).toHaveAttribute('data-nearby', 'true');
  await returnGate.tap();
  await expect(page.getByTestId('scene-village')).toBeVisible();
});
