# Popis žarnic

Preprosta aplikacija za telefon, s katero Hebo in žena popisujeta zalogo žarnic. Deluje v brskalniku, jo lahko dodaš na začetni zaslon in po prvem odprtju deluje tudi brez interneta.

Živa aplikacija: https://ashblody.github.io/popis-zarnic/

## Kako jo uporabljaš

1. Na telefonu odpri povezavo v Chromu (Android) ali Safariju (iPhone).
2. Dodaj jo na začetni zaslon: v Chromu meni → **Dodaj na začetni zaslon**; v Safariju delilnik → **Dodaj na začetni zaslon**.
3. Ko prvič pritisneš **Skeniraj**, dovoli dostop do kamere.
4. Pritisni **Skeniraj** in usmeri kamero na črtno kodo ali QR na škatli. Če je koda znana, se takoj odpre količina. Če kode še nimaš na artiklu, aplikacija prebere tudi napis in predlaga obstoječe artikle (najbolj podoben je prvi) — povezavo moraš potrditi, nikoli je ne naredi sama. Če na škatli ni kode, pritisni **Samo tekst**, napis drži v rumenem okvirju (približaj na 10-20 cm, dobra svetloba) in pritisni **Preberi**. Izberi eden od predlogov ali **Nič od tega / nov artikel**.
5. Vpiši količino (veliki gumbi +1 / +10 ali tipkovnica) in pritisni **Shrani**.
6. Artikel lahko poiščeš po imenu ali šifri, ali ga dodaš ročno z **Nov artikel**.
7. Na praznem telefonu pritisni **Naloži seznam žarnic (81)** za inventuro iz 9. 11. 2026 (2643 kos). Isti seznam lahko uvoziš tudi z **Uvozi Excel** (xlsx, xls, xlt, ods ali csv). Če se isto ime pojavi dvakrat, aplikacija obeh ne združi.
8. Če skeniraš kodo artikla, ki ga že imaš brez EAN, izberi **Poveži z obstoječim artiklom**.
9. Na koncu pritisni **Izvozi v Excel**. Datoteka ima list **Popis** (4 stolpci ime/količina, kot doslej) in list **Seznam** s šifro in EAN.
10. Skupna zaloga se poveže sama, brez PIN-a in brez prijave. Ime telefona je privzeto (npr. »Telefon-k3f9«); spremeniš ga v **Skupna zaloga**. PIN in naslov sta samo pod **Napredno** (neobvezno). Stanje se uskladi ob odprtju in približno vsakih 30 sekund; količine se prištevajo, da lahko oba štejeta hkrati. **Samo na tem telefonu** izklopi skupno zalogo. Ko ni interneta, vidiš **Brez povezave** — spremembe se pošljejo, ko je spet povezava.
11. Tap na artikel odpre urejanje (količina +/−, lokacija, opomba, slika, Izbriši). Lokacija in slika sta samo na tem telefonu. **Razveljavi** vrne zadnjo spremembo količine. **Zgodovina in popisi** pokaže spremembe s tega telefona; **Zaključi popis** shrani posnetek z vsotami za kasnejši izvoz. **Shrani kopijo / Obnovi kopijo** = JSON datoteka.

**Nov popis** vse količine postavi na 0, artikli (imena, šifre, kode) pa ostanejo.

Namestitev skupne zaloge (Apps Script) je opisana v `apps-script/README.md`. PIN shrani samo v Script Properties, ne v to repozitorij. Ob gradnji se vgrajen ključ prebere iz `POPIS_SYNC_PIN` ali iz datoteke izven gita (`POPIS_SYNC_PIN_FILE`, privzeto `/workspace/popis/SKUPNA-ZALOGA-PIN.txt`); v repozitoriju ga ni, v javnem bundlu pa je.

## Razvoj

```bash
npm install
npm test
npm run build
npm run smoke
```

Aplikacija zna brati EAN/QR/Data Matrix, predlagati šifro/ime z OCR, uvoziti obstoječi Excel in usklajevati skupno zalogo prek Google Sheet + Apps Script.
