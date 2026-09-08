import { desktopClient } from "./desktop-client";

let pending: Promise<void> | null = null;
let prepared = false;

/** Native Quit must not close the app when the shared Hub refuses shutdown. */
export function requestFullQuit(): Promise<void> {
	if (pending) return pending;
	pending = (async () => {
		if (!prepared) {
			await desktopClient.invoke("prepare_full_quit");
			prepared = true;
		}
		await desktopClient.invoke("quit_app");
	})().finally(() => { pending = null; });
	return pending;
}
