import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePack, shortestPath, planRoute, currentFacts, agentPrompt, journalMarkdown, validateJournalRecords, mergeJournalBackup} from '../skills/dudu-guide/assets/workbench/core.mjs';
const base = JSON.parse(await readFile(new URL('../skills/dudu-guide/assets/demo-park.json', import.meta.url), 'utf8'));
const pack = () => structuredClone(base);

test('place packs reject missing references, unsafe URLs, invalid dates and demo facts in real mode', () => {
  assert.deepEqual(validatePack(base), []);
  const p = pack(); p.facts[0].source_ids = ['missing'];
  assert.ok(validatePack(p).some(e => e.includes('source_ids')));
  const q = pack(); q.sources[0].url = 'javascript:alert(1)'; q.sources[0].checked_on = '2026-02-30';
  assert.ok(validatePack(q).some(e => e.includes('url')));
  assert.ok(validatePack(q).some(e => e.includes('checked_on')));
  const real = pack(); real.mode = 'real';
  assert.ok(validatePack(real).some(e => e.includes('演示事实')));
  assert.ok(validatePack(real).some(e => e.includes('真实路线边')));
  assert.ok(validatePack(null).length > 0);
});

test('shortest paths do not teleport, respect direction and exclude stairs when requested', () => {
  assert.equal(shortestPath(base, 'south-gate', 'south-gate').minutes, 0);
  const direct = shortestPath(base, 'habitat', 'lookout');
  const accessible = shortestPath(base, 'habitat', 'lookout', true);
  assert.equal(direct.minutes, 5); assert.ok(accessible.minutes > direct.minutes);
  const p = pack(); p.edges = [{...p.edges[0], from:'south-gate', to:'canopy', bidirectional:false}];
  assert.equal(shortestPath(p, 'canopy', 'south-gate').minutes, Infinity);
  assert.deepEqual(shortestPath(p, 'south-gate', 'north-gate'), {minutes:Infinity, path:[]});
  const closed = pack(); closed.nodes.find(n => n.id === 'canopy').status = 'closed';
  assert.equal(shortestPath(closed, 'south-gate', 'canopy').minutes, Infinity);
});

test('all feasible route budgets include actual path time, stays, exit and reserve', () => {
  for (const accessible of [false, true]) for (let budget = 1; budget <= 240; budget += 3) {
    const result = planRoute(base, {start:'south-gate', exit:'north-gate', minutes:budget, reserve:10, accessible});
    if (!result.feasible) { assert.equal(result.total_minutes, null); continue; }
    assert.ok(result.total_minutes <= budget);
    let from = result.start, total = 10;
    for (const stop of result.stops) {
      assert.equal(stop.path[0], from);
      assert.equal(stop.path.at(-1), stop.id);
      assert.equal(stop.walk_minutes, shortestPath(base, from, stop.id, accessible).minutes);
      total += stop.walk_minutes + stop.stay_minutes; from = stop.id;
    }
    assert.equal(result.exit_walk.path[0], from);
    assert.equal(result.exit_walk.path.at(-1), 'north-gate');
    assert.equal(total + result.exit_walk.minutes, result.total_minutes);
    assert.equal(new Set(result.stops.map(s => s.id)).size, result.stops.length);
  }
});

test('replanning respects current position, visited stops, selected candidates and smaller budget', () => {
  const p = pack(); p.nodes.find(n => n.id === 'wetland').status = 'closed';
  const result = planRoute(p, {start:'canopy', exit:'north-gate', minutes:65, reserve:10, visited:['canopy'], selected:['canopy','wetland','story-house']});
  assert.ok(result.feasible);
  assert.ok(result.stops.every(s => s.id === 'story-house'));
  assert.ok(result.skipped.includes('wetland'));
  assert.equal(result.stops[0]?.path[0], 'canopy');
  assert.ok(result.total_minutes <= 65);
  assert.equal(planRoute(base, {start:'canopy',exit:'north-gate',minutes:3}).feasible, false);
  const noEdges = pack(); noEdges.edges = [];
  assert.equal(planRoute(noEdges,{start:'south-gate',exit:'north-gate',minutes:999}).feasible,false);
});

test('expired facts are excluded; copied context has only the current venue and cited sources', () => {
  const p = pack(); p.facts[0].valid_until = '2000-01-01';
  assert.equal(currentFacts(p, 'canopy').length, 0);
  assert.ok(!agentPrompt(p, 'canopy', '这个空间为什么这样设计？').includes(p.facts[0].text));
  const prompt = agentPrompt(base, 'canopy', '有什么可看？');
  assert.ok(prompt.includes(base.facts[0].text));
  assert.ok(!prompt.includes(base.facts[1].text));
  assert.ok(prompt.includes('虚构演示'));
});

test('journal preserves non-sightings and user text while escaping active Markdown/HTML', () => {
  const md = journalMarkdown(base, [{venue_name:'林冠观察站',seen:false,note:'<script>alert(1)</script> [点我](https://example.com)',recorded_at:'2026-09-05T02:00:00Z'}]);
  assert.ok(md.includes('暂时没看见'));
  assert.ok(md.includes('虚构地点的演示记录'));
  assert.ok(!md.includes('<script>'));
  assert.ok(!md.includes('[点我]'));
});

test('backup import preserves existing records, canonicalizes venue names and rejects foreign or invalid records', () => {
  const record = {id:'a',venue_id:'canopy',venue_name:'林冠观察站',seen:false,note:'原始记录',recorded_at:'2026-09-05T02:00:00Z'};
  const backup = {schema_version:1,park_id:base.id,records:[{...record,note:'不应覆盖'},{...record,id:'b',venue_name:'伪造的场馆名',extra:'discard'}]};
  const merged = mergeJournalBackup(base,[record],backup);
  assert.equal(merged.length,2); assert.equal(merged[0].note,'原始记录');
  assert.equal(merged[1].venue_name,'林冠观察站'); assert.equal(merged[1].extra,undefined);
  assert.equal(merged[1].seen,false);
  assert.throws(()=>mergeJournalBackup(base,[record],{...backup,park_id:'other-park'}));
  assert.throws(()=>validateJournalRecords(base,[{...record,seen:'false'}]));
  assert.throws(()=>validateJournalRecords(base,[record,record]));
  assert.throws(()=>validateJournalRecords(base,[{...record,venue_id:'south-gate'}]));
  assert.throws(()=>validateJournalRecords(base,[{...record,note:'x'.repeat(2001)}]));
});
