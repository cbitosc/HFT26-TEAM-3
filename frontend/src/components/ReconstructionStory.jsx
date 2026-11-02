import { Button, Badge } from '../ui-kit';
import { formatTime } from '../lib/time';

/** Representative stored events only; absent phases are never manufactured. */
export function storyChapters(events = [], preferredId) {
  const placed=events.filter(e=>Number.isFinite(e.start_ms)).slice().sort((a,b)=>a.start_ms-b.start_ms);
  if(!placed.length)return [];
  const contact=placed.find(e=>e.id===preferredId) || placed.find(e=>/collision|impact|contact/.test(e.event_type||'')) || placed.find(e=>/near_miss/.test(e.event_type||''));
  const chosen=[];
  const add=(label,event)=>{if(event&&!chosen.some(x=>x.event.id===event.id))chosen.push({label,event});};
  add('First observation',placed[0]);
  add('Junction movement',placed.find(e=>/enter|approach|cross/.test(e.event_type||'')));
  add('Speed change',placed.find(e=>/brak|slow|stop/.test(e.event_type||'')&&(!contact||e.start_ms<=contact.start_ms)));
  add(/near_miss/.test(contact?.event_type||'')?'Possible near miss':'Possible contact',contact);
  if(!contact)add('Later observation',placed[Math.floor((placed.length-1)/2)]);
  add(contact?'After the flagged moment':'Last observation',placed.slice().reverse().find(e=>!contact||e.start_ms>contact.start_ms));
  return chosen.sort((a,b)=>a.event.start_ms-b.event.start_ms).slice(0,5);
}
export function ChapterStrip({chapters,activeId,onPick}) {
 return <section className="recon-chapters" aria-label="Incident chapters"><div className="recon-section-title"><div><span className="t-eyebrow text-accent-text">FOLLOW THE SEQUENCE</span><h2 className="t-h2 mt-2">The incident, step by step</h2></div><span className="t-caption text-fg-3">Select a moment to inspect it</span></div>{chapters.length?<ol className="recon-chapter-list">{chapters.map(({label,event},i)=><li key={event.id}><button aria-pressed={activeId===event.id} onClick={()=>onPick(event)}><span className="recon-chapter-number">0{i+1}</span><span className="mono t-caption text-accent-text">{formatTime(event.start_ms)}</span><strong>{label}</strong><span className="recon-chapter-description">{event.title}</span></button></li>)}</ol>:<p className="t-small text-fg-3">No events have been placed on the case clock yet. Review the sources to establish their timing.</p>}<p className="t-caption mt-3 text-fg-3">Representative recorded events. A flagged moment does not confirm physical contact.</p></section>;
}
export function ThisMoment({event,nameOf,questions=[],onDetails,onEvidence,onPlay}) {
 return <aside className="recon-moment card" aria-label="This moment"><span className="t-eyebrow text-accent-text">THIS MOMENT</span><div className="mt-4 mb-5"><Badge variant="neutral">{event?.start_ms!=null?formatTime(event.start_ms):'Choose a chapter'}</Badge></div><h2 className="recon-moment-headline">{event?.title||'Explore the recorded sequence'}</h2>{!event&&<p className="t-small text-fg-2 mt-3">Select a chapter below the video. Its explanation and source appear here.</p>}{event&&<><div className="recon-moment-block"><h3>What supports this?</h3><p>{event.source_id?nameOf(event.source_id):'See the event trace for its supporting records.'}</p><span className="t-caption text-fg-3">{event.source_type==='sensor'?'Measured by sensor':event.category==='witness_claim'?'Reported by witness · unverified testimony':event.category==='inference'?'Inferred from recorded evidence':event.category==='machine_detection'?'Derived from video analysis · review the footage':'Recorded event · review against the source'}</span></div><div className="recon-moment-block"><h3>What is uncertain?</h3><p>{questions[0]?.title||'Interpretation and physical contact require source review.'}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" onClick={()=>onPlay(event)}>Go to moment</Button><Button size="sm" variant="outline" onClick={()=>onEvidence(event)}>View source</Button></div><button className="t-small mt-5 text-accent-text" onClick={()=>onDetails(event)}>Inspect full event details →</button></>}</aside>;
}
