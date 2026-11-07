import { captureThread } from "./src/capture.js";
import { filterComments, DEFAULT_FILTERS, threadIdFromUrl } from "./src/reddit.js";
import { toMarkdown, toJson, filename, FIELD_GROUPS, DEFAULT_FIELDS, DEFAULT_SCOPE } from "./src/export.js";

const LANG = navigator.language.startsWith("zh") ? "zh" : "en";
const T = {
  en: {url_ph: "Paste a Reddit thread URL", capture: "Capture", use_tab: "Use current tab", sort: "Sort", expand: "Load all replies",
    s1: "Data scope", s2: "Comment filters", s3: "Output fields", s4: "Review & export", prev: "Back", next: "Next",
    sc_post: "Post", sc_post_d: "Title and body of the original post", sc_comments: "Comments and replies", sc_comments_d: "All accessible comments with their thread structure",
    sc_media: "Media links", sc_media_d: "Images, video and external link metadata",
    f_link: "Skip link-only comments", f_neg: "Keep negative scores", f_del: "Keep deleted / removed", f_bot: "Keep AutoModerator", f_op: "Only the original poster",
    f_depth: "Max depth ", f_score: "Min score ", f_max: "Max comments ", remembered: "✓ Choices remembered", reset: "Reset to defaults",
    dl_md: "Download Markdown", dl_json: "Download JSON", copy: "Copy Markdown", copied: "Copied",
   
    preview: "Preview (first 5 comments)",
    reported: "on the page", accessible: "accessible", exported: "will export", comments: "comments", edit: "Edit",
   
   
    loading_more: (r, c) => `Loading more comments… (${r} requests, ${c} comments)`, fetching: "Fetching thread…", bad_url: "That is not a Reddit thread URL (it needs /comments/).",
    incomplete: n => `${n} replies could not be loaded (Reddit "continue this thread" or the per-capture limit).`,
    sum_scope: "Scope", sum_filters: "Filters", sum_fields: "Fields", all_access: "all accessible", depth_any: "any depth", score_any: "any score", count_any: "no limit",
    with_bot: "incl. AutoModerator", no_bot: "no AutoModerator", with_neg: "incl. negative", no_neg: "no negative", with_del: "incl. deleted", only_op: "OP only", no_links: "no link-only",
    refresh: "↻ Refresh", change: "Change settings", auto_note: "Using your saved settings.", from_tab: "From the current tab", from_url: "From a pasted link"},
  zh: {url_ph: "粘贴 Reddit 帖子链接", capture: "抓取", use_tab: "使用当前标签页", sort: "排序", expand: "展开全部回复",
    s1: "数据范围", s2: "评论筛选", s3: "输出字段", s4: "检查与导出", prev: "上一步", next: "下一步",
    sc_post: "帖子正文", sc_post_d: "包含原帖标题与正文内容", sc_comments: "评论与楼中楼", sc_comments_d: "包含所有可访问评论及其层级关系",
    sc_media: "媒体链接", sc_media_d: "包含所有图片、视频、外部链接元数据",
    f_link: "跳过纯链接评论", f_neg: "保留负分评论", f_del: "保留已删除 / 被移除", f_bot: "保留 AutoModerator", f_op: "只看楼主",
    f_depth: "最大深度 ", f_score: "最低分数 ", f_max: "最多条数 ", remembered: "✓ 已记住选择", reset: "恢复默认",
    dl_md: "下载 Markdown", dl_json: "下载 JSON", copy: "复制 Markdown", copied: "已复制",
   
    preview: "预览（前 5 条评论）",
    reported: "页面显示", accessible: "可访问", exported: "将导出", comments: "条评论", edit: "编辑",
   
   
    loading_more: (r, c) => `正在展开更多评论…（${r} 次请求，${c} 条）`, fetching: "正在读取帖子…", bad_url: "这不是 Reddit 帖子链接（需要包含 /comments/）。",
    incomplete: n => `有 ${n} 条回复没能展开（Reddit 的“继续此讨论”或单次抓取上限）。`,
    sum_scope: "范围", sum_filters: "筛选", sum_fields: "字段", all_access: "全部可访问", depth_any: "深度不限", score_any: "不限分数", count_any: "不限条数",
    with_bot: "包含 AutoModerator", no_bot: "不含 AutoModerator", with_neg: "含负分", no_neg: "不含负分", with_del: "含已删除", only_op: "只看楼主", no_links: "去掉纯链接",
    refresh: "↻ 刷新", change: "修改设置", auto_note: "已按你上次的设置。", from_tab: "来自当前标签页", from_url: "来自粘贴的链接"},
}[LANG];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[ch]));
document.querySelectorAll("[data-t]").forEach(el => el.textContent = T[el.dataset.t]);
document.querySelectorAll("[data-tp]").forEach(el => el.placeholder = T[el.dataset.tp]);

