import './style.css'
import { articleMatches } from './search.ts'
import { applyQuantity, adjustEntered, parseCount, type QuantityMode } from './quantity.ts'
import { captureFrame, scanErrorMessage, startCameraPreview, startScan, type ScanHandle, type ScanResult } from './scan.ts'
import { pickPreferredScan } from './scanParse.ts'
import { pickBestOcrText, suggestFromOcr } from './ocrSuggest.ts'
import { applyOcrPrefill } from './ocrPrefill.ts'
import { rankArticlesWithoutEan, topMatches } from './linkMatch.ts'
import { captureViewCrop, cropDataUrl, downscaleDataUrl, TEXT_CROP } from './ocrCrop.ts'
import { formatOcrLabel } from './ocrNormalize.ts'
import type { ImportResult, ImportedItem } from './importSpreadsheet.ts'
import { STARTER_FILE_NAME, STARTER_ITEMS } from './starterCatalog.ts'
import { inferGroupFromName } from './group.ts'
import {
  escapeHtml,
  findByEan,
  findById,
  findBySifra,
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
import {
  addHistory,
  articlesToCsv,
  backupFileName,
  buildBackup,
  csvFileName,
  filterArticles,
  formatDelta,
  makeSnapshot,
  parseBackup,
  popisToArticles,
  totals,
  undoQuantity,
  type Backup,
  type HistoryEntry,
  type LocalExtras,
  type QuickFilter,
} from './features.ts'
import { loadExtras, saveExtras } from './localState.ts'
import { allPhotos, compressPhoto, deletePhoto, getPhoto, putPhoto } from './photos.ts'
import {
  applyPull,
  buildSetupLink,
  enqueueOp,
  DEFAULT_SYNC_URL,
  effectiveSyncUrl,
  isConfigured,
  matchLocalToRemote,
  opFromUpsert,
  opsAfterRemap,
  parseSetupLink,
  seedPendingFromLocal,
  syncStatusText,
  type SyncConfig,
} from './sync.ts'
import {
  autoSyncConfig,
  ensureSyncConfig,
  loadSyncConfig,
  saveSyncConfig,
  syncPing,
  syncPull,
  syncPush,
} from './syncClient.ts'

const APP_VERSION = '1.4.0'

type OcrStatus = 'idle' | 'running' | 'done' | 'error'

type Screen =
  | { kind: 'home' }
  | {
      kind: 'scan'
      mode: 'code' | 'text'
      error?: string
      ocrStatus?: OcrStatus
      ocrMessage?: string
      ocrText?: string
    }
  | { kind: 'quantity'; articleId: string; entered: string; mode: QuantityMode }
  | {
      kind: 'edit'
      article?: Article
      eanPrefill?: string
      sifraPrefill?: string
      imePrefill?: string
      frame?: string
      ocrStatus?: OcrStatus
      ocrMessage?: string
      /** Nova slika (še ne shranjena); '' = odstrani obstoječo. */
      photo?: string
    }
  | { kind: 'confirm-reset' }
  | { kind: 'confirm-delete'; articleId: string }
  | { kind: 'history'; message?: string }
  | { kind: 'confirm-restore'; backup: Backup }
  | { kind: 'import-preview'; result: ImportResult }
  | { kind: 'sync-settings'; message?: string }

let data: InventoryData = loadData()
let query = ''
let screen: Screen = { kind: 'home' }
let banner = ''
let scanHandle: ScanHandle | undefined
let linkQuery = ''
let linkQueryLocked = false
let syncConfig: SyncConfig | undefined = loadSyncConfig() ?? autoSyncConfig()
let extras: LocalExtras = loadExtras()
let quickFilter: QuickFilter = 'all'
let syncing = false
let syncError = ''
let syncTimer: ReturnType<typeof setInterval> | undefined
const app = document.querySelector('#app')

function persist(): void {
  saveData(data)
}

function persistExtras(): void {
  saveExtras(extras)
}

/** Zapiše spremembo količine v zgodovino (samo ta telefon) in si jo zapomni za Razveljavi. */
function recordQty(prev: Article | undefined, next: Article, kind: HistoryEntry['kind'] = 'qty'): void {
  const before = prev?.kolicina ?? 0
  if (kind !== 'delete' && before === next.kolicina) return
  const entry: HistoryEntry = {
    at: next.updatedAt,
    device: deviceLabel(),
    articleId: next.id,
    ime: next.ime || next.sifra || next.ean,
    before,
    after: next.kolicina,
    kind,
  }
  extras = {
    ...extras,
    history: addHistory(extras.history, entry),
    lastChange: kind === 'qty' ? { articleId: next.id, ime: entry.ime, before, after: next.kolicina, at: next.updatedAt } : undefined,
  }
  persistExtras()
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function deviceLabel(): string {
  return (syncConfig?.deviceName || syncConfig?.deviceId || 'Telefon').trim()
}

function syncErrorMessage(error?: string): string {
  if (error === 'google_login') {
    return 'Google zahteva prijavo. V namestitvi skripta mora biti dostop »Kdorkoli« (tudi brez Google računa), ne samo »Kdorkoli z Google Računom«.'
  }
  if (error === 'bad_pin') return 'Ključ skupne zaloge ni pravilen. Pod Napredno pusti PIN prazen (vgrajen ključ) ali vpiši pravega.'
  if (error === 'timeout') return 'Povezava je potekla. Poskusi znova.'
  if (error === 'network') return 'Povezava ni uspela. Preveri internet.'
  return 'Povezava ni uspela. Preveri PIN.'
}

function currentSyncStatus(): string {
  return syncStatusText({
    configured: isConfigured(syncConfig),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    syncing,
    error: syncError,
    lastSyncAt: syncConfig?.lastSyncAt,
  })
}

function updateSyncStatus(): void {
  const el = document.getElementById('sync-status')
  if (!el) return
  const text = currentSyncStatus()
  el.textContent = text
  el.hidden = !text
}

function queueMutation(prev: Article | undefined, next: Article, flush = true): void {
  if (!isConfigured(syncConfig) || !syncConfig) return
  const article = next.updatedBy ? next : { ...next, updatedBy: deviceLabel() }
  syncConfig = {
    ...syncConfig,
    pending: enqueueOp(syncConfig.pending, opFromUpsert(prev, article, article.updatedBy || deviceLabel())),
  }
  saveSyncConfig(syncConfig)
  if (flush) void flushSync()
}

function consumeSetupHash(): boolean {
  if (typeof location === 'undefined') return false
  const parsed = parseSetupLink(location.hash) || parseSetupLink(location.href)
  if (!parsed) return false
  history.replaceState(null, '', `${location.pathname}${location.search}`)
  syncConfig = ensureSyncConfig({
    url: parsed.url,
    pin: parsed.pin,
    deviceName: syncConfig?.deviceName,
  })
  return true
}

async function flushSync(): Promise<void> {
  if (!isConfigured(syncConfig) || !syncConfig || syncing) {
    updateSyncStatus()
    return
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    syncError = ''
    updateSyncStatus()
    return
  }
  syncing = true
  updateSyncStatus()
  const applyToUi = screen.kind === 'home' || screen.kind === 'sync-settings'
  const articlesBefore = applyToUi && screen.kind === 'home' ? JSON.stringify(data.articles) : ''
  let shouldFlushAgain = false
  try {
    const cfg = syncConfig
    const pulled = await syncPull(cfg)
    if (!pulled.ok || !pulled.articles) {
      syncError = pulled.error || 'pull'
      return
    }
    const remotes = pulled.articles
    const matched = matchLocalToRemote(data.articles, remotes)
    if (matched.remaps.length) {
      data = { ...data, articles: matched.local }
      const lokacija = { ...extras.lokacija }
      for (const r of matched.remaps) {
        if (lokacija[r.from] !== undefined) {
          lokacija[r.to] = lokacija[r.from]!
          delete lokacija[r.from]
        }
        void getPhoto(r.from).then((photo) => {
          if (photo) void putPhoto(r.to, photo).then(() => deletePhoto(r.from))
        })
      }
      extras = { ...extras, lokacija }
      persistExtras()
    }
    const latest = syncConfig
    let pending = opsAfterRemap(latest.pending, matched.remaps)
    pending = seedPendingFromLocal(data.articles, remotes, pending, deviceLabel())
    syncConfig = { ...latest, pending }
    saveSyncConfig(syncConfig)
    if (applyToUi) {
      data = { ...data, articles: applyPull(data.articles, remotes, pending) }
      persist()
    }
    if (pending.length) {
      if (!applyToUi) return
      const pushed = await syncPush({ ...syncConfig, pending }, pending)
      if (!pushed.ok || !pushed.articles) {
        syncError = pushed.error || 'push'
        return
      }
      const arrived = opsAfterRemap(syncConfig.pending, matched.remaps)
      // keep ops that were enqueued during the push
      const leftover = arrived.filter((op) => !pending.some((p) => p.id === op.id && p.updatedAt === op.updatedAt && p.qtyDelta === op.qtyDelta))
      data = { ...data, articles: applyPull(data.articles, pushed.articles, leftover) }
      persist()
      pending = leftover
    }
    const now = nowIso()
    syncConfig = { ...syncConfig, pending, lastSyncAt: now }
    saveSyncConfig(syncConfig)
    syncError = ''
    if (data.sync?.lastSyncAt !== now) {
      data = { ...data, sync: { ...(data.sync ?? {}), lastSyncAt: now } }
      persist()
    }
    shouldFlushAgain = pending.length > 0
  } catch {
    syncError = 'network'
  } finally {
    syncing = false
    updateSyncStatus()
    if (applyToUi && screen.kind === 'home' && JSON.stringify(data.articles) !== articlesBefore) render()
    if (shouldFlushAgain) void flushSync()
  }
}

function startSyncLoop(): void {
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    void flushSync()
  }, 30000)
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
    app.innerHTML = renderHome() + renderScan(screen)
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
    app.innerHTML = renderHome() + renderEdit(screen)
    bindHome()
    bindEdit()
    return
  }
  if (screen.kind === 'import-preview') {
    app.innerHTML = renderHome() + renderImportPreview(screen.result)
    bindHome()
    bindImportPreview()
    return
  }
  if (screen.kind === 'sync-settings') {
    app.innerHTML = renderHome() + renderSyncSettings(screen.message)
    bindHome()
    bindSyncSettings()
    return
  }
  if (screen.kind === 'confirm-delete') {
    const article = findById(data, screen.articleId)
    if (!article) {
      showHome()
      return
    }
    app.innerHTML = renderHome() + renderDeleteConfirm(article)
    bindHome()
    bindDelete(article)
    return
  }
  if (screen.kind === 'history') {
    app.innerHTML = renderHome() + renderHistory(screen.message)
    bindHome()
    bindHistory()
    return
  }
  if (screen.kind === 'confirm-restore') {
    app.innerHTML = renderHome() + renderRestoreConfirm(screen.backup)
    bindHome()
    bindRestore(screen.backup)
    return
  }
  app.innerHTML = renderHome() + renderResetConfirm()
  bindHome()
  bindReset()
}

