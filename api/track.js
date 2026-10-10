// Аналітика переглядів: що відкривали і скільки часу (пульс кожні 20 с, поки вкладка активна).
// POST /api/track {events:[{type:'view'|'open'|'beat', view, target, ms}]}
import { db } from './_db.js';
import { handler, send, readJSON } from './_lib.js';

const TYPES = new Set(['view', 'open', 'beat']);
export default handler(async (req, res, ctx) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const { events = [] } = await readJSON(req, 20_000);
  const rows = [];
  for (const e of [].concat(events).slice(0, 20)) {
    if (!TYPES.has(e?.type)) continue;
    rows.push({
      member_id: ctx.member.id, session: ctx.sid.slice(0, 16), type: e.type,
      view: String(e.view || '').slice(0, 40) || null, target: String(e.target || '').slice(0, 80) || null,
      ms: Math.max(0, Math.min(60000, Number(e.ms) || 0)),
    });
  }
  if (rows.length) await db.insert('events', rows);
  return send(res, 200, { ok: true });
});
