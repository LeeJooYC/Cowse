// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ModelSettingsEditor } from "./model-settings-editor";
import {
	readModelRuntimeSettings,
	saveModelRuntimeSettings,
	contextBudgetSteps,
	defaultContextBudget,
	formatContextBudget,
} from "@/lib/model-runtime-settings";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/desktop-client", () => ({ desktopClient: { invoke } }));
beforeEach(() => {
	invoke.mockReset().mockResolvedValue({});
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const container = document.createElement("div");
const root = createRoot(container);
afterEach(async () => {
	await act(async () => root.render(null));
	window.localStorage.clear();
});

it("keeps the output slider visible with default context and saves each limit", async () => {
	invoke.mockResolvedValue({ limit: 262144 });
	const onChange = vi.fn();
	await act(async () => root.render(<ModelSettingsEditor provider="openai-compatible" model="local"
		settings={{ provider: "openai-compatible", model: "local", contextWindow: 262144,
			modelContextLimit: 262144, useDefaultBudget: true }} disabled={false} onChange={onChange} />));
	expect(container.querySelector('[aria-label="上下文预算"]')).toBeNull();
	const input = container.querySelector<HTMLInputElement>('[aria-label="最大输出 Token"]')!;
	expect(input.value).toBe("4");
	for (const [index, value] of [4096, 8192, 16384, 32768, null].entries()) {
		if (value === null) {
			await act(async () => root.render(<ModelSettingsEditor provider="openai-compatible" model="local"
				settings={{ provider: "openai-compatible", model: "local", contextWindow: 262144,
					modelContextLimit: 262144, useDefaultBudget: true, maxOutputTokens: 32768 }} disabled={false} onChange={onChange} />));
		}
		await act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(index));
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxOutputTokens: value }));
	}
});

it("shows the default toggle and saves manual budget changes", async () => {
	invoke.mockResolvedValue({ limit: 262144 });
	const onChange = vi.fn();
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				provider="openai-compatible"
				model="local"
				settings={{
					provider: "openai-compatible",
					model: "local",
					contextWindow: 32768,
					modelContextLimit: 262144,
					useDefaultBudget: false,
				}}
				disabled={false}
				onChange={onChange}
			/>,
		),
	);
	expect(onChange).not.toHaveBeenCalled();
	expect(container.querySelector('input[type="checkbox"]')).toBeNull();
	expect(container.textContent).not.toMatch(
		/模型配置|思考设置|读取|Cline Core/,
	);
	const input = container.querySelector<HTMLInputElement>(
		'[aria-label="上下文预算"]',
	)!;
	expect(input.type).toBe("range");
	expect(input.max).toBe("4");
	expect(input.getAttribute("aria-valuetext")).toBe("32K");
	await act(async () =>
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "64K")
			?.click(),
	);
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({
			contextWindow: 65536,
			model: "local",
		}),
	);
	await act(async () => {
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set?.call(input, "3");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({ contextWindow: 131072 }),
	);
});

it("uses the detected model limit by default and hides the slider", async () => {
	invoke.mockResolvedValue({ limit: 262144 });
	const onChange = vi.fn();
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				provider="openai-compatible"
				model="local"
				disabled={false}
				onChange={onChange}
			/>,
		),
	);
	expect(invoke).toHaveBeenCalledWith("get_model_context_limit", {
		provider: "openai-compatible",
		model: "local",
	});
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({
			contextWindow: 262144,
			modelContextLimit: 262144,
			useDefaultBudget: true,
		}),
	);
	expect(container.querySelector("input[aria-label=上下文预算]")).toBeNull();
	expect(
		container
			.querySelector('[aria-label="使用默认预算"]')
			?.getAttribute("aria-checked"),
	).toBe("true");
});

it("offers 16K to 256K and defaults to 128K without claiming a model limit", async () => {
	const onChange = vi.fn();
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				provider="openai-compatible"
				model="local"
				disabled={false}
				onChange={onChange}
			/>,
		),
	);
	expect(
		container.querySelector<HTMLInputElement>("input[aria-label=上下文预算]")?.disabled,
	).toBe(false);
	expect(
		[...container.querySelectorAll("button")].map(
			(button) => button.textContent,
		),
	).toEqual(["16K", "32K", "64K", "128K", "256K"]);
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({
			contextWindow: 131072,
			modelContextLimit: undefined,
		}),
	);
});

