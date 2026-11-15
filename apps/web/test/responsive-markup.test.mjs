import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), "utf8");
}

test("declares mobile viewport behavior and theme colors", () => {
  const index = read("src/index.html");

  assert.match(index, /viewport-fit=cover/);
  assert.match(index, /interactive-widget=resizes-content/);
  assert.match(index, /<meta\s+name="theme-color"\s+content="#fffdf8"/i);
});

test("reserves safe areas around the mobile shell and composer", () => {
  const appStyles = read("src/app/app.component.css");
  const chatStyles = read("src/app/components/chat/chat.component.css");

  assert.match(appStyles, /env\(safe-area-inset-top/);
  assert.match(chatStyles, /env\(safe-area-inset-bottom/);
});

test("keeps the composer usable at narrow widths", () => {
  const chatStyles = read("src/app/components/chat/chat.component.css");

  assert.match(chatStyles, /@media\s*\(max-width:\s*520px\)/);
  assert.match(chatStyles, /\.composer[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(chatStyles, /\.composer button[\s\S]*?min-height:\s*44px/);
});

test("contains scroll chaining in owned scroll regions", () => {
  const chatStyles = read("src/app/components/chat/chat.component.css");
  const historyStyles = read(
    "src/app/components/conversation-history/conversation-history.component.css",
  );

  assert.match(chatStyles, /\.chat[\s\S]*?overscroll-behavior:\s*contain/);
  assert.match(
    historyStyles,
    /\.conversation-list[\s\S]*?overscroll-behavior[^:]*:\s*contain/,
  );
});
