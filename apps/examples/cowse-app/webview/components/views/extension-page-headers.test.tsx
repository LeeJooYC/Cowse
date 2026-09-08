// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarketplaceExplorerView } from "./marketplace-explorer-view";
import { CustomizeView } from "./settings/customize-view";

const { fetchCatalog, invoke } = vi.hoisted(() => ({
	fetchCatalog: vi.fn(),
	invoke: vi.fn(),
}));
vi.mock("@/lib/marketplace", () => ({ fetchMarketplaceCatalog: fetchCatalog }));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke, subscribe: () => () => {} },
	openExternalUrl: vi.fn(),
}));
vi.mock("./settings/extensions-view", () => ({
	CustomizationSectionView: () => <div>安装列表</div>,
	invalidateExtensionInventoryCache: vi.fn(),
}));
vi.mock("./settings/mcp-view", () => ({
	McpServersContent: () => <div>MCP 列表</div>,
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	fetchCatalog.mockReset();
	invoke.mockReset().mockResolvedValue({ installedKeys: [] });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

it("labels installed extensions and removes the redundant marketplace header button", async () => {
	await act(async () => root.render(<CustomizeView />));
	expect(container.querySelector("h1")?.textContent).toBe("已安装拓展");
	expect(
		[...container.querySelectorAll("button")].some((button) =>
			button.textContent?.includes("扩展市场"),
		),
	).toBe(false);
	expect(container.textContent).toContain("安装列表");
});

it.each([
	"loading",
	"error",
	"ready",
])("keeps the shared marketplace header in the %s state", async (state) => {
	if (state === "loading") fetchCatalog.mockReturnValue(new Promise(() => {}));
	else if (state === "error")
		fetchCatalog.mockRejectedValue(new Error("Catalog unavailable"));
	else
		fetchCatalog.mockResolvedValue({
			version: 1,
			counts: { total: 0, skills: 0, mcps: 0, plugins: 0 },
			tags: [],
			entries: [],
		});
	await act(async () => root.render(<MarketplaceExplorerView />));
	expect(container.querySelector(".page-content h1")?.textContent).toBe(
		"扩展市场",
	);
	expect(container.querySelector("h1")?.className).toContain("text-3xl");
	expect(container.textContent).toContain("浏览并安装技能、MCP 服务和插件");
	if (state === "loading")
		expect(container.textContent).toContain("正在加载扩展市场");
	if (state === "error")
		expect(container.textContent).toContain("Catalog unavailable");
	if (state === "ready")
		expect(
			container.querySelector('[aria-label="搜索扩展市场"]'),
		).not.toBeNull();
});
