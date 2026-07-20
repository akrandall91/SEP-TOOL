#!/usr/bin/env python3
"""Compare acquired/cross-referenced public records with current authoritative datasets."""
import hashlib,json
from datetime import date
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'data'
def load(path,default={}):
 try:return json.loads(path.read_text(encoding='utf-8'))
 except FileNotFoundError:return default
def main():
 index=load(DATA/'index.json');public=load(DATA/'public-records.json');funding=load(DATA/'funding.json');awards=load(DATA/'federal-awards.json');legistar=load(DATA/'live'/'legistar-snapshot.json')
 authoritative={s.get('sourceFile') for s in index.get('sources',[])};records=[]
 for dataset in public.get('datasets',[]):
  if dataset.get('id')=='solar-permits':
   records.append({'recordId':'solar-permits','datasetId':'solar-permits','title':dataset.get('name'),'impactClass':'new_contextual_dataset','effectOnAuthoritativeData':'none','candidateGoalIds':[],'finding':f"Adds {dataset.get('recordCount',0)} keyword-matched permit candidates summarized into {dataset.get('aggregateRecordCount',0)} tract/year/status aggregates.",'limitation':'No municipal ownership or SEP attribution is established; it cannot change a department goal status or establish implementation.'});continue
  for i,item in enumerate(dataset.get('records',[])):
   local=item.get('localPath');is_source=bool(local and Path(local).name in authoritative)
   if item.get('retrievalState')=='downloaded' and is_source:
    cls='already_integrated_authoritative_source';effect='none'
    finding='This exact local document is already the authoritative input for goals, annual statuses, and citations.'
   elif item.get('retrievalState')=='downloaded':
    cls='downloaded_analysis_required';effect='pending_review';finding='New local document is available but has not passed goal-link review.'
   else:
    cls='cross_reference_only';effect='unknown_until_review';finding=item.get('crossReferenceReason','Linked source retained for follow-up.')
   records.append({'recordId':f"{dataset.get('id')}:{i}",'datasetId':dataset.get('id'),'title':item.get('title'),'sourceUrl':item.get('url'),'localPath':local,'sha256':item.get('sha256'),'impactClass':cls,'effectOnAuthoritativeData':effect,'candidateGoalIds':[],'finding':finding})
 funding_text=json.dumps(funding)
 for award in awards.get('awards',[]):
  known=award.get('awardId') in funding_text
  records.append({'recordId':f"usaspending:{award.get('awardId')}",'datasetId':'federal-awards','title':f"USAspending award {award.get('awardId')}",'sourceUrl':award.get('sourceUrl'),'impactClass':'corroborates_existing_funding' if known else 'candidate_funding_record','effectOnAuthoritativeData':'adds_live_outlay_detail' if known else 'pending_review','candidateGoalIds':['WR-G2','CI-G1'] if known else [],'finding':f"Confirms ${award.get('totalObligation',0):,.2f} obligated and ${award.get('totalOutlay',0):,.2f} outlaid. The award ID and $314,150 grant were already present; outlay is refreshed operational detail.",'limitation':'Award spending does not establish goal completion or causation.'})
 known_ids={6283,7002,2507};matter_effects={
  6348:('corroborates_existing_external_asset','none',[], 'Corroborates the already represented White Street Landfill solar facility by documenting the Duke Energy utility easement; no goal status changes.'),
  2699:('candidate_historical_milestone','pending_attachment_review',['WR-G3'],'Adds evidence that a T. Z. Osborne solar lease was authorized in 2015. This may become a pre-SEP milestone for WR-G3, but authorization does not establish construction or operation.'),
  2507:('already_integrated_external_asset','none',[], 'Already represented in funding.json and the external-only White Street Landfill department record.'),
  1149:('contextual_pre_sep_infrastructure','none',[], 'Documents a pre-SEP electric-vehicle charging license; it does not establish progress on a current department goal.'),
  2432:('corroborates_existing_external_asset','none',[], 'Presentation record concerning the already represented White Street Landfill solar project.'),
  2132:('contextual_governance_record','none',[], 'Historical CSC greenhouse-gas presentation; title alone does not revise an emissions value.'),
  2131:('contextual_governance_record','none',[], 'Historical solar presentation; title alone does not establish a project milestone.'),
 }
 for matter in legistar.get('discoveredMatters',[]):
  mid=matter.get('matterId');known=mid in known_ids
  cls,effect,candidates,finding=matter_effects.get(mid,('already_integrated_governance_record' if known else 'candidate_legislative_cross_reference','none' if known else 'pending_attachment_review',[],'Already represented in the resolution/timeline record.' if known else 'Keyword discovery only; matter title is insufficient to change a goal without reviewing its attachments and exact language.'))
  records.append({'recordId':f'legistar:{mid}','datasetId':'legistar','title':matter.get('title'),'sourceUrl':f'https://webapi.legistar.com/v1/greensboro/matters/{mid}','impactClass':cls,'effectOnAuthoritativeData':effect,'candidateGoalIds':candidates,'finding':finding})
 counts={}
 for r in records:counts[r['impactClass']]=counts.get(r['impactClass'],0)+1
 material=[r for r in records if r['effectOnAuthoritativeData'] not in ('none','unknown_until_review')]
 out={'generatedAt':date.today().isoformat(),'methodology':'Acquisition never changes authoritative classifications automatically. Exact existing source files have no new impact; contextual datasets and title-only matches cannot establish goal progress.','summary':{'recordsAssessed':len(records),'classificationCounts':counts,'materialImpactCandidates':len(material),'authoritativeValuesChanged':0},'conclusion':'No authoritative goal status, reporting state, funding classification, or abandonment finding should change from the currently acquired files. USAspending adds refreshed outlay detail; permits add contextual tract-level activity only. Cross-referenced City documents remain pending content review.','records':records}
 (DATA/'public-record-impact.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(out['summary'],indent=2));print(out['conclusion'])
if __name__=='__main__':main()
