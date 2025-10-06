//Generating project types...

declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env {
	}
}
interface Env extends Cloudflare.Env {}

