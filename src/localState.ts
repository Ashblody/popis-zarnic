/** Podatki samo na tem telefonu (ne gredo v skupno zalogo): lokacija, zgodovina, popisi, zadnja sprememba. */
import { emptyExtras, parseExtras, type LocalExtras } from './features.ts'

export const EXTRAS_KEY = 'popis-zarnic-local-v1'

export function loadExtras(): LocalExtras {
  try {
    const raw = localStorage.getItem(EXTRAS_KEY)
    return raw ? parseExtras(JSON.parse(raw)) : emptyExtras()
  } catch {
    return emptyExtras()
  }
}

export function saveExtras(extras: LocalExtras): void {
  try {
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras))
  } catch {
    /* poln pomnilnik: ohrani v spominu */
  }
}
