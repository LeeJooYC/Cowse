import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type ProxyMode = "off" | "auto" | "manual";
export type ProxyProtocol = "http" | "https" | "socks5";

export interface ProxyConfig {
	mode: ProxyMode;
	protocol: ProxyProtocol;
	host: string;
	port: number;
	username: string;
	password: string;
}

export interface DetectedProxy {
	protocol: ProxyProtocol;
	host: string;
	port: number;
	source: string;
}

const DEFAULT_PROXY_CONFIG: ProxyConfig = {
	mode: "off",
	protocol: "http",
	host: "127.0.0.1",
	port: 7890,
	username: "",
	password: "",
};

const KNOWN_PROXY_PORTS: Array<{
	protocol: ProxyProtocol;
	label: string;
	port: number;
}> = [
	{ protocol: "http", label: "Surge", port: 6152 },
	{ protocol: "socks5", label: "Surge", port: 6153 },
	{ protocol: "http", label: "Clash", port: 7890 },
	{ protocol: "socks5", label: "Clash", port: 7891 },
	{ protocol: "http", label: "Clash mixed", port: 7892 },
	{ protocol: "http", label: "Clash Verge", port: 7897 },
	{ protocol: "socks5", label: "通用", port: 1080 },
	{ protocol: "http", label: "通用", port: 8888 },
	{ protocol: "http", label: "通用", port: 8118 },
	{ protocol: "http", label: "通用", port: 8080 },
];

function proxyConfigPath(): string {
	return join(homedir(), ".cline", "data", "settings", "proxy-config.json");
}

export function readProxyConfig(): ProxyConfig {
	const path = proxyConfigPath();
	if (!existsSync(path)) {
		return { ...DEFAULT_PROXY_CONFIG };
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ProxyConfig>;
		return { ...DEFAULT_PROXY_CONFIG, ...parsed };
	} catch {
		return { ...DEFAULT_PROXY_CONFIG };
	}
}

export function writeProxyConfig(config: ProxyConfig): void {
	const path = proxyConfigPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

// Bun's fetch does not read HTTP_PROXY/HTTPS_PROXY, but it does accept a
// per-request `proxy` option. Cline Core / the LLM SDK issue model requests
// through `globalThis.fetch`, so replacing the global with a proxy-injecting
// wrapper routes every request through the configured local proxy. The native
// fetch is captured at apply time (startup), so tests can substitute a mock
// before applying.

function proxyUrl(config: ProxyConfig): string | null {
	if (config.mode !== "auto" && config.mode !== "manual") {
		return null;
	}
	const host = config.host.trim();
	if (!host || !config.port) {
		return null;
	}
	// SOCKS5 is rejected at the command boundary; only http/https reach here.
	const scheme = config.protocol === "https" ? "https" : "http";
	const auth = config.username.trim()
		? `${encodeURIComponent(config.username.trim())}:${encodeURIComponent(config.password)}@`
		: "";
	return `${scheme}://${auth}${host}:${config.port}`;
}

export function applyProxyConfig(_config: ProxyConfig): void {
	// Capture the current fetch (Bun's native implementation at startup) so
	// repeated applies never stack wrappers on top of one another.
	const native = globalThis.fetch;
	// Don't close over the saved config. Config writes (save_proxy_config) run
	// in the sidecar process, but model/session requests are issued by the
	// shared Hub daemon — a separate process that only installs this wrapper
	// at startup. Re-reading the persisted config on every request makes a
	// config change (including enabling/disabling the proxy) take effect in
	// the daemon immediately, at the cost of one tiny file read per outbound
	// request.
	globalThis.fetch = ((input, init) => {
		const url = proxyUrl(readProxyConfig());
		if (!url) {
			return native(input as never, init);
		}
		return native(input as never, { ...init, proxy: url } as never);
	}) as typeof fetch;
}

export function applyProxyFromDisk(): void {
	applyProxyConfig(readProxyConfig());
}

// ---------------------------------------------------------------------------
// Local proxy detection
// ---------------------------------------------------------------------------

function portOpen(port: number, timeoutMs = 200): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ host: "127.0.0.1", port, timeout: timeoutMs });
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
		socket.once("timeout", () => {
			socket.destroy();
			resolve(false);
		});
	});
}

function scutilValue(output: string, key: string): string | undefined {
	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		const rest = trimmed.startsWith(key) ? trimmed.slice(key.length).trimStart() : "";
		if (rest.startsWith(":")) {
			return rest.slice(1).trim();
		}
	}
	return undefined;
}

function detectSystemProxies(): DetectedProxy[] {
	const results: DetectedProxy[] = [];
	let output = "";
	try {
		output = execFileSync("scutil", ["--proxy"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return results;
	}
	const entries: Array<[string, string, string, ProxyProtocol]> = [
		["HTTPEnable", "HTTPProxy", "HTTPPort", "http"],
		["HTTPSEnable", "HTTPSProxy", "HTTPSPort", "https"],
		["SOCKSEnable", "SOCKSProxy", "SOCKSPort", "socks5"],
	];
	for (const [enable, proxy, port, protocol] of entries) {
		if (scutilValue(output, enable) !== "1") {
			continue;
		}
		const host = scutilValue(output, proxy);
		const portValue = Number(scutilValue(output, port));
		if (host?.trim() && Number.isFinite(portValue) && portValue > 0) {
			results.push({
				protocol,
				host: host.trim(),
				port: portValue,
				source: "系统代理",
			});
		}
	}
	return results;
}

export async function detectLocalProxies(): Promise<DetectedProxy[]> {
	const results: DetectedProxy[] = detectSystemProxies();
	for (const entry of KNOWN_PROXY_PORTS) {
		const already = results.some(
			(item) => item.host === "127.0.0.1" && item.port === entry.port,
		);
		if (already) {
			continue;
		}
		if (await portOpen(entry.port)) {
			results.push({
				protocol: entry.protocol,
				host: "127.0.0.1",
				port: entry.port,
				source: `端口探测 · ${entry.label}`,
			});
		}
	}
	return results;
}
