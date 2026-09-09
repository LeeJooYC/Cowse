// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Calendar } from "./calendar";

it("renders Chinese month and weekday labels", () => {
	const html = renderToStaticMarkup(<Calendar month={new Date(2026, 8, 1)} />);
	expect(html).toContain("2026");
	expect(html).toContain("9月");
	expect(html).toContain("星期一");
	expect(html).not.toContain("September");
});
