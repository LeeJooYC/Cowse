// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PageFrame } from "./page-layout";
import {
	ProviderDetailContent,
	ProviderListContent,
} from "./settings/provider-list-view";

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
});

it("uses uncapped fluid content for shared pages, provider lists and details", async () => {
	const provider = {
		id: "ollama",
		name: "Ollama",
		models: 0,
		color: "#000",
		letter: "O",
		enabled: true,
		modelList: [],
	};
	for (const view of [
		<PageFrame>
			<section>设置</section>
		</PageFrame>,
		<ProviderListContent
			providers={[provider]}
			onConfigure={() => {}}
			onAddProvider={() => {}}
		/>,
		<ProviderDetailContent
			provider={provider}
			onBack={() => {}}
			onUpdate={() => {}}
		/>,
	]) {
		await act(async () => root.render(view));
		expect(
			container.querySelector(".page-scroll-area .page-content"),
		).not.toBeNull();
		expect(
			container.querySelector(
				'[class*="max-w-2xl"], [class*="max-w-184"], [class*="max-w-344"], [class*="max-[1200px]:px"], [class*="max-[720px]:px"]',
			),
		).toBeNull();
	}
});
