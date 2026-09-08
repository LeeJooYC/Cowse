import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
	applyProxyConfig,
	applyProxyFromDisk,
	type ProxyConfig,
	writeProxyConfig,
} from "./proxy";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_HOME = process.env.HOME;

let home: string;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	home = mkdtempSync(tmpdir());
	process.env.HOME = home;
	// Substitute a mock for Bun's native fetch before the wrapper captures it.
	fetchMock = vi.fn(async () => new Response("ok"));
	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	process.env.HOME = ORIGINAL_HOME;
	rmSync(home, { recursive: true, force: true });
});

function writeConfig(overrides: Partial<ProxyConfig>) {
	writeProxyConfig({
		mode: "off",
		protocol: "http",
		host: "127.0.0.1",
		port: 7890,
		username: "",
		password: "",
		...overrides,
	});
}

describe("local proxy fetch wrapping", () => {
	it("injects the configured proxy into every request", async () => {
		writeConfig({ mode: "manual", host: "127.0.0.1", port: 7892 });
		applyProxyFromDisk();

		await globalThis.fetch("http://example.com/v1/chat", {
			headers: { authorization: "Bearer xyz" },
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [input, init] = fetchMock.mock.calls[0] as [
			unknown,
			Record<string, unknown>,
		];
		expect(input).toBe("http://example.com/v1/chat");
		expect(init.proxy).toBe("http://127.0.0.1:7892");
		expect(init.headers).toEqual({ authorization: "Bearer xyz" });
	});

	it("connects directly when the proxy mode is off", async () => {
		writeConfig({ mode: "off", host: "127.0.0.1", port: 7892 });
		applyProxyFromDisk();

		// No init passed at all — the wrapper must forward transparently.
		await globalThis.fetch("https://example.com/v1/chat");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/v1/chat");
		expect(fetchMock.mock.calls[0]?.[1]?.proxy).toBeUndefined();
	});

	it("re-reads the config so runtime changes apply without re-applying", async () => {
		writeConfig({ mode: "manual", host: "127.0.0.1", port: 7892 });
		applyProxyFromDisk();

		// First request goes through the configured proxy.
		await globalThis.fetch("http://example.com/1");
		// Turning the proxy off takes effect on the very next request, without
		// another applyProxyFromDisk call (this is what lets the Hub daemon — a
		// different process — honor config changes made from the sidecar).
		writeConfig({ mode: "off", host: "127.0.0.1", port: 7892 });
		await globalThis.fetch("http://example.com/2");
		// Switching to a different proxy also applies immediately.
		writeConfig({ mode: "manual", host: "127.0.0.1", port: 7897 });
		await globalThis.fetch("http://example.com/3");

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[0]?.[1]?.proxy).toBe("http://127.0.0.1:7892");
		expect(fetchMock.mock.calls[1]?.[1]?.proxy).toBeUndefined();
		expect(fetchMock.mock.calls[2]?.[1]?.proxy).toBe("http://127.0.0.1:7897");
	});

	it("embeds credentials into the proxy URL when configured", async () => {
		writeConfig({
			mode: "manual",
			host: "proxy.corp.example",
			port: 3128,
			username: "alice",
			password: "p@ss",
		});
		applyProxyFromDisk();

		await globalThis.fetch("http://example.com/1");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[1]?.proxy).toBe(
			"http://alice:p%40ss@proxy.corp.example:3128",
		);
	});

	it("applying repeatedly never stacks wrappers", async () => {
		writeConfig({ mode: "manual", host: "127.0.0.1", port: 7892 });
		applyProxyFromDisk();
		writeConfig({ mode: "manual", host: "127.0.0.1", port: 7897 });
		applyProxyFromDisk();

		await globalThis.fetch("http://example.com/1");
		await globalThis.fetch("http://example.com/2");

		// Each request reaches the underlying mock exactly once.
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0]?.[1]?.proxy).toBe("http://127.0.0.1:7897");
		expect(fetchMock.mock.calls[1]?.[1]?.proxy).toBe("http://127.0.0.1:7897");
	});
});
