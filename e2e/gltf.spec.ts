import { expect, test, type Page } from '@playwright/test';
import { resumeFromPicker, seedCompletedQuests } from './harness.ts';
import {
  enableWorldProbe,
  playerAt,
  reactionsProbe,
  tapReactivePoint,
  tapWorldAnchor,
  waitForWalkerIdle,
} from './npcTap.ts';

// GLB landmark tier gate: `modelsForTier` mounts the gltf ModelSet only on
// high/very-high — very-low through normal keep the cubic set and must never
// fetch a .glb. (normal was measured at ~99.6% of its triangle ceiling before
// GLBs — see modelsForTier.) The tier is seeded directly (the parent's
// persisted choice) because SwiftShader auto-detection lands on 'low', which
// would silently skip the GLB path these tests exist to cover.

interface SceneProbe {
  __worldScene?: {
    traverse: (fn: (o: { isMesh?: boolean; name?: string }) => void) => void;
  };
}

/** Mesh names currently mounted from the generated gltf components. */
async function glbMeshNames(page: Page) {
  return page.evaluate(() => {
    const scene = (window as unknown as SceneProbe).__worldScene;
    const names: string[] = [];
    scene?.traverse((o) => {
      // Vertex-color-baked GLBs mount a single mesh named after the source
      // node (see scripts/gen-gltf-component.ts + convert-model.ts --vcolor).
      if (
        o.isMesh &&
        o.name &&
        /^(house|market|well|ball|box_A|farm_plot|fence|pathCobbled|pathDirt|detail_|character_|mesh_0|Object_7|Bush_|Rock_|bench|streetlight)/.test(
          o.name,
        )
      )
        names.push(o.name);
    });
    return names;
  });
}

/** Records every request whose URL ends in .glb for the spec's assertions. */
function watchGlbRequests(page: Page): { all: () => string[]; clear: () => void } {
  const urls: string[] = [];
  page.on('request', (req) => {
    if (/\.glb(?:\?|$)/.test(req.url())) urls.push(req.url());
  });
  return { all: () => urls, clear: () => (urls.length = 0) };
}

