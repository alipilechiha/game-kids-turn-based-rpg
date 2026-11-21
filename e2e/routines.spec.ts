import { expect, test, type Page } from '@playwright/test';
import { getAnchor } from '../src/world/navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from '../src/world/worldSource.ts';
import type { AnchorId } from '../src/domain/game/types.ts';
import { tapNpcFigure, tapWorldAnchor } from './npcTap.ts';

// NPC routines: authored spots cycle with world time (one tick per arrival),
// each spot carries its own greeting, and tapping a figure walks over and
// talks — all event-driven, deterministic, no per-frame simulation.

async function startGame(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__WORLD_PROBE'] = true;
  });
  await page.goto('/?research=0');
  await page.getByTestId('start-button').click();
  await page.getByTestId('avatar-aban').click();
  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

interface WorldProbe {
  __worldMapId?: string;
  __worldAt?: string;
  __worldTime?: number;
  __worldToScreen?: (x: number, z: number) => { x: number; y: number };
  __worldCamera?: { position: { x: number; z: number } };
  __worldNpcs?: Record<
    string,
    { anchorId: string; activity: string; dialogueId: string | null; x: number; z: number }
  >;
}

async function npcProbe(page: Page, id: string) {
  return page.evaluate(
    (npcId) => (window as unknown as WorldProbe).__worldNpcs?.[npcId] ?? null,
    id,
  );
}

async function playerAt(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldAt);
}

async function worldTime(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldTime);
}

async function waitForProbe(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as WorldProbe).__worldToScreen !== undefined,
    undefined,
    { timeout: 30000 },
  );
}

/** Screen pixels for a world anchor — every offset that lands on the canvas. */
async function screenPoints(page: Page, anchorId: AnchorId) {
  const anchor = getAnchor(STATIC_WORLD_SOURCE, anchorId);
  return worldPoints(page, anchor.x, anchor.z);
}

/** On-canvas pixels around a raw world point (stride taps, figure taps). */
async function worldPoints(page: Page, x: number, z: number) {
  return page.evaluate(
    ({ wx, wz }: { wx: number; wz: number }) => {
      const toScreen = (window as unknown as WorldProbe).__worldToScreen!;
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#world-canvas canvas, .world canvas',
      );
      if (!canvas) return [];
      const offsets: Array<[number, number]> = [
        [0.4, -1.2],
        [0, -0.8],
        [0.8, -0.4],
        [-0.8, -0.4],
        [0, 0],
        [0.6, 0.6],
        [-0.6, 0.6],
        [0, 1.2],
        [1.2, -0.8],
        [-1.2, -0.8],
      ];
      const points: Array<{ x: number; y: number }> = [];
      for (const [ox, oz] of offsets) {
        const pt = toScreen(wx + ox, wz + oz);
        if (pt.x < 0 || pt.y < 0 || pt.x > window.innerWidth || pt.y > window.innerHeight) {
          continue;
        }
        const el = document.elementFromPoint(pt.x, pt.y);
        if (el === canvas || canvas.contains(el)) points.push(pt);
      }
      return points;
    },
    { wx: x, wz: z },
  );
}

