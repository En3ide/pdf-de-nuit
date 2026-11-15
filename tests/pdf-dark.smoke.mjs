import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
function fixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    '',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  for (const [index, text] of [[3, 'Bonjour mode sombre'], [5, 'Deuxieme page de test']]) {
    const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
    objects[index] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const pdf = fixture();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/fixture.pdf') { res.setHeader('Content-Type', 'application/pdf'); res.end(pdf); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Content-Security-Policy', manifest.content_security_policy.extension_pages);
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ ...(process.env.PDF_BROWSER_CHANNEL ? { channel: process.env.PDF_BROWSER_CHANNEL } : {}), headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.chrome = { permissions: { request: async () => true } };
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/viewer.html`);
  await page.locator('#file').setInputFiles({ name: 'test.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.locator('#viewer .textLayer').first().waitFor();
  await page.waitForFunction(() => document.querySelector('#viewer .textLayer')?.textContent.includes('Bonjour'));
  assert.equal(await page.locator('#pages').textContent(), '/ 2');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.waitForFunction(() => document.querySelector('#viewer canvas')?.width > 0);
  const pixels = await page.locator('#viewer canvas').first().evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 100 && data[i + 3] > 0) ink++;
    return ink;
  });
  assert.ok(pixels > 100, 'PDF text is actually painted');
  await page.locator('#theme').selectOption('sepia');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sepia');
  await page.locator('#brightness').fill('65');
  assert.equal(await page.locator('#brightness-value').textContent(), '65 %');
  await page.locator('#next').click();
  await page.waitForFunction(() => document.querySelector('#page').value === '2');
  await page.locator('#zoom').selectOption('1.5');
  await page.locator('#find').fill('Bonjour');
  await page.locator('#find-form button').click();
  await page.waitForFunction(() => /1 \/ 1/.test(document.querySelector('#matches').textContent));
  await page.locator('#url').fill(`${origin}/fixture.pdf`);
  await page.locator('#open-url').click();
  await page.waitForFunction(() => document.querySelector('#filename').textContent === 'fixture.pdf' && !document.querySelector('#toolbar').hidden);
  await page.screenshot({ path: path.join(root, 'tests/pdf-dark-preview.png') });
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sepia');
  assert.equal(await page.locator('#brightness').inputValue(), '65');
  await page.locator('#file').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid document') });
  await page.waitForFunction(() => document.querySelector('#status').classList.contains('error'));
  assert.equal(await page.locator('#welcome').isVisible(), true);
  await page.locator('#file').setInputFiles({ name: 'recovery.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.waitForFunction(() => !document.querySelector('#toolbar').hidden);
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('OK: rendu PDF réel, texte sélectionnable, 2 pages, thème, luminosité, navigation, zoom, recherche, lien, préférences, fichier invalide et réouverture.');
} finally {
  await browser?.close();
  server.close();
}
