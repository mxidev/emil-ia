import assert from "node:assert/strict";
import test from "node:test";
import { MarkdownService } from "../src/app/services/markdown.service.ts";

const markdown = new MarkdownService();

test("keeps inline math inside the paragraph that contains it", () => {
  const html = markdown.render(
    String.raw`Un número \(\lambda\) asociado a una matriz \(A\).`,
  );

  assert.equal((html.match(/<p>/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<\/p>\s*<span class="katex">/);
});

test("renders display matrices as a block without breaking list text", () => {
  const html = markdown.render(String.raw`- Para \(\lambda=2\), un autovector es

\[
A\begin{pmatrix}1\\0\end{pmatrix}=2\begin{pmatrix}1\\0\end{pmatrix}
\]`);

  assert.match(html, /<li>Para\s+<span class="katex">/);
  assert.match(html, /<div class="math-block"><span class="katex-display">/);
  assert.match(html, /<mtable\b/);
});