function liveArticles(): Article[] {
  return data.articles.filter((a) => !a.deleted)
}

function visibleArticles(): Article[] {
  return filterArticles(data.articles, query, quickFilter)
}

function emptyListText(): string {
  if (liveArticles().length === 0) {
    return firstSyncPending()
      ? 'Nalagam skupno zalogo…'
      : 'Ni artiklov. Naloži seznam žarnic, skeniraj škatlo ali dodaj artikel ročno.'
  }
  if (quickFilter === 'zero') return 'Ni artiklov z 0 kos.'
  if (quickFilter === 'recent') return 'V zadnjih 24 urah ni sprememb.'
  return 'Nisem našel artikla s tem iskanjem.'
}

/** Novi telefon: dokler prvič ne potegne skupne zaloge, ne ponujaj začetnega seznama (podvajanje). */
function firstSyncPending(): boolean {
  return isConfigured(syncConfig) && !syncConfig?.lastSyncAt && !syncError
}

function artiklov(n: number): string {
  const m = n % 100
  if (m === 1) return `${n} artikel`
  if (m === 2) return `${n} artikla`
  if (m === 3 || m === 4) return `${n} artikli`
  return `${n} artiklov`
}

function renderTotalsLine(): string {
  const all = totals(data.articles)
  const shown = visibleArticles()
  const part = totals(shown)
  const filtered = query.trim() || quickFilter !== 'all'
  return filtered
    ? `Prikazano ${part.count} od ${artiklov(all.count)} · ${part.pcs} kos (skupaj ${all.pcs} kos)`
    : `${artiklov(all.count)} · skupaj ${all.pcs} kos`
}

function renderListHtml(): string {
  const list = visibleArticles()
  return list.length ? list.map((a) => renderArticleCard(a)).join('') : `<p class="empty">${escapeHtml(emptyListText())}</p>`
}

function renderUndoBar(): string {
  const c = extras.lastChange
  if (!c) return ''
  const article = findById(data, c.articleId)
  if (!article || article.deleted) return ''
  return `<div class="undo-bar">
      <span>Zadnje: <b>${escapeHtml(c.ime)}</b> ${c.before} → ${c.after} kos</span>
      <button type="button" class="btn" id="btn-undo">Razveljavi</button>
    </div>`
}


function renderArticleCard(a: Article): string {
  const skupina = a.skupina ? `${escapeHtml(a.skupina)} · ` : ''
  return `<article class="card" data-id="${escapeHtml(a.id)}">
            <div class="card-main" data-action="edit">
              <h2>${escapeHtml(a.ime || '(brez imena)')}</h2>
              <div class="meta">${skupina}${escapeHtml(a.sifra || 'brez šifre')}${a.ean ? ` · EAN ${escapeHtml(a.ean)}` : ''}</div>
              ${extras.lokacija[a.id] ? `<div class="meta">📍 ${escapeHtml(extras.lokacija[a.id]!)}</div>` : ''}
              <div class="meta">spremenjeno ${escapeHtml(formatDateTime(a.updatedAt))}</div>
              <button type="button" class="edit-link" data-action="edit">Uredi</button>
            </div>
            <button type="button" class="qty" data-action="qty" aria-label="Spremeni količino">
              <b>${a.kolicina}</b><span>kos</span>
            </button>
          </article>`
}

