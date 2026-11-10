/**
 * Podatkovni model v1.
 *
 * Kasnejše faze (še niso zgrajene, polja so namerno pripravljena):
 * - Skupna zaloga prek Google Sheet + Apps Script: Article.remoteId, InventoryData.sync.
 * - OCR napisa (Tesseract.js) je predlog pred shranitvijo — ne shrani se, dokler
 *   uporabnik ne potrdi artikla (potem gre v šifra/ime/ean).
 */

export type ArticleId = string & { readonly __brand: 'ArticleId' }

export type Article = {
  id: ArticleId
  sifra: string
  ime: string
  ean: string
  kolicina: number
  opomba: string
  /** Družina iz popisa (npr. NL-T5, RX-L, RL-PAR). */
  skupina?: string
  updatedAt: string
  updatedBy?: string
  /** Skrit ob sinhroniziranem brisanju; lokalno se ne kaže. */
  deleted?: boolean
  /** Zastarelo; id artikla je zdaj isti kot v Sheetu. */
  remoteId?: string
}

export type ImportMeta = {
  fileName: string
  importedAt: string
}

export type SyncMeta = {
  sheetId?: string
  lastSyncAt?: string
}

export type InventoryData = {
  version: 1
  articles: Article[]
  importMeta?: ImportMeta
  sync?: SyncMeta
}

export const DATA_KEY = 'popis-zarnic-data-v1'
