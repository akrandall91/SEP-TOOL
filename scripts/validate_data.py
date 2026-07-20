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
transitions=load('goal-transitions.json');reviewed_events=load('reviewed-events.json');review_proposals=load('review-proposals.json')
record_impact=load('public-record-impact.json')
collaborations=load('collaborations.json')
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
initiative_ids=[]
for initiative in collaborations.get('initiatives',[]):
 iid=initiative.get('id');initiative_ids.append(iid)
 if not iid or not initiative.get('title'):errors.append('collaborations: initiative id and title required')
 if initiative.get('attributionStatus') not in ('documented','mixed','inferred','unresolved'):errors.append(f'collaborations {iid}: invalid attribution status')
 for gid in initiative.get('linkedGoalIds',[]):
  if gid not in goal_ids:errors.append(f'collaborations {iid}: unknown goal {gid}')
 for participant in initiative.get('participants',[]):
  if not participant.get('name') or not participant.get('role'):errors.append(f'collaborations {iid}: participant name and role required')
 if not initiative.get('evidence'):errors.append(f'collaborations {iid}: evidence required')
if len(initiative_ids)!=len(set(initiative_ids)):errors.append('collaborations: duplicate initiative id')
citations(collaborations,'collaborations')
transition_ids=[x.get('goalId') for x in transitions.get('goals',[])]
if set(transition_ids)!=goal_ids:errors.append(f'goal-transitions IDs differ: missing={sorted(goal_ids-set(transition_ids))}, extra={sorted(set(transition_ids)-goal_ids)}')
if len(transition_ids)!=len(set(transition_ids)):errors.append('goal-transitions: duplicate goal id')
allowed_transitions={'newly_reported','returned_after_gap','reporting_dropoff','continued_nonreporting','progressed','continued_reporting','status_changed_unclear'}
for row in transitions.get('goals',[]):
 if len(row.get('years',[]))!=3 or len(row.get('transitions',[]))!=2:errors.append(f'{row.get("goalId")}: expected 3 years and 2 transitions')
 for t in row.get('transitions',[]):
  if t.get('type') not in allowed_transitions:errors.append(f'{row.get("goalId")}: invalid transition {t.get("type")}')
 if row.get('currentInterpretation')=='cancelled' and not row.get('abandonmentClaimSupported'):errors.append(f'{row.get("goalId")}: cancellation lacks reviewed support')
for event in reviewed_events.get('events',[]):
 if event.get('goalId') not in goal_ids:errors.append(f'reviewed event {event.get("id")}: unknown goal')
 if not event.get('citation'):errors.append(f'reviewed event {event.get("id")}: citation required')
for proposal in review_proposals.get('proposals',[]):
 if proposal.get('goalId') not in goal_ids:errors.append(f'review proposal {proposal.get("id")}: unknown goal')
impact_ids=[x.get('recordId') for x in record_impact.get('records',[])]
if len(impact_ids)!=len(set(impact_ids)):errors.append('public-record-impact: duplicate record id')
for impact in record_impact.get('records',[]):
 for gid in impact.get('candidateGoalIds',[]):
  if gid not in goal_ids:errors.append(f'public-record-impact {impact.get("recordId")}: unknown candidate goal {gid}')
if record_impact.get('summary',{}).get('authoritativeValuesChanged') not in (0,None):errors.append('public-record-impact claims automatic authoritative changes')
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
 if dataset.get('id')!='solar-permits':
  records=dataset.get('records',[]);downloaded=sum(x.get('retrievalState')=='downloaded' for x in records);crossed=sum(x.get('retrievalState')=='cross_referenced' for x in records)
  if downloaded+crossed!=len(records):errors.append(f'public-records {dataset.get("id")}: every item must be downloaded or cross-referenced')
  if dataset.get('downloadedCount')!=downloaded or dataset.get('crossReferencedCount')!=crossed:errors.append(f'public-records {dataset.get("id")}: disposition counts do not reconcile')
  for record in records:
   if record.get('retrievalState')=='cross_referenced' and not record.get('crossReferenceReason'):errors.append(f'public-records {dataset.get("id")}: cross-reference lacks reason')
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
