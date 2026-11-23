export async function registerGardenServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
    const registration = await navigator.serviceWorker.register(new URL('garden-sw.js', baseUrl), {
      scope: baseUrl.pathname,
    });
    if (registration.active?.state === 'activated') return true;
    const worker = registration.installing ?? registration.waiting;
    if (!worker) return false;
    return await waitForActivation(worker);
  } catch {
    return false;
  }
}

function waitForActivation(worker: ServiceWorker): Promise<boolean> {
  if (worker.state === 'activated') return Promise.resolve(true);
  if (worker.state === 'redundant') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.removeEventListener('statechange', onStateChange);
      resolve(ready);
    };
    const onStateChange = () => {
      if (worker.state === 'activated') finish(true);
      if (worker.state === 'redundant') finish(false);
    };
    const timeout = window.setTimeout(() => finish(false), 15_000);
    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}