/* ---------- remembered preferences ---------- */
const PREF_KEY = "vt_prefs";
const prefs = {scope: {...DEFAULT_SCOPE}, filters: {...DEFAULT_FILTERS}, fields: [...DEFAULT_FIELDS], sort: "confidence", expand: true, configured: false};
async function loadPrefs(){ try { Object.assign(prefs, (await chrome.storage.local.get(PREF_KEY))[PREF_KEY] || {}); } catch {} }
const savePrefs = () => chrome.storage.local.set({[PREF_KEY]: prefs});

let cap = null, step = 1, tabThread = null;

/* ---------- source: the current tab (automatic) or a pasted URL ---------- */
// Opening the panel on a thread captures it right away; switching to another thread re-captures it. Captures are kept
// for this panel session, so going back to a thread does not fetch it again; "Refresh" always fetches.
const cache = new Map(); let ctl = null, source = "tab";
async function checkTab(){
  const [t] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  tabThread = t && threadIdFromUrl(t.url) ? t.url : null;
  $("usetab").hidden = !tabThread;
  if (tabThread && source === "tab" && threadIdFromUrl(tabThread) !== (cap && threadIdFromUrl(cap.source_url))){ $("url").value = tabThread; runCapture(tabThread, false); }
}
chrome.tabs.onActivated.addListener(checkTab);
chrome.tabs.onUpdated.addListener((id, info, tab) => { if (tab.active && (info.url || info.status === "complete")) checkTab(); });
$("usetab").onclick = () => { source = "tab"; $("url").value = tabThread; runCapture(tabThread, false); };
$("refresh").onclick = () => cap && runCapture(cap.source_url, true);
$("sort").onchange = () => { prefs.sort = $("sort").value; savePrefs(); if (cap) runCapture(cap.source_url, true); };
$("expand").onchange = () => { prefs.expand = $("expand").checked; savePrefs(); };
$("urlform").onsubmit = e => {
  e.preventDefault(); const url = $("url").value.trim();
  if (!threadIdFromUrl(url)){ $("progress").innerHTML = `<span class="err">${T.bad_url}</span>`; return; }
  source = url === tabThread ? "tab" : "url"; runCapture(url, true);
};
async function runCapture(url, force){
  const id = threadIdFromUrl(url), key = id + "|" + prefs.sort;
  if (!force && cache.has(key)){ cap = cache.get(key); $("progress").textContent = ""; renderAll(); return; }
  if (ctl) ctl.abort(); const mine = ctl = new AbortController();
  $("refresh").disabled = true; $("progress").textContent = T.fetching;   // a new capture cancels the running one
  try {
    const c = await captureThread(url, {sort: prefs.sort, expand: prefs.expand, signal: mine.signal,
      onProgress: p => { if (ctl === mine) $("progress").textContent = p.stage === "more" ? T.loading_more(p.requests, p.captured) : T.fetching; }});
    if (ctl !== mine) return;
    cache.set(key, c); cap = c; $("progress").textContent = ""; renderAll();
  } catch (err){ if (ctl === mine && err.name !== "AbortError") $("progress").innerHTML = `<span class="err">${esc(err.message)}</span>`; }
  if (ctl === mine){ ctl = null; $("refresh").disabled = false; }
}

/* ---------- export buttons (free and unlimited; nothing to sign in to) ---------- */
function renderGate(){ for (const id of ["md", "json", "copy"]) $(id).disabled = !cap; }

