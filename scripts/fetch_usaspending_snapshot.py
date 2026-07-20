#!/usr/bin/env python3
"""Snapshot known USAspending awards referenced by authoritative funding records."""
import json,urllib.request
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; FUND=ROOT/'data'/'funding.json'; OUT=ROOT/'data'/'federal-awards.json'
def walk(v,path='funding'):
 if isinstance(v,dict):
  if v.get('usaSpendingAwardId'):yield path,v
  for k,x in v.items():yield from walk(x,f'{path}.{k}')
 elif isinstance(v,list):
  for i,x in enumerate(v):yield from walk(x,f'{path}[{i}]')
def main():
 now=datetime.now(timezone.utc); old={}
 try:old={x['awardId']:x for x in json.loads(OUT.read_text(encoding='utf-8')).get('awards',[])}
 except Exception:pass
 awards=[];fail=[]
 for path,item in walk(json.loads(FUND.read_text(encoding='utf-8'))):
  aid=item['usaSpendingAwardId'];url=f'https://api.usaspending.gov/api/v2/awards/{aid}/'
  try:
   req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'SEP-Accountability-Dashboard/1.0'})
   with urllib.request.urlopen(req,timeout=45) as r:data=json.loads(r.read().decode())
   awards.append({'awardId':aid,'fundingPath':path,'sourceUrl':url,'retrievedAt':now.isoformat(),'lastSuccessfulFetch':now.isoformat(),'freshnessState':'current','totalObligation':data.get('total_obligation'),'totalOutlay':data.get('total_outlay'),'dateSigned':data.get('date_signed'),'description':data.get('description'),'recipient':data.get('recipient_name'),'raw':data})
  except Exception as exc:
   row=old.get(aid,{'awardId':aid,'fundingPath':path,'sourceUrl':url});row.update({'lastAttemptedFetch':now.isoformat(),'freshnessState':'error','lastError':str(exc)});awards.append(row);fail.append({'awardId':aid,'error':str(exc)})
 OUT.write_text(json.dumps({'generatedAt':now.isoformat(),'methodology':'Only award IDs already confirmed in funding.json are queried; IDs are never guessed. A failed refresh preserves the last successful record.','awards':awards,'failures':fail},indent=2,ensure_ascii=False),encoding='utf-8');print(f'Wrote {OUT}: {len(awards)} awards, {len(fail)} failures')
if __name__=='__main__':main()
