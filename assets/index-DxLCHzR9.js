const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/esm-rqrLGm6m.js","assets/esm-84469jgD.js"])))=>i.map(i=>d[i]);
(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))r(i);new MutationObserver(i=>{for(const o of i)if(o.type==="childList")for(const c of o.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&r(c)}).observe(document,{childList:!0,subtree:!0});function n(i){const o={};return i.integrity&&(o.integrity=i.integrity),i.referrerPolicy&&(o.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?o.credentials="include":i.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function r(i){if(i.ep)return;i.ep=!0;const o=n(i);fetch(i.href,o)}})();const Q="modulepreload",K=function(t){return"/popis-zarnic/"+t},B={},A=function(e,n,r){let i=Promise.resolve();if(n&&n.length>0){let c=function(s){return Promise.all(s.map(u=>Promise.resolve(u).then(y=>({status:"fulfilled",value:y}),y=>({status:"rejected",reason:y}))))};document.getElementsByTagName("link");const a=document.querySelector("meta[property=csp-nonce]"),p=(a==null?void 0:a.nonce)||(a==null?void 0:a.getAttribute("nonce"));i=c(n.map(s=>{if(s=K(s),s in B)return;B[s]=!0;const u=s.endsWith(".css"),y=u?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${s}"]${y}`))return;const f=document.createElement("link");if(f.rel=u?"stylesheet":Q,u||(f.as="script"),f.crossOrigin="",f.href=s,p&&f.setAttribute("nonce",p),document.head.appendChild(f),u)return new Promise((R,H)=>{f.addEventListener("load",R),f.addEventListener("error",()=>H(new Error(`Unable to preload CSS for ${s}`)))})}))}function o(c){const a=new Event("vite:preloadError",{cancelable:!0});if(a.payload=c,window.dispatchEvent(a),!a.defaultPrevented)throw c}return i.then(c=>{for(const a of c||[])a.status==="rejected"&&o(a.reason);return e().catch(o)})};function x(t){return t.normalize("NFD").replace(new RegExp("\\p{M}+","gu"),"").replace(/đ/gi,"d").toLowerCase().trim()}function V(t,e){const n=x(t);return n?x(`${e.sifra} ${e.ime} ${e.ean}`).includes(n):!0}function w(t){const e=t.trim().replace(",",".");if(!e)return null;const n=Number(e);return Number.isFinite(n)?Math.trunc(n):null}function O(t){const e=t.mode==="set"?t.entered:t.current+t.entered;return!Number.isFinite(e)||e<0?0:Math.trunc(e)}function W(t,e){const n=w(t)??0;return String(Math.max(0,n+e))}function T(){return window.BarcodeDetector}function Z(){return typeof T()=="function"}async function J(t,e){const n=T();if(!n)throw new Error("BarcodeDetector ni na voljo");const r=new n({formats:["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code"]}),i=await navigator.mediaDevices.getUserMedia({audio:!1,video:{facingMode:{ideal:"environment"}}});t.srcObject=i,await t.play();let o=!1,c=0;const a=async()=>{var s,u;if(!o){try{if(t.readyState>=2){const f=(u=(s=(await r.detect(t))[0])==null?void 0:s.rawValue)==null?void 0:u.trim();if(f){await p(),e(f);return}}}catch{}c=requestAnimationFrame(()=>{a()})}};c=requestAnimationFrame(()=>{a()});const p=async()=>{o||(o=!0,cancelAnimationFrame(c),i.getTracks().forEach(s=>s.stop()),t.srcObject=null)};return{stop:p}}async function Y(t,e){const[{BrowserMultiFormatReader:n},{BarcodeFormat:r,DecodeHintType:i}]=await Promise.all([A(()=>import("./esm-rqrLGm6m.js"),__vite__mapDeps([0,1])),A(()=>import("./esm-84469jgD.js"),[])]),o=new Map;o.set(i.POSSIBLE_FORMATS,[r.EAN_13,r.EAN_8,r.UPC_A,r.UPC_E,r.CODE_128,r.CODE_39,r.QR_CODE]);const c=new n(o);let a=!1;const p=await c.decodeFromConstraints({audio:!1,video:{facingMode:{ideal:"environment"}}},t,(s,u,y)=>{if(a||!s)return;const f=s.getText().trim();f&&(a=!0,y.stop(),e(f))});return{stop:async()=>{a=!0,p.stop();const s=t.srcObject;s instanceof MediaStream&&s.getTracks().forEach(u=>u.stop()),t.srcObject=null}}}async function G(t,e){var n;if(!((n=navigator.mediaDevices)!=null&&n.getUserMedia))throw new Error("Ta brskalnik nima dostopa do kamere.");if(Z())try{return await J(t,e)}catch(r){if(U(r))throw r}return Y(t,e)}function U(t){if(!t||typeof t!="object")return!1;const e="name"in t?String(t.name):"";return e==="NotAllowedError"||e==="PermissionDeniedError"||e==="SecurityError"}function X(t){if(U(t))return"Dostop do kamere je zavrnjen. V nastavitvah brskalnika dovoli kamero ali vpiši artikel ročno.";if(t&&typeof t=="object"&&"name"in t&&String(t.name)==="NotFoundError")return"Kamere nisem našel. Preveri, ali telefon ima kamero, ali vpiši artikel ročno.";const e=t instanceof Error?t.message:"";return e||"Kamere trenutno ni mogoče odpreti. Poskusi znova ali vpiši artikel ročno."}const z="popis-zarnic-data-v1";function j(){return{version:1,articles:[]}}function tt(t="art"){return typeof crypto<"u"&&"randomUUID"in crypto?`${t}-${crypto.randomUUID()}`:`${t}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`}function et(t){if(!t||typeof t!="object")return!1;const e=t;return typeof e.id=="string"&&typeof e.sifra=="string"&&typeof e.ime=="string"&&typeof e.ean=="string"&&typeof e.kolicina=="number"&&Number.isFinite(e.kolicina)&&typeof e.opomba=="string"&&typeof e.updatedAt=="string"}function nt(t){if(!t||typeof t!="object")return j();const e=t,r={version:1,articles:Array.isArray(e.articles)?e.articles.filter(et):[]};if(e.importMeta&&typeof e.importMeta=="object"){const i=e.importMeta;typeof i.fileName=="string"&&typeof i.importedAt=="string"&&(r.importMeta={fileName:i.fileName,importedAt:i.importedAt})}if(e.sync&&typeof e.sync=="object"){const i=e.sync;r.sync={sheetId:typeof i.sheetId=="string"?i.sheetId:void 0,lastSyncAt:typeof i.lastSyncAt=="string"?i.lastSyncAt:void 0}}return r}function it(){try{const t=localStorage.getItem(z);return t?nt(JSON.parse(t)):j()}catch{return j()}}function rt(t){t.version=1,localStorage.setItem(z,JSON.stringify(t))}function E(t){return t.replace(/\s+/g,"").trim()}function ot(t,e){const n=E(e);if(n)return t.articles.find(r=>E(r.ean)===n)}function q(t,e){return t.articles.find(n=>n.id===e)}function F(t,e){const n=t.articles.findIndex(i=>i.id===e.id),r=n===-1?[e,...t.articles]:t.articles.map((i,o)=>o===n?e:i);return{...t,articles:r}}function at(t,e){return{...t,articles:t.articles.map(n=>n.kolicina===0?n:{...n,kolicina:0,updatedAt:e})}}function l(t){return t.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}function C(t){try{return new Date(t).toLocaleString("sl-SI",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return t}}function st(){if(!("serviceWorker"in navigator))return;const t="/popis-zarnic/";navigator.serviceWorker.register(`${t}sw.js`,{scope:t}).catch(()=>{})}let m=it(),N="",d={kind:"home"},S="",L;const k=document.querySelector("#app");function D(){rt(m)}function $(){return new Date().toISOString()}function v(t=""){S=t,d={kind:"home"},b()}function _(t){var e;d={kind:"quantity",articleId:t,entered:"0",mode:"set"},b(),(e=document.getElementById("qty-entered"))==null||e.focus()}async function P(){const t=L;L=void 0,t&&await t.stop()}function b(){if(k){if(d.kind==="home"){k.innerHTML=h(),g();return}if(d.kind==="scan"){k.innerHTML=h()+ct(d.error),g(),ft();return}if(d.kind==="quantity"){const t=q(m,d.articleId);if(!t){v("Artikel ni več na seznamu.");return}k.innerHTML=h()+dt(t,d.entered,d.mode),g(),bt();return}if(d.kind==="edit"){k.innerHTML=h()+lt(d.article,d.eanPrefill),g(),yt();return}k.innerHTML=h()+ut(),g(),vt()}}function I(){return m.articles.filter(t=>V(N,t))}function h(){const t=I(),e=t.length?t.map(r=>`<article class="card" data-id="${l(r.id)}">
            <div class="card-main" data-action="qty">
              <h2>${l(r.ime||"(brez imena)")}</h2>
              <div class="meta">${l(r.sifra||"brez šifre")}${r.ean?` · EAN ${l(r.ean)}`:""}</div>
              <div class="meta">spremenjeno ${l(C(r.updatedAt))}</div>
              <button type="button" class="edit-link" data-action="edit">Uredi</button>
            </div>
            <button type="button" class="qty" data-action="qty" aria-label="Spremeni količino">
              <b>${r.kolicina}</b><span>kos</span>
            </button>
          </article>`).join(""):`<p class="empty">${m.articles.length===0?"Ni artiklov. Skeniraj škatlo ali dodaj artikel ročno.":"Nisem našel artikla s tem iskanjem."}</p>`,n=S?`<p class="flash ok">${l(S)}</p>`:"";return`<header class="app-head">
      <img src="/popis-zarnic/icon-192.png" alt="" width="48" height="48" />
      <div>
        <h1>Popis žarnic</h1>
        <p class="sub">${m.articles.length} artiklov na tem telefonu</p>
      </div>
    </header>
    ${n}
    <div class="stack">
      <input class="search" id="search" type="search" placeholder="Išči po imenu, šifri ali EAN" value="${l(N)}" />
      <button type="button" class="btn btn-primary" id="btn-scan">Skeniraj</button>
      <button type="button" class="btn" id="btn-new">Nov artikel</button>
      <div class="row-actions">
        <button type="button" class="btn" id="btn-export">Izvozi v Excel</button>
        <button type="button" class="btn btn-danger" id="btn-reset">Nov popis</button>
      </div>
    </div>
    <div class="list">${e}</div>`}function ct(t){return`<div class="overlay" id="scan-overlay">
    <div class="sheet">
      <h2>Skeniraj kodo</h2>
      <p class="hint">Usmeri kamero na črtno kodo na škatli.</p>
      <div class="scan-wrap">
        <video id="scan-video" playsinline muted autoplay></video>
        <div class="scan-hint">Drži kodo v sredini slike</div>
      </div>
      ${t?`<p class="flash">${l(t)}</p>`:""}
      <div class="stack" style="margin-top:12px">
        <button type="button" class="btn" id="btn-cancel-scan">Prekliči</button>
      </div>
    </div>
  </div>`}function dt(t,e,n){const r=O({current:t.kolicina,entered:w(e)??0,mode:n});return`<div class="overlay">
    <div class="sheet">
      <h2>${l(t.ime||"(brez imena)")}</h2>
      <p class="hint">Zdaj na zalogi: <b>${t.kolicina}</b> kos · po shranitvi: <b>${r}</b> kos</p>
      <div class="mode">
        <button type="button" class="btn" data-mode="set" aria-pressed="${n==="set"}">Nastavi</button>
        <button type="button" class="btn" data-mode="add" aria-pressed="${n==="add"}">Prištej</button>
      </div>
      <div class="qty-display" id="qty-entered">${l(e||"0")}</div>
      <div class="steppers">
        <button type="button" class="btn" data-delta="-10">−10</button>
        <button type="button" class="btn" data-delta="-1">−1</button>
        <button type="button" class="btn" data-delta="1">+1</button>
        <button type="button" class="btn" data-delta="10">+10</button>
      </div>
      <div class="keypad">
        ${["1","2","3","4","5","6","7","8","9","C","0","⌫"].map(i=>`<button type="button" class="btn" data-key="${i}">${i}</button>`).join("")}
      </div>
      <div class="stack">
        <button type="button" class="btn btn-primary" id="btn-save-qty">Shrani</button>
        <button type="button" class="btn btn-ghost" id="btn-cancel-qty">Prekliči</button>
      </div>
    </div>
  </div>`}function lt(t,e){const n=!t;return`<div class="overlay">
    <div class="sheet">
      <h2>${n?"Nov artikel":"Uredi artikel"}</h2>
      <form id="edit-form">
        <label for="f-ime">Ime</label>
        <input id="f-ime" name="ime" type="text" required value="${l((t==null?void 0:t.ime)??"")}" />
        <label for="f-sifra">Šifra</label>
        <input id="f-sifra" name="sifra" type="text" value="${l((t==null?void 0:t.sifra)??"")}" />
        <label for="f-ean">EAN</label>
        <input id="f-ean" name="ean" type="text" inputmode="numeric" value="${l((t==null?void 0:t.ean)??e??"")}" />
        <label for="f-opomba">Opomba</label>
        <textarea id="f-opomba" name="opomba">${l((t==null?void 0:t.opomba)??"")}</textarea>
        ${n?`<label for="f-kolicina">Začetna količina</label>
        <input id="f-kolicina" name="kolicina" type="text" inputmode="numeric" value="0" />`:""}
        <div class="stack" style="margin-top:16px">
          <button type="submit" class="btn btn-primary">${n?"Dodaj":"Shrani"}</button>
          <button type="button" class="btn btn-ghost" id="btn-cancel-edit">Prekliči</button>
        </div>
      </form>
    </div>
  </div>`}function ut(){return`<div class="overlay">
    <div class="sheet">
      <h2>Nov popis?</h2>
      <p>Količine vseh artiklov bodo 0. Imena, šifre in kode ostanejo. Tega ni mogoče razveljaviti.</p>
      <div class="stack" style="margin-top:16px">
        <button type="button" class="btn btn-danger" id="btn-confirm-reset">Da, ponastavi količine</button>
        <button type="button" class="btn btn-ghost" id="btn-cancel-reset">Prekliči</button>
      </div>
    </div>
  </div>`}function g(){var t,e,n,r,i;(t=document.getElementById("search"))==null||t.addEventListener("input",o=>{N=o.target.value;const c=document.querySelector(".list");c&&(c.innerHTML=I().length?I().map(a=>`<article class="card" data-id="${l(a.id)}">
              <div class="card-main" data-action="qty">
                <h2>${l(a.ime||"(brez imena)")}</h2>
                <div class="meta">${l(a.sifra||"brez šifre")}${a.ean?` · EAN ${l(a.ean)}`:""}</div>
                <div class="meta">spremenjeno ${l(C(a.updatedAt))}</div>
                <button type="button" class="edit-link" data-action="edit">Uredi</button>
              </div>
              <button type="button" class="qty" data-action="qty" aria-label="Spremeni količino">
                <b>${a.kolicina}</b><span>kos</span>
              </button>
            </article>`).join(""):`<p class="empty">${m.articles.length===0?"Ni artiklov. Skeniraj škatlo ali dodaj artikel ročno.":"Nisem našel artikla s tem iskanjem."}</p>`),M()}),(e=document.getElementById("btn-scan"))==null||e.addEventListener("click",()=>{mt()}),(n=document.getElementById("btn-new"))==null||n.addEventListener("click",()=>{d={kind:"edit"},b()}),(r=document.getElementById("btn-export"))==null||r.addEventListener("click",()=>{kt()}),(i=document.getElementById("btn-reset"))==null||i.addEventListener("click",()=>{d={kind:"confirm-reset"},b()}),M()}function M(){document.querySelectorAll(".card").forEach(t=>{var n;const e=t.dataset.id;e&&(t.querySelectorAll('[data-action="qty"]').forEach(r=>{r.addEventListener("click",i=>{i.preventDefault(),_(e)})}),(n=t.querySelector('[data-action="edit"]'))==null||n.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation();const i=q(m,e);i&&(d={kind:"edit",article:i},b())}))})}async function mt(){await P(),d={kind:"scan"},b()}function ft(){var e;(e=document.getElementById("btn-cancel-scan"))==null||e.addEventListener("click",()=>{P().then(()=>v())});const t=document.getElementById("scan-video");t instanceof HTMLVideoElement&&G(t,n=>{pt(n)}).then(n=>{L=n}).catch(n=>{d={kind:"scan",error:X(n)},b()})}async function pt(t){await P();const e=E(t),n=ot(m,e);if(n){S="",_(n.id);return}d={kind:"edit",eanPrefill:e},b()}function bt(){var e,n;if(d.kind!=="quantity")return;const t=d;document.querySelectorAll("[data-mode]").forEach(r=>{r.addEventListener("click",()=>{const i=r.dataset.mode==="add"?"add":"set";d={...t,mode:i},b()})}),document.querySelectorAll("[data-delta]").forEach(r=>{r.addEventListener("click",()=>{const i=Number(r.dataset.delta);d={...t,entered:W(t.entered,i)},b()})}),document.querySelectorAll("[data-key]").forEach(r=>{r.addEventListener("click",()=>{const i=r.dataset.key??"";let o=t.entered==="0"?"":t.entered;i==="C"?o="0":i==="⌫"?o=o.slice(0,-1)||"0":o=(o+i).replace(/^0+(?=\d)/,""),d={...t,entered:o},b()})}),(e=document.getElementById("btn-cancel-qty"))==null||e.addEventListener("click",()=>v()),(n=document.getElementById("btn-save-qty"))==null||n.addEventListener("click",()=>{const r=q(m,t.articleId);if(!r)return v();const i=w(t.entered);if(i===null)return;const o={...r,kolicina:O({current:r.kolicina,entered:i,mode:t.mode}),updatedAt:$()};m=F(m,o),D(),v(`Shranjeno: ${o.ime||o.sifra||o.ean} = ${o.kolicina} kos`)})}function yt(){var t,e;(t=document.getElementById("btn-cancel-edit"))==null||t.addEventListener("click",()=>v()),(e=document.getElementById("edit-form"))==null||e.addEventListener("submit",n=>{n.preventDefault();const r=n.target,i=new FormData(r),o=String(i.get("ime")??"").trim(),c=String(i.get("sifra")??"").trim(),a=E(String(i.get("ean")??"")),p=String(i.get("opomba")??"").trim();if(!o&&!c&&!a||d.kind!=="edit")return;const s=d.article,u=w(String(i.get("kolicina")??"0"))??0,y=s?{...s,ime:o,sifra:c,ean:a,opomba:p,updatedAt:$()}:{id:tt(),ime:o,sifra:c,ean:a,opomba:p,kolicina:Math.max(0,u),updatedAt:$()};m=F(m,y),D(),s?v("Artikel je posodobljen."):_(y.id)})}function vt(){var t,e;(t=document.getElementById("btn-cancel-reset"))==null||t.addEventListener("click",()=>v()),(e=document.getElementById("btn-confirm-reset"))==null||e.addEventListener("click",()=>{m=at(m,$()),D(),v("Količine so ponastavljene. Artikli so ostali.")})}async function kt(){const{buildWorkbook:t,exportFileName:e,workbookToArrayBuffer:n}=await A(async()=>{const{buildWorkbook:p,exportFileName:s,workbookToArrayBuffer:u}=await import("./export-B-BFbFwU.js");return{buildWorkbook:p,exportFileName:s,workbookToArrayBuffer:u}},[]),r=t(m.articles),i=n(r),o=new Blob([i],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),c=URL.createObjectURL(o),a=document.createElement("a");a.href=c,a.download=e(),a.click(),URL.revokeObjectURL(c),v(`Datoteka ${e()} je pripravljena.`)}st();b();
