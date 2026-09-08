import { isTauri } from "@tauri-apps/api/core";

export const HUB_THEME_STORAGE_KEY = "cline-hub-theme";
const HUB_THEME_PREFERENCE_EVENT = "cowse-theme-preference-changed";
let nativeSystemTheme: HubTheme | null = null;

export type HubTheme = "light" | "dark";

export const DEFAULT_HUB_THEME: HubTheme = "dark";

/**
 * Runs from the document head before the webview paints. Keep this
 * self-contained: the browser executes it before the client bundle loads.
 */
export const HUB_THEME_BOOTSTRAP_SCRIPT = `(() => {
	const root = document.documentElement;
	let theme;

	try {
		const stored = window.localStorage.getItem(${JSON.stringify(HUB_THEME_STORAGE_KEY)});
		if (stored === "light" || stored === "dark") {
			theme = stored;
		}
	} catch {}

	if (!theme) {
		try {
			if (typeof window.matchMedia === "function") {
				if (window.matchMedia("(prefers-color-scheme: light)").matches) {
					theme = "light";
				} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
					theme = "dark";
				}
			}
		} catch {}
	}

	if (!theme) {
		theme = ${JSON.stringify(DEFAULT_HUB_THEME)};
	}
	root.classList.toggle("dark", theme === "dark");
	root.dataset.clineHubTheme = theme;
})();`;

export function readStoredHubTheme(): HubTheme | null {
	try {
		const stored = window.localStorage.getItem(HUB_THEME_STORAGE_KEY);
		return stored === "light" || stored === "dark" ? stored : null;
	} catch {
		return null;
	}
}

export function readSystemHubTheme(): HubTheme {
	// WKWebView's media query can lag behind the native macOS appearance.
	if (isTauri() && nativeSystemTheme) return nativeSystemTheme;
	const kind = document.body.dataset.vscodeThemeKind;
	if (kind === "vscode-dark" || kind === "vscode-high-contrast") {
		return "dark";
	}
	if (kind === "vscode-light" || kind === "vscode-high-contrast-light") {
		return "light";
	}
	try {
		if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
			return "dark";
		}
		if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
			return "light";
		}
	} catch {
		// Use the app default when the host cannot expose its color scheme.
	}
	return DEFAULT_HUB_THEME;
}

export function applyHubTheme(theme: HubTheme): HubTheme {
	document.documentElement.classList.toggle("dark", theme === "dark");
	document.documentElement.dataset.clineHubTheme = theme;
	return theme;
}

export function syncHubTheme(): HubTheme {
	return applyHubTheme(readStoredHubTheme() ?? readSystemHubTheme());
}

export function setStoredHubTheme(theme: HubTheme | "system"): HubTheme {
	try {
		if (theme === "system") {
			window.localStorage.removeItem(HUB_THEME_STORAGE_KEY);
		} else {
			window.localStorage.setItem(HUB_THEME_STORAGE_KEY, theme);
		}
	} catch {
		// Applying still works for this session when persistence is unavailable.
	}
	const applied = applyHubTheme(theme === "system" ? readSystemHubTheme() : theme);
	window.dispatchEvent(new Event(HUB_THEME_PREFERENCE_EVENT));
	return applied;
}

export const HUB_ACCENT_STORAGE_KEY = "cline.code.accent.v1";

/**
 * Accent palettes selectable in Settings. "violet" is the built-in brand
 * accent from @cline/ui tokens; the others override the interactive tokens
 * via `[data-cline-accent]` blocks in globals.css.
 */
export const HUB_ACCENTS = [
	"violet",
	"graphite",
	"cyan",
	"pink",
	"espresso",
	"ember",
] as const;

export type HubAccent = (typeof HUB_ACCENTS)[number];

export const DEFAULT_HUB_ACCENT: HubAccent = "violet";

export function isHubAccent(value: unknown): value is HubAccent {
	return (
		typeof value === "string" &&
		(HUB_ACCENTS as readonly string[]).includes(value)
	);
}

export function readStoredHubAccent(): HubAccent {
	try {
		const stored = window.localStorage.getItem(HUB_ACCENT_STORAGE_KEY);
		return isHubAccent(stored) ? stored : DEFAULT_HUB_ACCENT;
	} catch {
		return DEFAULT_HUB_ACCENT;
	}
}

export function applyHubAccent(accent: HubAccent): HubAccent {
	if (accent === DEFAULT_HUB_ACCENT) {
		delete document.documentElement.dataset.clineAccent;
	} else {
		document.documentElement.dataset.clineAccent = accent;
	}
	return accent;
}

export function syncHubAccent(): HubAccent {
	return applyHubAccent(readStoredHubAccent());
}

export function setStoredHubAccent(accent: HubAccent): HubAccent {
	try {
		window.localStorage.setItem(HUB_ACCENT_STORAGE_KEY, accent);
	} catch {
		// Accent falls back to default next launch; applying still works now.
	}
	return applyHubAccent(accent);
}

/**
 * Follow OS light/dark changes while the user has no stored preference.
 * Returns a cleanup function that removes the listener.
 */
export function watchSystemHubTheme(
	onChange?: (theme: HubTheme) => void,
): () => void {
	let disposed = false;
	let revision = 0;
	let nativeWindow: import("@tauri-apps/api/window").Window | undefined;
	let unlistenNative: (() => void) | undefined;
	const handle = () => {
		if (disposed || readStoredHubTheme() !== null) {
			return;
		}
		const theme = applyHubTheme(readSystemHubTheme());
		onChange?.(theme);
	};
	const refresh = () => {
		handle();
		if (!nativeWindow) return;
		const request = ++revision;
		void nativeWindow.theme().then((theme) => {
			if (disposed || request !== revision || !theme) return;
			nativeSystemTheme = theme;
			handle();
		}).catch(() => {});
	};
	const onVisible = () => {
		if (document.visibilityState === "visible") refresh();
	};
	const media = window.matchMedia?.("(prefers-color-scheme: dark)");
	if (media?.addEventListener) media.addEventListener("change", refresh);
	else media?.addListener?.(refresh);
	window.addEventListener("focus", refresh);
	window.addEventListener("pageshow", refresh);
	window.addEventListener(HUB_THEME_PREFERENCE_EVENT, refresh);
	document.addEventListener("visibilitychange", onVisible);

	if (isTauri()) {
		void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
			if (disposed) return;
			nativeWindow = getCurrentWindow();
			refresh();
			const unlisten = await nativeWindow.onThemeChanged(({ payload }) => {
				if (disposed) return;
				++revision; // An older in-flight query must not undo this event.
				nativeSystemTheme = payload;
				handle();
			});
			if (disposed) unlisten();
			else unlistenNative = unlisten;
		}).catch(() => {});
	}

	return () => {
		disposed = true;
		if (media?.removeEventListener) media.removeEventListener("change", refresh);
		else media?.removeListener?.(refresh);
		window.removeEventListener("focus", refresh);
		window.removeEventListener("pageshow", refresh);
		window.removeEventListener(HUB_THEME_PREFERENCE_EVENT, refresh);
		document.removeEventListener("visibilitychange", onVisible);
		unlistenNative?.();
	};
}
