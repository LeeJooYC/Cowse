import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SidecarContext } from "./types";
import { prepareFullQuit } from "./full-quit";

const mocks = vi.hoisted(() => ({ drain: vi.fn(), shutdown: vi.fn() }));
vi.mock("@cline/core", () => ({
	requestHubDrain: mocks.drain,
	requestHubShutdown: mocks.shutdown,
}));

function setup(idle = true, url = "ws://127.0.0.1:25463/hub") {
	const client = {
		isConnected: () => true,
		getUrl: () => url,
		command: vi.fn(async (name: string) => ({
			ok: true,
			payload: name === "hub.status" ? { idle } : {},
		})),
		dispose: vi.fn(async () => {}),
	};
	const manager = { dispose: vi.fn(async () => {}) };
	const unsubscribe = vi.fn();
	const ctx = {
		hubClient: client,
		sessionManager: manager,
		unsubscribeSessionEvents: unsubscribe,
	} as unknown as SidecarContext;
	return { ctx, client, manager, unsubscribe };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.drain.mockResolvedValue(true);
	mocks.shutdown.mockResolvedValue(true);
});

describe("full desktop quit", () => {
	it("drains before checking idle, requests graceful shutdown and stops reconnecting", async () => {
		const { ctx, client, manager, unsubscribe } = setup();
		await prepareFullQuit(ctx);
		expect(client.command.mock.calls.map(([name]) => name)).toEqual([
			"hub.status",
			"hub.drain",
			"hub.status",
		]);
		expect(mocks.shutdown).toHaveBeenCalledWith(client.getUrl());
		expect(client.dispose).toHaveBeenCalledOnce();
		expect(manager.dispose).toHaveBeenCalledWith("cowse_full_quit");
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(ctx.hubClient).toBeNull();
		await prepareFullQuit(ctx);
		expect(mocks.shutdown).toHaveBeenCalledOnce();
	});
	it("refuses running or queued work and restores admission without disconnecting", async () => {
		const { ctx, client } = setup(false);
		await expect(prepareFullQuit(ctx)).rejects.toThrow("运行或排队");
		expect(mocks.shutdown).not.toHaveBeenCalled();
		expect(mocks.drain).toHaveBeenCalledWith(
			client.getUrl(),
			undefined,
			"Cowse quit cancelled",
			{ off: true },
		);
		expect(client.dispose).not.toHaveBeenCalled();
	});
	it("does not stop a remote or disconnected hub", async () => {
		const { ctx } = setup(true, "wss://example.org/hub");
		await expect(prepareFullQuit(ctx)).rejects.toThrow("远程后台");
		ctx.hubClient = null;
		await expect(prepareFullQuit(ctx)).rejects.toThrow("无法确认后台状态");
		expect(mocks.shutdown).not.toHaveBeenCalled();
	});
	it("restores admission on shutdown failure and permits retry", async () => {
		const { ctx } = setup();
		mocks.shutdown.mockResolvedValueOnce(false);
		await expect(prepareFullQuit(ctx)).rejects.toThrow("后台拒绝");
		expect(mocks.drain).toHaveBeenCalledOnce();
		await prepareFullQuit(ctx);
		expect(mocks.shutdown).toHaveBeenCalledTimes(2);
	});
	it("fails closed when drain is rejected or activity is unknown", async () => {
		const { ctx, client } = setup();
		client.command.mockResolvedValueOnce({ ok: true, payload: {} });
		client.command.mockResolvedValueOnce({ ok: false, payload: {} });
		await expect(prepareFullQuit(ctx)).rejects.toThrow("后台未能准备退出");
		client.command.mockResolvedValue({ ok: true, payload: {} });
		await expect(prepareFullQuit(ctx)).rejects.toThrow("运行或排队");
		expect(mocks.shutdown).not.toHaveBeenCalled();
	});
	it("does not interfere with a hub already under maintenance", async () => {
		const { ctx, client } = setup();
		client.command.mockResolvedValueOnce({
			ok: true,
			payload: { draining: true },
		} as never);
		await expect(prepareFullQuit(ctx)).rejects.toThrow("维护");
		expect(client.command).toHaveBeenCalledOnce();
		expect(mocks.drain).not.toHaveBeenCalled();
		expect(mocks.shutdown).not.toHaveBeenCalled();
	});
});
