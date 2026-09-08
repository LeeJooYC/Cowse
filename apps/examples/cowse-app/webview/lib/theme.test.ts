// @vitest-environment jsdom

import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyHubAccent,
	DEFAULT_HUB_ACCENT,
	DEFAULT_HUB_THEME,
	HUB_ACCENT_STORAGE_KEY,
	HUB_THEME_BOOTSTRAP_SCRIPT,
	HUB_THEME_STORAGE_KEY,
	isHubAccent,
	readStoredHubAccent,
	readStoredHubTheme,
	readSystemHubTheme,
	setStoredHubAccent,
	setStoredHubTheme,
	watchSystemHubTheme,
	syncHubAccent,
	syncHubTheme,
} from "./theme";

const native = vi.hoisted(() => ({
	enabled: false,
	theme: vi.fn(),
	listen: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled }));
vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({ theme: native.theme, onThemeChanged: native.listen }),
}));
beforeEach(() => {
	native.enabled = false;
	native.theme.mockReset();
	native.listen.mockReset();
});

afterEach(() => {
	window.localStorage.clear();
	delete document.body.dataset.vscodeThemeKind;
	document.documentElement.classList.remove("dark");
	delete document.documentElement.dataset.clineAccent;
	delete document.documentElement.dataset.clineHubTheme;
	Reflect.deleteProperty(window, "matchMedia");
});

