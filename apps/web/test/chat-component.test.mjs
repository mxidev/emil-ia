import assert from "node:assert/strict";
import test from "node:test";
import { ChatComponent } from "../src/app/components/chat/chat.component.ts";

test("closes the PDF panel when Escape is pressed", () => {
  const component = new ChatComponent({}, {}, {});
  let prevented = false;
  component.attachmentsExpanded = true;

  component.onAttachmentKeydown({
    key: "Escape",
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(component.attachmentsExpanded, false);
  assert.equal(prevented, true);
});

test("keeps the PDF panel open for other keys", () => {
  const component = new ChatComponent({}, {}, {});
  component.attachmentsExpanded = true;

  component.onAttachmentKeydown({
    key: "Enter",
    preventDefault: () => {},
  });

  assert.equal(component.attachmentsExpanded, true);
});
