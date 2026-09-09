// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImportSessionsDialog } from "./import-sessions-dialog";
const { invoke, subscribe } = vi.hoisted(() => ({
	invoke: vi.fn(),
	subscribe: vi.fn(() => () => {}),
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke, subscribe },
}));
vi.mock("@/hooks/chat-session/constants", () => ({
	getInitialChatConfig: () => ({ provider: "openai", model: "original-model" }),
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	invoke.mockReset();
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});
const render = async () => {
	await act(async () =>
		root.render(<ImportSessionsDialog open onOpenChange={vi.fn()} />),
	);
};
it("localizes loading and scan errors without altering backend details", async () => {
	let reject!: (error: Error) => void;
	invoke.mockImplementation(
		() =>
			new Promise((_, r) => {
				reject = r;
			}),
	);
	await render();
	expect(document.body.textContent).toContain("正在扫描会话…");
	await act(async () => reject(new Error("EACCES /original/path")));
	expect(document.body.textContent).toContain("无法扫描会话：");
	expect(document.body.textContent).toContain("EACCES /original/path");
});
it("localizes empty state and preserves source product names", async () => {
	invoke.mockResolvedValue({ sessions: [] });
	await render();
	expect(document.body.textContent).toContain("未找到会话");
	expect(document.body.textContent).toContain("Claude Code、Codex 和 opencode");
});
it("imports original source IDs and model selection with Chinese counts and result", async () => {
	const session = {
		tool: "codex",
		sourceId: "original-id",
		sourcePath: "/original/path",
		title: "Original title",
		cwd: "/workspace",
		startedAtMs: 1,
		updatedAtMs: 1,
		messageCount: 2,
	};
	invoke.mockImplementation(async (command) =>
		command === "list_importable_sessions"
			? { sessions: [session] }
			: { results: [{ tool: "codex", sourceId: "original-id", ok: true }] },
	);
	await render();
	expect(document.body.textContent).toContain("2 条消息");
	expect(document.body.textContent).toContain("Original title");
	await act(async () =>
		document
			.querySelector<HTMLButtonElement>('[aria-label="选择全部会话"]')!
			.click(),
	);
	expect(document.body.textContent).toContain("已选择 1 / 1 个会话");
	const button = [...document.querySelectorAll("button")].find(
		(b) =>
			b.textContent?.trim() === "导入1" || b.textContent?.trim() === "导入 1",
	);
	expect(button).toBeDefined();
	await act(async () => button!.click());
	expect(invoke).toHaveBeenCalledWith(
		"import_sessions",
		{
			selections: [{ tool: "codex", sourceId: "original-id" }],
			provider: "openai",
			model: "original-model",
		},
		{ timeoutMs: null },
	);
	expect(document.body.textContent).toContain("已导入 1 个会话。");
	expect(document.body.textContent).toContain("完成");
});
