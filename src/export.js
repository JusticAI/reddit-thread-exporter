// Export a capture as Markdown (reddit-thread-md/v1, English snake_case labels) or JSON, with user-chosen scope and fields.
export const FIELD_GROUPS = [
  {id: "base", label: {en: "Traceability", zh: "基础溯源"}, fields: [
    ["source_url", "Source URL", "来源 URL", true], ["post_id", "Post ID", "Post ID", true], ["captured_at", "Captured at", "采集时间", true],
    ["schema", "Schema version", "Schema 版本", true], ["capture_status", "Completeness status", "完整度状态", true]]},
  {id: "post", label: {en: "Post", zh: "帖子信息"}, fields: [
    ["post_title", "Title", "标题", true], ["post_body", "Body", "正文", true], ["post_author", "Author", "作者", true], ["post_subreddit", "Subreddit", "Subreddit", true],
    ["post_created", "Created", "发布时间", true], ["post_permalink", "Permalink", "永久链接", true], ["post_score", "Score", "分数", true],
    ["post_num_comments", "Comment count", "评论总数", true], ["post_flair", "Flair", "Flair", false], ["post_flags", "Flags", "状态标记", false],
    ["post_crosspost", "Crosspost", "Crosspost", false], ["post_media", "Media", "媒体信息", false], ["post_links", "Outbound links", "外部链接", false]]},
  {id: "comment", label: {en: "Comments", zh: "评论信息"}, fields: [
    ["c_body", "Body", "正文", true], ["c_author", "Author", "作者", true], ["c_id", "Comment ID", "评论 ID", true], ["c_parent", "Parent ID", "父级 ID", true],
    ["c_depth", "Depth", "深度", true], ["c_order", "Original order", "原始顺序", true], ["c_created", "Created", "发布时间", true], ["c_score", "Score", "分数", true],
    ["c_permalink", "Permalink", "永久链接", true], ["c_identity", "Identity (OP / mod)", "身份标记", true], ["c_deletion", "Deletion state", "删除状态", true],
    ["c_links", "Outbound links", "外部链接", false], ["c_author_flair", "Author flair", "作者 Flair", false], ["c_edited", "Edited", "编辑状态", false],
    ["c_crowd", "Crowd control", "Crowd Control", false]]},
  {id: "raw", label: {en: "Raw data", zh: "原始数据"}, fields: [
    ["raw_response", "Raw response (in Markdown)", "原始响应（写入 Markdown）", false], ["raw_json_file", "Save JSON attachment", "另存 JSON 附件", false]]},
];
export const DEFAULT_FIELDS = FIELD_GROUPS.flatMap(g => g.fields.filter(f => f[3]).map(f => f[0]));
export const DEFAULT_SCOPE = {post: true, comments: true, media: true};
// the fields an analysis tool needs to rebuild the thread (ids, parents, links)
export const ANALYSIS_FIELDS = ["source_url", "post_id", "captured_at", "schema", "capture_status", "post_title", "post_body", "post_author", "post_subreddit",
  "post_created", "post_permalink", "post_score", "c_body", "c_author", "c_id", "c_parent", "c_depth", "c_order", "c_created", "c_score", "c_permalink", "c_identity", "c_deletion", "c_links"];

