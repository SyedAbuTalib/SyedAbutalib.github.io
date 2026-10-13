import { html } from "satori-html";
import { siteConfig } from "@/site.config";

// Colours for generated OG images — kept in step with the light palette in src/styles/global.css
const og = {
	bg: "#f6f6fb",
	text: "#0c0c19",
	muted: "#54515b",
	accent: "#6760b4",
};

/**
 * satori-html escapes interpolated strings (`&` → `&amp;`) but satori renders text
 * verbatim, so entities would show up literally in the image. Decode them back.
 */
type VNode = {
	type: string;
	props: { children?: VNode | string | (VNode | string)[] } & Record<string, unknown>;
};
const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	"#39": "'",
	apos: "'",
};
const decodeEntities = (node: VNode): VNode => {
	const decode = (s: string) =>
		s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name: string) => ENTITIES[name] ?? "");
	const walk = (child: VNode | string): VNode | string =>
		typeof child === "string" ? decode(child) : decodeEntities(child);
	const { children } = node.props;
	if (children !== undefined) {
		node.props.children = Array.isArray(children) ? children.map(walk) : walk(children);
	}
	return node;
};

// OG image markup, use https://og-playground.vercel.app/ to design your own.
export const ogMarkup = (title: string, pubDate: string) =>
	decodeEntities(html`<div tw="flex flex-col w-full h-full bg-[${og.bg}] text-[${og.muted}]">
		<div tw="flex flex-col flex-1 w-full p-10 justify-center">
			<p tw="text-2xl mb-6">${pubDate}</p>
			<h1 tw="text-6xl font-bold leading-snug text-[${og.text}]">${title}</h1>
		</div>
		<div tw="flex items-center justify-between w-full p-10 border-t-2 border-[${og.accent}] text-[${og.text}]">
			<p tw="text-2xl ml-3 font-semibold">${siteConfig.title}</p>
			<p>by ${siteConfig.author}</p>
		</div>
	</div>`);

// Default card for pages without their own OG image (home, listings, demos…) → /social-card.png
export const siteOgMarkup = () =>
	decodeEntities(html`<div tw="flex flex-col w-full h-full bg-[${og.bg}] text-[${og.muted}]">
		<div tw="flex flex-col flex-1 w-full p-10 justify-center">
			<h1 tw="text-7xl font-bold leading-snug text-[${og.text}]">${siteConfig.title}</h1>
			<p tw="text-3xl mt-6 leading-snug">${siteConfig.description}</p>
		</div>
		<div tw="flex items-center justify-between w-full p-10 border-t-2 border-[${og.accent}] text-[${og.text}]">
			<p tw="text-2xl ml-3 font-semibold">${new URL(siteConfig.url).host}</p>
			<p>by ${siteConfig.author}</p>
		</div>
	</div>`);