function renderHome(): string {
  const cards = renderListHtml()
  const chip = (f: QuickFilter, label: string) =>
    `<button type="button" class="chip" data-filter="${f}" aria-pressed="${quickFilter === f}">${label}</button>`

  const notice = banner ? `<p class="flash ok">${escapeHtml(banner)}</p>` : ''

  return `<header class="app-head">
      <img src="${import.meta.env.BASE_URL}icon-192.png" alt="" width="48" height="48" />
      <div>
        <h1>Popis žarnic</h1>
        <p class="sub totals" id="totals">${escapeHtml(renderTotalsLine())}</p>
        <p class="sub">v${APP_VERSION}</p>
        <p class="sync-status" id="sync-status"${currentSyncStatus() ? '' : ' hidden'}>${escapeHtml(currentSyncStatus())}</p>
      </div>
    </header>
    ${notice}
    ${renderUndoBar()}
    <div class="stack">
      <input class="search" id="search" type="search" placeholder="Išči po imenu, šifri ali EAN" value="${escapeHtml(query)}" />
      <div class="chips" role="group" aria-label="Hitri filter">
        ${chip('all', 'Vse')}${chip('zero', 'Brez zaloge')}${chip('recent', 'Nedavno')}
      </div>
      <button type="button" class="btn btn-primary" id="btn-scan">Skeniraj</button>
      <button type="button" class="btn" id="btn-new">Nov artikel</button>
      ${
        liveArticles().length === 0 && !firstSyncPending()
          ? `<button type="button" class="btn btn-primary" id="btn-starter">Naloži seznam žarnic (81)</button>`
          : ''
      }
      <div class="row-actions">
        <button type="button" class="btn" id="btn-export">Izvozi v Excel</button>
        <button type="button" class="btn" id="btn-export-csv">Izvozi CSV</button>
      </div>
      <div class="row-actions">
        <button type="button" class="btn" id="btn-history">Zgodovina in popisi</button>
        <button type="button" class="btn" id="btn-import">Uvozi Excel</button>
      </div>
      <div class="row-actions">
        <button type="button" class="btn" id="btn-backup">Shrani kopijo</button>
        <button type="button" class="btn" id="btn-restore">Obnovi kopijo</button>
      </div>
      <input id="file-restore" type="file" accept=".json,application/json" hidden />
      <input id="file-import" type="file" accept=".xlsx,.xls,.xlt,.ods,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet,text/csv" hidden />
      <div class="row-actions">
        <button type="button" class="btn" id="btn-sync">Skupna zaloga</button>
        <button type="button" class="btn btn-danger" id="btn-reset">Nov popis</button>
      </div>
    </div>
    <div class="list">${cards}</div>`
}

