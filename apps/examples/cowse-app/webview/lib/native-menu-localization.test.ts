import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const source = readFileSync(new URL("../../src-tauri/src/main.rs", import.meta.url), "utf8");
it("localizes native zoom titles and matches the localized shortcut target", () => {
 expect(source).toContain('VIEW_ZOOM_IN_MENU_ID, "放大"');
 expect(source).toMatch(/VIEW_ZOOM_OUT_MENU_ID,\s*"缩小"/);
 expect(source).toMatch(/VIEW_ZOOM_RESET_MENU_ID,\s*"实际大小"/);
 expect(source).toContain('view_menu.set_text("视图")');
 expect(source).toContain('Submenu::with_items(app, "视图"');
 expect(source).toContain('set_macos_menu_key_equivalent("视图", "放大", "+")');
 expect(source).toContain('Some("CmdOrCtrl+-")');
 expect(source).toContain('Some("CmdOrCtrl+0")');
});