const y = v => v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(String(v));
export function toMarkdown(cap, comments, {fields = DEFAULT_FIELDS, scope = DEFAULT_SCOPE} = {}){
  const F = new Set(fields), has = k => F.has(k), p = cap.post, m = cap.metrics, L = ["---"];
  if (has("schema")) L.push(`schema: "reddit-thread-md/v1"`);
  if (has("source_url")) L.push(`source_url: ${y(cap.source_url)}`);
  if (has("post_id")) L.push(`post_id: ${y(p.id)}`);
  if (has("post_subreddit")) L.push(`subreddit: ${y(p.subreddit)}`);
  if (has("post_author")) L.push(`author: ${y(p.author || "[deleted]")}`);
  if (has("post_created")) L.push(`created_at: ${y(p.created_at)}`);
  if (has("captured_at")) L.push(`captured_at: ${y(cap.captured_at)}`);
  if (has("capture_status")) L.push(`capture_status: ${y(m.capture_status)}`, `comments_reported: ${m.comments_reported}`);
  L.push(`comments_captured: ${m.comments_captured}`, `comments_exported: ${scope.comments ? comments.length : 0}`, `comments_unavailable: ${m.comments_unavailable}`,
    `pending_more_nodes: ${m.pending_more_nodes}`, `comment_sort: ${y(cap.comment_sort)}`, "---", "");
  L.push(`# ${scope.post && has("post_title") ? p.title : "Reddit thread"}`, "");
  if (scope.post){
    const meta = [has("post_author") && `- author: ${p.author ? "u/" + p.author : "[deleted]"}`, has("post_subreddit") && `- subreddit: ${p.subreddit}`,
      has("post_created") && `- created_at: ${p.created_at}`, has("post_score") && `- score: ${p.score ?? "hidden"}`, has("post_num_comments") && `- num_comments: ${p.num_comments}`,
      has("post_permalink") && `- permalink: ${p.permalink}`, has("post_flair") && p.flair && `- flair: ${p.flair}`,
      has("post_flags") && `- flags: ${Object.entries(p.flags).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`,
      has("post_crosspost") && p.crosspost_parent && `- crosspost_parent: ${p.crosspost_parent}`,
      has("post_links") && p.outbound_links.length && `- outbound_links: ${p.outbound_links.join(" ")}`].filter(Boolean);
    if (meta.length) L.push(...meta, "");
    if (has("post_body") && p.body) L.push("## Post body", "", p.body, "");
  }
  if (scope.media && has("post_media") && p.media.length){ L.push("## Media", ""); for (const x of p.media) L.push(`- [${x.type}](${x.url})`); L.push(""); }
  if (scope.comments){
    if (has("capture_status")) L.push("## Comment completeness", "", `- status: ${m.capture_status}`, `- reported: ${m.comments_reported}`, `- captured: ${m.comments_captured}`,
      `- exported: ${comments.length}`, `- deleted_or_removed: ${m.comments_deleted_or_removed}`, `- unavailable: ${m.comments_unavailable}`, `- pending_more_nodes: ${m.pending_more_nodes}`, "");
    L.push("## Comments", "");
    comments.forEach((c, i) => {
      L.push(`### Comment ${has("c_id") ? c.id : i + 1}`, "");
      const meta = [has("c_author") && `- author: ${c.author ? "u/" + c.author : "[deleted]"}`, has("c_parent") && `- parent_id: ${c.parent_id}`,
        has("c_depth") && `- depth: ${c.depth}`, has("c_order") && `- order: ${c.order}`, has("c_score") && `- score: ${c.score_hidden ? "hidden" : c.score ?? "null"}`,
        has("c_created") && `- created_at: ${c.created_at}`, has("c_permalink") && `- permalink: ${c.permalink}`,
        has("c_identity") && c.is_op && "- is_op: true", has("c_identity") && c.distinguished && `- distinguished: ${c.distinguished}`, has("c_identity") && c.stickied && "- stickied: true",
        has("c_deletion") && c.deletion !== "none" && `- deletion: ${c.deletion}`, has("c_links") && c.outbound_links.length && `- outbound_links: ${c.outbound_links.join(" ")}`,
        has("c_author_flair") && c.author_flair && `- author_flair: ${c.author_flair}`, has("c_edited") && c.edited && "- edited: true",
        has("c_crowd") && c.collapsed_crowd_control && "- crowd_control_collapsed: true"].filter(Boolean);
      if (meta.length) L.push(...meta, "");
      if (has("c_body")) L.push(c.body == null ? (c.deletion === "removed_by_mod" ? "[removed]" : "[deleted]") : (c.body || "[empty]"), "");
    });
  }
  if (has("raw_response") && cap.raw) L.push("## Raw response", "", "```json", JSON.stringify(cap.raw, null, 2), "```", "");
  return L.join("\n").trimEnd() + "\n";
}
const POST_KEYS = {post_title: "title", post_body: "body", post_author: "author", post_subreddit: "subreddit", post_created: "created_at", post_permalink: "permalink",
  post_score: "score", post_num_comments: "num_comments", post_flair: "flair", post_flags: "flags", post_crosspost: "crosspost_parent", post_media: "media", post_links: "outbound_links"};
const COMMENT_KEYS = {c_body: ["body"], c_author: ["author"], c_id: ["id"], c_parent: ["parent_id"], c_depth: ["depth"], c_order: ["order"], c_created: ["created_at"],
  c_score: ["score", "score_hidden"], c_permalink: ["permalink"], c_identity: ["is_op", "distinguished", "stickied"], c_deletion: ["deletion"], c_links: ["outbound_links"],
  c_author_flair: ["author_flair"], c_edited: ["edited"], c_crowd: ["collapsed_crowd_control"]};
export function toJson(cap, comments, {fields = DEFAULT_FIELDS, scope = DEFAULT_SCOPE, full = false} = {}){
  const F = new Set(full ? Object.keys(POST_KEYS).concat(Object.keys(COMMENT_KEYS), ["source_url", "post_id", "captured_at", "schema", "capture_status"]) : fields);
  const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));
  const out = {};
  if (F.has("schema")) out.schema = cap.schema;
  if (F.has("source_url")) out.source_url = cap.source_url;
  if (F.has("captured_at")) out.captured_at = cap.captured_at;
  out.comment_sort = cap.comment_sort;
  out.metrics = {...cap.metrics, comments_exported: scope.comments ? comments.length : 0};
  if (scope.post || scope.media){
    const keys = Object.entries(POST_KEYS).filter(([f]) => F.has(f) && (f === "post_media" ? scope.media : scope.post)).map(([, k]) => k);
    out.post = {...(F.has("post_id") ? {id: cap.post.id} : {}), ...pick(cap.post, keys)};
  }
  if (scope.comments){ const keys = Object.entries(COMMENT_KEYS).filter(([f]) => F.has(f)).flatMap(([, k]) => k); out.comments = comments.map(c => pick(c, keys)); }
  if (!full && F.has("raw_response") && cap.raw) out.raw = cap.raw;
  return JSON.stringify(out, null, 2);
}
export function filename(cap, ext){
  const d = (cap.captured_at || new Date().toISOString()).slice(0, 10), sub = String(cap.post.subreddit || "reddit").replace(/^r\//, "");
  const t = String(cap.post.title || "thread").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 72);
  return `${d}_${sub}_${t || "thread"}.${ext}`;
}
