import { test, expect } from '@playwright/test';
const sizes = [320, 375, 390, 430, 768, 1440];
for (const width of sizes)
  test(`landing ${width}px, narrative, no overflow, legal keyboard`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Una idea entra. Tu marca sale.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '03 · Guardian' }).click();
    await expect(page.locator('#story-title')).toHaveText('Una palabra cambia la revisión.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('link', { name: 'Privacidad', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Pausar movimiento' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
    if (width === 1440 || width === 390)
      await page.screenshot({ path: `docs/screenshots/landing-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
test('dashboard complete local flow, two organizations, image, review/export and mobile', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como Alice (DEMO)' }).click();
  await page.getByLabel('Nombre de organización').fill('Taller Norte · DEMO');
  await page.getByRole('button', { name: 'Crear workspace de prueba' }).click();
  await expect(page.getByRole('heading', { name: 'Tu centro de trabajo' })).toBeVisible();
  await page.getByRole('button', { name: 'Marcas', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Taller Norte');
  await page.getByLabel('Sector', { exact: true }).fill('Artesanía');
  await page.getByLabel('Descripción', { exact: true }).fill('Cuadernos hechos a mano');
  await page.getByLabel('Público', { exact: true }).fill('Personas que escriben');
  await page.getByLabel('Tono', { exact: true }).fill('cercano');
  await page.getByLabel('Palabras prohibidas', { exact: true }).fill('perfecto');
  await page.getByLabel('Información verificable de producto').fill('Cuaderno artesanal');
  await page.getByRole('button', { name: 'Guardar marca' }).click();
  await expect(page.getByRole('heading', { name: 'Taller Norte', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Campañas', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Lanzamiento');
  await page.getByLabel('Objetivo', { exact: true }).fill('Presentar cuadernos');
  await page.getByRole('button', { name: 'Crear campaña' }).click();
  await expect(page.getByRole('heading', { name: 'Lanzamiento', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Briefs', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Ideas sobre papel');
  await page.getByLabel('Objetivo y mensaje').fill('Descubre los cuadernos');
  await page.getByLabel('Llamada a la acción').fill('Conoce la colección');
  await page.getByRole('button', { name: 'Guardar brief' }).click();
  await expect(page.getByRole('heading', { name: 'Ideas sobre papel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generador', exact: true }).click();
  await page.getByRole('button', { name: 'Crear y ejecutar trabajo' }).click();
  await expect(page.getByText('DEMO · Completado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activos', exact: true }).click();
  await expect(page.locator('.asset pre')).toContainText('DEMO · Taller Norte');
  await page.getByRole('button', { name: 'Marcar revisado' }).click();
  await expect(page.getByText('Revisión humana: approved')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar resultado' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.txt$/);
  await page.getByRole('button', { name: 'Generador', exact: true }).click();
  await page.getByLabel('Modalidad').selectOption('image');
  await page
    .getByLabel('Copy de referencia (obligatorio para imagen)')
    .selectOption({ label: 'Ideas sobre papel' });
  await page.getByRole('button', { name: 'Crear y ejecutar trabajo' }).click();
  await expect(page.getByRole('heading', { name: 'image', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.locator('.stats')).toContainText('89');
  for (const width of sizes) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of [
      'Resumen',
      'Marcas',
      'Campañas',
      'Briefs',
      'Generador',
      'Trabajos',
      'Activos',
      'TII / ROI',
      'Trends Pulse',
      'Configuración',
    ]) {
      await page.getByRole('button', { name: view, exact: true }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${view} ${width}`,
      ).toBe(true);
    }
    await page.getByRole('button', { name: 'Resumen', exact: true }).click();
    if (width === 390 || width === 1440)
      await page.screenshot({ path: `docs/screenshots/dashboard-${width}.png`, fullPage: true });
  }
  const me = await (
    await request.get('/api/me', { headers: { Authorization: 'Bearer demo-alice' } })
  ).json();
  const foreign = await request.get('/api/orgs/' + me.organizations[0].id, {
    headers: { Authorization: 'Bearer demo-bob' },
  });
  expect(foreign.status()).toBe(403);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como Bob (DEMO)' }).click();
  await page.getByLabel('Nombre de organización').fill('Organización B · DEMO');
  await page.getByRole('button', { name: 'Crear workspace de prueba' }).click();
  await expect(page.locator('.stats')).toContainText('100');
  await page.getByRole('button', { name: 'Marcas', exact: true }).click();
  await expect(page.getByText('Todavía no hay marcas.')).toBeVisible();
  expect(errors).toEqual([]);
});