function setSystemTheme(theme: "light" | "dark" | null): void {
	window.matchMedia = ((query: string) =>
		({
			matches: theme !== null && query === `(prefers-color-scheme: ${theme})`,
			media: query,
			addEventListener() {},
			removeEventListener() {},
		}) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function runThemeBootstrap(): void {
	runInNewContext(HUB_THEME_BOOTSTRAP_SCRIPT, { document, window });
}

describe("hub theme", () => {
	it("updates the app shell without requiring an onChange callback", () => {
		let dark = true;
		let change = () => {};
		window.matchMedia = ((query: string) => ({
			get matches() { return query.includes(": dark") ? dark : !dark; },
			addEventListener: (_: string, listener: () => void) => { change = listener; },
			removeEventListener: vi.fn(),
		})) as unknown as typeof window.matchMedia;
		syncHubTheme();
		const stop = watchSystemHubTheme();
		try {
			dark = false;
			change();
			expect(document.documentElement.classList.contains("dark")).toBe(false);
			expect(document.documentElement.dataset.clineHubTheme).toBe("light");
			dark = true;
			change();
			expect(document.documentElement.classList.contains("dark")).toBe(true);
		} finally { stop(); }
	});
	it("recovers missed changes on focus, pageshow and visibility, but respects manual mode", () => {
		setSystemTheme("dark");
		syncHubTheme();
		const stop = watchSystemHubTheme();
		try {
			for (const event of ["focus", "pageshow", "visibilitychange"]) {
				setSystemTheme("dark");
				syncHubTheme();
				setSystemTheme("light");
				(event === "visibilitychange" ? document : window).dispatchEvent(new Event(event));
				expect(document.documentElement.dataset.clineHubTheme).toBe("light");
			}
			setStoredHubTheme("dark");
			window.dispatchEvent(new Event("focus"));
			expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
		} finally { stop(); }
		window.localStorage.clear();
		window.dispatchEvent(new Event("focus"));
		expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
	});
	it("uses native appearance when WebKit is stale, ignores stale queries and cleans up", async () => {
		native.enabled = true;
		setSystemTheme("dark");
		let changed!: (event: { payload: "light" | "dark" }) => void;
		const unlisten = vi.fn();
		native.listen.mockImplementation(async (handler) => { changed = handler; return unlisten; });
		native.theme.mockResolvedValue("dark");
		const stop = watchSystemHubTheme();
		try {
			await vi.waitFor(() => expect(changed).toBeTypeOf("function"));
			let resolve!: (theme: string) => void;
			native.theme.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
			window.dispatchEvent(new Event("focus"));
			changed({ payload: "light" });
			expect(document.documentElement.dataset.clineHubTheme).toBe("light");
			resolve("dark");
			await Promise.resolve();
			expect(document.documentElement.dataset.clineHubTheme).toBe("light");
			setStoredHubTheme("dark");
			changed({ payload: "light" });
			expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
			setStoredHubTheme("system");
			expect(document.documentElement.dataset.clineHubTheme).toBe("light");
		} finally { stop(); }
		expect(unlisten).toHaveBeenCalledOnce();
		changed({ payload: "dark" });
		expect(document.documentElement.dataset.clineHubTheme).toBe("light");
	});
	it("resumes system following and preserves it on the next bootstrap", () => {
		setSystemTheme("light");
		setStoredHubTheme("dark");
		expect(setStoredHubTheme("system")).toBe("light");
		expect(readStoredHubTheme()).toBeNull();
		setSystemTheme("dark");
		runThemeBootstrap();
		expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
	});
	it("tracks live system changes only in automatic mode and cleans up", () => {
		let dark = false;
		let change = () => {};
		const remove = vi.fn();
		window.matchMedia = ((query: string) => ({
			get matches() {
				return query.includes(": dark") ? dark : !dark;
			},
			addEventListener: (_: string, listener: () => void) => {
				change = listener;
			},
			removeEventListener: remove,
		})) as unknown as typeof window.matchMedia;
		const onChange = vi.fn();
		const stop = watchSystemHubTheme(onChange);
		dark = true;
		change();
		expect(onChange).toHaveBeenLastCalledWith("dark");
		setStoredHubTheme("light");
		change();
		expect(document.documentElement.dataset.clineHubTheme).toBe("light");
		expect(onChange).toHaveBeenCalledTimes(1);
		stop();
		expect(remove).toHaveBeenCalledWith("change", change);
	});
	it("applies a saved theme before the system preference", () => {
		setSystemTheme("light");
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "dark");

		runThemeBootstrap();

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
	});

	it("applies the system preference before the first paint when unsaved", () => {
		setSystemTheme("light");

		runThemeBootstrap();

		expect(document.documentElement.classList.contains("dark")).toBe(false);
		expect(document.documentElement.dataset.clineHubTheme).toBe("light");
	});

	it("defaults to dark when no saved or system preference is available", () => {
		expect(readStoredHubTheme()).toBeNull();
		expect(readSystemHubTheme()).toBe(DEFAULT_HUB_THEME);
		expect(syncHubTheme()).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		document.documentElement.classList.remove("dark");
		delete document.documentElement.dataset.clineHubTheme;
		runThemeBootstrap();

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
	});
});

describe("hub accent", () => {
	it("defaults to violet and validates stored values", () => {
		expect(readStoredHubAccent()).toBe(DEFAULT_HUB_ACCENT);
		window.localStorage.setItem(HUB_ACCENT_STORAGE_KEY, "not-a-color");
		expect(readStoredHubAccent()).toBe(DEFAULT_HUB_ACCENT);
		expect(isHubAccent("ember")).toBe(true);
		expect(isHubAccent("magenta")).toBe(false);
	});

	it("round-trips through storage and the html dataset", () => {
		setStoredHubAccent("graphite");
		expect(window.localStorage.getItem(HUB_ACCENT_STORAGE_KEY)).toBe(
			"graphite",
		);
		expect(document.documentElement.dataset.clineAccent).toBe("graphite");

		expect(syncHubAccent()).toBe("graphite");
		expect(document.documentElement.dataset.clineAccent).toBe("graphite");
	});

	it("clears the dataset attribute for the default accent", () => {
		applyHubAccent("ember");
		expect(document.documentElement.dataset.clineAccent).toBe("ember");
		applyHubAccent(DEFAULT_HUB_ACCENT);
		expect(document.documentElement.dataset.clineAccent).toBeUndefined();
	});
});
