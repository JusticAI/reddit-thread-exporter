// Capture one thread on the user's click: thread JSON, then "load more" stubs, slowly and with a hard cap.
// No background crawling, no automation bridge: this only runs from the side panel button.
import { threadIdFromUrl, threadJsonUrl, normalizeThread, normalizeComment, finish } from "./reddit.js";

const GAP_MS = 1200;           // between "load more" requests
const MAX_MORE_REQUESTS = 25;  // per capture
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, signal){
  const r = await fetch(url, {credentials: "include", headers: {Accept: "application/json"}, signal});
  if (r.status === 403 || r.status === 429) throw Object.assign(new Error("Reddit is limiting requests. Wait a minute and try again."), {code: "rate_limited", status: r.status});
  if (!r.ok) throw Object.assign(new Error(`Reddit returned ${r.status}`), {code: "http", status: r.status});
  return r.json();
}

export async function captureThread(pageUrl, {sort = "confidence", expand = true, onProgress = () => {}, signal} = {}){
  const id = threadIdFromUrl(pageUrl);
  if (!id) throw Object.assign(new Error("Open a Reddit thread (a URL with /comments/) first."), {code: "not_thread"});
  onProgress({stage: "thread"});
  const cap = normalizeThread(await getJson(threadJsonUrl(id, sort), signal), pageUrl, new Date().toISOString(), sort);
  if (!expand) return cap;
  let requests = 0, stopped = null;
  while (cap.more.length && requests < MAX_MORE_REQUESTS){
    // "continue this thread" stubs have no children ids: they cannot be expanded here
    const stub = cap.more.find(m => m.children.length); if (!stub) break;
    const batch = stub.children.splice(0, 100);
    if (!stub.children.length) cap.more.splice(cap.more.indexOf(stub), 1);
    await sleep(GAP_MS); requests++;
    onProgress({stage: "more", requests, captured: cap.comments.length, pending: cap.more.reduce((a, m) => a + m.children.length, 0)});
    let data;
    try { data = await getJson(`https://www.reddit.com/api/morechildren.json?api_type=json&raw_json=1&link_id=${cap.post.id}&children=${batch.join(",")}&sort=${sort}&limit_children=false`, signal); }
    catch (e){ if (e.code === "rate_limited"){ stub.children.unshift(...batch); if (!cap.more.includes(stub)) cap.more.push(stub); stopped = e.message; break; } throw e; }
    cap.raw.push(data);
    for (const t of data?.json?.data?.things || []){
      if (t.kind === "t1") cap.comments.push(normalizeComment(t.data, cap.post, t.data.depth ?? 0, cap.comments.length));
      else if (t.kind === "more" && (t.data.children || []).length) cap.more.push({parent_id: t.data.parent_id, count: Number(t.data.count || 0), children: t.data.children, depth: t.data.depth});
    }
    for (const m of cap.more) m.count = m.children.length || m.count;
  }
  finish(cap); cap.stopped_early = stopped || (cap.more.some(m => m.children.length) && requests >= MAX_MORE_REQUESTS ? "Reached the per-capture limit for loading more comments." : null);
  return cap;
}
