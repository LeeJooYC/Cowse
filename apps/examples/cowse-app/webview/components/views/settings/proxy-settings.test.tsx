// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProxySettings } from "./proxy-settings";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/desktop-client", () => ({ desktopClient: { invoke } }));
let root: Root;
let container: HTMLDivElement;
const config = { mode: "off", protocol: "http", host: "127.0.0.1", port: 7890, username: "", password: "" };
async function click(text: string) {
	await act(async () => { Array.from(container.querySelectorAll("button")).find(b => b.textContent === text)!.click(); });
}
beforeEach(async () => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	invoke.mockReset().mockImplementation(async (command, args) => command === "get_proxy_config" ? config : args?.config);
	container = document.createElement("div"); document.body.append(container);
	root = createRoot(container);
	await act(async () => root.render(<ProxySettings />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it("off shows only the title and mode buttons", () => {
	expect(container.querySelector('[role="status"]')?.textContent).toContain("未启用");
	expect(Array.from(container.querySelectorAll("button")).map(b => b.textContent)).toEqual(["关闭", "自动", "手动"]);
	expect(container.querySelectorAll("button")).toHaveLength(3);
	expect(container.textContent).not.toContain("保存");
	expect(container.textContent).not.toContain("所有请求");
});
it("expands only the selected mode and saves off without a save button", async () => {
	await click("自动");
	expect(container.textContent).toContain("检测本地代理");
	expect(container.querySelector("input")).toBeNull();
	await click("手动");
	expect(container.querySelector('[role="status"]')?.textContent).toContain("未启用");
	for (const field of container.querySelectorAll("select, input")) expect(field.classList.contains("h-10")).toBe(true);
	expect(container.textContent).not.toContain("检测本地代理");
	expect(container.textContent).toContain("保存并启用");
	await click("关闭");
	expect(invoke).toHaveBeenCalledWith("save_proxy_config", { config });
	expect(container.querySelector("input")).toBeNull();
	expect(container.textContent).not.toContain("保存");
});
it("shows saved status only after save succeeds", async () => {
	await click("手动");
	await click("保存并启用");
	expect(container.querySelector('[role="status"]')?.textContent).toContain("已启用（手动） · HTTP · 127.0.0.1:7890");
	await click("自动");
	expect(container.querySelector('[role="status"]')?.textContent).toContain("已启用（手动）");
});
it("keeps the current mode and shows an error when disabling fails", async () => {
	await click("手动");
	invoke.mockRejectedValueOnce(new Error("保存失败"));
	await click("关闭");
	expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe("手动");
	expect(container.querySelector('[role="alert"]')?.textContent).toBe("保存失败");
});
