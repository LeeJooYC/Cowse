// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	APP_FONT_SIZE_STORAGE_KEY,
	applyAppZoomAction,
} from "@/lib/app-font-size";
import { SettingsView } from "./settings-view";
import {
	PREFERRED_LANGUAGE_KEY,
	applyPreferredLanguage,
} from "@/lib/preferred-language";
import { normalizeRuntimeConfig } from "@/hooks/chat-session/helpers";
import { HUB_THEME_STORAGE_KEY } from "@/lib/theme";

const { invoke, subscribe } = vi.hoisted(() => ({
	invoke: vi.fn(),
	subscribe: vi.fn(),
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke, subscribe },
	isTauriAvailable: vi.fn(() => false),
	openExternalUrl: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

class ResizeObserverStub {
	disconnect() {}
	observe() {}
	unobserve() {}
}

beforeEach(() => {
	Object.assign(globalThis, {
		IS_REACT_ACT_ENVIRONMENT: true,
		ResizeObserver: ResizeObserverStub,
	});
	if (!window.localStorage) {
		const values = new Map<string, string>();
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: {
				get length() {
					return values.size;
				},
				clear: () => values.clear(),
				getItem: (key: string) => values.get(key) ?? null,
				key: (index: number) => [...values.keys()][index] ?? null,
				removeItem: (key: string) => values.delete(key),
				setItem: (key: string, value: string) => values.set(key, value),
			} satisfies Storage,
		});
	}
	window.localStorage.clear();
	document.documentElement.style.removeProperty("font-size");
	delete document.documentElement.dataset.clineFontSize;
	invoke.mockReset();
	subscribe.mockReset().mockReturnValue(vi.fn());
	invoke.mockResolvedValue({
		telemetryOptOut: false,
		autoUpdateEnabled: true,
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	Reflect.deleteProperty(window, "matchMedia");
	document.documentElement.classList.remove("dark");
	delete document.documentElement.dataset.clineHubTheme;
});

describe("app branding settings", () => {
	it("does not offer alternate app icons", async () => {
		await act(async () =>
			root.render(
				<SettingsView onNavigateSection={vi.fn()} section="General" />,
			),
		);
		expect(container.textContent).not.toContain("应用图标");
		expect(container.textContent).not.toContain("保持 CLI 为最新版本");
		expect(container.querySelector('img[src^="/app-icons/"]')).toBeNull();
		expect(container.textContent).toContain("强调色");
		const text = container.textContent!;
		expect(text.indexOf("新手引导")).toBeLessThan(text.indexOf("本地代理"));
		expect(text.indexOf("本地代理")).toBeLessThan(text.indexOf("关于"));
		expect(text.indexOf("关于")).toBeLessThan(text.indexOf("完全退出"));
		expect(container.textContent).toContain("供应商内置网页搜索");
		expect(
			container.querySelector('[aria-label="供应商内置网页搜索"]'),
		).not.toBeNull();
		expect(container.textContent).toContain("仅对新会话生效");
		expect(container.textContent).toContain(
			"此开关不控制网页读取工具，也不设置自动批准。",
		);
		expect(container.textContent).toContain("只决定读取网页时是否需要你的确认");
	});
});

describe("system theme settings", () => {
	it("disables manual theme selection while following live system changes", async () => {
		let dark = false;
		let change = () => {};
		window.matchMedia = ((query: string) => ({
			get matches() {
				return query.includes(": dark") ? dark : !dark;
			},
			addEventListener: (_: string, listener: () => void) => {
				change = listener;
			},
			removeEventListener: vi.fn(),
		})) as unknown as typeof window.matchMedia;
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "dark");
		await act(async () =>
			root.render(
				<SettingsView onNavigateSection={vi.fn()} section="General" />,
			),
		);
		const follow = () =>
			container.querySelector<HTMLButtonElement>(
				'[aria-label="跟随系统主题"]',
			)!;
		const manual = () =>
			container.querySelector<HTMLButtonElement>('[aria-label="深色模式"]')!;
		expect(follow().getAttribute("aria-checked")).toBe("false");
		expect(manual().disabled).toBe(false);
		await act(async () => follow().click());
		expect(manual().disabled).toBe(true);
		expect(manual().classList.contains("grayscale")).toBe(true);
		expect(manual().getAttribute("aria-checked")).toBe("false");
		expect(window.localStorage.getItem(HUB_THEME_STORAGE_KEY)).toBeNull();
		await act(async () => {
			dark = true;
			change();
		});
		expect(manual().getAttribute("aria-checked")).toBe("true");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		await act(async () => manual().click());
		expect(window.localStorage.getItem(HUB_THEME_STORAGE_KEY)).toBeNull();
		await act(async () => follow().click());
		expect(manual().disabled).toBe(false);
		expect(window.localStorage.getItem(HUB_THEME_STORAGE_KEY)).toBe("dark");
		await act(async () => {
			dark = false;
			change();
		});
		expect(manual().getAttribute("aria-checked")).toBe("true");
		await act(async () => manual().click());
		expect(window.localStorage.getItem(HUB_THEME_STORAGE_KEY)).toBe("light");
	});
});

describe("SettingsView provider navigation", () => {
	it("recovers persisted OAuth status on focus, auth events, and reentry", async () => {
		let connected = false;
		invoke.mockImplementation(async (command: string) => {
			if (command === "list_provider_catalog")
				return {
					providers: [
						{
							id: "openai-codex",
							name: "ChatGPT test",
							models: 0,
							color: "#000",
							letter: "O",
							enabled: connected,
							configured: connected,
							oauthAccessTokenPresent: connected,
							capabilities: ["oauth"],
							configFields: [],
							modelList: [],
						},
					],
				};
			if (command === "list_provider_models") return { models: [] };
			return {};
		});
		const mountModels = async () => {
			await act(async () =>
				root.render(
					<SettingsView section="Models" onNavigateSection={vi.fn()} />,
				),
			);
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
			await act(async () => {
				[...container.querySelectorAll("button")]
					.find((b) => b.textContent?.includes("ChatGPT test"))
					?.click();
			});
		};
		await mountModels();
		expect(container.textContent).toContain("使用浏览器登录");
		connected = true;
		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});
		expect(container.textContent).toContain("已通过浏览器登录");
		expect(container.textContent).toContain("退出登录");
		connected = false;
		await act(async () => {
			subscribe.mock.calls.find(
				([event]) => event === "provider_auth_changed",
			)?.[1]({ provider: "openai-codex" });
		});
		expect(container.textContent).toContain("使用浏览器登录");
		await act(async () =>
			root.render(
				<SettingsView section="General" onNavigateSection={vi.fn()} />,
			),
		);
		connected = true;
		await mountModels();
		expect(container.textContent).toContain("已通过浏览器登录");
	});

	it("keeps token exchange errors visible and allows a successful retry", async () => {
		let connected = false;
		let failLogin = true;
		invoke.mockImplementation(async (command: string) => {
			if (command === "list_provider_catalog")
				return {
					providers: [
						{
							id: "openai-codex",
							name: "ChatGPT test",
							models: 0,
							color: "#000",
							letter: "O",
							enabled: connected,
							configured: connected,
							oauthAccessTokenPresent: connected,
							capabilities: ["oauth"],
							configFields: [],
							modelList: [],
						},
					],
				};
			if (command === "list_provider_models") return { models: [] };
			if (command === "run_provider_oauth_login") {
				if (failLogin) throw new Error("Token exchange failed");
				connected = true;
				return { provider: "openai-codex", accessToken: "test-only-token" };
			}
			return {};
		});
		await act(async () =>
			root.render(
				<SettingsView section="Models" onNavigateSection={vi.fn()} />,
			),
		);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
		await act(async () => {
			[...container.querySelectorAll("button")]
				.find((b) => b.textContent?.includes("ChatGPT test"))
				?.click();
		});
		const login = () =>
			[...container.querySelectorAll("button")].find(
				(b) => b.textContent === "使用浏览器登录",
			)!;
		await act(async () => login().click());
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Token exchange failed",
		);
		expect(container.textContent).not.toContain("退出登录");
		failLogin = false;
		await act(async () => login().click());
		expect(container.textContent).toContain("已通过浏览器登录");
		expect(container.textContent).toContain("退出登录");
		expect(container.textContent).not.toContain("Token exchange failed");
	});

	it("refreshes from the source on reentry and preserves the last list on failure", async () => {
		let liveModel = "old-backend-model";
		let storedModels = [liveModel];
		let failRefresh = false;
		invoke.mockImplementation(
			async (command: string, args?: { fresh?: boolean }) => {
				if (command === "list_provider_catalog")
					return {
						providers: [
							{
								id: "test-provider",
								name: "Test provider",
								models: 0,
								color: "#000",
								letter: "T",
								enabled: true,
								configured: true,
								modelList: [],
							},
						],
					};
				if (command === "list_provider_models") {
					if (failRefresh) throw new Error("Backend unavailable");
					// Ordinary Core catalog reads merge saved and discovered models;
					// a source refresh replaces the saved list before reading it.
					storedModels = args?.fresh
						? [liveModel]
						: [...new Set([...storedModels, liveModel])];
					return {
						providerId: "test-provider",
						models: storedModels.map((id) => ({ id, name: id })),
					};
				}
				return {};
			},
		);
		await act(async () =>
			root.render(
				<SettingsView onNavigateSection={vi.fn()} section="Models" />,
			),
		);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
		const enter = async () => {
			await act(async () => {
				[...container.querySelectorAll("button")]
					.find((button) => button.textContent?.includes("Test provider"))
					?.click();
			});
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
		};
		const leave = async () => {
			await act(async () =>
				container
					.querySelector<HTMLButtonElement>('[aria-label="返回供应商列表"]')
					?.click(),
			);
		};
		await enter();
		expect(container.textContent).toContain("old-backend-model");
		await leave();
		liveModel = "new-backend-model";
		await enter();
		expect(container.textContent).toContain("new-backend-model");
		expect(container.textContent).not.toContain("old-backend-model");
		expect(invoke).toHaveBeenCalledWith("list_provider_models", {
			provider: "test-provider",
			fresh: true,
		});
		await leave();
		failRefresh = true;
		await enter();
		expect(container.textContent).toContain("Backend unavailable");
		expect(container.textContent).toContain("new-backend-model");
	});

	it("uses list-to-detail navigation at both normal and wide widths", async () => {
		invoke.mockImplementation(async (command: string) => {
			if (command === "list_provider_catalog")
				return {
					providers: [
						{
							id: "test-provider",
							name: "Test provider",
							models: 0,
							color: "#000",
							letter: "T",
							enabled: true,
							configured: true,
							modelList: [],
						},
					],
					settingsPath: "/test/settings.json",
				};
			if (command === "list_provider_models")
				return { providerId: "test-provider", models: [] };
			return { telemetryOptOut: false, autoUpdateEnabled: true };
		});
		for (const width of [1000, 2600]) {
			await act(async () => {
				container.style.width = `${width}px`;
				root.render(
					<SettingsView onNavigateSection={vi.fn()} section="Models" />,
				);
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
			await vi.waitFor(() =>
				expect(container.textContent).toContain("模型供应商"),
			);
			expect(container.querySelector(".provider-detail-layout")).toBeNull();
			const provider = [...container.querySelectorAll("button")].find(
				(button) => button.textContent?.includes("Test provider"),
			);
			expect(provider).toBeDefined();
			await act(async () => provider?.click());
			expect(container.querySelector(".provider-detail-layout")).not.toBeNull();
			expect(container.textContent).not.toContain("模型供应商");
			expect(container.querySelector(".provider-split-layout")).toBeNull();
			await act(async () =>
				container
					.querySelector<HTMLButtonElement>('[aria-label="返回供应商列表"]')
					?.click(),
			);
			expect(container.textContent).toContain("模型供应商");
			expect(container.querySelector(".provider-detail-layout")).toBeNull();
		}
	});
});