function renderScan(state: Extract<Screen, { kind: 'scan' }>): string {
  const textMode = state.mode === 'text'
  const ocrBusy = state.ocrStatus === 'running'
  const matches =
    textMode && state.ocrText
      ? topMatches(liveArticles(), formatOcrLabel(state.ocrText) || state.ocrText, 5)
      : []
  const matchButtons = matches
    .map(
      (row) => `<button type="button" class="btn btn-primary scan-match" data-text-id="${escapeHtml(row.article.id)}">
        ${escapeHtml(row.article.ime)}${row.article.skupina ? ` · ${escapeHtml(row.article.skupina)}` : ''} · ${row.article.kolicina} kos
      </button>`,
    )
    .join('')
  const ocrNote = state.ocrMessage
    ? `<p class="flash ${state.ocrStatus === 'error' ? '' : 'ok'}">${escapeHtml(state.ocrMessage)}</p>`
    : ''
  const newFromOcr =
    textMode && state.ocrStatus === 'done'
      ? `<button type="button" class="btn" id="btn-text-new">Nič od tega / nov artikel</button>`
      : ''
  const actions = textMode
    ? `<button type="button" class="btn btn-primary" id="btn-read-text" ${ocrBusy ? 'disabled' : ''}>${
        ocrBusy ? 'Berem napis…' : 'Preberi'
      }</button>
        ${matchButtons}
        ${newFromOcr}
        <button type="button" class="btn" id="btn-scan-code">Nazaj na kodo</button>
        <button type="button" class="btn btn-ghost" id="btn-cancel-scan">Prekliči</button>`
    : `<button type="button" class="btn btn-primary" id="btn-scan-text">Samo tekst</button>
        <button type="button" class="btn" id="btn-cancel-scan">Prekliči</button>`
  return `<div class="overlay" id="scan-overlay">
    <div class="sheet">
      <h2>${textMode ? 'Samo tekst' : 'Skeniraj kodo'}</h2>
      <p class="hint">${
        textMode
          ? 'Približaj na 10-20 cm, dobra svetloba. Napis naj bo v rumenem okvirju, nato pritisni Preberi.'
          : 'Usmeri kamero na črtno kodo ali QR na škatli. Če kode ni, pritisni Samo tekst.'
      }</p>
      <div class="scan-wrap${textMode ? ' scan-wrap-text' : ''}">
        <video id="scan-video" playsinline muted autoplay></video>
        ${textMode ? '<div class="scan-crop" aria-hidden="true"></div>' : ''}
        <div class="scan-hint">${textMode ? 'Napis v okvirju' : 'Drži kodo v sredini slike'}</div>
      </div>
      ${state.error ? `<p class="flash">${escapeHtml(state.error)}</p>` : ''}
      ${ocrNote}
      <div class="stack" style="margin-top:12px">
        ${actions}
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

function renderEdit(state: Extract<Screen, { kind: 'edit' }>): string {
  const article = state.article
  const isNew = !article
  const imeValue = article?.ime ?? state.imePrefill ?? ''
  const sifraValue = article?.sifra ?? state.sifraPrefill ?? ''
  const eanValue = article?.ean ?? state.eanPrefill ?? ''
  const showOcr = isNew && Boolean(state.frame)
  const ocrBusy = state.ocrStatus === 'running'
  const ocrBtn = showOcr
    ? `<button type="button" class="btn" id="btn-ocr" ${ocrBusy ? 'disabled' : ''}>${
        ocrBusy ? 'Berem napis…' : 'Preberi napis'
      }</button>`
    : ''
  const ocrNote = state.ocrMessage
    ? `<p class="flash ${state.ocrStatus === 'error' ? '' : 'ok'}" id="ocr-note">${escapeHtml(state.ocrMessage)}</p>`
    : ''
  return `<div class="overlay">
    <div class="sheet">
      <h2>${isNew ? 'Nov artikel' : 'Uredi artikel'}</h2>
      ${ocrNote}
      <form id="edit-form">
        <label for="f-ime">Ime</label>
        <input id="f-ime" name="ime" type="text" required value="${escapeHtml(imeValue)}" />
        <label for="f-kolicina">${isNew ? 'Začetna količina' : 'Količina'}</label>
        <div class="qty-edit">
          <button type="button" class="btn" data-edit-delta="-1" aria-label="Manj">−</button>
          <input id="f-kolicina" name="kolicina" type="text" inputmode="numeric" value="${article?.kolicina ?? 0}" />
          <button type="button" class="btn" data-edit-delta="1" aria-label="Več">+</button>
        </div>
        <label for="f-sifra">Šifra</label>
        <input id="f-sifra" name="sifra" type="text" value="${escapeHtml(sifraValue)}" />
        <label for="f-ean">Koda (EAN / QR)</label>
        <input id="f-ean" name="ean" type="text" inputmode="numeric" value="${escapeHtml(eanValue)}" />
        <label for="f-lokacija">Lokacija <span class="meta">(samo na tem telefonu)</span></label>
        <input id="f-lokacija" name="lokacija" type="text" placeholder="npr. klet, polica 2" value="${escapeHtml((article && extras.lokacija[article.id]) || '')}" />
        <label for="f-skupina">Skupina</label>
        <input id="f-skupina" name="skupina" type="text" value="${escapeHtml(article?.skupina ?? '')}" />
        <label for="f-opomba">Opomba</label>
        <textarea id="f-opomba" name="opomba">${escapeHtml(article?.opomba ?? '')}</textarea>
        <label>Slika <span class="meta">(samo na tem telefonu)</span></label>
        <div class="photo-box">
          <img id="edit-photo" alt="Slika artikla" ${state.photo ? `src="${escapeHtml(state.photo)}"` : 'hidden'} />
          <div class="row-actions">
            <button type="button" class="btn" id="btn-photo-camera">Slikaj</button>
            <button type="button" class="btn" id="btn-photo-gallery">Iz galerije</button>
          </div>
          <button type="button" class="btn btn-ghost" id="btn-photo-remove" ${state.photo ? '' : 'hidden'}>Odstrani sliko</button>
          <input id="f-photo-camera" type="file" accept="image/*" capture="environment" hidden />
          <input id="f-photo-gallery" type="file" accept="image/*" hidden />
        </div>
        ${isNew && (eanValue || sifraValue || linkQuery) ? renderLinkBox(eanValue) : ''}
        <div class="stack" style="margin-top:16px">
          ${ocrBtn}
          <button type="submit" class="btn btn-primary">${isNew ? 'Dodaj nov artikel' : 'Shrani'}</button>
          <button type="button" class="btn btn-ghost" id="btn-cancel-edit">Prekliči</button>
          ${isNew ? '' : '<button type="button" class="btn btn-danger" id="btn-delete">Izbriši</button>'}
        </div>
      </form>
    </div>
  </div>`
}

function renderLinkItems(): string {
  const candidates = rankArticlesWithoutEan(data.articles, linkQuery)
    .filter((row) => !linkQuery.trim() || row.score > 0 || articleMatches(linkQuery, row.article))
    .slice(0, 20)
  if (!candidates.length) {
    return `<p class="empty">Ni artiklov brez EAN, ki bi ustrezali iskanju.</p>`
  }
  return candidates
    .map((row) => {
      const a = row.article
      return `<button type="button" class="link-item" data-link-id="${escapeHtml(a.id)}">
        <span><b>${escapeHtml(a.ime)}</b><br /><span class="meta">${escapeHtml(a.skupina || a.sifra || 'brez šifre')} · ${a.kolicina} kos</span></span>
        <span class="link-action">Poveži</span>
      </button>`
    })
    .join('')
}

function renderLinkBox(eanValue: string): string {
  if (!data.articles.some((a) => !a.ean.trim())) return ''
  return `<div class="link-box" id="link-box">
        <h3>Poveži z obstoječim artiklom</h3>
        <p class="hint">Če je to artikel, ki ga že imaš brez kode, ga izberi. Koda ${escapeHtml(eanValue)} se shrani nanj. Ali pa spodaj dodaš nov artikel.</p>
        <input class="search" id="link-search" type="search" placeholder="Išči artikel brez EAN" value="${escapeHtml(linkQuery)}" />
        <div class="link-list" id="link-list">${renderLinkItems()}</div>
      </div>`
}

function renderImportPreview(result: ImportResult): string {
  const dup = result.duplicates.length
    ? `<p class="flash">Možno podvajanje (nisem združil): ${escapeHtml(result.duplicates.join(', '))}</p>`
    : ''
  const existing = data.articles.length
    ? `<p class="hint">Na telefonu je že ${data.articles.length} artiklov.</p>
        <button type="button" class="btn btn-primary" id="btn-import-add">Dodaj k obstoječim</button>
        <button type="button" class="btn btn-danger" id="btn-import-replace">Zamenjaj seznam</button>`
    : `<button type="button" class="btn btn-primary" id="btn-import-add">Uvozi ${result.items.length} artiklov</button>`
  return `<div class="overlay">
    <div class="sheet">
      <h2>Uvoz</h2>
      <p>Našel sem <b>${result.items.length}</b> artiklov, skupaj <b>${result.total}</b> kos${result.fileName ? ` v datoteki ${escapeHtml(result.fileName)}` : ''}.</p>
      ${dup}
      ${existing}
      <div class="stack" style="margin-top:12px">
        <button type="button" class="btn btn-ghost" id="btn-import-cancel">Prekliči</button>
      </div>
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
    if (list) list.innerHTML = renderListHtml()
    const tot = document.getElementById('totals')
    if (tot) tot.textContent = renderTotalsLine()
    bindCards()
  })
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      quickFilter = (btn.dataset.filter as QuickFilter) || 'all'
      if (screen.kind === 'home') render()
      else {
        const list = document.querySelector('.list')
        if (list) list.innerHTML = renderListHtml()
        bindCards()
      }
    })
  })
  document.getElementById('btn-undo')?.addEventListener('click', () => undoLastChange())
  document.getElementById('btn-export-csv')?.addEventListener('click', () => downloadCsv())
  document.getElementById('btn-history')?.addEventListener('click', () => {
    screen = { kind: 'history' }
    render()
  })
  document.getElementById('btn-backup')?.addEventListener('click', () => {
    void downloadBackup()
  })
  document.getElementById('btn-restore')?.addEventListener('click', () => {
    document.getElementById('file-restore')?.click()
  })
  document.getElementById('file-restore')?.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) void readBackupFile(file)
  })
  document.getElementById('btn-scan')?.addEventListener('click', () => {
    void openScan()
  })
  document.getElementById('btn-new')?.addEventListener('click', () => {
    linkQuery = ''
    linkQueryLocked = false
    screen = { kind: 'edit' }
    render()
  })
  document.getElementById('btn-export')?.addEventListener('click', () => {
    void downloadExport()
  })
  document.getElementById('btn-import')?.addEventListener('click', () => {
    document.getElementById('file-import')?.click()
  })
  document.getElementById('file-import')?.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) void importFromFile(file)
  })
  document.getElementById('btn-starter')?.addEventListener('click', () => {
    loadStarterCatalog()
  })
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    screen = { kind: 'confirm-reset' }
    render()
  })
  document.getElementById('btn-sync')?.addEventListener('click', () => {
    screen = { kind: 'sync-settings' }
    render()
  })
  bindCards()
}

