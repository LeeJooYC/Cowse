// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApprovalCard } from "@cline/ui";
import { AddProviderContent } from "@/components/views/settings/add-provider";
import { ToolApprovalPanel } from "@/components/views/chat/messages/tool-approval-panel";
import { ChatSessionStatusSchema } from "@/lib/chat-schema";
import { sessionStatusLabel } from "@/lib/session-status";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});
function button(text: string): HTMLButtonElement {
	const node = Array.from(container.querySelectorAll("button")).find(
		(item) => item.textContent?.trim() === text,
	);
	expect(node).toBeDefined();
	return node!;
}
async function input(placeholder: string, value: string) {
	const field = Array.from(container.querySelectorAll("input")).find(
		(item) => item.placeholder === placeholder,
	);
	expect(field).toBeDefined();
	await act(async () => {
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)!.set!.call(field, value);
		field!.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("Cowse first-batch localization", () => {
	it("saves original provider parameters through Chinese capability labels and retains raw errors", async () => {
		const onSave = vi.fn(async () => {
			throw new Error("HTTP 401: invalid_api_key");
		});
		await act(async () =>
			root.render(
				<AddProviderContent
					existingProviderIds={[]}
					onBack={vi.fn()}
					onSave={onSave}
				/>,
			),
		);
		expect(container.textContent).toContain("供应商 ID");
		expect(container.textContent).toContain("支持的能力");
		expect(button("添加供应商").disabled).toBe(true);
		await input("my-provider", "test-provider");
		await input("我的供应商", "Test Provider");
		await input("https://api.example.com/v1", "https://example.com/v1");
		await input(
			"https://api.example.com/v1/models",
			"https://example.com/v1/models",
		);
		await input("sk-...", "test-key");
		await act(async () => button("推理").click());
		await act(async () => button("提示词缓存").click());
		await act(async () => button("添加供应商").click());
		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({
				providerId: "test-provider",
				name: "Test Provider",
				apiKey: "test-key",
				baseUrl: "https://example.com/v1",
				modelsSourceUrl: "https://example.com/v1/models",
				capabilities: ["streaming", "tools", "reasoning", "prompt-cache"],
			}),
		);
		expect(container.textContent).toContain("HTTP 401: invalid_api_key");
		expect(container.textContent).not.toContain("Add Provider");
	});

	it("shows Chinese approvals while keeping tool input, IDs and backend errors verbatim", async () => {
		const onApprove = vi.fn(),
			onReject = vi.fn();
		const props = {
			items: [
				{
					requestId: "req-1",
					sessionId: "s1",
					createdAt: "invalid",
					toolCallId: "t1",
					toolName: "run_commands",
					input: { command: "echo hello" },
					iteration: 2,
				},
			],
			pendingActions: {},
			requestErrors: { "req-1": "raw_backend_error" },
			onApprove,
			onReject,
		};
		await act(async () => root.render(<ToolApprovalPanel {...props} />));
		expect(container.textContent).toContain("工具操作需要审批");
		expect(container.textContent).toContain("第 2 轮");
		expect(container.textContent).toContain("正在等待审批");
		expect(container.textContent).toContain("run_commands");
		expect(container.textContent).toContain("raw_backend_error");
		expect(container.querySelector("pre")?.textContent).toBe(
			JSON.stringify({ command: "echo hello" }, null, 2),
		);
		await act(async () => button("批准").click());
		await act(async () => button("拒绝").click());
		expect(onApprove).toHaveBeenCalledWith("req-1");
		expect(onReject).toHaveBeenCalledWith("req-1");
		for (const state of ["approving", "rejecting"] as const) {
			await act(async () =>
				root.render(
					<ToolApprovalPanel {...props} pendingActions={{ "req-1": state }} />,
				),
			);
			expect(container.textContent).toContain(
				state === "approving" ? "正在批准…" : "正在拒绝…",
			);
			expect(
				Array.from(container.querySelectorAll("button")).every(
					(item) => item.disabled,
				),
			).toBe(true);
		}
	});

	it("preserves shared component English defaults for other hosts", async () => {
		await act(async () =>
			root.render(
				<AgentApprovalCard
					title="Run command"
					onApprove={vi.fn()}
					onReject={vi.fn()}
				/>,
			),
		);
		expect(button("Approve").disabled).toBe(false);
		expect(button("Reject").disabled).toBe(false);
		await act(async () =>
			root.render(
				<AgentApprovalCard
					title="Run command"
					onApprove={vi.fn()}
					onReject={vi.fn()}
					responding="approve"
				/>,
			),
		);
		expect(button("Approving...").disabled).toBe(true);
	});

	it("localizes all known chat statuses without changing protocol values or unknown statuses", () => {
		for (const status of ChatSessionStatusSchema.options) {
			expect(sessionStatusLabel(status)).toMatch(/[\u4e00-\u9fff]/);
			expect(ChatSessionStatusSchema.parse(status)).toBe(status);
		}
		expect(sessionStatusLabel("future_status")).toBe("future_status");
		expect(sessionStatusLabel(undefined)).toBe("未知");
	});
});