test.describe('gltf landmarks', () => {
  // These cases deliberately intercept asset requests. PWA cache behavior is
  // covered by the offline suite; allowing a service worker here would make
  // cold-cache and failure injection depend on its cache contents.
  test.use({ serviceWorkers: 'block' });

  const canvas = (page: Page) => page.locator('[data-testid="world-canvas"] canvas');

  test('lower tiers never initiate a GLB fetch', async ({ page }) => {
    await enableWorldProbe(page);
    const requested = watchGlbRequests(page);
    await seedCompletedQuests(page, [], 'low');
    // The helper's first visit has no profile, so capable devices may warm
    // their detected default tier before the seeded low-tier profile exists.
    // Reload the persisted profile and measure only its selected-tier path.
    requested.clear();
    await page.reload();
    await resumeFromPicker(page);
    await waitForWalkerIdle(page);
    // Even after a little navigation the cubic set stays in charge.
    expect(requested.all()).toEqual([]);
    expect(await glbMeshNames(page)).toEqual([]);
  });

  test('high and very-high tiers load exactly the committed GLBs and mount them', async ({
    page,
  }) => {
    await enableWorldProbe(page);
    const requested = watchGlbRequests(page);
    await seedCompletedQuests(page, [], 'high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    const urls = requested.all().map((u) => new URL(u).pathname.split('/').pop());
    // High-tier warmup fetches the complete town model set to avoid a late
    // network pop as the child explores. Very-high-only animals are excluded.
    expect(new Set(urls)).toEqual(
      new Set([
        'fountain.glb',
        'shop.glb',
        'home-gate.glb',
        'tree-a.glb',
        'tree-b.glb',
        'tree-c.glb',
        'bush.glb',
        'rock.glb',
        'rocks.glb',
        'bench.glb',
        'streetlight.glb',
        'crate.glb',
        'ball.glb',
        'fence.glb',
        'farm-plot.glb',
        'duck.glb',
        'dog.glb',
        'cat.glb',
      ]),
    );
    const names = await glbMeshNames(page);
    // node names post-vertex-bake: house, market, well — one mesh each
    expect(names).toContain('house');
    expect(names).toContain('market');
    expect(names).toContain('well');
    // crate → box_A; mini-game characters → character_duck/character_dog
    expect(names).toContain('box_A');
    expect(names).toContain('character_duck');
    expect(names).toContain('character_dog');
    // two authored rocks slots share rocks.glb — one fetch, two mounts
    expect(names.filter((n) => n === 'detail_rocks').length).toBe(2);
    // the garden's farm plot keeps its cubic form on high (see minDetail)
    expect(names).not.toContain('farm_plot');
  });

  test('very-high upgrades the farm plot and garden fence to their GLBs', async ({ page }) => {
    await enableWorldProbe(page);
    const requested = watchGlbRequests(page);
    await seedCompletedQuests(page, [], 'very-high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    const urls = requested.all().map((u) => new URL(u).pathname.split('/').pop());
    // both top-tier scenery GLBs in spawn-visible areas (garden), plus the
    // koi and elephant — both are very-high only (over high's headroom).
    // bush/rock/bench/streetlight also mount eagerly: their slots sit in the
    // spawn-visible square + garden.
    expect(urls).toContain('farm-plot.glb');
    expect(urls).toContain('fence.glb');
    expect(urls).toContain('koi.glb');
    expect(urls).toContain('elephant.glb');
    expect(urls).toContain('bush.glb');
    expect(urls).toContain('rock.glb');
    expect(urls).toContain('bench.glb');
    expect(urls).toContain('streetlight.glb');
    const names = await glbMeshNames(page);
    expect(names).toContain('farm_plot');
    expect(names).toContain('fence');
    // both fountain koi mount the shared mesh_0 node — one fetch, two mounts
    expect(names.filter((n) => n === 'mesh_0').length).toBe(2);
    // the park elephant mounts its single Object_7 mesh — one fetch, one mount
    expect(names.filter((n) => n === 'Object_7').length).toBe(1);
  });

  test('a cold high-tier cache holds Canvas until its slowest GLB settles', async ({ page }) => {
    await enableWorldProbe(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/models/tree-a.glb', async (route) => {
      await held;
      await route.continue();
    });

    await seedCompletedQuests(page, [], 'high');
    const world = page.getByTestId('world-canvas');
    await expect(world).toHaveAttribute('data-assets', 'loading');
    release();
    await expect(canvas(page)).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
  });

  test('a cold very-high-tier cache holds Canvas until its slowest GLB settles', async ({
    page,
  }) => {
    await enableWorldProbe(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/models/butterfly.glb', async (route) => {
      await held;
      await route.continue();
    });

    await seedCompletedQuests(page, [], 'very-high');
    const world = page.getByTestId('world-canvas');
    await expect(world).toHaveAttribute('data-assets', 'loading');
    release();
    await expect(canvas(page)).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
  });

  test('a missing GLB settles warmup and leaves the model fallback available', async ({ page }) => {
    await enableWorldProbe(page);
    await page.route('**/models/tree-a.glb', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing fixture' }),
    );

    await seedCompletedQuests(page, [], 'high');
    await expect(canvas(page)).toBeVisible({ timeout: 10000 });
    // Other models still mount, while the missing scenery is handled by its
    // authored cubic fallback instead of trapping the whole scene at startup.
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
  });

  test('offline model requests fail open to the built-in world models', async ({ page }) => {
    await enableWorldProbe(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/models/*.glb', (route) => route.abort('internetdisconnected'));

    await seedCompletedQuests(page, [], 'very-high');
    await expect(canvas(page)).toBeVisible({ timeout: 10000 });
    expect(pageErrors).toEqual([]);
    expect(await glbMeshNames(page)).toEqual([]);
  });

  test('changing quality tiers warms only the requested renderer and remains usable', async ({
    page,
  }) => {
    await enableWorldProbe(page);
    const requested = watchGlbRequests(page);
    await seedCompletedQuests(page, [], 'high');
    await expect(canvas(page)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('pause-button').click();
    await page.getByTestId('child-quality-very-high').click();
    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(canvas(page)).toBeVisible({ timeout: 15000 });
    const requestedNames = requested.all().map((url) => new URL(url).pathname.split('/').pop());
    expect(requestedNames).toContain('butterfly.glb');
    expect(requestedNames).toContain('koi.glb');
    expect(requestedNames).toContain('elephant.glb');

    await page.getByTestId('pause-button').click();
    await page.getByTestId('child-quality-low').click();
    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(canvas(page)).toBeVisible();
    await expect.poll(async () => glbMeshNames(page)).toEqual([]);
  });

  test('the glb home-gate door still answers a knock with door-swing', async ({ page }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [], 'high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    // Approach via the path, not the gate anchor itself: npc-neighbour
    // shares anchor-home-gate, so anchor taps resolve as figure taps and the
    // helper would spin on dialogue dismissals past the test timeout.
    await tapWorldAnchor(page, 'anchor-path-north');
    await waitForWalkerIdle(page);

    // The proxy slab stands on the model's door: world (-0.68, 0.31, -6.68)
    // — the tap surface of `reactive-door-home-gate`, kept by the adapter
    // because the GLB mesh itself has no door node and is raycast-inert.
    await tapReactivePoint(page, -0.68, -6.68, 0.31);
    await page.waitForTimeout(300);
    const reactions = await reactionsProbe(page);
    expect(
      reactions.some((r) => r.reaction === 'door-swing' && r.subject === 'door-home-gate'),
    ).toBe(true);
    await waitForWalkerIdle(page);
    expect(await playerAt(page)).toBe('anchor-home-gate');
  });

  test('the glb fountain still bloops and the tap keeps walking', async ({ page }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [], 'high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    await tapWorldAnchor(page, 'anchor-path-west');
    await waitForWalkerIdle(page);

    await tapReactivePoint(page, -6, -2.0);
    await page.waitForTimeout(300);
    expect(
      (await reactionsProbe(page)).some((r) => r.reaction === 'bloop' && r.subject === 'fountain'),
    ).toBe(true);
  });

  test('a canvas remount keeps the shared GLB geometry alive', async ({ page }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [], 'high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);

    // Pause unmounts the whole <Canvas> (AGENTS §5); resuming remounts it.
    // GLB geometries/materials are shared `useGLTF` cache objects under
    // `dispose={null}` — they must not have been disposed with the old
    // scene, so the meshes mount again cleanly.
    await page.getByTestId('pause-button').click();
    await expect(page.getByTestId('resume-button')).toBeVisible();
    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
  });

  test('WebGL loss uses the safe fallback and a reload restores the game canvas', async ({
    page,
  }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [], 'high');
    await expect(canvas(page)).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => {
      const w = window as unknown as { __worldCanvasId?: number; __worldRenderer?: unknown };
      return typeof w.__worldCanvasId === 'number' && w.__worldRenderer !== undefined;
    });
    // Let CanvasLiveness's passive effect mark the scene alive before
    // exercising a real browser context-loss event.
    await page.waitForTimeout(100);

    const canLoseContext = await page.evaluate(() => {
      const renderer = (
        window as unknown as { __worldRenderer?: { getContext(): WebGLRenderingContext } }
      ).__worldRenderer;
      return renderer?.getContext().getExtension('WEBGL_lose_context') !== null;
    });
    expect(canLoseContext).toBe(true);
    await page.evaluate(() => {
      const renderer = (
        window as unknown as { __worldRenderer?: { getContext(): WebGLRenderingContext } }
      ).__worldRenderer;
      renderer?.getContext().getExtension('WEBGL_lose_context')?.loseContext();
    });
    await expect(page.getByTestId('webgl-fallback')).toBeVisible();

    await page.reload();
    await page.locator('[data-testid^="profile-card-"]').first().click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(canvas(page)).toBeVisible({ timeout: 15000 });
  });
});
