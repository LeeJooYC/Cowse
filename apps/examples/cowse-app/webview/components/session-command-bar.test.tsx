// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCommandBar } from "@/components/session-command-bar";

const desktopMocks = vi.hoisted(() => ({
	invoke: vi.fn(),
}));

vi.mock("@/lib/desktop-client", () => ({ desktopClient: desktopMocks }));

type SearchHit = {
	sessionId: string;
	documentId: string;
	ordinal: number;
	role: string;
	startedAt: string;
	workspaceRoot: string;
	title: string;
	snippet: string;
};

let container: HTMLDivElement;
let root: Root;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

async function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	await act(async () => {
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function waitForDebounce() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 210));
	});
}

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	desktopMocks.invoke.mockReset();
	HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
	HTMLElement.prototype.setPointerCapture = vi.fn();
	HTMLElement.prototype.releasePointerCapture = vi.fn();
	HTMLElement.prototype.scrollIntoView = vi.fn();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("SessionCommandBar", () => {
	it("keeps typing responsive, ignores stale searches, and lazily renders bounded results", async () => {
		const firstSearch = deferred<SearchHit[]>();
		const secondSearch = deferred<SearchHit[]>();
		desktopMocks.invoke
			.mockReturnValueOnce(firstSearch.promise)
			.mockReturnValueOnce(secondSearch.promise);
		const onOpenChange = vi.fn();
		const onOpenSession = vi.fn();

		await act(async () => {
			root.render(
				<SessionCommandBar
					onOpenChange={onOpenChange}
					onOpenSession={onOpenSession}
					open
				/>,
			);
		});

		const input = document.querySelector<HTMLInputElement>("[cmdk-input]");
		expect(input).not.toBeNull();
		expect(input?.placeholder).toBe("搜索全部会话记录…");
		expect(document.body.textContent).toContain("搜索消息、命令、错误和文件路径。");
		expect(document.body.textContent).toContain("使用 ↑↓ 选择，按 ↵ 打开");
		expect(document.body.textContent).toContain("搜索会话记录");
		expect(document.body.textContent).toContain("Cmd/Ctrl+P");
		await changeInput(input as HTMLInputElement, "generate");
		expect(document.body.textContent).toContain("正在搜索会话…");
		await waitForDebounce();
		expect(desktopMocks.invoke).toHaveBeenCalledTimes(1);

		await changeInput(input as HTMLInputElement, "generate puppy");
		expect(input?.value).toBe("generate puppy");
		expect(document.querySelectorAll("[cmdk-item]")).toHaveLength(0);
		await waitForDebounce();
		expect(desktopMocks.invoke).toHaveBeenCalledTimes(2);

		firstSearch.resolve([
			{
				sessionId: "stale-session",
				documentId: "stale-session:0",
				ordinal: 0,
				role: "user",
				startedAt: "2026-08-27T12:00:00.000Z",
				workspaceRoot: "/workspace/project",
				title: "stale result",
				snippet: "stale result",
			},
		]);
		await act(async () => Promise.resolve());
		expect(document.querySelectorAll("[cmdk-item]")).toHaveLength(0);

		const oversized = `<user_input mode="act">${"generate puppy ".repeat(3_000)}</user_input>`;
		secondSearch.resolve(
			Array.from({ length: 40 }, (_, index) => ({
				sessionId: `session-${index}`,
				documentId: `session-${index}:0`,
				ordinal: 0,
				role: "user",
				startedAt: "2026-08-27T12:00:00.000Z",
				workspaceRoot: "/workspace/project",
				title: oversized,
				snippet: oversized,
			})),
		);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		const initialItems = document.querySelectorAll<HTMLElement>("[cmdk-item]");
		expect(initialItems).toHaveLength(15);
		expect(document.body.textContent).toContain("已显示 15 条，共 40 条结果");
		expect(initialItems[0]?.textContent).toContain("用户");
		expect(document.body.textContent).not.toContain("user_input");
		expect(initialItems[0]?.querySelector("svg")).toBeNull();
		expect(initialItems[0]?.getAttribute("data-value")?.length).toBeLessThan(
			1_000,
		);
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(onOpenSession).not.toHaveBeenCalled();

		const list = document.querySelector<HTMLElement>("[cmdk-list]");
		expect(list).not.toBeNull();
		Object.defineProperties(list as HTMLElement, {
			scrollHeight: { configurable: true, value: 1_000 },
			clientHeight: { configurable: true, value: 300 },
			scrollTop: { configurable: true, value: 650 },
		});
		await act(async () => {
			list?.dispatchEvent(new Event("scroll", { bubbles: true }));
		});

		expect(document.querySelectorAll("[cmdk-item]")).toHaveLength(30);
		expect(document.body.textContent).toContain("已显示 30 条，共 40 条结果");
		await act(async () => initialItems[0]?.click());
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onOpenSession).toHaveBeenCalledWith("session-0");
	});

	it("shows a Chinese empty-result message", async () => {
		desktopMocks.invoke.mockResolvedValue([]);
		await act(async () => {
			root.render(<SessionCommandBar open onOpenChange={vi.fn()} onOpenSession={vi.fn()} />);
		});
		await changeInput(document.querySelector<HTMLInputElement>("[cmdk-input]")!, "不存在的消息");
		await waitForDebounce();
		expect(document.body.textContent).toContain("没有找到匹配的会话记录。");
		expect(document.body.textContent).not.toContain("正在搜索会话…");
	});
});
