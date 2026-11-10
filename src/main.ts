import './style.css'
import { articleMatches } from './search.ts'
import { applyQuantity, adjustEntered, parseCount, type QuantityMode } from './quantity.ts'
import { scanErrorMessage, startScan, type ScanHandle } from './scan.ts'
import {
  escapeHtml,
  findByEan,
  findById,
  formatDateTime,
  loadData,
  normalizeEan,
  registerServiceWorker,
  resetQuantities,
  saveData,
  uid,
  upsertArticle,
} from './storage.ts'
import type { Article, InventoryData } from './types.ts'

type Screen =
  | { kind: 'home' }
  | { kind: 'scan'; error?: string }
  | { kind: 'quantity'; articleId: string; entered: string; mode: QuantityMode }
  | { kind: 'edit'; article?: Article; eanPrefill?: string }
  | { kind: 'confirm-reset' }

let data: InventoryData = loadData()
let query = ''
let screen: Screen = { kind: 'home' }
let banner = ''
let scanHandle: ScanHandle | undefined
const app = document.querySelector('#app')

function persist(): void {
  saveData(data)
}

function nowIso(): string {
  return new Date().toISOString()
}

function showHome(message = ''): void {
  banner = message
  screen = { kind: 'home' }
  render()
}

function openQuantity(articleId: string): void {
  screen = { kind: 'quantity', articleId, entered: '0', mode: 'set' }
  render()
  document.getElementById('qty-entered')?.focus()
}

async function stopScan(): Promise<void> {
  const handle = scanHandle
  scanHandle = undefined
  if (handle) await handle.stop()
}

function render(): void {
  if (!app) return
  if (screen.kind === 'home') {
    app.innerHTML = renderHome()
    bindHome()
    return
  }
  if (screen.kind === 'scan') {
    app.innerHTML = renderHome() + renderScan(screen.error)
    bindHome()
    bindScan()
    return
  }
  if (screen.kind === 'quantity') {
    const article = findById(data, screen.articleId)
    if (!article) {
      showHome('Artikel ni več na seznamu.')
      return
    }
    app.innerHTML = renderHome() + renderQuantity(article, screen.entered, screen.mode)
    bindHome()
    bindQuantity()
    return
  }
  if (screen.kind === 'edit') {
    app.innerHTML = renderHome() + renderEdit(screen.article, screen.eanPrefill)
    bindHome()
    bindEdit()
    return
  }
  app.innerHTML = renderHome() + renderResetConfirm()
  bindHome()
  bindReset()
}

function visibleArticles(): Article[] {
  return data.articles.filter((a) => articleMatches(query, a))
}

function renderHome(): string {
  const list = visibleArticles()
  const cards = list.length
    ? list
        .map((a) => {
          return `<article class="card" data-id="${escapeHtml(a.id)}">
            <div class="card-main" data-action="qty">
              <h2>${escapeHtml(a.ime || '(brez imena)')}</h2>
              <div class="meta">${escapeHtml(a.sifra || 'brez šifre')}${a.ean ? ` · EAN ${escapeHtml(a.ean)}` : ''}</div>
              <div class="meta">spremenjeno ${escapeHtml(formatDateTime(a.updatedAt))}</div>
              <button type="button" class="edit-link" data-action="edit">Uredi</button>
            </div>
            <button type="button" class="qty" data-action="qty" aria-label="Spremeni količino">
              <b>${a.kolicina}</b><span>kos</span>
            </button>
          </article>`
        })
        .join('')
    : `<p class="empty">${
        data.articles.length === 0
          ? 'Ni artiklov. Skeniraj škatlo ali dodaj artikel ročno.'
          : 'Nisem našel artikla s tem iskanjem.'
      }</p>`

  const notice = banner ? `<p class="flash ok">${escapeHtml(banner)}</p>` : ''

  return `<header class="app-head">
      <img src="${import.meta.env.BASE_URL}icon-192.png" alt="" width="48" height="48" />
      <div>
        <h1>Popis žarnic</h1>
        <p class="sub">${data.articles.length} artiklov na tem telefonu</p>
      </div>
    </header>
    ${notice}
    <div class="stack">
      <input class="search" id="search" type="search" placeholder="Išči po imenu, šifri ali EAN" value="${escapeHtml(query)}" />
      <button type="button" class="btn btn-primary" id="btn-scan">Skeniraj</button>
      <button type="button" class="btn" id="btn-new">Nov artikel</button>
      <div class="row-actions">
        <button type="button" class="btn" id="btn-export">Izvozi v Excel</button>
        <button type="button" class="btn btn-danger" id="btn-reset">Nov popis</button>
      </div>
    </div>
    <div class="list">${cards}</div>`
}

