#!/usr/bin/env python3
"""Generate conservative goal-year continuity and transition records.

This script never infers abandonment from silence and never overwrites departments.json.
Explicit cancellation/pause/supersession requires a reviewed primary-source event in
data/reviewed-events.json.
"""
import json
from datetime import date
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'data'
YEARS=(2023,2024,2025); STATUS_RANK={'Initiated':1,'In Progress':2}
def load(name,default):
 try:return json.loads((DATA/name).read_text(encoding='utf-8'))
 except FileNotFoundError:return default
def year_record(goal,year):
 update=goal.get('statusUpdate2025') if year==2025 else next((x for x in goal.get('statusHistory',[]) if x.get('year')==year),None)
 return {'year':year,'reportingState':'reported' if update is not None else 'not_reported','implementationStatus':(update or {}).get('status') or 'unknown','progressDirection':'unknown','statusText':(update or {}).get('text') or (update or {}).get('statusNote'),'citation':(update or {}).get('citation'),'evidenceType':'city_report' if update is not None else 'missing'}
def transition(a,b,had_earlier=False):
 if a['reportingState']=='not_reported' and b['reportingState']=='reported':return 'returned_after_gap' if had_earlier else 'newly_reported'
 if a['reportingState']=='reported' and b['reportingState']=='not_reported':return 'reporting_dropoff'
 if a['reportingState']=='not_reported' and b['reportingState']=='not_reported':return 'continued_nonreporting'
 if STATUS_RANK.get(b['implementationStatus'],0)>STATUS_RANK.get(a['implementationStatus'],0):return 'progressed'
 if a['implementationStatus']==b['implementationStatus']:return 'continued_reporting'
 return 'status_changed_unclear'
def main():
 departments=load('departments.json',{}); reviewed=load('reviewed-events.json',{'events':[]}); events={}
 for event in reviewed.get('events',[]):events.setdefault(event.get('goalId'),[]).append(event)
 rows=[]
 for dept in departments.get('departments',[]):
  for goal in dept.get('goals',[]):
   yearly=[year_record(goal,y) for y in YEARS]; transitions=[]; had=False
   for i in range(1,len(yearly)):
    transitions.append({'fromYear':yearly[i-1]['year'],'toYear':yearly[i]['year'],'type':transition(yearly[i-1],yearly[i],had),'fromStatus':yearly[i-1]['implementationStatus'],'toStatus':yearly[i]['implementationStatus']})
    had=had or yearly[i-1]['reportingState']=='reported'
   explicit=sorted(events.get(goal['id'],[]),key=lambda x:x.get('date',''))
   terminal=next((e for e in reversed(explicit) if e.get('eventType') in ('paused','cancelled','superseded','completed')),None)
   silent=sum(1 for y in reversed(yearly) if y['reportingState']=='not_reported') if yearly[-1]['reportingState']=='not_reported' else 0
   target_year=int((__import__('re').search(r'20\d{2}',goal.get('text','')) or [0])[0] or 0)
   interpretation=terminal['eventType'] if terminal else ('went_silent' if goal.get('wentSilent',{}).get('value') else 'reported' if yearly[-1]['reportingState']=='reported' else 'not_reported')
   rows.append({'goalId':goal['id'],'departmentId':dept['id'],'department':dept['name'],'goalText':goal['text'],'targetYear':target_year or None,'targetPassedUnverified':bool(target_year and target_year<=2025 and not terminal),'fundingState':'funded' if goal.get('fundingLink',{}).get('hasActiveFunding') else 'no_linked_funding','deprioritized':bool(goal.get('deprioritizedInSource',{}).get('value')),'years':yearly,'transitions':transitions,'silentReportingCycles':silent,'currentInterpretation':interpretation,'explicitEvents':explicit,'abandonmentClaimSupported':bool(terminal and terminal['eventType']=='cancelled')})
 metrics={k:0 for k in ('reported_all_years','newly_reported_2025','returned_2025','went_silent_2025','silent_two_or_more','target_passed_unverified','explicitly_paused','explicitly_cancelled','completed')}
 for r in rows:
  if all(y['reportingState']=='reported' for y in r['years']):metrics['reported_all_years']+=1
  t=r['transitions'][-1]['type'];metrics['newly_reported_2025']+=t=='newly_reported';metrics['returned_2025']+=t=='returned_after_gap';metrics['went_silent_2025']+=t=='reporting_dropoff';metrics['silent_two_or_more']+=r['silentReportingCycles']>=2;metrics['target_passed_unverified']+=r['targetPassedUnverified'];metrics['explicitly_paused']+=r['currentInterpretation']=='paused';metrics['explicitly_cancelled']+=r['currentInterpretation']=='cancelled';metrics['completed']+=r['currentInterpretation']=='completed'
 out={'$schema':'schemas/goal-transitions.schema.json','generatedAt':date.today().isoformat(),'years':list(YEARS),'methodology':'Reporting continuity is separate from implementation. Silence never establishes abandonment. Paused, cancelled, superseded, and completed require a reviewed primary-source event.','metrics':metrics,'goals':rows}
 (DATA/'goal-transitions.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8');print(f'Wrote {len(rows)} goal transition records')
if __name__=='__main__':main()
