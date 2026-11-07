// Reddit thread JSON -> normalized capture. Runs in the side panel (browser) and in Node tests.
// Differences from the old Funnel plugin: hidden scores are null (Reddit reports them as 1), deletion is split into
// author_deleted / body_deleted / removed_by_mod, outbound links are extracted, field names are snake_case English.
export const SCHEMA = "reddit-thread-json/v1";
const HOST = "https://www.reddit.com";

const iso = v => { if (!v && v !== 0) return null; const d = new Date(typeof v === "number" && v < 1e10 ? v * 1000 : v); return isNaN(d) ? null : d.toISOString(); };
const flair = v => !v ? null : typeof v === "string" ? v : v.text || (Array.isArray(v.richtext) ? v.richtext.map(x => x.t || x.a || "").join("").trim() || null : null);
const abs = p => p ? new URL(p, HOST).toString() : null;

/** thread id from any reddit thread URL (www/old/new, with or without slug) */
export function threadIdFromUrl(url){
  try { const u = new URL(url); if (!/(^|\.)reddit\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/comments\/([a-z0-9]+)/i); return m ? m[1].toLowerCase() : null; } catch { return null; }
}
export function threadJsonUrl(id, sort = "confidence"){ return `${HOST}/comments/${id}.json?raw_json=1&limit=500&sort=${encodeURIComponent(sort)}`; }

