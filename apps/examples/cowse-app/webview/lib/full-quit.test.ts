import { beforeEach, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("./desktop-client", () => ({ desktopClient: { invoke } }));
beforeEach(() => { vi.resetModules(); invoke.mockReset(); });
it("stops the Hub before exiting the shell", async () => {
	invoke.mockResolvedValue(undefined);
	const { requestFullQuit } = await import("./full-quit");
	await requestFullQuit();
	expect(invoke.mock.calls.map(([command]) => command)).toEqual(["prepare_full_quit", "quit_app"]);
});
it("keeps the app open when shutdown is refused and permits retry", async () => {
	invoke.mockRejectedValueOnce(new Error("busy"));
	const { requestFullQuit } = await import("./full-quit");
	await expect(requestFullQuit()).rejects.toThrow("busy");
	expect(invoke).not.toHaveBeenCalledWith("quit_app");
	invoke.mockResolvedValue(undefined);
	await requestFullQuit();
	expect(invoke).toHaveBeenLastCalledWith("quit_app");
});
it("coalesces repeated native quit requests", async () => {
	let done!: () => void;
	invoke.mockImplementationOnce(() => new Promise<void>((resolve) => { done = resolve; }));
	const { requestFullQuit } = await import("./full-quit");
	const first = requestFullQuit();
	expect(requestFullQuit()).toBe(first);
	done();
	await first;
	expect(invoke).toHaveBeenCalledTimes(2);
});
