import satori, { type SatoriOptions } from "satori";
import sharp from "sharp";
import RobotoMonoBold from "@/assets/roboto-mono-700.ttf";
import RobotoMono from "@/assets/roboto-mono-regular.ttf";
import { siteOgMarkup } from "./og-image/_ogMarkup";

/**
 * Default social card (/social-card.png), referenced by BaseHead for every page that
 * doesn't have its own OG image. Generated at build time with the same Satori pipeline
 * as the per-post images in ./og-image/, so there's no static PNG to keep in sync.
 */
const ogOptions: SatoriOptions = {
	fonts: [
		{
			data: Buffer.from(RobotoMono),
			name: "Roboto Mono",
			style: "normal",
			weight: 400,
		},
		{
			data: Buffer.from(RobotoMonoBold),
			name: "Roboto Mono",
			style: "normal",
			weight: 700,
		},
	],
	height: 630,
	width: 1200,
};

export async function GET() {
	const svg = await satori(siteOgMarkup(), ogOptions);
	const png = await sharp(Buffer.from(svg)).png().toBuffer();

	return new Response(new Uint8Array(png), {
		headers: {
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Type": "image/png",
		},
	});
}
