(function(){
  const baked=document.getElementById('baked-collaborations');
  const data=baked?JSON.parse(baked.textContent):null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!data)return;
  const initiatives=data.initiatives||[];
  const departments=new Set(initiatives.flatMap(i=>i.participants||[]).map(p=>p.name));
  const partners=new Set(initiatives.flatMap(i=>i.externalPartners||[]));
  const goals=new Set(initiatives.flatMap(i=>i.linkedGoalIds||[]));
  document.getElementById('collab-summary').innerHTML=[['Initiatives',initiatives.length],['Named City participants',departments.size],['External partners',partners.size],['Linked department goals',goals.size]].map(([label,value])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('');
  const filter=document.getElementById('collab-filter');
  const categories=[...new Set(initiatives.map(i=>i.category))].sort();
  filter.innerHTML='<option value="">All relationship types</option>'+categories.map(x=>`<option>${esc(x)}</option>`).join('');
  function cite(e){const c=e.citation||{};const tier=c.sourceType==='external'?'Independently verified':'City-reported';return c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(e.label)} · ${tier}</a>`:`<span>${esc(e.label)} · ${tier}</span>`}
  function render(){const query=document.getElementById('collab-search').value.trim().toLowerCase();const status=document.getElementById('collab-status').value;const rows=initiatives.filter(i=>(!filter.value||i.category===filter.value)&&(!status||i.attributionStatus===status)&&(!query||JSON.stringify(i).toLowerCase().includes(query)));document.getElementById('collab-count').textContent=`${rows.length} of ${initiatives.length} shared initiatives`;document.getElementById('initiative-list').innerHTML=rows.length?rows.map(i=>`<article class="initiative"><p class="eyebrow">${esc(i.category)}</p><h2>${esc(i.title)}</h2><p class="initiative__meta"><span class="badge ${i.attributionStatus==='documented'?'reported':i.attributionStatus==='unresolved'?'danger':'warning'}">${esc(i.attributionStatus)}</span> · ${esc(i.years.join('–'))}</p><p>${esc(i.summary)}</p><dl class="role-grid">${i.participants.map(p=>`<div><dt>${esc(p.name)}</dt><dd>${esc(p.role)}</dd></div>`).join('')}</dl>${i.externalPartners.length?`<p><strong>External partners:</strong> ${esc(i.externalPartners.join('; '))}</p>`:''}${i.linkedGoalIds.length?`<p><strong>Linked goals:</strong> ${i.linkedGoalIds.map(g=>`<a href="explorer.html?q=${encodeURIComponent(g)}">${esc(g)}</a>`).join(', ')}</p>`:''}<details><summary>Year-by-year milestones</summary><ol>${i.milestones.map(m=>`<li><strong>${m.year}:</strong> ${esc(m.text)}</li>`).join('')}</ol></details><p class="evidence-note"><strong>Evidence:</strong> ${i.evidence.map(cite).join(' · ')}</p><p class="limit-note"><strong>Attribution limit:</strong> ${esc(i.attributionGap)}</p></article>`).join(''):'<div class="unknown-panel"><h2>No initiatives match</h2><p>Clear a filter or broaden the search.</p></div>'}
  [filter,document.getElementById('collab-status')].forEach(x=>x.addEventListener('change',render));document.getElementById('collab-search').addEventListener('input',render);render();
})();
