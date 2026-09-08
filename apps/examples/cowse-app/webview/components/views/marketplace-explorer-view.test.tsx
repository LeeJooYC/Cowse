// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarketplaceExplorerView } from "./marketplace-explorer-view";

const { fetchMarketplaceCatalog, invoke } = vi.hoisted(() => ({
	fetchMarketplaceCatalog: vi.fn(),
	invoke: vi.fn(),
}));

vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke },
	openExternalUrl: vi.fn(),
}));

vi.mock("@/lib/marketplace", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/marketplace")>()),
	fetchMarketplaceCatalog,
}));

const labels = [
	"Software Development",
	"Data & Analytics",
	"Productivity",
	"Research & Docs",
	"Security",
	"Finance",
];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	fetchMarketplaceCatalog.mockResolvedValue({
		version: 1,
		counts: {
			total: labels.length,
			skills: labels.length,
			plugins: 0,
			mcps: 0,
		},
		tags: labels.map((label, index) => ({
			id: `tag-${index}`,
			label,
			count: 1,
		})),
		entries: labels.map((_, index) => ({
			id: `entry-${index}`,
			type: "skill",
			name: `Example skill ${index}`,
			tagline: "Original tagline",
			description: "Original description",
			tags: [`tag-${index}`],
			install: { args: [], command: "example" },
		})),
	});
	invoke.mockResolvedValue({ installedKeys: [] });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it("preserves original category labels while keeping UI controls Chinese and filtering by tag ID", async () => {
	await act(async () => root.render(<MarketplaceExplorerView />));
	expect(container.textContent).toContain("扩展市场");
	const expand = [...container.querySelectorAll("button")].find(
		(button) => button.textContent === "还有 2 项",
	);
	expect(expand).toBeDefined();
	await act(async () => expand!.click());
	for (const label of labels) expect(container.textContent).toContain(label);
	for (const label of [
		"软件开发",
		"数据与分析",
		"效率工具",
		"研究与文档",
		"安全",
		"金融",
	]) {
		expect(container.textContent).not.toContain(label);
	}
	expect(container.textContent).toContain("收起");
	const category = [...container.querySelectorAll("button")].find((button) =>
		button.textContent?.startsWith("Software Development"),
	);
	await act(async () => category!.click());
	expect(category!.getAttribute("aria-pressed")).toBe("true");
	expect(container.textContent).toContain("Example skill 0");
	expect(container.textContent).not.toContain("Example skill 1");
});
