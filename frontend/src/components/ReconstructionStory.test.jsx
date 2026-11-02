import { describe, expect, it } from 'vitest';
import { storyChapters } from './ReconstructionStory';
const e=(id,start_ms,event_type)=>({id,start_ms,event_type,title:id});
describe('recorded incident chapters',()=>{
 it('keeps the strongest stored contact and chronological context without inventing phases',()=>{
  const events=[e('last',10000,'vehicle_stop'),e('near',2000,'near_miss'),e('first',0,'vehicle_seen'),e('brake',3000,'hard_braking'),e('contact',7000,'possible_collision')];
  const out=storyChapters(events,'contact');
  expect(out.map(c=>c.event.id)).toEqual(['first','brake','contact','last']);
  expect(out.map(c=>c.label)).not.toContain('Junction movement');
 });
 it('does not invent a collision when none is stored or order unplaced events',()=>{
  const out=storyChapters([e('unknown',null,'collision'),e('a',100,'vehicle_seen'),e('b',400,'vehicle_slowing')]);
  expect(out.some(c=>/contact|impact|collision/i.test(c.label))).toBe(false);
  expect(out.map(c=>c.event.id)).toEqual(['a','b']);
 });
 it('handles an empty or single-event timeline without repeating it',()=>{
  expect(storyChapters([])).toEqual([]);
  expect(storyChapters([e('one',0,'vehicle_seen')])).toHaveLength(1);
 });
});