function renderScan(error?: string): string {
  return `<div class="overlay" id="scan-overlay">
    <div class="sheet">
      <h2>Skeniraj kodo</h2>
      <p class="hint">Usmeri kamero na črtno kodo na škatli.</p>
      <div class="scan-wrap">
        <video id="scan-video" playsinline muted autoplay></video>
        <div class="scan-hint">Drži kodo v sredini slike</div>
      </div>
      ${error ? `<p class="flash">${escapeHtml(error)}</p>` : ''}
      <div class="stack" style="margin-top:12px">
        <button type="button" class="btn" id="btn-cancel-scan">Prekliči</button>
      </div>
    </div>
  </div>`
}

function renderQuantity(article: Article, entered: string, mode: QuantityMode): string {
  const preview = applyQuantity({
    current: article.kolicina,
    entered: parseCount(entered) ?? 0,
    mode,
  })
  return `<div class="overlay">
    <div class="sheet">
      <h2>${escapeHtml(article.ime || '(brez imena)')}</h2>
      <p class="hint">Zdaj na zalogi: <b>${article.kolicina}</b> kos · po shranitvi: <b>${preview}</b> kos</p>
      <div class="mode">
        <button type="button" class="btn" data-mode="set" aria-pressed="${mode === 'set'}">Nastavi</button>
        <button type="button" class="btn" data-mode="add" aria-pressed="${mode === 'add'}">Prištej</button>
      </div>
      <div class="qty-display" id="qty-entered">${escapeHtml(entered || '0')}</div>
      <div class="steppers">
        <button type="button" class="btn" data-delta="-10">−10</button>
        <button type="button" class="btn" data-delta="-1">−1</button>
        <button type="button" class="btn" data-delta="1">+1</button>
        <button type="button" class="btn" data-delta="10">+10</button>
      </div>
      <div class="keypad">
        ${['1','2','3','4','5','6','7','8','9','C','0','⌫'].map((k) => `<button type="button" class="btn" data-key="${k}">${k}</button>`).join('')}
      </div>
      <div class="stack">
        <button type="button" class="btn btn-primary" id="btn-save-qty">Shrani</button>
        <button type="button" class="btn btn-ghost" id="btn-cancel-qty">Prekliči</button>
      </div>
    </div>
  </div>`
}

function renderEdit(article?: Article, eanPrefill?: string): string {
  const isNew = !article
  return `<div class="overlay">
    <div class="sheet">
      <h2>${isNew ? 'Nov artikel' : 'Uredi artikel'}</h2>
      <form id="edit-form">
        <label for="f-ime">Ime</label>
        <input id="f-ime" name="ime" type="text" required value="${escapeHtml(article?.ime ?? '')}" />
        <label for="f-sifra">Šifra</label>
        <input id="f-sifra" name="sifra" type="text" value="${escapeHtml(article?.sifra ?? '')}" />
        <label for="f-ean">EAN</label>
        <input id="f-ean" name="ean" type="text" inputmode="numeric" value="${escapeHtml(article?.ean ?? eanPrefill ?? '')}" />
        <label for="f-opomba">Opomba</label>
        <textarea id="f-opomba" name="opomba">${escapeHtml(article?.opomba ?? '')}</textarea>
        ${isNew ? `<label for="f-kolicina">Začetna količina</label>
        <input id="f-kolicina" name="kolicina" type="text" inputmode="numeric" value="0" />` : ''}
        <div class="stack" style="margin-top:16px">
          <button type="submit" class="btn btn-primary">${isNew ? 'Dodaj' : 'Shrani'}</button>
          <button type="button" class="btn btn-ghost" id="btn-cancel-edit">Prekliči</button>
        </div>
      </form>
    </div>
  </div>`
}

function renderResetConfirm(): string {
  return `<div class="overlay">
    <div class="sheet">
      <h2>Nov popis?</h2>
      <p>Količine vseh artiklov bodo 0. Imena, šifre in kode ostanejo. Tega ni mogoče razveljaviti.</p>
      <div class="stack" style="margin-top:16px">
        <button type="button" class="btn btn-danger" id="btn-confirm-reset">Da, ponastavi količine</button>
        <button type="button" class="btn btn-ghost" id="btn-cancel-reset">Prekliči</button>
      </div>
    </div>
  </div>`
}

function bindHome(): void {
  document.getElementById('search')?.addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value
    const list = document.querySelector('.list')
    if (list) list.innerHTML = visibleArticles().length
      ? visibleArticles()
          .map((a) => {
            return `<article class="card" data-id="${escapeHtml(a.id)}">
              <div class="card-main" data-action="qty">
                <h2>${escapeHtml(a.ime || '(brez imena)')}</h2>
                <div class="meta">${escapeHtml(a.sifra || 'brez šifre')}${a.ean ? ` · EAN ${escapeHtml(a.ean)}` : ''}</div>
                <div class="meta">spremenjeno ${escapeHtml(formatDateTime(a.updatedAt))}</div>
                <button type="button" class="edit-link" data-action="edit">Uredi</button>
              </div>
              <button type="button" class="qty" data-action="qty" aria-label="Spremeni količino">
                <b>${a.kolicina}</b><span>kos</span>
              </button>
            </article>`
          })
          .join('')
      : `<p class="empty">${data.articles.length === 0 ? 'Ni artiklov. Skeniraj škatlo ali dodaj artikel ročno.' : 'Nisem našel artikla s tem iskanjem.'}</p>`
    bindCards()
  })
  document.getElementById('btn-scan')?.addEventListener('click', () => {
    void openScan()
  })
  document.getElementById('btn-new')?.addEventListener('click', () => {
    screen = { kind: 'edit' }
    render()
  })
  document.getElementById('btn-export')?.addEventListener('click', () => {
    void downloadExport()
  })
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    screen = { kind: 'confirm-reset' }
    render()
  })
  bindCards()
}

