import * as pdfjs from './vendor/build/pdf.mjs';
import { EventBus, PDFViewer, PDFLinkService, PDFFindController } from './vendor/web/pdf_viewer.mjs';

const $ = id => document.getElementById(id);
const asset = path => new URL(`vendor/${path}`, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset('build/pdf.worker.mjs');
const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus, externalLinkTarget: 2, externalLinkRel: 'noopener noreferrer' });
const findController = new PDFFindController({ eventBus, linkService });
const viewer = new PDFViewer({
  container: $('viewer-container'), viewer: $('viewer'), eventBus, linkService, findController,
  imageResourcesPath: asset('web/images/'), annotationEditorMode: -1,
  maxCanvasPixels: 16777216
});
linkService.setViewer(viewer);
let task = null;
let busy = false;
let passwordCallback = null;
let lastSearch = '';
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_FACTOR = 1.25;

function changeZoom(direction, origin) {
  if (!viewer.pagesCount) return;
  const scale = viewer.currentScale;
  const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(scale * factor * 100) / 100));
  viewer.updateScale({ scaleFactor: next / scale, drawingDelay: 150, origin });
}

function refreshViewerLayout() {
  if (!viewer.pagesCount) return;
  if (['page-width', 'page-fit'].includes($('zoom').value)) viewer.currentScaleValue = $('zoom').value;
  viewer.update();
}

function setPanelExpanded(expanded) {
  $('top-panel').hidden = !expanded;
  $('toggle-panel').setAttribute('aria-expanded', String(expanded));
  $('panel-toggle-label').textContent = expanded ? 'Masquer le panneau' : 'Afficher le panneau';
  $('panel-toggle-icon').textContent = expanded ? '▴' : '▾';
  requestAnimationFrame(refreshViewerLayout);
}
$('toggle-panel').addEventListener('click', () => setPanelExpanded($('top-panel').hidden));

function status(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
  if (error) setPanelExpanded(true);
}

function setBusy(value) {
  busy = value;
  for (const id of ['open-file', 'choose-file', 'open-url', 'file']) $(id).disabled = value;
}

function appearance() {
  document.documentElement.dataset.theme = $('theme').value;
  document.documentElement.style.setProperty('--pdf-brightness', Number($('brightness').value) / 100);
  $('brightness-value').value = `${$('brightness').value} %`;
  try { localStorage.setItem('appearance', JSON.stringify({ theme: $('theme').value, brightness: Number($('brightness').value) })); } catch { /* Preferences are optional. */ }
}
try {
  const saved = JSON.parse(localStorage.getItem('appearance') || '{}');
  if (['dark', 'sepia', 'light'].includes(saved.theme)) $('theme').value = saved.theme;
  if (Number.isFinite(saved.brightness) && saved.brightness >= 40 && saved.brightness <= 100) $('brightness').value = saved.brightness;
} catch { /* Ignore damaged preferences. */ }
appearance();
$('theme').addEventListener('change', appearance);
$('brightness').addEventListener('input', appearance);

async function loadDocument(source, name) {
  if (busy) return;
  setBusy(true);
  for (const id of ['zoom-out', 'zoom', 'zoom-in']) $(id).disabled = true;
  status('Ouverture du PDF…');
  try {
    viewer.setDocument(null);
    linkService.setDocument(null);
    if (task) await task.destroy();
    $('welcome').hidden = true;
    $('toolbar').hidden = true;
    $('document-area').hidden = false;
    $('filename').textContent = name;
    $('find').value = '';
    $('matches').textContent = '';
    lastSearch = '';
    task = pdfjs.getDocument({
      ...source, cMapUrl: asset('cmaps/'), cMapPacked: true,
      standardFontDataUrl: asset('standard_fonts/'), wasmUrl: asset('wasm/'),
      iccUrl: asset('iccs/'), isEvalSupported: false, enableXfa: false,
      disableWorkerRendering: true
    });
    task.onPassword = (callback, reason) => {
      passwordCallback = callback;
      $('password-message').textContent = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD
        ? 'Mot de passe incorrect. Réessayez.' : 'Saisissez le mot de passe du document.';
      $('password').value = '';
      if (!$('password-dialog').open) $('password-dialog').showModal();
      $('password').focus();
    };
    task.onProgress = ({ loaded, total }) => {
      if (total > 0) status(`Chargement du PDF… ${Math.min(100, Math.round(loaded / total * 100))} %`);
    };
    const pdf = await task.promise;
    $('pages').textContent = `/ ${pdf.numPages}`;
    $('page').max = pdf.numPages;
    $('page').value = 1;
    $('toolbar').hidden = false;
    $('hide-url').hidden = false;
    linkService.setDocument(pdf);
    viewer.setDocument(pdf);
    document.title = `${name} — PDF de nuit`;
    status(`${pdf.numPages} page(s) · Affichage local · Le fichier original reste inchangé.`);
  } catch (error) {
    $('welcome').hidden = false;
    $('document-area').hidden = true;
    $('toolbar').hidden = true;
    status(`Impossible d’ouvrir ce PDF. ${error?.message || ''} Pour un lien protégé ou inaccessible, téléchargez le fichier puis utilisez « Ouvrir un PDF ».`, true);
  } finally {
    passwordCallback = null;
    if ($('password-dialog').open) $('password-dialog').close();
    setBusy(false);
  }
}

