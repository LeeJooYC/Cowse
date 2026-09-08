// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { McpServersContent } from "./mcp-view";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/desktop-client", () => ({ desktopClient: { invoke } }));
vi.mock("./extensions-view", () => ({
	subscribeToExtensionInventoryInvalidation: () => () => {},
}));
vi.mock("../marketplace-view", () => ({
	MarketplaceEntrySetupDetails: () => null,
	MarketplaceView: ({
		installedItems,
	}: {
		installedItems: Array<{ key: string; render: () => React.ReactNode }>;
	}) => (
		<div>
			{installedItems.map((item) => (
				<div key={item.key}>{item.render()}</div>
			))}
		</div>
	),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	invoke.mockReset();
	invoke.mockResolvedValue({
		settingsPath: "/test/cline_mcp_settings.json",
		hasSettingsFile: true,
		servers: [
			{
				name: "example",
				transportType: "stdio",
				command: "npx",
				disabled: false,
			},
		],
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

it("localizes MCP settings and the local/remote server editor", async () => {
	await act(async () => {
		root.render(
			<McpServersContent chrome="embedded" marketplaceVariant="installed" />,
		);
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
	});
	expect(container.textContent).toContain(
		"修改此列表会同步更新 cline_mcp_settings.json。",
	);
	expect(container.textContent).toContain("MCP 配置路径：");
	expect(container.textContent).toContain("本地 · stdio");
	await act(async () =>
		[...container.querySelectorAll("button")]
			.find((b) => b.textContent === "添加 MCP 服务")
			?.click(),
	);
	expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
		"服务名称",
	);
	expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
		"环境变量",
	);
	expect(document.querySelector('[placeholder="变量名"]')).not.toBeNull();
	await act(async () =>
		document
			.querySelector<HTMLButtonElement>("#mcp-server-type-remote")
			?.click(),
	);
	expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
		"服务地址",
	);
	expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
		"Streamable HTTP（推荐）",
	);
});

it("localizes the MCP delete confirmation", async () => {
	await act(async () => root.render(<McpServersContent chrome="embedded" />));
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
	});
	await act(async () =>
		container
			.querySelector<HTMLButtonElement>('[aria-label="删除 example"]')
			?.click(),
	);
	expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
		"删除 MCP 服务",
	);
	expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
		"确定从配置中删除 MCP 服务“example”吗？",
	);
	expect(invoke).not.toHaveBeenCalledWith(
		"delete_mcp_server",
		expect.anything(),
	);
});