function renderSyncSettings(message?: string): string {
  const url = effectiveSyncUrl(syncConfig)
  const customPin = syncConfig?.pin ?? ''
  const name = syncConfig?.deviceName ?? ''
  const localOnly = Boolean(syncConfig?.localOnly)
  const base = `${location.origin}${import.meta.env.BASE_URL}`
  const setup = customPin && syncConfig ? buildSetupLink(base, effectiveSyncUrl(syncConfig), customPin) : ''
  const flash = message
    ? `<p class="flash${syncError ? '' : ' ok'}">${escapeHtml(message)}</p>`
    : ''
  const state = localOnly
    ? 'Skupna zaloga je izklopljena. Seznam je samo na tem telefonu.'
    : `Skupna zaloga je vklopljena samodejno. ${escapeHtml(currentSyncStatus())}`
  return `<div class="overlay" id="sync-overlay">
    <div class="sheet">
      <h2>Skupna zaloga</h2>
      <p class="hint">${state}</p>
      ${flash}
      <form id="sync-form" class="stack">
        <label class="field">Ime tega telefona (neobvezno)
          <input class="search" id="sync-name" name="deviceName" autocomplete="off" value="${escapeHtml(name)}" placeholder="npr. Telefon Mojca" />
        </label>
        <button type="submit" class="btn btn-primary">Shrani</button>
        ${
          localOnly
            ? '<button type="button" class="btn" id="btn-sync-on">Vklopi skupno zalogo</button>'
            : '<button type="button" class="btn" id="btn-sync-test">Preizkusi povezavo</button>\n        <button type="button" class="btn btn-danger" id="btn-sync-off">Samo na tem telefonu</button>'
        }
        <button type="button" class="btn btn-ghost" id="btn-sync-close">Zapri</button>
        <details class="advanced" id="sync-advanced">
          <summary>Napredno</summary>
          <p class="hint">Pusti prazno za vgrajen ključ.</p>
          <label class="field">PIN (neobvezno)
            <input class="search" id="sync-pin" name="pin" type="password" inputmode="numeric" autocomplete="off" value="${escapeHtml(customPin)}" />
          </label>
          <label class="field">Naslov spletne aplikacije
            <input class="search" id="sync-url" name="url" type="url" inputmode="url" autocomplete="off" value="${escapeHtml(url)}" placeholder="${escapeHtml(DEFAULT_SYNC_URL)}" />
          </label>
          <label class="field">Ali prilepi povezavo za nastavitev
            <input class="search" id="sync-link" type="text" autocomplete="off" placeholder="#setup?url=…&amp;pin=…" />
          </label>
          ${
            setup
              ? `<p class="hint">Povezava za drugi telefon (vsebuje PIN):</p>
          <textarea class="search setup-link" id="sync-setup-link" readonly rows="3">${escapeHtml(setup)}</textarea>
          <button type="button" class="btn" id="btn-copy-setup">Kopiraj povezavo</button>`
              : ''
          }
        </details>
      </form>
    </div>
  </div>`
}

function bindSyncSettings(): void {
  const readForm = (): { url: string; pin: string; deviceName: string } => {
    const link = (document.getElementById('sync-link') as HTMLInputElement | null)?.value ?? ''
    const fromLink = parseSetupLink(link)
    const url =
      fromLink?.url ||
      (document.getElementById('sync-url') as HTMLInputElement | null)?.value.trim() ||
      DEFAULT_SYNC_URL
    const pin = fromLink?.pin || (document.getElementById('sync-pin') as HTMLInputElement | null)?.value.trim() || ''
    const deviceName = (document.getElementById('sync-name') as HTMLInputElement | null)?.value.trim() || ''
    return { url, pin, deviceName }
  }
  const connect = (localOnly: boolean, okMessage: string) => {
    const { url, pin, deviceName } = readForm()
    syncConfig = ensureSyncConfig({ url, pin, deviceName, localOnly })
    syncError = ''
    if (localOnly || !isConfigured(syncConfig)) {
      screen = {
        kind: 'sync-settings',
        message: localOnly ? okMessage : 'Ključ ni vgrajen. Pod Napredno vpiši PIN.',
      }
      render()
      return
    }
    screen = { kind: 'sync-settings', message: 'Shranjeno. Povezujem…' }
    render()
    void flushSync().then(() => {
      screen = {
        kind: 'sync-settings',
        message: syncError ? syncErrorMessage(syncError) : okMessage,
      }
      render()
    })
  }
  document.getElementById('btn-sync-close')?.addEventListener('click', () => showHome())
  document.getElementById('sync-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault()
    connect(Boolean(syncConfig?.localOnly), 'Shranjeno.')
  })
  document.getElementById('btn-sync-on')?.addEventListener('click', () => connect(false, 'Povezano. Spremembe se usklajujejo z listom.'))
  document.getElementById('btn-sync-off')?.addEventListener('click', () => {
    connect(true, 'Skupna zaloga je izklopljena. Seznam ostane na tem telefonu.')
  })
  document.getElementById('btn-sync-test')?.addEventListener('click', () => {
    const { url, pin, deviceName } = readForm()
    const trial = { ...ensureSyncConfigPreview(url, pin, deviceName) }
    void syncPing(trial)
      .then((res) => {
        screen = {
          kind: 'sync-settings',
          message: res.ok ? 'Povezava deluje.' : syncErrorMessage(res.error),
        }
        if (!res.ok) syncError = res.error || 'ping'
        else syncError = ''
        render()
      })
      .catch(() => {
        syncError = 'network'
        screen = { kind: 'sync-settings', message: syncErrorMessage('network') }
        render()
      })
  })
  document.getElementById('btn-copy-setup')?.addEventListener('click', () => {
    const text = (document.getElementById('sync-setup-link') as HTMLTextAreaElement | null)?.value ?? ''
    if (!text) return
    void navigator.clipboard.writeText(text).then(
      () => {
        screen = { kind: 'sync-settings', message: 'Povezava je kopirana.' }
        render()
      },
      () => {
        screen = { kind: 'sync-settings', message: 'Povezave nisem mogel kopirati. Označi jo in kopiraj ročno.' }
        render()
      },
    )
  })
}

/** Preizkus brez shranjevanja (ne prepiše nastavitev). */
function ensureSyncConfigPreview(url: string, pin: string, deviceName: string): SyncConfig {
  return {
    url,
    pin,
    deviceId: syncConfig?.deviceId || 'preizkus',
    deviceName: deviceName || syncConfig?.deviceName || '',
    pending: [],
  }
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

async function openScan(mode: 'code' | 'text' = 'code'): Promise<void> {
  await stopScan()
  screen = { kind: 'scan', mode }
  render()
}

async function startScanForScreen(): Promise<void> {
  const video = document.getElementById('scan-video')
  if (!(video instanceof HTMLVideoElement) || screen.kind !== 'scan') return
  const mode = screen.mode
  try {
    const handle = mode === 'text' ? await startCameraPreview(video) : await startScan(video, (result) => {
      void onScanned(result)
    })
    if (screen.kind === 'scan' && screen.mode === mode) scanHandle = handle
    else await handle.stop()
  } catch (err: unknown) {
    if (screen.kind !== 'scan' || screen.mode !== mode) return
    screen = { ...screen, error: scanErrorMessage(err) }
    render()
  }
}

function bindScan(): void {
  document.getElementById('btn-cancel-scan')?.addEventListener('click', () => {
    void stopScan().then(() => showHome())
  })
  document.getElementById('btn-scan-text')?.addEventListener('click', () => {
    void openScan('text')
  })
  document.getElementById('btn-scan-code')?.addEventListener('click', () => {
    void openScan('code')
  })
  document.getElementById('btn-read-text')?.addEventListener('click', () => {
    void runTextOcr()
  })
  document.getElementById('btn-text-new')?.addEventListener('click', () => {
    if (screen.kind !== 'scan') return
    const raw = screen.ocrText || ''
    const sug = suggestFromOcr(raw)
    const label = [sug.sifra, sug.ime].filter(Boolean).join(' · ') || formatOcrLabel(raw)
    void stopScan().then(() => {
      linkQuery = [sug.sifra, sug.ime].filter(Boolean).join(' ')
      linkQueryLocked = false
      screen = {
        kind: 'edit',
        imePrefill: sug.ime || label,
        sifraPrefill: sug.sifra,
      }
      render()
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-text-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.textId
      if (!id) return
      void stopScan().then(() => openQuantity(id))
    })
  })
  void startScanForScreen()
}

async function onScanned(result: ScanResult): Promise<void> {
  await stopScan()
  const parsed = pickPreferredScan(result.hits)
  const ean = normalizeEan(parsed.ean || (!parsed.sifra ? parsed.raw : ''))
  const found =
    (parsed.ean && findByEan(data, parsed.ean)) ||
    (parsed.sifra && findBySifra(data, parsed.sifra)) ||
    (ean && findByEan(data, ean))
  if (found) {
    banner = ''
    openQuantity(found.id)
    return
  }
  linkQuery = [parsed.sifra, parsed.raw, ean].filter(Boolean).join(' ')
  linkQueryLocked = false
  screen = {
    kind: 'edit',
    eanPrefill: ean,
    sifraPrefill: parsed.sifra,
    frame: result.frame,
    ocrStatus: result.frame ? 'idle' : undefined,
  }
  render()
  if (result.frame) void runOcr()
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
      updatedBy: deviceLabel(),
    }
    data = upsertArticle(data, next)
    persist()
    recordQty(article, next)
    queueMutation(article, next)
    showHome(`Shranjeno: ${next.ime || next.sifra || next.ean} = ${next.kolicina} kos`)
  })
}