describe("SettingsView font size", () => {
	it("persists preferred language and applies the latest preference to existing sessions", async () => {
		window.localStorage.setItem(PREFERRED_LANGUAGE_KEY, "en");
		await act(async () =>
			root.render(
				<SettingsView onNavigateSection={vi.fn()} section="General" />,
			),
		);
		const select = container.querySelector<HTMLSelectElement>(
			"#preferred-language",
		);
		expect(select?.value).toBe("en");
		await act(async () => {
			if (select) {
				select.value = "zh-CN";
				select.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});
		expect(window.localStorage.getItem(PREFERRED_LANGUAGE_KEY)).toBe("zh-CN");
		const config = {
			workspaceRoot: "/tmp",
			provider: "cline",
			model: "test",
			apiKey: "",
			enableTools: true,
			mode: "plan" as const,
			preferredLanguage: "en",
		};
		expect(normalizeRuntimeConfig(config)).toMatchObject({
			mode: "plan",
			preferredLanguage: "zh-CN",
		});
		await act(async () => {
			if (select) {
				select.value = "default";
				select.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});
		expect(normalizeRuntimeConfig(config).preferredLanguage).toBe("default");
		expect(applyPreferredLanguage("Original", "unknown language")).toBe(
			"Original",
		);
	});

	it("loads the saved size and updates it from the General settings controls", async () => {
		window.localStorage.setItem(APP_FONT_SIZE_STORAGE_KEY, "17");

		await act(async () => {
			root.render(
				<SettingsView onNavigateSection={vi.fn()} section="General" />,
			);
		});

		const slider = container.querySelector<HTMLElement>(
			'[role="slider"][aria-label="字体大小"]',
		);
		const increaseButton = container.querySelector<HTMLButtonElement>(
			'button[aria-label="增大字体"]',
		);
		expect(slider?.getAttribute("aria-valuenow")).toBe("17");
		expect(increaseButton).not.toBeNull();
		expect(increaseButton?.disabled).toBe(false);
		expect(container.textContent).toContain("17px");

		await act(async () => {
			increaseButton?.click();
		});

		expect(window.localStorage.getItem(APP_FONT_SIZE_STORAGE_KEY)).toBe("18");
		expect(document.documentElement.style.fontSize).toBe("18px");
		const updatedSlider = container.querySelector<HTMLElement>(
			'[role="slider"][aria-label="字体大小"]',
		);
		expect(updatedSlider).toBe(slider);
		expect(updatedSlider?.getAttribute("aria-valuenow")).toBe("18");

		await act(async () => {
			updatedSlider?.focus();
			updatedSlider?.dispatchEvent(
				new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
			);
		});

		expect(window.localStorage.getItem(APP_FONT_SIZE_STORAGE_KEY)).toBe("19");
		expect(document.documentElement.style.fontSize).toBe("19px");
		expect(updatedSlider?.getAttribute("aria-valuenow")).toBe("19");

		await act(async () => {
			applyAppZoomAction("zoom-in");
		});

		expect(window.localStorage.getItem(APP_FONT_SIZE_STORAGE_KEY)).toBe("20");
		expect(container.textContent).toContain("20px");
		expect(updatedSlider?.getAttribute("aria-valuenow")).toBe("20");
		expect(increaseButton?.disabled).toBe(true);
	});
});