function bindCards(): void {
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    const id = card.dataset.id
    if (!id) return
    card.querySelectorAll('[data-action="qty"]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault()
        openQuantity(id)
      })
    })
    card.querySelector('[data-action="edit"]')?.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      const article = findById(data, id)
      if (article) {
        screen = { kind: 'edit', article }
        render()
      }
    })
  })
}

async function openScan(): Promise<void> {
  await stopScan()
  screen = { kind: 'scan' }
  render()
}

function bindScan(): void {
  document.getElementById('btn-cancel-scan')?.addEventListener('click', () => {
    void stopScan().then(() => showHome())
  })
  const video = document.getElementById('scan-video')
  if (!(video instanceof HTMLVideoElement)) return
  void startScan(video, (code) => {
    void onScanned(code)
  }).then((handle) => {
    scanHandle = handle
  }).catch((err: unknown) => {
    screen = { kind: 'scan', error: scanErrorMessage(err) }
    render()
  })
}

async function onScanned(code: string): Promise<void> {
  await stopScan()
  const ean = normalizeEan(code)
  const found = findByEan(data, ean)
  if (found) {
    banner = ''
    openQuantity(found.id)
    return
  }
  screen = { kind: 'edit', eanPrefill: ean }
  render()
}

function bindQuantity(): void {
  if (screen.kind !== 'quantity') return
  const current = screen
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode === 'add' ? 'add' : 'set'
      screen = { ...current, mode }
      render()
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.delta)
      screen = { ...current, entered: adjustEntered(current.entered, delta) }
      render()
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key ?? ''
      let entered = current.entered === '0' ? '' : current.entered
      if (key === 'C') entered = '0'
      else if (key === '⌫') entered = entered.slice(0, -1) || '0'
      else entered = (entered + key).replace(/^0+(?=\d)/, '')
      screen = { ...current, entered }
      render()
    })
  })
  document.getElementById('btn-cancel-qty')?.addEventListener('click', () => showHome())
  document.getElementById('btn-save-qty')?.addEventListener('click', () => {
    const article = findById(data, current.articleId)
    if (!article) return showHome()
    const entered = parseCount(current.entered)
    if (entered === null) return
    const next: Article = {
      ...article,
      kolicina: applyQuantity({ current: article.kolicina, entered, mode: current.mode }),
      updatedAt: nowIso(),
    }
    data = upsertArticle(data, next)
    persist()
    showHome(`Shranjeno: ${next.ime || next.sifra || next.ean} = ${next.kolicina} kos`)
  })
}

function bindEdit(): void {
  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => showHome())
  document.getElementById('edit-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const form = ev.target as HTMLFormElement
    const fd = new FormData(form)
    const ime = String(fd.get('ime') ?? '').trim()
    const sifra = String(fd.get('sifra') ?? '').trim()
    const ean = normalizeEan(String(fd.get('ean') ?? ''))
    const opomba = String(fd.get('opomba') ?? '').trim()
    if (!ime && !sifra && !ean) return
    if (screen.kind !== 'edit') return
    const existing = screen.article
    const startQty = parseCount(String(fd.get('kolicina') ?? '0')) ?? 0
    const article: Article = existing
      ? { ...existing, ime, sifra, ean, opomba, updatedAt: nowIso() }
      : {
          id: uid(),
          ime,
          sifra,
          ean,
          opomba,
          kolicina: Math.max(0, startQty),
          updatedAt: nowIso(),
        }
    data = upsertArticle(data, article)
    persist()
    if (existing) {
      showHome('Artikel je posodobljen.')
    } else {
      openQuantity(article.id)
    }
  })
}

function bindReset(): void {
  document.getElementById('btn-cancel-reset')?.addEventListener('click', () => showHome())
  document.getElementById('btn-confirm-reset')?.addEventListener('click', () => {
    data = resetQuantities(data, nowIso())
    persist()
    showHome('Količine so ponastavljene. Artikli so ostali.')
  })
}

async function downloadExport(): Promise<void> {
  const { buildWorkbook, exportFileName, workbookToArrayBuffer } = await import('./export.ts')
  const workbook = buildWorkbook(data.articles)
  const buffer = workbookToArrayBuffer(workbook)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName()
  a.click()
  URL.revokeObjectURL(url)
  showHome(`Datoteka ${exportFileName()} je pripravljena.`)
}

registerServiceWorker()
render()
