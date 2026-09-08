import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { desktopClient } from "@/lib/desktop-client";

type ProxyMode = "off" | "auto" | "manual";
type ProxyProtocol = "http" | "https" | "socks5";

interface ProxyConfig {
	mode: ProxyMode;
	protocol: ProxyProtocol;
	host: string;
	port: number;
	username: string;
	password: string;
}

interface DetectedProxy {
	protocol: ProxyProtocol;
	host: string;
	port: number;
	source: string;
}

const EMPTY_CONFIG: ProxyConfig = {
	mode: "off",
	protocol: "http",
	host: "127.0.0.1",
	port: 7890,
	username: "",
	password: "",
};

const PROTOCOL_LABELS: Record<ProxyProtocol, string> = {
	http: "HTTP",
	https: "HTTPS",
	socks5: "SOCKS5",
};

const MODE_OPTIONS: Array<{ value: ProxyMode; label: string }> = [
	{ value: "off", label: "关闭" },
	{ value: "auto", label: "自动检测" },
	{ value: "manual", label: "手动配置" },
];

export function ProxySettings() {
	const [config, setConfig] = useState<ProxyConfig>(EMPTY_CONFIG);
	const [loaded, setLoaded] = useState(false);
	const [detecting, setDetecting] = useState(false);
	const [detected, setDetected] = useState<DetectedProxy[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void desktopClient
			.invoke<ProxyConfig>("get_proxy_config")
			.then((saved) => {
				if (!cancelled) setConfig(saved);
			})
			.catch(() => undefined)
			.finally(() => {
				if (!cancelled) setLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	async function persist(next: ProxyConfig) {
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const saved = await desktopClient.invoke<ProxyConfig>("save_proxy_config", {
				config: next,
			});
			setConfig(saved);
			setNotice("代理设置已保存并生效。");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	}

	async function runDetection() {
		setDetecting(true);
		setError(null);
		setNotice(null);
		setDetected([]);
		try {
			const results = await desktopClient.invoke<DetectedProxy[]>("detect_local_proxy");
			setDetected(results);
			if (!results.length) {
				setError("未检测到本地代理，可切换到手动配置。");
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setDetecting(false);
		}
	}

	function summary() {
		if (config.mode === "off") return "未启用，所有请求直连";
		return `${PROTOCOL_LABELS[config.protocol]} · ${config.host}:${config.port || "—"}`;
	}

	return (
		<div className="border-b py-4">
			<div className="flex flex-col gap-1">
				<p className="text-base font-semibold text-foreground">本地代理</p>
				<p className="text-sm text-muted-foreground">
					让 Surge、Clash 等本地代理软件接管牛马的所有网络请求。当前：{summary()}
				</p>
			</div>

			<div className="mt-3 flex gap-1 rounded-lg border p-1">
				{MODE_OPTIONS.map((option) => (
					<button
						key={option.value}
						type="button"
						className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
							config.mode === option.value
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => {
							setError(null);
							setNotice(null);
							setConfig((current) => ({ ...current, mode: option.value }));
						}}
					>
						{option.label}
					</button>
				))}
			</div>

			{config.mode === "off" && (
				<div className="mt-3 flex items-center justify-between gap-4">
					<p className="text-sm text-muted-foreground">
						关闭后所有请求将绕过代理，直接连接目标服务。
					</p>
					<Button
						variant="outline"
						size="sm"
						type="button"
						disabled={saving || !loaded}
						onClick={() => void persist({ ...config, mode: "off" })}
					>
						保存
					</Button>
				</div>
			)}

			{config.mode === "auto" && (
				<div className="mt-3 flex flex-col gap-3">
					<div className="flex items-center gap-3">
						<Button
							variant="outline"
							size="sm"
							type="button"
							disabled={detecting}
							onClick={() => void runDetection()}
						>
							{detecting ? "正在检测…" : "检测本地代理"}
						</Button>
						<span className="text-xs text-muted-foreground">
							检测系统代理及 Surge / Clash 的常见本地端口。
						</span>
					</div>
					{detected.length > 0 && (
						<ul className="flex flex-col gap-2">
							{detected.map((item, index) => {
								const unsupported = item.protocol === "socks5";
								return (
									<li
										key={`${item.host}-${item.port}-${index}`}
										className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
									>
										<div className="flex min-w-0 flex-col gap-0.5">
											<span className="text-sm font-medium">
												{PROTOCOL_LABELS[item.protocol]} · {item.host}:{item.port}
												{unsupported ? "（暂不支持）" : ""}
											</span>
											<span className="text-xs text-muted-foreground">{item.source}</span>
										</div>
										<Button
											variant="outline"
											size="sm"
											type="button"
											disabled={saving || unsupported}
											onClick={() =>
												void persist({
													...config,
													mode: "auto",
													protocol: item.protocol,
													host: item.host,
													port: item.port,
												})
											}
										>
											使用
										</Button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			)}

			{config.mode === "manual" && (
				<div className="mt-3 flex flex-col gap-3">
					<div className="grid grid-cols-[110px_1fr_110px] gap-3 max-[720px]:grid-cols-1">
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">协议</span>
							<select
								className="rounded-md border bg-background px-3 py-2 text-sm"
								value={config.protocol}
								disabled={saving}
								onChange={(event) =>
									setConfig({ ...config, protocol: event.target.value as ProxyProtocol })
								}
							>
								<option value="http">HTTP</option>
								<option value="https">HTTPS</option>
								<option value="socks5">SOCKS5</option>
							</select>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">主机</span>
							<input
								className="rounded-md border bg-background px-3 py-2 text-sm"
								value={config.host}
								disabled={saving}
								placeholder="127.0.0.1"
								onChange={(event) => setConfig({ ...config, host: event.target.value })}
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">端口</span>
							<input
								className="rounded-md border bg-background px-3 py-2 text-sm"
								type="number"
								value={config.port || ""}
								disabled={saving}
								min={1}
								max={65535}
								placeholder="7890"
								onChange={(event) =>
									setConfig({ ...config, port: Number(event.target.value) || 0 })
								}
							/>
						</label>
					</div>
					<div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">用户名（可选）</span>
							<input
								className="rounded-md border bg-background px-3 py-2 text-sm"
								value={config.username}
								disabled={saving}
								autoComplete="off"
								onChange={(event) => setConfig({ ...config, username: event.target.value })}
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">密码（可选）</span>
							<input
								className="rounded-md border bg-background px-3 py-2 text-sm"
								type="password"
								value={config.password}
								disabled={saving}
								autoComplete="off"
								onChange={(event) => setConfig({ ...config, password: event.target.value })}
							/>
						</label>
					</div>
					{config.protocol === "socks5" && (
						<p className="text-xs text-destructive">
							当前版本暂不支持 SOCKS5，请改用 HTTP 代理端口（如 Clash 的混合端口 7892）。
						</p>
					)}
					<div className="flex justify-end">
						<Button
							variant="outline"
							size="sm"
							type="button"
							disabled={saving || !config.host.trim() || !config.port}
							onClick={() => void persist({ ...config, mode: "manual" })}
						>
							{saving ? "正在保存…" : "保存并启用"}
						</Button>
					</div>
				</div>
			)}

			{error && (
				<p className="mt-2 text-xs text-destructive" role="alert">
					{error}
				</p>
			)}
			{notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}
		</div>
	);
}
