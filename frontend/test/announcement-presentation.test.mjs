import assert from "node:assert/strict";
import test from "node:test";
import { createAnnouncementPresentation } from "../src/features/admin/announcementPresentation.js";
const origin = "https://console.example";
const presentation = createAnnouncementPresentation({ getOrigin: () => origin });
const imagePath = "/api/public/announcement-images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png";
for (const source of [
  "javascript:alert(1)",
  "data:image/png;base64,abc",
  "file:///tmp/image.png",
  "ftp://example.com/file"
]) {
  test(`announcement URLs reject ${source.split(":")[0]} schemes`, () => {
    assert.equal(presentation.safeAnnouncementUrl(source), "");
  });
}
test("announcement URL policy resolves relative URLs and encoded query separators", () => {
  assert.equal(presentation.safeAnnouncementUrl(" /docs?x=1&amp;y=2 "), `${origin}/docs?x=1&y=2`);
  assert.equal(
    presentation.safeAnnouncementUrl("https://images.example/cover.png"),
    "https://images.example/cover.png"
  );
  assert.equal(presentation.safeAnnouncementUrl(""), "");
});
test("stored announcement images follow the current deployment origin", () => {
  assert.equal(
    presentation.safeAnnouncementUrl(`https://old.example/tracking${imagePath}?old=1#hash`),
    origin + imagePath
  );
  assert.equal(presentation.announcementImageUrl({ imageUrl: imagePath }), origin + imagePath);
  assert.equal(presentation.announcementImageUrl(null), "");
});
test("announcement image serialization keeps portable paths while external URLs stay intact", () => {
  assert.equal(presentation.announcementPortableUrl(imagePath, origin + imagePath), imagePath);
  assert.equal(
    presentation.announcementPortableUrl("", `${origin}${imagePath}?download=1#image`),
    `${imagePath}?download=1#image`
  );
  assert.equal(
    presentation.announcementPortableUrl(
      "https://images.example/cover.png",
      "https://images.example/cover.png"
    ),
    "https://images.example/cover.png"
  );
});
test("announcement HTML is escaped before inline formatting", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown("<script>alert(\"x\")</script> & 'text'"),
    "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;text&#39;</p>"
  );
});
test("announcement inline code protects its formatting and markup", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown("`**bold** <img>` **bold** __strong__ *italic*"),
    "<p><code>**bold** &lt;img&gt;</code> <strong>bold</strong> <strong>strong</strong> <em>italic</em></p>"
  );
});
test("announcement links escape labels and include external navigation safeguards", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown("[<label>](/docs)"),
    `<p><a href="${origin}/docs" target="_blank" rel="noopener noreferrer">&lt;label&gt;</a></p>`
  );
});
test("unsafe announcement links and images remain inert text", () => {
  const html = presentation.renderAnnouncementMarkdown(
    "[bad](javascript:alert) ![bad](data:image/png;base64,abc)"
  );
  assert.equal(html, "<p>[bad](javascript:alert) ![bad](data:image/png;base64,abc)</p>");
});
test("announcement images normalize storage paths and escape illustration captions", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown(`![<caption>](${imagePath})`),
    `<p><img src="${origin}${imagePath}" alt="&amp;lt;caption&amp;gt;" loading="lazy"></p>`
  );
});
test("announcement heading levels and adjacent paragraphs retain existing rendering", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown(
      "# Heading\n## Subheading\n### Third\n#### Fourth\n\nBody"
    ),
    "<h2>Heading</h2><h3>Subheading</h3><h4>Third</h4><h5>Fourth</h5><p>Body</p>"
  );
});
test("announcement list transitions close preceding lists", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown("- One\n+ Two\n1. Three\n2) Four\n\nTail"),
    "<ul><li>One</li><li>Two</li></ul><ol><li>Three</li><li>Four</li></ol><p>Tail</p>"
  );
});
test("announcement quotes and code fences preserve literal content", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown("> **Quote**\n```js\n<script> &\n```"),
    "<blockquote><strong>Quote</strong></blockquote><pre><code>&lt;script&gt; &amp;</code></pre>"
  );
});
test("announcement unclosed code fences still escape HTML", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown("```\n<a>\n*literal*"),
    "<pre><code>&lt;a&gt;\n*literal*</code></pre>"
  );
});
test("announcement newline normalization and empty content stay stable", () => {
  assert.equal(presentation.renderAnnouncementMarkdown("One\r\n\rTwo\n"), "<p>One</p><p>Two</p>");
  assert.equal(presentation.renderAnnouncementMarkdown(null), "");
});
test("announcement consecutive inline tokens retain text between them", () => {
  assert.equal(
    presentation.renderAnnouncementMarkdown("`one``two` and `three`"),
    "<p><code>one</code><code>two</code> and <code>three</code></p>"
  );
  assert.equal(
    presentation.renderAnnouncementMarkdown("a\u0000text\u0000b"),
    "<p>a\u0000text\u0000b</p>"
  );
  assert.equal(
    presentation.renderAnnouncementMarkdown("`one`\u00000\u0000"),
    "<p><code>one</code><code>one</code></p>"
  );
});
test("announcement excerpts strip code and images while preserving link labels", () => {
  assert.equal(
    presentation.announcementExcerpt(
      "# **Title**\n![cover](/cover.png) [Read more](/docs)\n```\nhidden\n```"
    ),
    "Title Read more"
  );
  assert.equal(presentation.announcementExcerpt("x".repeat(73)), "x".repeat(72) + "…");
  assert.equal(presentation.announcementExcerpt(""), "-");
});
test("announcement presentation reads the current origin without importing browser globals", () => {
  let current = origin;
  const module = createAnnouncementPresentation({ getOrigin: () => current });
  current = "https://new.example";
  assert.equal(module.safeAnnouncementUrl(imagePath), current + imagePath);
});
