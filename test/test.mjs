import fs from "node:fs"; import assert from "node:assert"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { normalizeThread, filterComments, DEFAULT_FILTERS, threadIdFromUrl, outboundLinks, finish, normalizeComment } from "../src/reddit.js";
import { toMarkdown, toJson, filename, ANALYSIS_FIELDS, DEFAULT_FIELDS } from "../src/export.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(fs.readFileSync(path.join(here, "fixture-thread.json"), "utf8"));

assert.strictEqual(threadIdFromUrl("https://www.reddit.com/r/espresso/comments/ABC123/x/"), "abc123");
assert.strictEqual(threadIdFromUrl("https://old.reddit.com/comments/abc123"), "abc123");
assert.strictEqual(threadIdFromUrl("https://example.com/comments/abc123"), null);
assert.deepStrictEqual(outboundLinks("see [a](https://x.com/a) and https://y.org/b. also https://www.reddit.com/r/z"), ["https://x.com/a", "https://y.org/b"]);

const cap = normalizeThread(payload, "https://www.reddit.com/r/espresso/comments/abc123/which_espresso/", "2026-09-29T00:00:00.000Z");
const by = Object.fromEntries(cap.comments.map(c => [c.id, c]));
assert.strictEqual(by.t1_c3.score, null); assert.strictEqual(by.t1_c3.score_hidden, true);          // hidden score is not "1"
assert.strictEqual(by.t1_c4.deletion, "removed_by_mod"); assert.strictEqual(by.t1_c4.body, null);
assert.strictEqual(by.t1_c7.deletion, "author_deleted"); assert.ok(by.t1_c7.body.includes("readable"));
assert.strictEqual(by.t1_c2.is_op, true); assert.strictEqual(by.t1_c8.distinguished, "moderator");
assert.deepStrictEqual(by.t1_c1.outbound_links, ["https://example.org/grinders"]);
assert.strictEqual(cap.metrics.capture_status, "incomplete"); assert.strictEqual(cap.metrics.pending_more_comments, 2);

// "load more" results merge in and completeness is recomputed
const m = cap.more.shift(); for (const id of m.children) cap.comments.push(normalizeComment({id, name: "t1_" + id, parent_id: "t1_c1", author: "carol", body: "more " + id, score: 3, depth: 1, created_utc: 1790000700}, cap.post, 1, cap.comments.length));
finish(cap); assert.strictEqual(cap.metrics.capture_status, "complete"); assert.strictEqual(cap.metrics.comments_captured, 8);

const sel = filterComments(cap.comments, DEFAULT_FILTERS);
assert.ok(!sel.some(c => c.id === "t1_c4") && sel.some(c => c.id === "t1_c7"));
const md = toMarkdown(cap, sel, {fields: ANALYSIS_FIELDS});
assert.ok(md.startsWith("---\nschema: \"reddit-thread-md/v1\"")); assert.ok(!/分数|作者/.test(md));
assert.ok(filename(cap, "md").endsWith(".md"));
// field and scope choices
const slim = toMarkdown(cap, sel, {fields: ["post_title", "c_body"], scope: {post: true, comments: true, media: false}});
assert.ok(!slim.includes("- author:") && !slim.includes("t1_c1") && slim.includes("### Comment 1") && slim.includes("Get a separate grinder"));
assert.ok(!toMarkdown(cap, sel, {scope: {post: true, comments: false, media: true}}).includes("## Comments"));
assert.ok(!toMarkdown(cap, sel).includes("## Raw response") && toMarkdown(cap, sel, {fields: [...DEFAULT_FIELDS, "raw_response"]}).includes("## Raw response"));
const j = JSON.parse(toJson(cap, sel, {fields: ["c_body", "c_score"]}));
assert.deepStrictEqual(Object.keys(j.comments[0]).sort(), ["body", "score", "score_hidden"]); assert.ok(!("post" in j) || !("title" in j.post));
const full = JSON.parse(toJson(cap, sel, {fields: ["c_body"], full: true}));
assert.ok(full.comments[0].id && full.comments[0].parent_id && full.comments[0].permalink && full.post.title && !("raw" in full));

console.log("ALL OK;", sel.length, "comments exported");
