import type { FastifyInstance } from 'fastify';

type OpenApiDocument = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, {
    tags?: string[];
    summary?: string;
    description?: string;
    operationId?: string;
    security?: Array<Record<string, string[]>>;
    requestBody?: unknown;
    responses?: Record<string, { description?: string }>;
  }>>;
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] ?? character));

const operationData = (document: OpenApiDocument) => Object.entries(document.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ method: method.toUpperCase(), path, ...operation })));

function renderDocsHtml(document: OpenApiDocument): string {
  const title = escapeHtml(document.info.title);
  const description = escapeHtml(document.info.description ?? 'API reference');
  const version = escapeHtml(document.info.version);
  const tags = (document.tags ?? []).map((tag) => `<a href="#tag-${encodeURIComponent(tag.name)}">${escapeHtml(tag.name)}</a>`).join('');
  const operations = operationData(document);
  const cards = operations.map((operation) => {
    const internal = (operation.tags ?? []).some((tag) => tag.toLowerCase().includes('internal'));
    const security = operation.security?.length ? 'Authenticated' : 'No session required';
    return `<article class="operation${internal ? ' internal' : ''}" id="op-${escapeHtml(operation.operationId ?? operation.path)}">
      <button class="operation-head" aria-expanded="false">
        <span class="method method-${operation.method.toLowerCase()}">${escapeHtml(operation.method)}</span>
        <code>${escapeHtml(operation.path)}</code>
        <span class="summary">${escapeHtml(operation.summary ?? '')}</span>
        <span class="chevron" aria-hidden="true">+</span>
      </button>
      <div class="operation-body" hidden>
        <p>${escapeHtml(operation.description ?? '')}</p>
        <div class="meta"><span>${escapeHtml((operation.tags ?? []).join(' / '))}</span><span>${escapeHtml(security)}</span></div>
        <h3>Responses</h3><ul>${Object.entries(operation.responses ?? {}).map(([status, response]) => `<li><code>${escapeHtml(status)}</code> ${escapeHtml(response.description ?? '')}</li>`).join('')}</ul>
        ${operation.requestBody ? `<h3>Request body</h3><pre data-schema="requestBody">Loading schema…</pre>` : ''}
        <pre data-operation="${escapeHtml(operation.operationId ?? operation.path)}" class="example" hidden></pre>
      </div>
    </article>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title} · API reference</title><style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#182a2a;background:#f5f7f4;font-synthesis:none;text-rendering:optimizeLegibility;--ink:#182a2a;--muted:#61716d;--line:#dce4dd;--teal:#087e75;--paper:#fff;--soft:#edf3ef}*{box-sizing:border-box}body{margin:0}.topbar{height:64px;padding:0 clamp(20px,5vw,72px);display:flex;align-items:center;justify-content:space-between;background:#173c38;color:#f4fbf8}.brand{display:flex;align-items:center;gap:12px;font-weight:650;letter-spacing:-.02em}.mark{width:28px;height:28px;border:1px solid #7ec7b5;border-radius:50%;display:grid;place-items:center;color:#b8e7d9;font-size:13px}.topbar a{color:#bce4d9;text-decoration:none;font-size:13px}.layout{max-width:1320px;margin:auto;padding:50px clamp(18px,5vw,72px);display:grid;grid-template-columns:220px minmax(0,1fr);gap:58px}.layout>*{min-width:0}.rail{position:sticky;top:24px;align-self:start}.rail-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#74837f;margin:0 0 14px}.rail nav{display:grid;gap:3px}.rail nav a{padding:9px 11px;border-radius:4px;color:#4a5d58;text-decoration:none;font-size:13px}.rail nav a:hover,.rail nav a:focus-visible{background:#e7efea;color:#0a6d65}.intro{padding:6px 0 32px;border-bottom:1px solid var(--line);margin-bottom:28px}.eyebrow{color:var(--teal);font-size:12px;font-weight:600;margin:0 0 11px}.intro h1{font-size:clamp(30px,4vw,46px);line-height:1.1;letter-spacing:-.045em;margin:0 0 14px;font-weight:650}.intro p{max-width:700px;color:var(--muted);font-size:15px;line-height:1.65;margin:0}.version{display:inline-flex;margin-top:18px;padding:5px 9px;border:1px solid var(--line);border-radius:3px;color:#52645f;font-size:12px}.section-title{font-size:20px;letter-spacing:-.025em;margin:34px 0 13px}.operation{border:1px solid var(--line);border-radius:5px;background:var(--paper);margin:9px 0;overflow:hidden}.operation.internal{border-left:3px solid #c48333}.operation-head{display:grid;grid-template-columns:74px minmax(0,.85fr) minmax(0,1fr) 20px;gap:14px;align-items:center;width:100%;padding:15px 17px;border:0;background:transparent;text-align:left;color:var(--ink);cursor:pointer;font:inherit}.operation-head:hover{background:#fbfdfb}.method{font-size:10px;font-weight:750;letter-spacing:.08em;padding:6px 7px;text-align:center;border-radius:3px;background:#e6f2ee;color:#087161}.method-get{background:#e8f1f7;color:#27618b}.method-post{background:#e8f2eb;color:#247249}.operation.internal .method{background:#f7eee0;color:#8e5816}.operation-head code{font-size:13px;font-weight:600;overflow-wrap:anywhere}.summary{color:#667570;font-size:13px}.chevron{font-size:20px;color:#71817b;text-align:center}.operation-body{padding:2px 20px 22px 105px;border-top:1px solid #edf1ed;color:#4e605a;font-size:14px;line-height:1.6}.operation-body h3{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#53635e;margin:22px 0 8px}.operation-body p{max-width:760px}.operation-body ul{padding-left:18px}.operation-body li{margin:6px 0}.operation-body code,.schema code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.meta{display:flex;gap:10px;flex-wrap:wrap}.meta span{padding:4px 8px;border-radius:3px;background:var(--soft);font-size:11px;color:#526660}.json-toggle{margin:12px 0 0;border:1px solid var(--line);background:white;border-radius:3px;padding:8px 10px;color:#33534d;cursor:pointer}.schema{white-space:pre-wrap;overflow:auto;padding:14px;background:#f3f6f3;border:1px solid var(--line);border-radius:4px;color:#42534f}.footer{margin-top:56px;padding:18px 0;border-top:1px solid var(--line);font-size:12px;color:#71807c}.footer a{color:#087e75}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}button:focus-visible,a:focus-visible{outline:3px solid #53afa1;outline-offset:2px}@media(max-width:760px){.layout{grid-template-columns:minmax(0,1fr);gap:24px;padding-top:30px}.layout>*{min-width:0}.rail{position:static;overflow:hidden}.rail nav{display:flex;gap:5px;overflow-x:auto;padding-bottom:4px;max-width:100%}.rail nav a{flex:0 0 auto;white-space:nowrap}.operation-head{grid-template-columns:62px minmax(0,1fr) 18px;gap:10px;padding:13px}.operation-head>*{min-width:0}.operation-head code,.summary{overflow-wrap:anywhere}.summary{grid-column:2;grid-row:2}.chevron{grid-column:3;grid-row:1}.operation-body{padding:4px 14px 18px;overflow-wrap:anywhere}.schema{max-width:100%;overflow-x:auto}.topbar{padding-inline:18px}.intro h1{font-size:33px}}
  </style></head><body><header class="topbar"><div class="brand"><span class="mark" aria-hidden="true">E</span>EduSync <span style="color:#a6cfc4;font-weight:450">/ API reference</span></div><a href="/openapi.json">OpenAPI ${version} <span aria-hidden="true">↗</span></a></header>
    <div class="layout"><aside class="rail"><p class="rail-label">On this page</p><nav>${tags}</nav><p class="rail-label" style="margin-top:28px">Operations</p><nav>${operations.map((operation) => `<a href="#op-${encodeURIComponent(operation.operationId ?? operation.path)}"><span class="method method-${operation.method.toLowerCase()}">${escapeHtml(operation.method)}</span> ${escapeHtml(operation.summary ?? operation.path)}</a>`).join('')}</nav></aside>
    <main><section class="intro"><p class="eyebrow">${title}</p><h1>API reference</h1><p>${description}</p><span class="version">Version ${version}</span></section>
      ${[...(document.tags ?? [])].map((tag) => `<section id="tag-${encodeURIComponent(tag.name)}"><h2 class="section-title">${escapeHtml(tag.name)}</h2>${tag.description ? `<p>${escapeHtml(tag.description)}</p>` : ''}${operations.filter((op) => (op.tags ?? []).includes(tag.name)).map((operation) => {
        const internal = (operation.tags ?? []).some((name) => name.toLowerCase().includes('internal'));
        const security = operation.security?.length ? 'Authenticated' : 'No session required';
        return `<article class="operation${internal ? ' internal' : ''}" id="op-${escapeHtml(operation.operationId ?? operation.path)}"><button class="operation-head" aria-expanded="false"><span class="method method-${operation.method.toLowerCase()}">${escapeHtml(operation.method)}</span><code>${escapeHtml(operation.path)}</code><span class="summary">${escapeHtml(operation.summary ?? '')}</span><span class="chevron" aria-hidden="true">+</span></button><div class="operation-body" hidden><p>${escapeHtml(operation.description ?? '')}</p><div class="meta"><span>${escapeHtml(tag.name)}</span><span>${escapeHtml(security)}</span></div>${operation.requestBody ? `<h3>Request body</h3><pre class="schema" data-schema="${escapeHtml(operation.operationId ?? '')}">Loading schema…</pre>` : ''}<h3>Responses</h3><ul>${Object.entries(operation.responses ?? {}).map(([status, response]) => `<li><code>${escapeHtml(status)}</code> ${escapeHtml(response.description ?? '')}</li>`).join('')}</ul></div></article>`;
      }).join('')}</section>`).join('')}
      <footer class="footer">Generated from this service’s OpenAPI document · <a href="/openapi.json">View raw specification</a></footer></main></div>
    <script>
      const specUrl='/openapi.json';
      document.querySelectorAll('.operation-head').forEach((button)=>button.addEventListener('click',async()=>{
        const open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));const panel=button.nextElementSibling;panel.hidden=open;button.querySelector('.chevron').textContent=open?'+':'−';
        if(open)return;
        const pre=panel.querySelector('[data-schema]');if(!pre||pre.dataset.loaded)return;
        try{const spec=await fetch(specUrl,{credentials:'omit'}).then((response)=>response.json());const opId=button.closest('.operation').id.slice(3);const operation=Object.values(spec.paths).flatMap((methods)=>Object.values(methods)).find((item)=>item.operationId===opId);const ref=operation?.requestBody?.content?.['application/json']?.schema?.$ref;const key=ref?.split('/').pop();pre.textContent=key?JSON.stringify(spec.components?.schemas?.[key]??{reference:key},null,2):'No request body schema';pre.dataset.loaded='true';pre.classList.add('schema')}catch{pre.textContent='Could not load schema. Open the raw OpenAPI document instead.'}
      }));
    </script></body></html>`;
}

export async function registerApiDocs(app: FastifyInstance, document: OpenApiDocument): Promise<void> {
  app.get('/openapi.json', async (_request, reply) => reply.type('application/json; charset=utf-8').send(document));
  app.get('/docs', async (_request, reply) => reply.type('text/html; charset=utf-8').send(renderDocsHtml(document)));
}
