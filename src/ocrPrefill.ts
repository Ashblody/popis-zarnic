/** Kako OCR dopolni polja po uspešnem branju kode. EAN/šifra iz kode imata prednost. */

import { type OcrSuggestion } from './ocrSuggest.ts'

export type OcrPrefill = {
  sifra: string
  ean: string
  ime: string
  linkBits: string
  message: string
}

export function applyOcrPrefill(input: {
  previousSifra: string
  previousEan: string
  sug: OcrSuggestion
}): OcrPrefill {
  const ean = input.previousEan
  const sifra = input.previousSifra || input.sug.sifra
  const ime = input.sug.ime
  const linkBits = [sifra, ime].filter(Boolean).join(' ')
  let message = 'Nisem prebral šifre ali imena. Vpiši ročno ali poskusi znova.'
  if (input.previousSifra && ime) {
    message = `Predlog imena z napisa: ${ime}. Šifra in EAN sta iz kode.`
  } else if (sifra || ime) {
    message = 'Predlog z napisa. Predloge povezave sem razvrstil po šifri in imenu — potrdi, preden shraniš.'
  }
  return { sifra, ean, ime, linkBits, message }
}