async function runOcr(): Promise<void> {
  if (screen.kind !== 'edit' || !screen.frame) return
  const frame = screen.frame
  const previousSifra = screen.sifraPrefill ?? ''
  screen = { ...screen, ocrStatus: 'running', ocrMessage: 'Berem napis…' }
  render()
  try {
    const { recognizeLabel } = await import('./ocr.ts')
    const sources: string[] = []
    const cropped = await cropDataUrl(frame)
    if (cropped) sources.push(cropped)
    const small = await downscaleDataUrl(frame, 1000)
    if (small) sources.push(small)
    if (!sources.length) sources.push(frame)
    const texts: string[] = []
    for (const src of sources) texts.push(await recognizeLabel(src))
    const text = pickBestOcrText(texts)
    if (screen.kind !== 'edit' || screen.frame !== frame) return
    const applied = applyOcrPrefill({
      previousSifra,
      previousEan: screen.eanPrefill ?? '',
      sug: suggestFromOcr(text),
    })
    if (!linkQueryLocked && applied.linkBits.trim()) linkQuery = applied.linkBits
    screen = {
      ...screen,
      sifraPrefill: applied.sifra,
      eanPrefill: applied.ean || screen.eanPrefill,
      imePrefill: applied.ime || screen.imePrefill,
      ocrStatus: 'done',
      ocrMessage: applied.message,
    }
    render()
  } catch {
    if (screen.kind !== 'edit' || screen.frame !== frame) return
    screen = {
      ...screen,
      ocrStatus: 'error',
      ocrMessage: 'Branje napisa ni uspelo. Poskusi znova ali vpiši ročno.',
    }
    render()
  }
}

async function runTextOcr(): Promise<void> {
  if (screen.kind !== 'scan' || screen.mode !== 'text') return
  const video = document.getElementById('scan-video')
  if (!(video instanceof HTMLVideoElement)) return
  const frame = captureViewCrop(video, TEXT_CROP)
  if (!frame) {
    screen = { ...screen, ocrStatus: 'error', ocrMessage: 'Slike nisem ujel. Poskusi znova.' }
    render()
    return
  }
  screen = { ...screen, ocrStatus: 'running', ocrMessage: 'Berem napis…', error: undefined }
  render()
  try {
    const { recognizeLabel } = await import('./ocr.ts')
    const sources: string[] = [frame]
    const full = captureFrame(video)
    if (full) {
      const small = await downscaleDataUrl(full, 1000)
      if (small) sources.push(small)
    }
    const texts: string[] = []
    for (const src of sources) texts.push(await recognizeLabel(src))
    const text = pickBestOcrText(texts)
    if (screen.kind !== 'scan' || screen.mode !== 'text') return
    const sug = suggestFromOcr(text)
    const label = [sug.sifra, sug.ime].filter(Boolean).join(' · ') || formatOcrLabel(text)
    const query = [sug.sifra, sug.ime].filter(Boolean).join(' ') || label
    const matches = topMatches(liveArticles(), query, 5)
    screen = {
      ...screen,
      ocrStatus: 'done',
      ocrText: text,
      ocrMessage: text
        ? matches.length
          ? `Prebral sem: ${label}. Izberi artikel ali dodaj novega.`
          : `Prebral sem: ${label}. Nisem našel podobnega artikla.`
        : 'Nisem prebral napisa. Približaj na 10-20 cm in poskusi znova.',
    }
    render()
  } catch {
    if (screen.kind !== 'scan' || screen.mode !== 'text') return
    screen = { ...screen, ocrStatus: 'error', ocrMessage: 'Branje napisa ni uspelo. Poskusi znova ali vpiši ročno.' }
    render()
  }
}

function setEditPhoto(photo: string): void {
  if (screen.kind !== 'edit') return
  screen = { ...screen, photo }
  const img = document.getElementById('edit-photo') as HTMLImageElement | null
  const remove = document.getElementById('btn-photo-remove')
  if (img) {
    if (photo) img.src = photo
    else img.removeAttribute('src')
    img.hidden = !photo
  }
  if (remove) remove.hidden = !photo
}

