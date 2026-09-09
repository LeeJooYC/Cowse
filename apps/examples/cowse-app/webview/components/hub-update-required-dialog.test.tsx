// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { HubUpdateRequiredDialog } from "./hub-update-required-dialog";
const { invoke, subscribe } = vi.hoisted(() => ({
	invoke: vi.fn(),
	subscribe: vi.fn(),
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke, subscribe },
}));
let emit: (payload: unknown) => void;
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	invoke.mockReset();
	subscribe.mockImplementation((_event, listener) => {
		emit = listener;
		return () => {};
	});
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => root.render(<HubUpdateRequiredDialog />));
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});
it("silently accepts compatible builds without checking updates", async () => {
	await act(async () => emit({ reason: "build_mismatch", hubBuildId: "new" }));
	expect(document.querySelector('[role="alertdialog"]')).toBeNull();
	expect(invoke).not.toHaveBeenCalled();
});
it.each([
	"outdated_hub",
	"unsupported_protocol",
])("only acknowledges %s without mutating the backend", async (reason) => {
	const payload = {
		reason,
		hubCoreVersion: "original-version",
		activeSessionCount: 2,
		participantClientCount: 1,
	};
	await act(async () => emit(payload));
	expect(document.body.textContent).toContain("已禁用自动更新");
	expect(document.body.textContent).toContain("original-version");
	const buttons = [...document.querySelectorAll('[role="alertdialog"] button')];
	expect(buttons.map((b) => b.textContent)).toEqual(["知道了"]);
	await act(async () => (buttons[0] as HTMLButtonElement).click());
	expect(document.querySelector('[role="alertdialog"]')).toBeNull();
	await act(async () => emit(payload));
	expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
	await act(async () => emit(null));
	expect(document.querySelector('[role="alertdialog"]')).toBeNull();
	expect(invoke).not.toHaveBeenCalled();
});
