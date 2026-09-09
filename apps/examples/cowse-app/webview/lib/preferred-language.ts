// Language keys mirror apps/vscode/src/shared/Languages.ts. This is a host
// preference, passed to Core through its existing system-prompt interface.
export const LANGUAGE_OPTIONS = [
	["default", "默认（跟随对话）"],
	["zh-CN", "简体中文"],
	["zh-TW", "繁體中文"],
	["en", "English"],
	["ar", "العربية"],
	["pt-BR", "Português (Brasil)"],
	["cs", "Čeština"],
	["fr", "Français"],
	["de", "Deutsch"],
	["hi", "हिन्दी"],
	["hu", "Magyar"],
	["it", "Italiano"],
	["ja", "日本語"],
	["ko", "한국어"],
	["pl", "Polski"],
	["pt-PT", "Português (Portugal)"],
	["ru", "Русский"],
	["es", "Español"],
	["tr", "Türkçe"],
] as const;
export type PreferredLanguage = (typeof LANGUAGE_OPTIONS)[number][0];
export const PREFERRED_LANGUAGE_KEY = "cowse.preferredLanguage";

export function normalizePreferredLanguage(value: unknown): PreferredLanguage {
	return LANGUAGE_OPTIONS.some(([key]) => key === value)
		? (value as PreferredLanguage)
		: "default";
}

export function readPreferredLanguage(): PreferredLanguage {
	try {
		return normalizePreferredLanguage(
			window.localStorage.getItem(PREFERRED_LANGUAGE_KEY),
		);
	} catch {
		return "default";
	}
}

export function savePreferredLanguage(value: PreferredLanguage): void {
	window.localStorage.setItem(
		PREFERRED_LANGUAGE_KEY,
		normalizePreferredLanguage(value),
	);
}

// Only used by browser SpeechRecognition, not provider transcription requests.
export function resolveSpeechRecognitionLanguage(
	value: unknown,
	browserLanguage = typeof navigator === "undefined" ? "" : navigator.language,
): string {
	const language = normalizePreferredLanguage(value);
	return language === "default" ? browserLanguage || "en-US" : language;
}

export function applyPreferredLanguage(prompt: string, value: unknown): string {
	const language = normalizePreferredLanguage(value);
	return language === "default"
		? prompt
		: `${prompt}\n\n# Preferred Language\n\nSpeak in ${language}.`;
}