function bindEdit(): void {
  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => showHome())
  document.querySelectorAll<HTMLButtonElement>('[data-edit-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('f-kolicina') as HTMLInputElement | null
      if (!input) return
      const current = parseCount(input.value) ?? 0
      input.value = String(Math.max(0, current + Number(btn.dataset.editDelta)))
    })
  })
  const pick = (inputId: string) => {
    const input = document.getElementById(inputId) as HTMLInputElement | null
    input?.addEventListener('change', () => {
      const file = input.files?.[0]
      input.value = ''
      if (!file) return
      void compressPhoto(file).then(
        (photo) => setEditPhoto(photo),
        () => {
          const note = document.getElementById('ocr-note')
          if (note) note.textContent = 'Slike nisem mogel prebrati.'
        },
      )
    })
  }
  pick('f-photo-camera')
  pick('f-photo-gallery')
  document.getElementById('btn-photo-camera')?.addEventListener('click', () => document.getElementById('f-photo-camera')?.click())
  document.getElementById('btn-photo-gallery')?.addEventListener('click', () => document.getElementById('f-photo-gallery')?.click())
  document.getElementById('btn-photo-remove')?.addEventListener('click', () => setEditPhoto(''))
  if (screen.kind === 'edit' && screen.article && screen.photo === undefined) {
    const id = screen.article.id
    void getPhoto(id).then((photo) => {
      if (photo && screen.kind === 'edit' && screen.article?.id === id && screen.photo === undefined) {
        setEditPhoto(photo)
        if (screen.kind === 'edit') screen = { ...screen, photo: undefined }
        const img = document.getElementById('edit-photo') as HTMLImageElement | null
        if (img) img.dataset.stored = '1'
      }
    })
  }
  document.getElementById('btn-delete')?.addEventListener('click', () => {
    if (screen.kind !== 'edit' || !screen.article) return
    screen = { kind: 'confirm-delete', articleId: screen.article.id }
    render()
  })
  document.getElementById('btn-ocr')?.addEventListener('click', () => {
    void runOcr()
  })
  document.getElementById('link-search')?.addEventListener('input', (e) => {
    linkQuery = (e.target as HTMLInputElement).value
    linkQueryLocked = true
    const list = document.getElementById('link-list')
    if (list) list.innerHTML = renderLinkItems()
    bindLinkItems()
  })
  bindLinkItems()
  document.getElementById('edit-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const form = ev.target as HTMLFormElement
    const fd = new FormData(form)
    const ime = String(fd.get('ime') ?? '').trim()
    const sifra = String(fd.get('sifra') ?? '').trim()
    const ean = normalizeEan(String(fd.get('ean') ?? ''))
    const opomba = String(fd.get('opomba') ?? '').trim()
    const skupina = String(fd.get('skupina') ?? '').trim() || inferGroupFromName(ime)
    if (!ime && !sifra && !ean) return
    if (screen.kind !== 'edit') return
    const existing = screen.article ? (findById(data, screen.article.id) ?? screen.article) : undefined
    const photo = screen.photo
    const lokacija = String(fd.get('lokacija') ?? '').trim()
    const startQty = parseCount(String(fd.get('kolicina') ?? '0')) ?? 0
    const article: Article = existing
      ? { ...existing, ime, sifra, ean, opomba, skupina, kolicina: Math.max(0, startQty), updatedAt: nowIso(), updatedBy: deviceLabel() }
      : {
          id: uid(),
          ime,
          sifra,
          ean,
          opomba,
          skupina,
          kolicina: Math.max(0, startQty),
          updatedAt: nowIso(),
          updatedBy: deviceLabel(),
        }
    data = upsertArticle(data, article)
    persist()
    const lok = { ...extras.lokacija }
    if (lokacija) lok[article.id] = lokacija
    else delete lok[article.id]
    extras = { ...extras, lokacija: lok }
    persistExtras()
    recordQty(existing, article)
    if (photo === '') void deletePhoto(article.id)
    else if (photo) void putPhoto(article.id, photo)
    queueMutation(existing, article)
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
    const prevArticles = data.articles
    const now = nowIso()
    data = resetQuantities(data, now)
    data = {
      ...data,
      articles: data.articles.map((a) =>
        a.updatedAt === now ? { ...a, updatedBy: deviceLabel() } : a,
      ),
    }
    persist()
    if (isConfigured(syncConfig) && syncConfig) {
      for (const next of data.articles) {
        const prev = prevArticles.find((a) => a.id === next.id)
        if (prev && prev.kolicina !== next.kolicina) queueMutation(prev, next, false)
      }
      void flushSync()
    }
    showHome('Količine so ponastavljene. Artikli so ostali.')
  })
}

function renderDeleteConfirm(article: Article): string {
  return `<div class="overlay">
    <div class="sheet">
      <h2>Izbrišem artikel?</h2>
      <p><b>${escapeHtml(article.ime || article.sifra || article.ean || '(brez imena)')}</b> · ${article.kolicina} kos</p>
      <p class="hint">Artikel izgine s seznama na vseh telefonih. V skupnem listu ostane vrstica, označena kot izbrisana.</p>
      <div class="stack" style="margin-top:16px">
        <button type="button" class="btn btn-danger" id="btn-confirm-delete">Da, izbriši</button>
        <button type="button" class="btn btn-ghost" id="btn-cancel-delete">Prekliči</button>
      </div>
    </div>
  </div>`
}

function bindDelete(article: Article): void {
  document.getElementById('btn-cancel-delete')?.addEventListener('click', () => {
    screen = { kind: 'edit', article }
    render()
  })
  document.getElementById('btn-confirm-delete')?.addEventListener('click', () => {
    const next: Article = { ...article, deleted: true, updatedAt: nowIso(), updatedBy: deviceLabel() }
    data = upsertArticle(data, next)
    persist()
    recordQty(article, next, 'delete')
    const lok = { ...extras.lokacija }
    delete lok[article.id]
    extras = { ...extras, lokacija: lok }
    persistExtras()
    void deletePhoto(article.id)
    queueMutation(article, next)
    showHome(`Izbrisano: ${article.ime || article.sifra || article.ean}`)
  })
}

function undoLastChange(): void {
  const change = extras.lastChange
  if (!change) return
  const article = findById(data, change.articleId)
  if (!article || article.deleted) {
    extras = { ...extras, lastChange: undefined }
    persistExtras()
    showHome('Tega artikla ni več.')
    return
  }
  const next: Article = {
    ...article,
    kolicina: undoQuantity(article.kolicina, change),
    updatedAt: nowIso(),
    updatedBy: deviceLabel(),
  }
  data = upsertArticle(data, next)
  persist()
  recordQty(article, next, 'undo')
  queueMutation(article, next)
  showHome(`Razveljavljeno: ${next.ime || next.sifra || next.ean} = ${next.kolicina} kos`)
}

function historyKindText(entry: HistoryEntry): string {
  if (entry.kind === 'delete') return 'izbrisano'
  if (entry.kind === 'undo') return `razveljavi ${formatDelta(entry)}`
  return formatDelta(entry)
}

function renderHistory(message?: string): string {
  const rows = extras.history.slice(0, 150)
  const log = rows.length
    ? rows
        .map(
          (h) => `<li><span class="h-delta${h.after - h.before < 0 ? ' neg' : ''}">${escapeHtml(historyKindText(h))}</span>
            <span><b>${escapeHtml(h.ime || '(brez imena)')}</b> ${h.before} → ${h.after} kos<br /><span class="meta">${escapeHtml(formatDateTime(h.at))} · ${escapeHtml(h.device)}</span></span></li>`,
        )
        .join('')
    : '<li class="meta">Še ni sprememb na tem telefonu.</li>'
  const popisi = extras.popisi.length
    ? extras.popisi
        .map(
          (p) => `<div class="popis-row">
            <div><b>${escapeHtml(formatDateTime(p.at))}</b><br /><span class="meta">${p.count} artiklov · ${p.pcs} kos · ${escapeHtml(p.device)}</span></div>
            <div class="row-actions">
              <button type="button" class="btn" data-popis-xlsx="${escapeHtml(p.id)}">Excel</button>
              <button type="button" class="btn" data-popis-csv="${escapeHtml(p.id)}">CSV</button>
            </div>
          </div>`,
        )
        .join('')
    : '<p class="meta">Še ni zaključenih popisov.</p>'
  const all = totals(data.articles)
  return `<div class="overlay" id="history-overlay">
    <div class="sheet">
      <h2>Zgodovina in popisi</h2>
      ${message ? `<p class="flash ok">${escapeHtml(message)}</p>` : ''}
      <p class="hint">Zdaj: ${all.count} artiklov · ${all.pcs} kos.</p>
      <button type="button" class="btn btn-primary" id="btn-finish-popis">Zaključi popis</button>
      <h3>Pretekli popisi</h3>
      <div class="popis-list">${popisi}</div>
      <h3>Spremembe na tem telefonu</h3>
      <ul class="history-list">${log}</ul>
      <div class="stack" style="margin-top:12px">
        <button type="button" class="btn btn-ghost" id="btn-history-close">Zapri</button>
      </div>
    </div>
  </div>`
}

