# Popis žarnic

Preprosta aplikacija za telefon, s katero Hebo in žena popisujeta zalogo žarnic. Deluje v brskalniku, jo lahko dodaš na začetni zaslon in po prvem odprtju deluje tudi brez interneta.

Živa aplikacija: https://ashblody.github.io/popis-zarnic/

## Kako jo uporabljaš

1. Na telefonu odpri povezavo v Chromu (Android) ali Safariju (iPhone).
2. Dodaj jo na začetni zaslon: v Chromu meni → **Dodaj na začetni zaslon**; v Safariju delilnik → **Dodaj na začetni zaslon**.
3. Ko prvič pritisneš **Skeniraj**, dovoli dostop do kamere.
4. Pritisni **Skeniraj** in usmeri kamero na črtno kodo ali QR na škatli. Če artikla še ni, se odpre **Nov artikel** z že vpisano kodo. Pri novem artiklu lahko pritisneš **Preberi napis**, da predlaga šifro in ime z nalepke — pred shranitvijo preveri predlog.
5. Vpiši količino (veliki gumbi +1 / +10 ali tipkovnica) in pritisni **Shrani**.
6. Artikel lahko poiščeš po imenu ali šifri, ali ga dodaš ročno z **Nov artikel**.
7. Na praznem telefonu pritisni **Naloži seznam žarnic (81)** za inventuro iz 9. 11. 2026 (2643 kos). Isti seznam lahko uvoziš tudi z **Uvozi Excel** (xlsx, xls, xlt, ods ali csv). Če se isto ime pojavi dvakrat, aplikacija obeh ne združi.
8. Če skeniraš kodo artikla, ki ga že imaš brez EAN, izberi **Poveži z obstoječim artiklom**.
9. Na koncu pritisni **Izvozi v Excel**. Datoteka ima list **Popis** (4 stolpci ime/količina, kot doslej) in list **Seznam** s šifro in EAN.
10. Za skupno zalogo na obeh telefonih odpri **Skupna zaloga**, prilepi naslov spletne aplikacije in PIN (ali povezavo za nastavitev). Stanje se uskladi ob odprtju in približno vsakih 30 sekund; količine se prištevajo, da lahko oba štejeta hkrati. Če nastavitve ni, ostane seznam samo na tem telefonu. Ko ni interneta, vidiš **Brez povezave** — spremembe se pošljejo, ko je spet povezava.

**Nov popis** vse količine postavi na 0, artikli (imena, šifre, kode) pa ostanejo.

Namestitev skupne zaloge (Apps Script) je opisana v `apps-script/README.md`. PIN shrani samo v Script Properties, ne v to repozitorij.

## Razvoj

```bash
npm install
npm test
npm run build
npm run smoke
```

Aplikacija zna brati EAN/QR/Data Matrix, predlagati šifro/ime z OCR, uvoziti obstoječi Excel in usklajevati skupno zalogo prek Google Sheet + Apps Script.
