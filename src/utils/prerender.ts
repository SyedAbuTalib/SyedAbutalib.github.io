/**
 * Runs `fn` once the page is actually being shown.
 *
 * The base layout ships speculation rules that may prerender same-origin links on hover.
 * Demo pages that grab the camera/mic or start fetching media should wait until the page
 * is activated rather than doing that work inside a hidden prerender.
 * (`document.prerendering` isn't in lib.dom yet.)
 */
export function whenPageShown(fn: () => void) {
	const doc = document as Document & { prerendering?: boolean };
	if (doc.prerendering) {
		document.addEventListener("prerenderingchange", fn, { once: true });
	} else {
		fn();
	}
}
