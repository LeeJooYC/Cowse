import { describe, expect, it } from "vitest";
import {
	LANGUAGE_OPTIONS,
	resolveSpeechRecognitionLanguage,
} from "./preferred-language";

describe("resolveSpeechRecognitionLanguage", () => {
	it("preserves every explicit preferred language including regional variants", () => {
		for (const [language] of LANGUAGE_OPTIONS) {
			if (language !== "default") {
				expect(resolveSpeechRecognitionLanguage(language, "en-US")).toBe(
					language,
				);
			}
		}
	});
	it("uses the browser language for default and unknown preferences", () => {
		for (const value of ["default", undefined, "invalid"]) {
			expect(resolveSpeechRecognitionLanguage(value, "zh-CN")).toBe("zh-CN");
			expect(resolveSpeechRecognitionLanguage(value, "ja-JP")).toBe("ja-JP");
		}
	});
	it("retains the previous fallback only when browser language is unavailable", () => {
		expect(resolveSpeechRecognitionLanguage("default", "")).toBe("en-US");
	});
});