it("only offers fixed stops at or below the model limit", () => {
	expect(contextBudgetSteps(100000)).toEqual([16384, 32768, 65536]);
	expect(contextBudgetSteps(8192)).toEqual([]);
	expect(contextBudgetSteps(undefined)).toEqual([]);
	expect(defaultContextBudget(65536)).toBe(65536);
	expect(contextBudgetSteps(1310720)).toEqual([
		16384, 32768, 65536, 131072, 262144,
	]);
	expect(formatContextBudget(36642)).toBe("35.8K");
	expect(formatContextBudget(1310720)).toBe("1280K");
});

it("toggles a large default budget into a capped manual slider and restores the choice", async () => {
	invoke.mockResolvedValue({ limit: 1310720 });
	const { useState } = await import("react");
	function Harness() {
		const [settings, setSettings] = useState({
			provider: "cline-pass",
			model: "glm",
			contextWindow: 1310720,
			useDefaultBudget: true,
			manualContextWindow: 65536,
		});
		return (
			<ModelSettingsEditor
				provider="cline-pass"
				model="glm"
				settings={settings}
				disabled={false}
				onChange={(next) => setSettings(next as typeof settings)}
			/>
		);
	}
	await act(async () => root.render(<Harness />));
	expect(container.querySelector('input[aria-label=上下文预算]')).toBeNull();
	await act(async () =>
		container
			.querySelector<HTMLButtonElement>('[aria-label="使用默认预算"]')!
			.click(),
	);
	expect(
		container
			.querySelector('input[aria-label=上下文预算]')
			?.getAttribute("aria-valuetext"),
	).toBe("64K");
	expect(
		[...container.querySelectorAll("button[aria-pressed]")].map(
			(b) => b.textContent,
		),
	).toEqual(["16K", "32K", "64K", "128K", "256K"]);
	await act(async () =>
		container
			.querySelector<HTMLButtonElement>('[aria-label="使用默认预算"]')!
			.click(),
	);
	expect(container.querySelector('input[aria-label=上下文预算]')).toBeNull();
	await act(async () =>
		container
			.querySelector<HTMLButtonElement>('[aria-label="使用默认预算"]')!
			.click(),
	);
	expect(
		container
			.querySelector('input[aria-label=上下文预算]')
			?.getAttribute("aria-valuetext"),
	).toBe("64K");
});

it.each([
	[65536, ["16K", "32K", "64K"]],
	[131072, ["16K", "32K", "64K", "128K"]],
	[196608, ["16K", "32K", "64K", "128K"]],
	[65535, ["16K", "32K"]],
	[16384, ["16K"]],
] as const)("renders manual stops bounded by a %i-token model limit", async (limit, labels) => {
	invoke.mockResolvedValue({ limit });
	const onChange = vi.fn();
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				provider="test"
				model="small"
				disabled={false}
				settings={{
					provider: "test",
					model: "small",
					contextWindow: 262144,
					useDefaultBudget: false,
				}}
				onChange={onChange}
			/>,
		),
	);
	expect(
		[...container.querySelectorAll("button[aria-pressed]")].map(
			(button) => button.textContent,
		),
	).toEqual(labels);
	const slider = container.querySelector<HTMLInputElement>(
		'input[aria-label=上下文预算]',
	)!;
	expect(slider.max).toBe(String(labels.length - 1));
	expect(slider.getAttribute("aria-valuetext")).toBe(labels.at(-1));
	expect(slider.disabled).toBe(labels.length === 1);
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({
			contextWindow: contextBudgetSteps(limit).at(-1),
		}),
	);
	expect(container.textContent).not.toMatch(
		/默认预算使用模型声明|1K = 1024|手动预算最高/,
	);
});

