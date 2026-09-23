import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { createServer } from 'node:http';
import { handler } from '../../server/http.js';
import { LocalStore } from '../../server/store.js';
import { Service } from '../../server/service.js';
import { LocalBlobs } from '../../server/blobs.js';
import { MockProvider } from '../../server/providers.js';
test('built UI + real local backend: Alice brand/campaign/brief/copy/image/review; Bob isolated', async (t) => {
  const store = await new LocalStore().init(),
    blobs = new LocalBlobs(null),
    service = new Service(store, new MockProvider(), blobs, { ORG_DAILY_MAX_USD: '1' });
  const rt = {
    env: { APP_MODE: 'local', DEMO_AUTH: 'true' },
    store,
    blobs,
    service,
    verify: async (token) => {
      assert.ok(['demo-alice', 'demo-bob'].includes(token));
      return { uid: token, email: token + '@example.invalid', demo: true };
    },
  };
  const server = createServer(handler(rt));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  rt.env.APP_ORIGIN = origin;
  const dom = new JSDOM(
      '<!doctype html><html><head></head><body><div id="app"></div></body></html>',
      { url: origin, runScripts: 'outside-only', pretendToBeVisual: true },
    ),
    { window } = dom;
  t.after(() => window.close());
  window.fetch = (path, options = {}) =>
    fetch(new URL(path, origin), { ...options, headers: { ...options.headers, Origin: origin } });
  window.HTMLElement.prototype.scrollIntoView = function () {}; // jsdom has no layout engine.
  window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };
  const file = (await readdir('dist/assets')).find((f) => f.endsWith('.js'));
  const mod = new vm.SourceTextModule(await readFile('dist/assets/' + file, 'utf8'), {
    context: dom.getInternalVMContext(),
    initializeImportMeta: (meta) => {
      meta.url = origin + '/assets/' + file;
    },
  });
  await mod.link(() => {
    throw new Error('Unexpected external import');
  });
  await mod.evaluate();
  const doc = window.document;
  async function until(predicate) {
    const stop = Date.now() + 4000;
    while (!predicate()) {
      if (Date.now() > stop)
        throw new Error('UI timeout: ' + doc.querySelector('#feedback')?.textContent);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  async function click(selector) {
    const element = doc.querySelector(selector);
    assert.ok(element, selector);
    element.click();
    await until(() => doc.querySelector('#app').getAttribute('aria-busy') === 'false');
    assert.equal(
      doc.querySelector('#feedback.error'),
      null,
      doc.querySelector('#feedback')?.textContent,
    );
  }
  async function submit(formId, data) {
    const form = doc.getElementById(formId);
    assert.ok(form, formId);
    for (const [key, value] of Object.entries(data)) form.elements.namedItem(key).value = value;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => doc.querySelector('#app').getAttribute('aria-busy') === 'false');
    assert.equal(
      doc.querySelector('#feedback.error'),
      null,
      doc.querySelector('#feedback')?.textContent,
    );
  }
  assert.match(doc.querySelector('h1').textContent, /Una idea entra/);
  await click('[data-story="guardian"]');
  assert.match(doc.querySelector('#story-body').textContent, /perfecto/);
  await click('[data-user="demo-alice"]');
  await submit('onboarding', { name: 'Alice organization' });
  await click('[data-view="brands"]');
  await submit('brand-form', {
    name: 'Safe <img src=x onerror=alert(1)>',
    description: 'Cuaderno artesanal',
    sector: 'artesanía',
    audience: 'adultos',
    tone: 'formal',
    productInfo: 'Cuaderno de papel',
    instructions: 'sin emojis',
  });
  assert.equal(
    doc.querySelector('.record-grid img'),
    null,
    'Untrusted brand name must be rendered as text',
  );
  await click('[data-view="campaigns"]');
  await submit('campaign-form', { name: 'Campaña uno', objective: 'Presentar cuadernos' });
  await click('[data-view="briefs"]');
  await submit('brief-form', {
    title: 'Ideas sobre papel',
    objective: 'Dar a conocer el cuaderno',
    cta: 'Descubre la colección',
  });
  await click('[data-view="generate"]');
  await submit('generation-form', { kind: 'copy' });
  await click('[data-view="assets"]');
  assert.match(doc.querySelector('.asset pre').textContent, /DEMO/);
  assert.equal(doc.querySelector('.asset img'), null);
  await click('[data-action="review-asset"]');
  assert.match(doc.querySelector('.asset').textContent, /approved/);
  await click('[data-view="generate"]');
  const select = doc.querySelector('[name=copyAssetId]');
  await submit('generation-form', { kind: 'image', copyAssetId: select.options[1].value });
  const orgs = await store.list('demo-alice'),
    aliceOrg = await store.get(orgs[0].id);
  assert.equal(aliceOrg.usage.length, 2);
  assert.equal(aliceOrg.creditBalance, 89);
  assert.equal(Object.keys(aliceOrg.assets).length, 2);
  const copy = Object.values(aliceOrg.assets).find((a) => a.kind === 'copy');
  const downloaded = await fetch(`${origin}/api/orgs/${aliceOrg.id}/assets/${copy.id}/download`, {
    headers: { Authorization: 'Bearer demo-alice' },
  });
  assert.equal(downloaded.status, 200);
  assert.match(await downloaded.text(), /DEMO/);
  for (const view of [
    'overview',
    'brands',
    'campaigns',
    'briefs',
    'generate',
    'jobs',
    'assets',
    'analytics',
    'trends',
    'settings',
  ]) {
    await click(`[data-view="${view}"]`);
    assert.ok(doc.querySelector('main h1'));
    for (const input of doc.querySelectorAll('input,textarea,select'))
      assert.ok(input.closest('label'), 'Form control has a label');
  }
  await click('[data-action="logout"]');
  await click('[data-user="demo-bob"]');
  await submit('onboarding', { name: 'Bob organization' });
  await click('[data-view="brands"]');
  assert.match(doc.querySelector('.empty').textContent, /Todavía no hay marcas/);
  const forbidden = await fetch(`${origin}/api/orgs/${aliceOrg.id}`, {
    headers: { Authorization: 'Bearer demo-bob' },
  });
  assert.equal(forbidden.status, 403);
});
