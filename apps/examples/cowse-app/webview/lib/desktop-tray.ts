"use client";

import { type AppZoomAction, isAppZoomAction } from "@/lib/app-font-size";
import { desktopClient, isTauriAvailable } from "@/lib/desktop-client";

export const DESKTOP_ACTION_PENDING_EVENT = "desktop-action-pending";

export type DesktopAction =
	| { type: "full-quit" }
	| { type: AppZoomAction }
	| { type: "open-session"; sessionId: string };

function isDesktopAction(value: unknown): value is DesktopAction {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const action = value as { type?: unknown; sessionId?: unknown };
	if (action.type === "full-quit" || isAppZoomAction(action.type)) {
		return true;
	}
	return (
		action.type === "open-session" &&
		typeof action.sessionId === "string" &&
		action.sessionId.trim().length > 0
	);
}

export function subscribeToDesktopActions(
	onAction: (action: DesktopAction) => void,
): () => void {
	if (!isTauriAvailable()) {
		return () => {};
	}

	let disposed = false;
	let unlisten: (() => void) | undefined;
	let draining = false;
	let drainRequested = false;

	const drainPendingActions = async () => {
		if (disposed) {
			return;
		}
		if (draining) {
			drainRequested = true;
			return;
		}

		draining = true;
		try {
			do {
				drainRequested = false;
				const pending = await desktopClient.invoke<unknown>(
					"drain_desktop_actions",
				);
				if (!Array.isArray(pending)) {
					continue;
				}
				for (const action of pending) {
					if (isDesktopAction(action)) {
						onAction(action);
					}
				}
			} while (drainRequested && !disposed);
		} catch {
			// The native queue retains actions when the drain command fails.
		} finally {
			draining = false;
			if (drainRequested && !disposed) {
				void drainPendingActions();
			}
		}
	};

	void import("@tauri-apps/api/event")
		.then(async ({ listen }) => {
			const stopListening = await listen<void>(
				DESKTOP_ACTION_PENDING_EVENT,
				() => void drainPendingActions(),
			);
			if (disposed) {
				stopListening();
				return;
			}
			unlisten = stopListening;
			// Actions selected before listener registration remain in the native
			// queue, so this initial drain closes the startup delivery gap.
			await drainPendingActions();
		})
		.catch(() => {
			// The browser-only development shell has no native event bridge.
		});

	return () => {
		disposed = true;
		unlisten?.();
	};
}