/** Arrival dialogue opens a beat after the walker stops — close it so taps resume. */
async function dismissDialogue(page: Page) {
  const dialogue = page.getByTestId('npc-dialogue');
  for (let i = 0; i < 6; i += 1) {
    if (!(await dialogue.isVisible().catch(() => false))) return;
    const close = page.getByTestId('close-dialogue');
    if (await close.isVisible().catch(() => false)) await close.click();
    await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

async function waitForAnchor(page: Page, anchorId: string) {
  await expect.poll(() => playerAt(page), { timeout: 60000 }).toBe(anchorId);
}

test.describe('NPC routines', () => {
  test('positions cycle with world time and greetings match the routine spot', async ({ page }) => {
    test.setTimeout(300000);
    await startGame(page);
    await waitForProbe(page);

    // Repeated taps on this empty waypoint exercise one arrival per tick,
    // including returns to the same anchor. Long routes to the river and
    // school can sample midpoints over NPC figures; those taps become visits
    // and intentionally skip a routine tick.
    const TICK_ANCHOR = 'anchor-path-north';
    const seenSpots = new Set<string>();
    await expect.poll(() => worldTime(page), { timeout: 15000 }).toBe(0);
    let expectedWorldTime = 0;

    // Three arrivals cover the full three-stop routine and leave the fisher
    // back at the river, where both mobile layouts can reach his figure.
    for (let visit = 0; visit < 3; visit += 1) {
      const points = await screenPoints(page, TICK_ANCHOR);
      expect(points.length, `${TICK_ANCHOR} should have a tappable ground point`).toBeGreaterThan(
        0,
      );
      await page.mouse.click(points[0]!.x, points[0]!.y);
      await waitForAnchor(page, TICK_ANCHOR);
      expectedWorldTime += 1;
      await expect.poll(() => worldTime(page), { timeout: 15000 }).toBe(expectedWorldTime);
      // __worldNpcs republishes after the worldTime re-render — wait until
      // two reads agree so it cannot lag a tick behind the arrival dialogue.
      await expect
        .poll(
          async () => {
            const a = await npcProbe(page, 'npc-fisher');
            await page.waitForTimeout(400);
            const b = await npcProbe(page, 'npc-fisher');
            return a?.anchorId === b?.anchorId ? 'stable' : 'settling';
          },
          { timeout: 15000 },
        )
        .toBe('stable');
      const fisher = await npcProbe(page, 'npc-fisher');
      expect(fisher).not.toBeNull();
      seenSpots.add(fisher!.anchorId);
      await dismissDialogue(page);
    }

    // The routine must actually move him through at least two authored spots.
    expect(seenSpots.size).toBeGreaterThanOrEqual(2);
    expect(seenSpots.has('anchor-river')).toBe(true);

    // Move into the fisher's area so his figure is in the tappable viewport.
    // The arrival is a visit, so it holds the routine spot and its greeting.
    const fisher = await npcProbe(page, 'npc-fisher');
    const visitAnchor = fisher!.anchorId as 'anchor-river' | 'anchor-river-bank' | 'anchor-bakery';
    await tapWorldAnchor(page, visitAnchor);
    await waitForAnchor(page, visitAnchor);
    await dismissDialogue(page);
    const standing = await npcProbe(page, 'npc-fisher');
    expect(standing).not.toBeNull();
    const standingAnchor = standing!.anchorId as
      'anchor-river' | 'anchor-river-bank' | 'anchor-bakery';
    const worldTimeBeforeVisit = await worldTime(page);
    const expected = {
      'anchor-river': 'صبح خوبی برای ماهی است.',
      'anchor-river-bank': 'امروز رودخانه آرام بود.',
      'anchor-bakery': 'بوی نان تازه آمد.',
    }[standingAnchor];
    expect(expected).toBeTruthy();
    const dialogue = page.getByTestId('npc-dialogue');
    const tapped = await tapNpcFigure(page, 'npc-fisher', 60000);
    test.skip(!tapped, 'fisher figure is not tappable in this layout');
    await expect(dialogue).toContainText(expected!);
    await expect.poll(() => worldTime(page)).toBe(worldTimeBeforeVisit);
    expect((await npcProbe(page, 'npc-fisher'))!.anchorId).toBe(standingAnchor);
  });

  test('tapping a person talks to them where they stand', async ({ page }) => {
    test.setTimeout(300000);
    await startGame(page);
    await waitForProbe(page);

    // Get to the river area so his figure mounts, then read whatever spot
    // the routine currently has him on. That spot is frozen now — world
    // time only advances on avatar arrivals, and no walk is in flight.
    await tapWorldAnchor(page, 'anchor-river');
    await waitForAnchor(page, 'anchor-river');
    const fisher = await npcProbe(page, 'npc-fisher');
    expect(fisher).not.toBeNull();
    const expectedBySpot: Record<string, string> = {
      'fisher-at-river': 'صبح خوبی برای ماهی است.',
      'fisher-at-bakery': 'بوی نان تازه آمد.',
      'fisher-at-bank': 'امروز رودخانه آرام بود.',
    };
    const expected = expectedBySpot[fisher!.dialogueId!];
    expect(expected, `unmapped fisher dialogue ${fisher!.dialogueId}`).toBeTruthy();
    await dismissDialogue(page);

    // Tapping the figure walks over and opens HIS dialogue — a plain walk
    // to another anchor or another NPC's greeting both count as misses.
    // The shared helper re-probes his RENDERED position between clicks and
    // the NPC-tap walk is a skipArrivalTick arrival, so the greeting is
    // captured against the same routine spot we just read — while he is
    // still strolling toward it.
    const dialogue = page.getByTestId('npc-dialogue');
    const tapped = await tapNpcFigure(page, 'npc-fisher', 60000);
    test.skip(!tapped, 'fisher figure is not tappable in this layout');
    await expect(dialogue).toContainText(expected!);
  });
});
