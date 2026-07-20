#!/usr/bin/env python3
"""Dependency-free integrity checks for authoritative and baked SEP data."""
import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'data';errors=[]
def load(name):
 try:return json.loads((DATA/name).read_text(encoding='utf-8'))
 except Exception as exc:errors.append(f'data/{name}: invalid JSON: {exc}');return {}
index=load('index.json');departments=load('departments.json');linkage=load('funding-linkage.json')
public_records=load('public-records.json');federal_awards=load('federal-awards.json');funding=load('funding.json')
source_ids={s.get('id') for s in index.get('sources',[])};goal_ids=set();goals=[]
def citations(value,path='root'):
 if path.startswith('index.citationSchema'):return
 if isinstance(value,dict):
  if 'source' in value and ('page' in value or 'table' in value):
   if value['source'] not in source_ids:errors.append(f'{path}: missing source {value["source"]!r}')
   pages=value.get('page',[]);pages=pages if isinstance(pages,list) else [pages]
   for page in pages:
    if not isinstance(page,int) or page<1:errors.append(f'{path}: impossible page {page!r}')
  for k,v in value.items():citations(v,f'{path}.{k}')
 elif isinstance(value,list):
  for i,v in enumerate(value):citations(v,f'{path}[{i}]')
for di,d in enumerate(departments.get('departments',[])):
 if not d.get('id') or not d.get('name'):errors.append(f'departments[{di}]: id and name required')
 for gi,g in enumerate(d.get('goals',[])):
  path=f'{d.get("id","?")}.goals[{gi}]';gid=g.get('id');goals.append(g)
  if not gid or not g.get('text'):errors.append(f'{path}: id and text required')
  if gid in goal_ids:errors.append(f'{path}: duplicate goal id {gid}')
  goal_ids.add(gid)
  for h in g.get('statusHistory',[]):
   if h.get('year') not in (2023,2024):errors.append(f'{gid}: invalid history year {h.get("year")}')
   if h.get('status') not in ('Ongoing','In Progress','Initiated',None):errors.append(f'{gid}: unknown status {h.get("status")}')
citations(departments,'departments');citations(index,'index')
linked={x.get('goalId') for x in linkage.get('goalLevelDetail',[])}
if linked!=goal_ids:errors.append(f'funding-linkage IDs differ: missing={sorted(goal_ids-linked)}, extra={sorted(linked-goal_ids)}')
if len(goals)!=21:errors.append(f'expected 21 goals, found {len(goals)}')
dataset_ids=[x.get('id') for x in public_records.get('datasets',[])]
if len(dataset_ids)!=len(set(dataset_ids)):errors.append('public-records: duplicate dataset id')
for dataset in public_records.get('datasets',[]):
 if dataset.get('freshnessState') not in ('current','stale','error'):errors.append(f'public-records {dataset.get("id")}: invalid freshness state')
 forbidden={'OwnerName','OwnerName2','FullAddress','MailAddress','MailAddress2'}
 def privacy_keys(v):
  if isinstance(v,dict):
   for k,x in v.items():
    if k in forbidden:errors.append(f'public-records: privacy-minimized output contains {k}')
    privacy_keys(x)
  elif isinstance(v,list):
   for x in v:privacy_keys(x)
 privacy_keys(dataset.get('records',[]))
funding_text=json.dumps(funding)
for award in federal_awards.get('awards',[]):
 if award.get('awardId') not in funding_text:errors.append(f'federal-awards: unreferenced award {award.get("awardId")}')
for html in list(ROOT.glob('*.html'))+list((ROOT/'departments').glob('*.html')):
 text=html.read_text(encoding='utf-8');match=re.search(r'<!-- BUILD:DATA files="([^"]*)" -->(.*?)<!-- /BUILD:DATA -->',text,re.S)
 if not match:continue
 for name in filter(None,map(str.strip,match.group(1).split(','))):
  block=re.search(rf'<script type="application/json" id="baked-{re.escape(name[:-5])}">(.*?)</script>',match.group(2),re.S)
  if not block:errors.append(f'{html.name}: missing baked {name}');continue
  if json.loads(block.group(1))!=load(name):errors.append(f'{html.name}: baked {name} differs from source')
if errors:print('SEP data validation failed:\n'+'\n'.join(f'  - {e}' for e in errors));sys.exit(1)
print(f'OK: {len(goals)} unique goals, {len(source_ids)} central sources, funding links and baked JSON verified.')
