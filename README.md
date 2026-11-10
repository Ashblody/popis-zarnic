# Popis žarnic

Preprosta aplikacija za telefon, s katero Hebo in žena popisujeta zalogo žarnic. Deluje v brskalniku, jo lahko dodaš na začetni zaslon in po prvem odprtju deluje tudi brez interneta.

Živa aplikacija: https://ashblody.github.io/popis-zarnic/

## Kako jo uporabljaš

1. Na telefonu odpri povezavo v Chromu (Android) ali Safariju (iPhone).
2. Dodaj jo na začetni zaslon: v Chromu meni → **Dodaj na začetni zaslon**; v Safariju delilnik → **Dodaj na začetni zaslon**.
3. Ko prvič pritisneš **Skeniraj**, dovoli dostop do kamere.
4. Pritisni **Skeniraj** in usmeri kamero na črtno kodo na škatli. Če artikla še ni, se odpre **Nov artikel** z že vpisano kodo.
5. Vpiši količino (veliki gumbi +1 / +10 ali tipkovnica) in pritisni **Shrani**.
6. Artikel lahko poiščeš po imenu ali šifri, ali ga dodaš ročno z **Nov artikel**.
7. Na koncu pritisni **Izvozi v Excel**. Datoteka se imenuje `popis-zarnic-LETO-MESEC-DAN.xlsx`.

**Nov popis** vse količine postavi na 0, artikli (imena, šifre, kode) pa ostanejo.

Pomembno: podatki so trenutno shranjeni na vsakem telefonu posebej. Skupna zaloga za oba pride v naslednji različici.

## Razvoj

```bash
npm install
npm test
npm run build
npm run smoke
```

Aplikacija je namenoma lokalna (brez računa). Kasneje: uvoz obstoječega Excela, skupna zaloga prek Google Sheet in predlog imena z OCR.
