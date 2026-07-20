#!/usr/bin/env python3
"""Fetch public records that can corroborate SEP implementation without changing goal facts.

Sources are official City or federal primary records. Raw response bytes are preserved under
data/raw/public-records/<date>/; normalized discovery metadata is written to
data/live/public-records.json. A failed request preserves the prior normalized record.
"""
import hashlib,json,re,sys,urllib.parse,urllib.request,subprocess,shutil
from datetime import datetime,timezone
from html import unescape
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; LIVE=ROOT/'data'/'public-records.json'
MANIFEST=ROOT/'data'/'browser-download-manifest.json'
NOW=datetime.now(timezone.utc); DAY=NOW.date().isoformat(); RAW=ROOT/'data'/'raw'/'public-records'/DAY
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 SEP-Accountability/1.0'
SOURCES=[
 ('sep','Official SEP and annual reports','https://www.greensboro-nc.gov/departments/office-of-sustainability-and-resilience/strategic-energy-plan',['report','strategic energy','implementation']),
 ('cip','Capital Improvements Program','https://www.greensboro-nc.gov/departments/budget-evaluation/capital-improvements-program-cip',['cip','capital','bond','map']),
 ('budget','Adopted budgets','https://www.greensboro-nc.gov/departments/budget-evaluation/learn-about-the-city-budget',['budget','adopted','recommended']),
 ('contracts-ei','Engineering and Inspections contracts','https://www.greensboro-nc.gov/departments/engineering-inspections/developers-contractors/available-contracts',['award','contract','rfp','rfq']),
 ('contracts-water','Water Resources contracts','https://www.greensboro-nc.gov/departments/water-resources/available-contracts',['award','contract','generator','electrical']),
 ('csc','Community Sustainability Council','https://www.greensboro-nc.gov/departments/office-of-sustainability-and-resilience/community-sustainability-council-csc/-folder-1982',['agenda','minutes','meeting','document']),
 ('arpa','American Rescue Plan projects','https://www.greensboro-nc.gov/government/city-council/american-rescue-plan',['spending','project','sustainability','report']),
]
HREF=re.compile(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',re.I|re.S); TAG=re.compile('<[^>]+>')
def request(url):
 req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/json','Accept-Language':'en-US,en;q=0.9'})
 with urllib.request.urlopen(req,timeout=45) as r:return r.read(),dict(r.headers),r.geturl()
def rendered_page(url):
 candidates=[shutil.which('google-chrome'),shutil.which('chromium'),shutil.which('chromium-browser'),r'C:\Program Files\Google\Chrome\Application\chrome.exe']
 chrome=next((x for x in candidates if x and Path(x).exists()),None)
 if not chrome:raise RuntimeError('Rendered-page fallback unavailable: Chrome/Chromium not installed')
 run=subprocess.run([chrome,'--headless=new','--disable-gpu','--no-sandbox','--dump-dom',url],capture_output=True,timeout=90)
 if run.returncode or not run.stdout:raise RuntimeError(f'Rendered-page fallback failed ({run.returncode})')
 return run.stdout,{},url
def links(html,base,terms):
 out=[]
 for href,label in HREF.findall(html):
  label=' '.join(unescape(TAG.sub(' ',label)).split()); url=urllib.parse.urljoin(base,unescape(href))
  hay=(label+' '+url).lower()
  downloadable=bool(re.search(r'/showpublished(?:document)?/|/showdocument\?|\.(pdf|docx?|xlsx?|csv)(?:$|\?)',url,re.I))
  if label and (downloadable or any(t in hay for t in terms)) and url.startswith('http'):
   out.append({'title':label[:240],'url':url,'documentType':Path(urllib.parse.urlparse(url).path).suffix.lower().lstrip('.') or 'web'})
 seen=set();return [x for x in out if not (x['url'] in seen or seen.add(x['url']))][:250]
def inventory_documents(sid,records):
 out=[]; dest=RAW/'downloads'/sid;dest.mkdir(parents=True,exist_ok=True)
 for i,record in enumerate(records):
  url=record['url']; is_download=bool(re.search(r'/showpublished(?:document)?/|/showdocument\?|\.(pdf|docx?|xlsx?|csv)(?:$|\?)',url,re.I))
  item={**record,'retrievalState':'cross_referenced','analyzed':False}
  existing=None
  if sid=='sep':
   if '54579' in url:existing=ROOT/'Strategic Energy Plan 2022.pdf'
   elif 'Sustainability-Resilience-2025-Annual-Progress' in url:existing=ROOT/'publication.pdf'
   elif 'Resilience-2024-Annual-Progress' in url:existing=next(ROOT.glob('Download Version-Office of Sustainability and Resilience 2024 Annual Progress Rep*.pdf'),None)
   elif 'Resilience-2023-Annual-Progress' in url:existing=ROOT/'OSR Annual Progress Report 2024.pdf'
  if existing and existing.exists():
   item.update({'retrievalState':'downloaded','localPath':str(existing.relative_to(ROOT)).replace('\\','/'),'bytes':existing.stat().st_size,'sha256':hashlib.sha256(existing.read_bytes()).hexdigest(),'analyzed':True,'analysisNote':'Existing authoritative local copy; already analyzed into the central goal and citation datasets.'});out.append(item);continue
  if not is_download:
   item['crossReferenceReason']='Interactive or web resource; retained as a source-page cross-reference.';out.append(item);continue
  # Download recent/current documents; historical inventories remain fully cross-referenced to avoid repository bloat.
  title=record['title']; current=(sid=='sep' or bool(re.search(r'energy|solar|sustainab|emission|electric|vehicle|fleet|tree canopy|roof|hvac|led|annual progress|award|cancellation|cancelation',title,re.I)) or (sid in ('cip','budget','arpa') and bool(re.search(r'202[4-9]|FY 2[4-9]|spending|progress',title,re.I))))
  if not current:
   item['crossReferenceReason']='Historical downloadable item inventoried; not duplicated locally under the current-document retention policy.';out.append(item);continue
  try:
   raw,headers,final=request(url)
   if len(raw)>20_000_000:
    item['crossReferenceReason']=f'Document is {len(raw)} bytes, above the 20 MB repository retention limit.';out.append(item);continue
   ctype=headers.get('Content-Type','');ext=Path(urllib.parse.urlparse(final).path).suffix.lower()
   if not ext or len(ext)>6:ext='.pdf' if 'pdf' in ctype else '.bin'
   name=f'{i:03d}-{hashlib.sha256(url.encode()).hexdigest()[:10]}{ext}';path=dest/name;path.write_bytes(raw)
   item.update({'retrievalState':'downloaded','localPath':str(path.relative_to(ROOT)).replace('\\','/'),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'contentType':ctype,'analyzed':False})
   pdftotext=shutil.which('pdftotext')
   if pdftotext and (ext=='.pdf' or 'pdf' in ctype):
    text_path=path.with_suffix('.txt');result=subprocess.run([pdftotext,'-layout',str(path),str(text_path)],capture_output=True,timeout=120)
    if result.returncode==0 and text_path.exists() and text_path.stat().st_size:
     content=text_path.read_text(encoding='utf-8',errors='replace');terms=['energy','solar','renewable','emission','electric vehicle','fleet','greenhouse gas','sustainability','efficiency','building audit','tree canopy','EECBG'];hits={term:len(re.findall(re.escape(term),content,re.I)) for term in terms};item.update({'analyzed':True,'analysisTextPath':str(text_path.relative_to(ROOT)).replace('\\','/'),'analysisTermHits':{k:v for k,v in hits.items() if v}})
    else:item['analysisNote']='Downloaded for analysis; text extraction unavailable or document has no text layer.'
  except Exception as exc:item['crossReferenceReason']=f'Download attempt failed; source retained for follow-up: {exc}'
  out.append(item)
 return out
def previous():
 try:return json.loads(LIVE.read_text(encoding='utf-8'))
 except Exception:return {'datasets':[]}
def fetch_arcgis():
 base='https://gis.greensboro-nc.gov/arcgis/rest/services/EngineeringInspections/BuildingPermits_MS/MapServer/6'
 string_fields=['ApplicationType','Description','TypeConstructionDesc','OccupancyDesc']
 clauses=[f"UPPER({f}) LIKE '%SOLAR%'" for f in string_fields]; query=base+'/query?'+urllib.parse.urlencode({'where':' OR '.join(clauses),'outFields':'OBJECTID,PermitNum,IssuedDate,StatusCurrent,ApplicationType,Description,TotalCost,FinalCO,FinalCODate,CensusTract','returnGeometry':'false','f':'geojson','resultRecordCount':'2000'})
 qraw,qheaders,qurl=request(query); payload=json.loads(qraw); features=payload.get('features',[])
 aggregates={}
 for feature in features:
  p=feature.get('properties',{});stamp=p.get('IssuedDate');year=datetime.fromtimestamp(stamp/1000,timezone.utc).year if isinstance(stamp,(int,float)) else (str(stamp)[:4] if stamp else 'Unknown');tract=str(p.get('CensusTract') or 'Unknown').strip();key=(str(year),tract,p.get('FinalCO') or 'Unknown');aggregates[key]=aggregates.get(key,0)+1
 records=[{'issuedYear':k[0],'censusTract':k[1],'finalCO':k[2],'candidatePermitCount':v} for k,v in sorted(aggregates.items())]
 return {'id':'solar-permits','name':'Solar-related building permit candidates','sourceUrl':base,'retrievedAt':NOW.isoformat(),'lastSuccessfulFetch':NOW.isoformat(),'freshnessState':'current','recordCount':len(features),'aggregateRecordCount':len(records),'records':records,'privacyNote':'Published data is aggregated by tract/year; owner names, addresses, and exact coordinates are not collected.','warning':'Keyword candidates only. A permit does not establish completion, ownership, operation, or SEP attribution.','fieldsSearched':string_fields}, [('solar-permits.geojson',qraw)]
def main():
 RAW.mkdir(parents=True,exist_ok=True); old={x.get('id'):x for x in previous().get('datasets',[])}; datasets=[]; failures=[]
 manifest={x.get('id'):x for x in json.loads(MANIFEST.read_text(encoding='utf-8')).get('sources',[])} if MANIFEST.exists() else {}
 for sid,name,url,terms in SOURCES:
  try:
   access='direct'
   try:raw,headers,final=request(url)
   except Exception:raw,headers,final=rendered_page(url);access='rendered_browser_fallback'
   text=raw.decode('utf-8','replace');discovered=links(text,final,terms)
   if access=='direct' or discovered:(RAW/f'{sid}.html').write_bytes(raw)
   if manifest.get(sid,{}).get('records'):
    discovered=manifest[sid]['records'];access='checked_in_rendered_browser_manifest'
   if not discovered:raise RuntimeError('No document links discovered; page shell is not accepted as a successful inventory')
   found=inventory_documents(sid,discovered)
   downloaded=sum(x['retrievalState']=='downloaded' for x in found);crossed=len(found)-downloaded
   datasets.append({'id':sid,'name':name,'sourceUrl':url,'resolvedUrl':final,'retrievedAt':NOW.isoformat(),'lastSuccessfulFetch':NOW.isoformat(),'freshnessState':'current','accessMethod':access,'contentSha256':hashlib.sha256(raw).hexdigest(),'recordCount':len(found),'downloadedCount':downloaded,'crossReferencedCount':crossed,'records':found,'verificationType':'external-primary','analystReviewed':False,'analysisState':'inventory_complete_analysis_pending'})
  except Exception as exc:
   failures.append({'id':sid,'error':str(exc)}); prior=old.get(sid,{'id':sid,'name':name,'sourceUrl':url,'records':[]}); prior.update({'lastAttemptedFetch':NOW.isoformat(),'freshnessState':'error','lastError':str(exc)});datasets.append(prior)
 try:
  permit,raws=fetch_arcgis();datasets.append(permit)
  for name,raw in raws:(RAW/name).write_bytes(raw)
 except Exception as exc:
  failures.append({'id':'solar-permits','error':str(exc)});prior=old.get('solar-permits',{'id':'solar-permits','records':[]});prior.update({'lastAttemptedFetch':NOW.isoformat(),'freshnessState':'error','lastError':str(exc)});datasets.append(prior)
 result={'generatedAt':NOW.isoformat(),'rawSnapshotDirectory':str(RAW.relative_to(ROOT)).replace('\\','/'),'methodology':'Discovery only. Records do not change goal status or funding until an analyst approves a source-supported link.','datasets':datasets,'failures':failures}
 LIVE.parent.mkdir(parents=True,exist_ok=True);LIVE.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(f'Wrote {LIVE}: {sum(x.get("recordCount",0) for x in datasets)} discovered records, {len(failures)} failures')
 return 1 if failures else 0
if __name__=='__main__':sys.exit(main())