function bindHistory(): void {
  document.getElementById('btn-history-close')?.addEventListener('click', () => showHome())
  document.getElementById('btn-finish-popis')?.addEventListener('click', () => {
    const snap = makeSnapshot(data.articles, nowIso(), deviceLabel())
    extras = { ...extras, popisi: [snap, ...extras.popisi] }
    persistExtras()
    screen = { kind: 'history', message: `Popis shranjen: ${snap.count} artiklov, ${snap.pcs} kos.` }
    render()
  })
  document.querySelectorAll<HTMLButtonElement>('[data-popis-xlsx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = extras.popisi.find((x) => x.id === btn.dataset.popisXlsx)
      if (p) void downloadXlsx(popisToArticles(p), `popis-zarnic-${p.at.slice(0, 10)}-zakljucen.xlsx`)
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-popis-csv]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = extras.popisi.find((x) => x.id === btn.dataset.popisCsv)
      if (!p) return
      downloadBlob(new Blob([articlesToCsv(popisToArticles(p))], { type: 'text/csv;charset=utf-8' }), `popis-zarnic-${p.at.slice(0, 10)}-zakljucen.csv`)
    })
  })
}

function downloadCsv(): void {
  const name = csvFileName()
  downloadBlob(new Blob([articlesToCsv(liveArticles(), extras.lokacija)], { type: 'text/csv;charset=utf-8' }), name)
  showHome(`Datoteka ${name} je pripravljena.`)
}

async function downloadXlsx(articles: Article[], name: string): Promise<void> {
  const { buildWorkbook, workbookToArrayBuffer } = await import('./export.ts')
  const buffer = workbookToArrayBuffer(buildWorkbook(articles))
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
}

async function downloadBackup(): Promise<void> {
  const photos = await allPhotos()
  const backup = buildBackup(data, extras, nowIso(), photos)
  const name = backupFileName()
  downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), name)
  showHome(`Kopija ${name} je shranjena v Prenose.`)
}

async function readBackupFile(file: File): Promise<void> {
  const backup = parseBackup(await file.text())
  if (!backup) {
    showHome('To ni kopija Popisa žarnic.')
    return
  }
  screen = { kind: 'confirm-restore', backup }
  render()
}

function renderRestoreConfirm(backup: Backup): string {
  const t = totals(backup.data.articles)
  return `<div class="overlay">
    <div class="sheet">
      <h2>Obnovim kopijo?</h2>
      <p>Kopija ${escapeHtml(backup.createdAt ? formatDateTime(backup.createdAt) : '')}: <b>${t.count}</b> artiklov, <b>${t.pcs}</b> kos.</p>
      <p class="hint">Seznam na tem telefonu se zamenja s kopijo.${isConfigured(syncConfig) ? ' Razlike se pošljejo tudi v skupno zalogo.' : ''}</p>
      <div class="stack" style="margin-top:16px">
        <button type="button" class="btn btn-danger" id="btn-confirm-restore">Da, obnovi</button>
        <button type="button" class="btn btn-ghost" id="btn-cancel-restore">Prekliči</button>
      </div>
    </div>
  </div>`
}

function bindRestore(backup: Backup): void {
  document.getElementById('btn-cancel-restore')?.addEventListener('click', () => showHome())
  document.getElementById('btn-confirm-restore')?.addEventListener('click', () => {
    const now = nowIso()
    // novejši čas, da obnovljena polja zmagajo v skupni zalogi
    data = { ...backup.data, articles: backup.data.articles.map((a) => ({ ...a, updatedAt: now, updatedBy: deviceLabel() })) }
    persist()
    extras = { ...backup.extras, history: extras.history.length ? [...extras.history] : backup.extras.history }
    persistExtras()
    for (const [id, photo] of Object.entries(backup.photos ?? {})) void putPhoto(id, photo)
    void flushSync()
    showHome(`Kopija obnovljena: ${backup.data.articles.filter((a) => !a.deleted).length} artiklov.`)
  })
}

async function downloadExport(): Promise<void> {
  const { buildWorkbook, exportFileName, workbookToArrayBuffer } = await import('./export.ts')
  const workbook = buildWorkbook(liveArticles())
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

function bindLinkItems(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-link-id]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      if (screen.kind !== 'edit') return
      const id = btn.dataset.linkId
      if (!id) return
      const article = findById(data, id)
      if (!article) return
      const ean = normalizeEan(screen.eanPrefill ?? (document.getElementById('f-ean') as HTMLInputElement | null)?.value ?? '')
      const sifra = (screen.sifraPrefill || String((document.getElementById('f-sifra') as HTMLInputElement | null)?.value ?? '').trim())
      const next: Article = {
        ...article,
        ean: ean || article.ean,
        sifra: article.sifra || sifra,
        updatedAt: nowIso(),
        updatedBy: deviceLabel(),
      }
      data = upsertArticle(data, next)
      persist()
      queueMutation(article, next)
      openQuantity(next.id)
    })
  })
}

function itemsToArticles(items: ImportedItem[], now: string): Article[] {
  return items.map((item) => ({
    id: uid(),
    ime: item.ime,
    sifra: item.sifra,
    ean: item.ean,
    kolicina: item.kolicina,
    opomba: item.opomba,
    skupina: item.skupina,
    updatedAt: now,
  }))
}

function applyImport(result: ImportResult, mode: 'replace' | 'append'): void {
  const now = nowIso()
  const incoming = itemsToArticles(result.items, now)
  data = {
    ...data,
    articles: mode === 'replace' ? incoming : [...incoming, ...data.articles],
    importMeta: { fileName: result.fileName || STARTER_FILE_NAME, importedAt: now },
  }
  persist()
  void flushSync()
  const dup = result.duplicates.length ? ` Možno podvajanje ostaja ločeno: ${result.duplicates.join(', ')}.` : ''
  showHome(`Uvoženih ${incoming.length} artiklov, skupaj ${result.total} kos.${dup}`)
}

function loadStarterCatalog(): void {
  const result: ImportResult = {
    items: STARTER_ITEMS,
    total: STARTER_ITEMS.reduce((sum, item) => sum + item.kolicina, 0),
    duplicates: ['NL-T5 13W/840/65'],
    fileName: STARTER_FILE_NAME,
  }
  if (data.articles.length === 0) {
    applyImport(result, 'replace')
    return
  }
  screen = { kind: 'import-preview', result }
  render()
}

async function importFromFile(file: File): Promise<void> {
  try {
    const { parseSpreadsheetBuffer } = await import('./importSpreadsheet.ts')
    const buffer = new Uint8Array(await file.arrayBuffer())
    const result = parseSpreadsheetBuffer(buffer, file.name)
    if (!result.items.length) {
      showHome('V datoteki nisem našel artiklov. Preveri, da so v stolpcih ime in količina.')
      return
    }
    screen = { kind: 'import-preview', result }
    render()
  } catch {
    showHome('Datoteke nisem mogel prebrati. Poskusi xlsx, xls, xlt, ods ali csv.')
  }
}

function bindImportPreview(): void {
  if (screen.kind !== 'import-preview') return
  const result = screen.result
  document.getElementById('btn-import-cancel')?.addEventListener('click', () => showHome())
  document.getElementById('btn-import-add')?.addEventListener('click', () => applyImport(result, 'append'))
  document.getElementById('btn-import-replace')?.addEventListener('click', () => applyImport(result, 'replace'))
}

registerServiceWorker()
if (consumeSetupHash()) {
  screen = { kind: 'sync-settings', message: 'Povezava za nastavitev je prebrana. Povezujem…' }
}
window.addEventListener('online', () => {
  void flushSync()
})
window.addEventListener('offline', () => {
  updateSyncStatus()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void flushSync()
})
startSyncLoop()
render()
void flushSync()
