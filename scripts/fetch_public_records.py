#!/usr/bin/env python3
"""Fetch public records that can corroborate SEP implementation without changing goal facts.

Sources are official City or federal primary records. Raw response bytes are preserved under
data/raw/public-records/<date>/; normalized discovery metadata is written to
data/live/public-records.json. A failed request preserves the prior normalized record.
"""
import hashlib,json,re,sys,urllib.parse,urllib.request
from datetime import datetime,timezone
from html import unescape
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; LIVE=ROOT/'data'/'public-records.json'
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
def links(html,base,terms):
 out=[]
 for href,label in HREF.findall(html):
  label=' '.join(unescape(TAG.sub(' ',label)).split()); url=urllib.parse.urljoin(base,unescape(href))
  hay=(label+' '+url).lower()
  if label and any(t in hay for t in terms) and url.startswith('http'):
   out.append({'title':label[:240],'url':url,'documentType':Path(urllib.parse.urlparse(url).path).suffix.lower().lstrip('.') or 'web'})
 seen=set();return [x for x in out if not (x['url'] in seen or seen.add(x['url']))][:250]
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
 for sid,name,url,terms in SOURCES:
  try:
   raw,headers,final=request(url); (RAW/f'{sid}.html').write_bytes(raw); text=raw.decode('utf-8','replace'); found=links(text,final,terms)
   datasets.append({'id':sid,'name':name,'sourceUrl':url,'resolvedUrl':final,'retrievedAt':NOW.isoformat(),'lastSuccessfulFetch':NOW.isoformat(),'freshnessState':'current','contentSha256':hashlib.sha256(raw).hexdigest(),'recordCount':len(found),'records':found,'verificationType':'external-primary','analystReviewed':False})
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
