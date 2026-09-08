import { requestHubDrain, requestHubShutdown } from "@cline/core";
import type { SidecarContext } from "./types";

const pendingQuits = new WeakMap<SidecarContext, Promise<void>>();

/** User-confirmed desktop shutdown; never kill a process or discard history. */
export function prepareFullQuit(ctx: SidecarContext): Promise<void> {
	const pending = pendingQuits.get(ctx);
	if (pending) return pending;
	const result = stopIdleHub(ctx).catch((error) => {
		pendingQuits.delete(ctx);
		throw error;
	});
	pendingQuits.set(ctx, result);
	return result;
}

async function stopIdleHub(ctx: SidecarContext): Promise<void> {
	const client = ctx.hubClient;
	if (!client?.isConnected()) {
		throw new Error("无法确认后台状态，请等待连接恢复后重试。");
	}
	const url = client.getUrl();
	if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
		throw new Error("当前连接的是远程后台，不能通过完全退出停止远程服务。");
	}
	const before = await client.command("hub.status", {});
	if (!before.ok || before.payload?.draining === true) {
		throw new Error("后台正在维护或状态不可用，请稍后再退出。");
	}
	// Drain before checking activity: new runs must not race the idle check.
	const drain = await client.command("hub.drain", {
		draining: true,
		reason: "Cowse fully quit",
	});
	if (!drain.ok) throw new Error("后台未能准备退出，请稍后重试。");
	let stopped = false;
	try {
		const status = await client.command("hub.status", {});
		if (!status.ok || status.payload?.idle !== true) {
			throw new Error(
				"后台还有运行或排队中的任务。请等待任务完成，或先在会话中停止任务后再退出。",
			);
		}
		if (!(await requestHubShutdown(url))) {
			throw new Error("后台拒绝了退出请求，请稍后重试。");
		}
		stopped = true;
		// Disable both reconnect loops before the native shell exits. Keep the
		// webview socket alive long enough to deliver this command's reply.
		ctx.unsubscribeSessionEvents?.();
		ctx.unsubscribeSessionEvents = null;
		const manager = ctx.sessionManager;
		ctx.sessionManager = null;
		ctx.hubClient = null;
		await Promise.allSettled([
			client.dispose(),
			manager?.dispose("cowse_full_quit"),
		]);
	} finally {
		if (!stopped) {
			// A refused quit must not leave the shared service blocking new work.
			const restored = await requestHubDrain(
				url,
				undefined,
				"Cowse quit cancelled",
				{ off: true },
			);
			if (!restored)
				throw new Error("退出已取消，但后台恢复接收任务失败，请重新连接后台。");
		}
	}
}