it("keeps models below 16K on their default without inventing a manual stop", async () => {
	invoke.mockResolvedValue({ limit: 8192 });
	const onChange = vi.fn();
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				provider="test"
				model="tiny"
				disabled={false}
				onChange={onChange}
				settings={{
					provider: "test",
					model: "tiny",
					useDefaultBudget: false,
					contextWindow: 262144,
				}}
			/>,
		),
	);
	expect(container.querySelector('input[aria-label=上下文预算]')).toBeNull();
	expect(
		container.querySelector<HTMLButtonElement>('[aria-label="使用默认预算"]')
			?.disabled,
	).toBe(true);
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({ contextWindow: 8192, useDefaultBudget: true }),
	);
});

it("clamps an existing budget when the server reports a smaller maximum", async () => {
	invoke.mockResolvedValue({ limit: 65536 });
	const onChange = vi.fn();
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				provider="openai-compatible"
				model="local"
				settings={{
					provider: "openai-compatible",
					model: "local",
					contextWindow: 131072,
					modelContextLimit: 262144,
				}}
				disabled={false}
				onChange={onChange}
			/>,
		),
	);
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({ contextWindow: 65536, modelContextLimit: 65536 }),
	);
});

it("does not commit an old model's late query after switching models", async () => {
	let finish!: (result: { limit: number }) => void;
	invoke.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const onChange = vi.fn();
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				key="a"
				provider="openai-compatible"
				model="a"
				disabled={false}
				onChange={onChange}
			/>,
		),
	);
	expect(
		container.querySelector<HTMLInputElement>("input[aria-label=上下文预算]")?.disabled,
	).toBe(true);
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				key="b"
				provider="openai-compatible"
				model="b"
				disabled={false}
				onChange={onChange}
			/>,
		),
	);
	await act(async () => finish({ limit: 262144 }));
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({
			model: "b",
			contextWindow: 131072,
			modelContextLimit: undefined,
		}),
	);
});

it("also enables the fallback when the server query fails and ignores old imported limits", async () => {
	invoke.mockRejectedValue(new Error("offline"));
	const onChange = vi.fn();
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				provider="openai-compatible"
				model="local"
				settings={{
					provider: "openai-compatible",
					model: "local",
					contextWindow: 524288,
					modelContextLimit: 1048576,
				}}
				disabled={false}
				onChange={onChange}
			/>,
		),
	);
	expect(
		container.querySelector<HTMLInputElement>("input[aria-label=上下文预算]")?.disabled,
	).toBe(false);
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({
			contextWindow: 262144,
			modelContextLimit: undefined,
		}),
	);
});

it("keeps model preferences isolated and restores them after remount", () => {
	saveModelRuntimeSettings({
		provider: "openai-compatible",
		model: "a",
		contextWindow: 65536,
	});
	expect(
		readModelRuntimeSettings("openai-compatible", "a")?.contextWindow,
	).toBe(65536);
	expect(readModelRuntimeSettings("openai-compatible", "b")).toBeUndefined();
	expect(readModelRuntimeSettings("other", "a")).toBeUndefined();
});

it("ignores legacy capability declarations while retaining the saved budget", () => {
	const legacy = {
		provider: "openai-compatible",
		model: "local",
		contextWindow: 65536,
		reasoningOptions: [{ type: "effort", values: ["none", "xhigh"] }],
		source: "/old/model",
	};
	const key = 'cowse.model-settings:["openai-compatible","local"]';
	window.localStorage.setItem(key, JSON.stringify(legacy));
	expect(readModelRuntimeSettings("openai-compatible", "local")).toEqual({
		provider: "openai-compatible",
		model: "local",
		contextWindow: 65536,
	});
	saveModelRuntimeSettings(legacy);
	expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({
		provider: "openai-compatible",
		model: "local",
		contextWindow: 65536,
	});
});

it("disables editing while a turn is running", async () => {
	await act(async () =>
		root.render(
			<ModelSettingsEditor
				provider="openai-compatible"
				model="local"
				disabled
				onChange={vi.fn()}
			/>,
		),
	);
	expect(
		container.querySelector<HTMLInputElement>('[aria-label="上下文预算"]')
			?.disabled,
	).toBe(true);
	expect(
		[...container.querySelectorAll("button")].every(
			(button) => button.disabled,
		),
	).toBe(true);
});
