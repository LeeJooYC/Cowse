import { cn } from "@/lib/utils";

/** Use the bundled Cowse app artwork consistently across the desktop UI. */
export function CowseLogo({ className }: { className?: string }) {
	return (
		<img
			alt=""
			aria-hidden="true"
			className={cn("shrink-0 object-contain", className)}
			draggable={false}
			src="/app-icons/midnight.png"
		/>
	);
}