/* ---------- result ---------- */
const selected = () => cap && prefs.scope.comments ? filterComments(cap.comments, prefs.filters) : [];
const pct = (n, d) => d ? ` · ${(100 * n / d).toFixed(1)}%` : "";
function renderStats(){
  const m = cap.metrics, access = cap.comments.filter(c => c.deletion === "none" || c.deletion === "author_deleted").length, n = selected().length;
  $("title").textContent = cap.post.title;
  $("stats").innerHTML = [[m.comments_reported, T.reported, ""], [access, T.accessible, pct(access, m.comments_reported)], [n, T.exported, pct(n, m.comments_reported)]]
    .map(([v, l, p]) => `<div class="stat"><span>${l}</span><b>${v}</b><small>${T.comments}${p}</small></div>`).join("");
  const pend = m.pending_more_comments; $("warn").hidden = !(cap.stopped_early || pend);
  $("warn").textContent = cap.stopped_early ? cap.stopped_early : T.incomplete(pend);
}
function renderSteps(){
  $("steps").innerHTML = [T.s1, T.s2, T.s3, T.s4].map((l, i) => `<button type="button" data-go="${i + 1}" ${step === i + 1 ? 'aria-current="step"' : ""} class="${i + 1 < step ? "done" : ""}">${i + 1 < step ? "✓ " : `${i + 1} `}${l}</button>`).join("");
  document.querySelectorAll(".step").forEach(s => s.hidden = +s.dataset.step !== step);
  $("prev").hidden = step === 1; $("next").hidden = step === 4;
  const quiet = prefs.configured && !editing;       // settings chosen before: go straight to export
  $("steps").hidden = quiet; $("stepnav").hidden = quiet; $("settingsbar").hidden = !quiet;
  $("setsum").textContent = T.auto_note;
}
function renderFields(){
  const F = new Set(prefs.fields);
  $("fields").innerHTML = FIELD_GROUPS.map(g => { const on = g.fields.filter(f => F.has(f[0])).length;
    return `<div class="fg"><label class="gh"><input type="checkbox" data-group="${g.id}" ${on === g.fields.length ? "checked" : ""}>${esc(g.label[LANG])} <span class="muted small">(${on}/${g.fields.length})</span></label>
      <div class="fl">${g.fields.map(f => `<label class="chk"><input type="checkbox" data-field="${f[0]}" ${F.has(f[0]) ? "checked" : ""}>${esc(LANG === "zh" ? f[2] : f[1])}</label>`).join("")}</div></div>`; }).join("");
  document.querySelectorAll("[data-group]").forEach(el => { const g = FIELD_GROUPS.find(x => x.id === el.dataset.group), on = g.fields.filter(f => F.has(f[0])).length; el.indeterminate = on > 0 && on < g.fields.length; });
}
$("fields").onchange = e => {
  const F = new Set(prefs.fields);
  if (e.target.dataset.field){ e.target.checked ? F.add(e.target.dataset.field) : F.delete(e.target.dataset.field); }
  if (e.target.dataset.group){ const g = FIELD_GROUPS.find(x => x.id === e.target.dataset.group); for (const f of g.fields) e.target.checked ? F.add(f[0]) : F.delete(f[0]); }
  prefs.fields = [...F]; savePrefs(); renderFields();
};
$("resetfields").onclick = () => { prefs.fields = [...DEFAULT_FIELDS]; savePrefs(); renderFields(); };
function filterSummary(){
  const f = prefs.filters;
  return [f.includeDeleted ? T.with_del : T.all_access, Number.isFinite(f.maxDepth) ? `≤ ${f.maxDepth}` : T.depth_any, Number.isFinite(f.minScore) ? `≥ ${f.minScore}` : T.score_any,
    Number.isFinite(f.maxComments) ? `≤ ${f.maxComments}` : T.count_any, f.includeAutomod ? T.with_bot : T.no_bot, f.includeNegative ? T.with_neg : T.no_neg,
    f.excludeLinkOnly ? T.no_links : "", f.onlyOp ? T.only_op : ""].filter(Boolean).join(" · ");
}
function renderReview(){
  const sel = selected(), total = FIELD_GROUPS.reduce((a, g) => a + g.fields.length, 0);
  const scope = [["post", T.sc_post], ["comments", T.sc_comments], ["media", T.sc_media]].filter(([k]) => prefs.scope[k]).map(([, l]) => l).join(" · ") || "–";
  $("summary").innerHTML = `<div><b>${T.sum_scope}</b> ${esc(scope)} <button type="button" class="link" data-go="1">${T.edit}</button></div>
    <div><b>${T.sum_filters}</b> ${esc(filterSummary())} <button type="button" class="link" data-go="2">${T.edit}</button></div>
    <div><b>${T.sum_fields}</b> ${prefs.fields.length}/${total} <button type="button" class="link" data-go="3">${T.edit}</button></div>`;
  $("preview").innerHTML = sel.slice(0, 5).map(c => `<li><span class="m">${c.author ? "u/" + esc(c.author) : "[deleted]"} · ${c.score_hidden ? "hidden" : c.score ?? "–"}${c.is_op ? " · OP" : ""}</span><br>${esc((c.body || "").slice(0, 220))}</li>`).join("");
  renderGate();
}
let editing = false;
function renderAll(){
  if (!cap) return; $("result").hidden = false;
  if (prefs.configured && !editing) step = 4;
  $("src").textContent = source === "tab" ? T.from_tab : T.from_url;
  renderStats(); renderSteps(); renderFields(); renderReview();
}
$("editset").onclick = () => { editing = true; step = 1; renderSteps(); };
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b){ step = +b.dataset.go; if (step < 4) editing = true; else markConfigured(); renderSteps(); renderReview(); } });
$("prev").onclick = () => { step = Math.max(1, step - 1); renderSteps(); };
function markConfigured(){ if (!prefs.configured || editing){ prefs.configured = true; editing = false; savePrefs(); } }
$("next").onclick = () => { step = Math.min(4, step + 1); if (step === 4) markConfigured(); renderSteps(); renderReview(); };

