// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useCompactionStatus } from "./use-compaction-status";
const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	subscribe: vi.fn(),
	transport: vi.fn(),
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: {
		invoke: mocks.invoke,
		subscribe: mocks.subscribe,
		subscribeTransportState: mocks.transport,
	},
}));
let root: Root;
let container: HTMLDivElement;
let current = false;
let listener: (event: unknown) => void;
let transport: (state: string) => void;
let pending: Array<(value: unknown) => void>;
function Harness({ id, running = true }: { id: string; running?: boolean }) {
	current = useCompactionStatus(id, running);
	return null;
}
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	vi.clearAllMocks();
	pending = [];
	mocks.invoke.mockImplementation(
		() => new Promise((resolve) => pending.push(resolve)),
	);
	mocks.subscribe.mockImplementation((_name, fn) => {
		listener = fn;
		return vi.fn();
	});
	mocks.transport.mockImplementation((fn) => {
		transport = fn;
		fn("connected");
		return vi.fn();
	});
	container = document.createElement("div");
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
});
it("shows actual start/end events and rejects a stale initial snapshot", async () => {
	await act(async () => root.render(<Harness id="a" />));
	await act(async () => listener({ sessionId: "b", active: true }));
	expect(current).toBe(false);
	await act(async () => listener({ sessionId: "a", active: true }));
	expect(current).toBe(true);
	await act(async () => pending[0]({ sessionId: "a", active: false }));
	expect(current).toBe(true);
	await act(async () => listener({ sessionId: "a", active: false }));
	expect(current).toBe(false);
});
it("restores running compaction on re-entry and clears it on completion", async () => {
	await act(async () => root.render(<Harness id="a" />));
	await act(async () => pending[0]({ sessionId: "a", active: true }));
	expect(current).toBe(true);
	await act(async () => root.render(<Harness id="b" />));
	expect(current).toBe(false);
	await act(async () => pending[1]({ sessionId: "b", active: true }));
	expect(current).toBe(true);
	await act(async () => root.render(<Harness id="b" running={false} />));
	expect(current).toBe(false);
});
it("ignores old-session snapshots and re-queries after reconnect", async () => {
	await act(async () => root.render(<Harness id="a" />));
	await act(async () => root.render(<Harness id="b" />));
	await act(async () => pending[0]({ sessionId: "a", active: true }));
	expect(current).toBe(false);
	await act(async () => listener({ sessionId: "b", active: true }));
	expect(current).toBe(true);
	await act(async () => transport("reconnecting"));
	expect(current).toBe(false);
	await act(async () => transport("connected"));
	await act(async () => pending.at(-1)!({ sessionId: "b", active: true }));
	expect(current).toBe(true);
});
