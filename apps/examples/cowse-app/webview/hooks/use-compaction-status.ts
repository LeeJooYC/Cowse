"use client";

import { useEffect, useState } from "react";
import { desktopClient } from "@/lib/desktop-client";

export function useCompactionStatus(
	sessionId: string | null,
	running: boolean,
): boolean {
	const [state, setState] = useState<{
		sessionId: string;
		active: boolean;
	} | null>(null);
	useEffect(() => {
		setState(null);
		if (!sessionId || !running) return;
		let disposed = false;
		let revision = 0;
		const unsubscribe = desktopClient.subscribe(
			"chat_compaction_status",
			(value) => {
				if (disposed) return;
				const event = value as { sessionId?: unknown; active?: unknown } | null;
				if (event?.sessionId !== sessionId || typeof event.active !== "boolean")
					return;
				revision++;
				setState({ sessionId, active: event.active });
			},
		);
		const unsubscribeTransport = desktopClient.subscribeTransportState(
			(transport) => {
				const requestRevision = ++revision;
				if (transport !== "connected") {
					setState(null);
					return;
				}
				// Read after subscribing; an older snapshot must never overwrite a newer event.
				void desktopClient
					.invoke<{ sessionId: string; active: boolean }>(
						"chat_session_command",
						{
							request: { action: "compaction_status", sessionId },
						},
					)
					.then((snapshot) => {
						if (
							!disposed &&
							revision === requestRevision &&
							snapshot?.sessionId === sessionId &&
							typeof snapshot.active === "boolean"
						)
							setState({ sessionId, active: snapshot.active });
					})
					.catch(() => {
						/* Older backends have no snapshot action; live events still work. */
					});
			},
		);
		return () => {
			disposed = true;
			unsubscribe();
			unsubscribeTransport();
		};
	}, [sessionId, running]);
	return running && state?.sessionId === sessionId && state.active === true;
}