// scope + filters
document.querySelectorAll("[data-scope]").forEach(el => el.onchange = () => { prefs.scope[el.dataset.scope] = el.checked; savePrefs(); if (cap){ renderStats(); renderReview(); } });
document.querySelectorAll("[data-f]").forEach(el => el.onchange = () => { prefs.filters[el.dataset.f] = el.checked; savePrefs(); if (cap){ renderStats(); renderReview(); } });
document.querySelectorAll("[data-n]").forEach(el => el.oninput = () => { const v = el.value.trim(); prefs.filters[el.dataset.n] = v === "" ? null : Number(v); savePrefs(); if (cap){ renderStats(); renderReview(); } });
function applyPrefsToControls(){
  document.querySelectorAll("[data-scope]").forEach(el => el.checked = !!prefs.scope[el.dataset.scope]);
  document.querySelectorAll("[data-f]").forEach(el => el.checked = !!prefs.filters[el.dataset.f]);
  document.querySelectorAll("[data-n]").forEach(el => el.value = Number.isFinite(prefs.filters[el.dataset.n]) ? prefs.filters[el.dataset.n] : "");
  $("sort").value = prefs.sort; $("expand").checked = prefs.expand;
}

/* ---------- export ---------- */
const opts = () => ({fields: prefs.fields, scope: prefs.scope});
async function spendExport(){ return true; }
async function save(text, ext, type){
  const url = URL.createObjectURL(new Blob([text], {type}));
  await chrome.downloads.download({url, filename: filename(cap, ext), saveAs: false}); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$("md").onclick = async () => {
  markConfigured(); renderSteps();
  if (!(await spendExport())) return renderGate();
  await save(toMarkdown(cap, selected(), opts()), "md", "text/markdown");
  if (prefs.fields.includes("raw_json_file")) await save(toJson(cap, selected(), {...opts(), fields: [...prefs.fields, "raw_response"]}), "json", "application/json");
  renderGate();
};
$("json").onclick = async () => { if (!(await spendExport())) return renderGate(); await save(toJson(cap, selected(), opts()), "json", "application/json"); renderGate(); };
$("copy").onclick = async () => { if (!(await spendExport())) return renderGate(); await navigator.clipboard.writeText(toMarkdown(cap, selected(), opts())); $("copied").textContent = T.copied; setTimeout(() => $("copied").textContent = "", 2000); renderGate(); };

(async () => { await loadPrefs(); applyPrefsToControls(); renderGate(); checkTab(); })();