async function openFile(file) {
  if (!file || busy) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    status('Choisissez un fichier PDF.', true);
    return;
  }
  // Blob URL lets PDF.js stream the file without copying the whole file first.
  const url = URL.createObjectURL(file);
  try { await loadDocument({ url }, file.name); }
  finally { URL.revokeObjectURL(url); }
}
for (const id of ['open-file', 'choose-file']) $(id).addEventListener('click', () => $('file').click());
$('file').addEventListener('change', () => {
  void openFile($('file').files[0]);
  $('file').value = '';
});
document.addEventListener('dragover', event => {
  event.preventDefault();
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', event => {
  if (!event.relatedTarget) document.body.classList.remove('dragging');
});
document.addEventListener('drop', event => {
  event.preventDefault();
  document.body.classList.remove('dragging');
  void openFile(event.dataTransfer.files[0]);
});

$('url-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  try {
    const url = new URL($('url').value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Utilisez un lien HTTP ou HTTPS sans identifiants dans l’adresse.');
    // Called directly from the click: permission applies only to this host.
    const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
    if (!granted) { status('Accès au site refusé. Vous pouvez ouvrir le PDF depuis votre ordinateur.', true); return; }
    let name = url.pathname.split('/').pop() || url.hostname;
    try { name = decodeURIComponent(name); } catch { /* Keep original filename. */ }
    await loadDocument({ url: url.href, withCredentials: true }, name);
  } catch (error) { status(error.message || 'Lien invalide.', true); }
});
$('hide-url').addEventListener('click', () => { $('url-form').hidden = true; });

eventBus.on('pagesinit', () => { viewer.currentScaleValue = $('zoom').value; });
eventBus.on('scalechanging', ({ scale, presetValue }) => {
  const value = presetValue || String(scale);
  const custom = $('custom-zoom');
  const preset = [...$('zoom').options].some(option => option !== custom && option.value === value);
  custom.hidden = preset;
  if (!preset) {
    custom.value = value;
    custom.textContent = `${Math.round(scale * 100)} %`;
  }
  $('zoom').value = value;
  $('zoom').disabled = false;
  $('zoom-out').disabled = scale <= MIN_ZOOM;
  $('zoom-in').disabled = scale >= MAX_ZOOM;
});
eventBus.on('pagechanging', ({ pageNumber }) => {
  $('page').value = pageNumber;
  $('previous').disabled = pageNumber <= 1;
  $('next').disabled = pageNumber >= viewer.pagesCount;
});
eventBus.on('pagerendered', ({ error }) => { if (error) status(`Erreur de rendu : ${error.message}`, true); });
$('previous').addEventListener('click', () => { if (viewer.currentPageNumber > 1) viewer.currentPageNumber--; });
$('next').addEventListener('click', () => { if (viewer.currentPageNumber < viewer.pagesCount) viewer.currentPageNumber++; });
$('page').addEventListener('change', () => {
  const page = Number($('page').value);
  if (Number.isInteger(page) && page >= 1 && page <= viewer.pagesCount) viewer.currentPageNumber = page;
  else $('page').value = viewer.currentPageNumber;
});
$('zoom').addEventListener('change', () => { viewer.currentScaleValue = $('zoom').value; });
$('zoom-out').addEventListener('click', () => changeZoom(-1));
$('zoom-in').addEventListener('click', () => changeZoom(1));
$('viewer-container').addEventListener('wheel', event => {
  if (!(event.ctrlKey || event.metaKey) || !event.deltaY || !viewer.pagesCount) return;
  event.preventDefault();
  changeZoom(event.deltaY < 0 ? 1 : -1, [event.clientX, event.clientY]);
}, { passive: false });
window.addEventListener('resize', refreshViewerLayout);
$('find-form').addEventListener('submit', event => {
  event.preventDefault();
  const query = $('find').value;
  eventBus.dispatch('find', { source: window, type: query === lastSearch ? 'again' : '', query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: false, matchDiacritics: false });
  lastSearch = query;
});
eventBus.on('updatefindmatchescount', ({ matchesCount }) => {
  $('matches').textContent = `${matchesCount.current} / ${matchesCount.total}`;
});
eventBus.on('updatefindcontrolstate', ({ state, matchesCount }) => {
  if (state === 1) $('matches').textContent = 'Aucun résultat';
  else if (matchesCount) $('matches').textContent = `${matchesCount.current} / ${matchesCount.total}`;
});
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || $('toolbar').hidden) return;
  if (['+', '=', '-', '0'].includes(event.key) && viewer.pagesCount) {
    event.preventDefault();
    if (event.key === '0') viewer.currentScale = 1;
    else changeZoom(event.key === '-' ? -1 : 1);
  } else if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    setPanelExpanded(true);
    $('find').focus(); $('find').select();
  }
});
$('password-form').addEventListener('submit', event => {
  event.preventDefault();
  const callback = passwordCallback;
  passwordCallback = null;
  const password = $('password').value;
  $('password').value = '';
  $('password-dialog').close();
  callback?.(password);
});
function cancelPassword() {
  $('password-dialog').close();
  passwordCallback = null;
  void task?.destroy();
}
$('cancel-password').addEventListener('click', cancelPassword);
$('password-dialog').addEventListener('cancel', event => { event.preventDefault(); cancelPassword(); });

const source = new URLSearchParams(location.hash.slice(1)).get('source');
if (source && /^https?:\/\//i.test(source)) {
  $('url').value = source;
  status('Lien de l’onglet précédent repris. Cliquez sur « Ouvrir le lien », ou choisissez un fichier local.');
}
// Do not retain document URLs in this tab's address bar.
history.replaceState(null, '', location.pathname);
