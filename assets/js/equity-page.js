(async function(){
  const data=await loadJson('canopy-assessment.json','');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compact=n=>Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
  const money=n=>Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(n);
  const pct=n=>`${Number(n).toFixed(1)}%`;
  const s=data.summary;
  document.getElementById('canopy-metrics').innerHTML=[
    [pct(s.canopyCoveragePct),'City land with canopy'],[compact(s.trees),'Modeled trees'],[compact(s.canopyAcres),'Canopy acres'],[money(s.annualBenefitsUsd),'Modeled annual benefits']
  ].map(([value,label])=>`<div class="metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('');
  const rows=(data.strata||[]).filter(x=>x.Stratum&&Number.isFinite(x.Net_Canopy_Change)).sort((a,b)=>b.Net_Canopy_Change-a.Net_Canopy_Change);
  const max=Math.max(...rows.map(x=>Math.abs(x.Net_Canopy_Change)),1);
  document.getElementById('canopy-bars').innerHTML=rows.map(row=>{const value=row.Net_Canopy_Change;return `<article class="canopy-bar"><div class="canopy-bar__label"><strong>${esc(row.Stratum)}</strong><span>${value>=0?'+':''}${compact(value)} m&sup2; net</span></div><div class="canopy-bar__track"><span class="${value<0?'loss':'gain'}" style="--bar:${Math.max(3,Math.abs(value)/max*100)}%"></span></div><small>${compact(row.Canopy_Gain)} gained / ${compact(row.Canopy_Loss)} lost</small></article>`}).join('');
  const priority=(data.priorityTracts||[]).map(x=>({...x,priority:(x.Very_High||0)+(x.High||0),share:x.Total?100*((x.Very_High||0)+(x.High||0))/x.Total:0})).sort((a,b)=>b.priority-a.priority).slice(0,12);
  document.getElementById('priority-tracts').innerHTML=priority.map(x=>`<tr><th scope="row">${esc(x.NAME)}</th><td>${Number(x.Very_High||0).toFixed(1)} ac</td><td>${Number(x.High||0).toFixed(1)} ac</td><td><span class="priority-meter" style="--priority:${Math.min(100,x.share)}%">${pct(x.share)}</span></td><td>${Number(x.AverageQuantileScore_All||0).toFixed(1)} / 4</td></tr>`).join('');
})().catch(error=>{console.error(error);document.getElementById('canopy-metrics').innerHTML='<div class="unknown-panel">The local canopy snapshot could not be loaded.</div>'});
