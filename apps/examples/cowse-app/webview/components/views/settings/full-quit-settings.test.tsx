// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FullQuitSettings } from "./full-quit-settings";

const { invoke, native } = vi.hoisted(() => ({
	invoke: vi.fn(),
	native: vi.fn(),
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke },
	isTauriAvailable: native,
}));
let root: Root;
let container: HTMLDivElement;
function button(text: string) {
	return Array.from(document.querySelectorAll("button")).find(
		(b) => b.textContent === text,
	)!;
}
async function click(text: string) {
	await act(async () => button(text).click());
}
beforeEach(async () => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	invoke.mockReset().mockResolvedValue({ ready: true });
	native.mockReturnValue(true);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => root.render(<FullQuitSettings />));
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});
describe("full quit settings", () => {
	it("requires confirmation; cancellation performs no shutdown", async () => {
		await click("完全退出");
		expect(document.body.textContent).toContain("会话记录会保留");
		expect(invoke).not.toHaveBeenCalled();
		await click("取消");
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(invoke).not.toHaveBeenCalled();
	});
	it("stops the idle backend before exiting the native app", async () => {
		await click("完全退出");
		await click("确认退出");
		expect(invoke.mock.calls.map(([name]) => name)).toEqual([
			"prepare_full_quit",
			"quit_app",
		]);
	});
	it("keeps the app open and displays a backend refusal", async () => {
		invoke.mockRejectedValueOnce(new Error("后台还有运行或排队中的任务"));
		await click("完全退出");
		await click("确认退出");
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"运行或排队",
		);
		expect(invoke).not.toHaveBeenCalledWith("quit_app");
	});
	it("retries only native exit if the backend already stopped", async () => {
		invoke
			.mockResolvedValueOnce({ ready: true })
			.mockRejectedValueOnce(new Error("native failure"));
		await click("完全退出");
		await click("确认退出");
		await click("确认退出");
		expect(invoke.mock.calls.map(([name]) => name)).toEqual([
			"prepare_full_quit",
			"quit_app",
			"quit_app",
		]);
	});
	it("disables quitting in browser-only mode", async () => {
		native.mockReturnValue(false);
		await act(async () => root.render(<FullQuitSettings />));
		expect(button("完全退出").disabled).toBe(true);
	});
});
