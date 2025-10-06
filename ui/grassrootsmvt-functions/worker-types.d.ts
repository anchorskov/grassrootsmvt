
 ⛅️ wrangler 4.42.0
───────────────────
Generating project types...

declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env {
	}
}
interface Env extends Cloudflare.Env {}

Generating runtime types...

Runtime types generated.


✨ Types written to worker-configuration.d.ts

📖 Read about runtime types
https://developers.cloudflare.com/workers/languages/typescript/#generate-types
📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.