export function deletionState(d){
  const cat = d.removed_by_category || null;
  if (d.body === "[removed]" || (cat && cat !== "deleted") || d.removed) return "removed_by_mod";
  if (d.body === "[deleted]" || cat === "deleted") return "body_deleted";
  if (!d.author || d.author === "[deleted]") return "author_deleted";
  return "none";
}
export function outboundLinks(text){
  const out = new Set(), s = String(text || "");
  for (const m of s.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) out.add(m[1]);
  for (const m of s.matchAll(/(?<![(\[])\bhttps?:\/\/[^\s)\]>"']+/g)) out.add(m[0].replace(/[.,;:!?]+$/, ""));
  for (const m of s.matchAll(/(?<![\w/.@])www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)\]>"']*)?/gi)) out.add("https://" + m[0].replace(/[.,;:!?]+$/, ""));
  return [...out].filter(u => { try { return !/(^|\.)reddit\.com$|(^|\.)redd\.it$/.test(new URL(u).hostname); } catch { return false; } }).slice(0, 20);
}
function media(d){
  const out = []; if (d.url_overridden_by_dest) out.push({type: d.post_hint || "link", url: d.url_overridden_by_dest});
  for (const it of Object.values(d.media_metadata || {})){ const src = it?.s?.u || it?.s?.gif || it?.s?.mp4; if (src) out.push({type: it.e || "media", url: src.replaceAll("&amp;", "&")}); }
  return out.filter((x, i, a) => a.findIndex(y => y.url === x.url) === i);
}
export function normalizePost(d = {}, sourceUrl = ""){
  return { id: d.name || (d.id ? `t3_${d.id}` : null), title: d.title || "Untitled Reddit post", body: d.selftext ?? "",
    author: d.author && d.author !== "[deleted]" ? d.author : null, subreddit: d.subreddit_name_prefixed || (d.subreddit ? "r/" + d.subreddit : null),
    created_at: iso(d.created_utc), edited: !!d.edited, score: Number.isFinite(d.score) ? d.score : null,
    num_comments: Number(d.num_comments || 0), permalink: abs(d.permalink) || sourceUrl, url: d.url || sourceUrl,
    flair: flair(d.link_flair_text), flags: {nsfw: !!d.over_18, spoiler: !!d.spoiler, locked: !!d.locked, archived: !!d.archived, removed: !!(d.removed || d.removed_by_category)},
    crosspost_parent: d.crosspost_parent || null, author_flair: flair(d.author_flair_text), media: media(d), outbound_links: outboundLinks(d.selftext) };
}
export function normalizeComment(d, post, depth, order){
  const del = deletionState(d), author = d.author && d.author !== "[deleted]" ? d.author : null, hidden = !!d.score_hidden;
  return { id: d.name || (d.id ? `t1_${d.id}` : null), parent_id: d.parent_id || post.id, depth: Number.isFinite(d.depth) ? d.depth : depth, order,
    author, is_op: !!d.is_submitter || (!!author && author === post.author), distinguished: d.distinguished || null, stickied: !!d.stickied,
    score: hidden || !Number.isFinite(d.score) ? null : d.score, score_hidden: hidden, created_at: iso(d.created_utc), edited: !!d.edited,
    permalink: abs(d.permalink), deletion: del, body: del === "body_deleted" || del === "removed_by_mod" ? null : (d.body ?? ""),
    outbound_links: outboundLinks(d.body), author_flair: flair(d.author_flair_text), collapsed_crowd_control: !!d.collapsed_because_crowd_control };
}
/** walk a listing; collects "more" stubs for later expansion */
export function walk(nodes, post, more, out, depth = 0){
  for (const n of nodes || []){
    if (!n || typeof n !== "object") continue;
    if (n.kind === "more"){ const d = n.data || {}; more.push({parent_id: d.parent_id || null, count: Number(d.count || 0), children: Array.isArray(d.children) ? d.children : [], depth: d.depth ?? depth}); continue; }
    if (n.kind !== "t1") continue;
    const d = n.data || {}; out.push(normalizeComment(d, post, depth, out.length));
    const kids = d.replies?.data?.children; if (Array.isArray(kids)) walk(kids, post, more, out, (Number.isFinite(d.depth) ? d.depth : depth) + 1);
  }
  return out;
}
export function normalizeThread(payload, sourceUrl = "", capturedAt = new Date().toISOString(), sort = "confidence"){
  if (!Array.isArray(payload) || payload.length < 2) throw new Error("Not a Reddit thread response");
  const pd = payload[0]?.data?.children?.[0]?.data; if (!pd) throw new Error("Reddit post data is missing");
  const post = normalizePost(pd, sourceUrl), more = [];
  const comments = walk(payload[1]?.data?.children, post, more, []);
  const cap = finish({schema: SCHEMA, source_url: post.permalink || sourceUrl, captured_at: capturedAt, comment_sort: sort, post, comments, more});
  Object.defineProperty(cap, "raw", {value: [payload], writable: true, enumerable: false});   // kept for "raw response" exports, never sent anywhere
  return cap;
}
/** recompute completeness after expanding "more" stubs */
export function finish(cap){
  const seen = new Map(); for (const c of cap.comments) if (c.id && !seen.has(c.id)) seen.set(c.id, c);
  cap.comments = [...seen.values()]; cap.comments.forEach((c, i) => (c.order = i));
  const ids = new Set(cap.comments.map(c => c.id));
  const pendingCount = cap.more.reduce((a, m) => a + (m.count || m.children.length), 0);
  const captured = cap.comments.length, reported = cap.post.num_comments || captured + pendingCount;
  const unavailable = cap.comments.filter(c => c.deletion !== "none").length;
  cap.metrics = { comments_reported: reported, comments_captured: captured, comments_deleted_or_removed: unavailable,
    comments_unavailable: Math.max(0, reported - captured - pendingCount), pending_more_nodes: cap.more.length, pending_more_comments: pendingCount,
    orphan_comments: cap.comments.filter(c => c.parent_id !== cap.post.id && !ids.has(c.parent_id)).length,
    capture_status: cap.more.length ? "incomplete" : reported > captured ? "accessible_complete" : "complete" };
  return cap;
}
const linkOnly = b => /^\s*(https?:\/\/\S+|\[[^\]]+\]\(https?:\/\/[^)]+\))\s*$/i.test(String(b || ""));
export const DEFAULT_FILTERS = {includeDeleted: false, includeAutomod: false, includeNegative: true, onlyOp: false, excludeLinkOnly: true, maxDepth: null, minScore: null, maxComments: null};
export function filterComments(comments, f = DEFAULT_FILTERS){
  let out = comments;
  if (!f.includeDeleted) out = out.filter(c => c.deletion === "none" || c.deletion === "author_deleted");
  if (!f.includeAutomod) out = out.filter(c => c.author !== "AutoModerator");
  if (!f.includeNegative) out = out.filter(c => c.score == null || c.score >= 0);
  if (f.onlyOp) out = out.filter(c => c.is_op);
  if (f.excludeLinkOnly) out = out.filter(c => !linkOnly(c.body));
  if (Number.isFinite(f.maxDepth)) out = out.filter(c => c.depth <= f.maxDepth);
  if (Number.isFinite(f.minScore)) out = out.filter(c => c.score == null || c.score >= f.minScore);
  if (Number.isFinite(f.maxComments)) out = out.slice(0, f.maxComments);
  return out;
}
