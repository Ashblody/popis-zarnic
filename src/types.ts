/**
 * Podatkovni model v1.
 *
 * Kasnejše faze (še niso zgrajene, polja so namerno pripravljena):
 * - Uvoz obstoječega Excela: InventoryData.importMeta (ime datoteke, čas, preslikava vrstic).
 * - Skupna zaloga prek Google Sheet + Apps Script: Article.remoteId, InventoryData.sync.
 * - OCR napisa (Tesseract.js) je samo predlog pred shranitvijo — ne hrani se, dokler
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
  updatedAt: string
  /** Id vrstice v Google Sheetu, ko pride skupna zaloga. */
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
