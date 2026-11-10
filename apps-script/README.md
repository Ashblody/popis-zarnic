# Skupna zaloga — namestitev Apps Script

Skripta v tem direktoriju (`Code.gs`, `appsscript.json`) poganja spletno aplikacijo, ki bere in piše v Google Sheet. PIN ni v kodi in ga ne shranjuj v git.

Tabela (že narejena, 81 artiklov):  
https://docs.google.com/spreadsheets/d/1asETb_clPjCGufXTwQjoGXkFx9Re_LB1pOKdyrep0R8/edit?usp=drivesdk

Id tabele: `1asETb_clPjCGufXTwQjoGXkFx9Re_LB1pOKdyrep0R8`

Mapa: https://drive.google.com/drive/folders/1aAwr60_SUbZ9flwvmLqpcsst4a96bzGq

Račun: `ankhxx@gmail.com`. Datotek ne briši in jih za zdaj ne deli.

## Koraki (v brskalniku)

1. Odpri tabelo zgoraj (prijavljen kot ankhxx@gmail.com).
2. **Extensions** (Razširitve) → **Apps Script**.
3. Izbriši predlogo `Code.gs`, če je prazna, in prilepi vsebino datoteke `apps-script/Code.gs` iz tega repozitorija. Shrani projekt (npr. ime *Popis žarnic — zaloga*).
4. (Neobvezno, a priporočeno) Project Settings → odpri `appsscript.json` in uskladi z datoteko v tem direktoriju (`timeZone`: `Europe/Ljubljana`, `runtimeVersion`: `V8`).
5. **Project Settings** (ikona zobnika) → **Script properties** → **Add script property**:
   - `SYNC_PIN` = PIN (8-mestno število je v datoteki na strežniku, pot je v poročilu o izdaji; ne committaj ga).
   - `SPREADSHEET_ID` = `1asETb_clPjCGufXTwQjoGXkFx9Re_LB1pOKdyrep0R8`
6. **Deploy** → **New deployment** → vrsta **Web app**.
   - Execute as: **Me** (ankhxx@gmail.com)
   - Who has access: **Anyone** / **Kdorkoli** — in sicer tako, da URL **brez Google prijave** vrne JSON (npr. `{"ok":false,"error":"bad_pin"}`). To ni isto kot **Anyone with a Google account** / **Kdorkoli z Google Računom**. Če se odpre stran za prijavo, v **Manage deployments** s svinčnikom spremeni dostop in shrani novo različico.
   - Deploy, dovoli dovoljenja za ta Google račun, nato **skopiraj Web app URL** (konča se z `/exec`).
7. Na telefonu odpri https://ashblody.github.io/popis-zarnic/ → **Skupna zaloga** → vpiši PIN in ime → **Shrani in poveži**. Naslov je že vgrajen (pod **Napredno** ga lahko spremeniš). Lahko tudi **Preizkusi povezavo**.
8. Ko je prvi telefon povezan, v nastavitvah kopiraj *povezavo za nastavitev* in jo odpri na drugem telefonu (vsebuje PIN — ne objavljaj je).

Če kasneje spremeniš `Code.gs`, naredi **Deploy** → **Manage deployments** → svinčnik → **New version**, sicer telefoni še uporabljajo staro različico.

Dostop *Anyone* je varovan s PIN-om v Script Properties. URL + PIN ne deli javno.
