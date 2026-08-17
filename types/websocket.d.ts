/**
 * Hand-written declaration for `universal-websocket-client`, covering only the
 * surface `lib/drivers/socket.ts` uses. The package's `browser` field points at
 * the global `WebSocket`, which is what React Native actually runs — so
 * `@types/ws` would describe code that never executes, and the DOM lib has no
 * 3-argument constructor. This describes the real runtime instead.
 */
declare module 'universal-websocket-client' {
	class WebSocket {
		constructor(url: string, protocols?: string | string[] | null, options?: { headers?: { [key: string]: string } })
		onopen: ((ev: any) => void) | null
		onmessage: ((ev: any) => void) | null
		onerror: ((ev: any) => void) | null
		onclose: ((ev: any) => void) | null
		readonly readyState: number
		send(data: string): void
		close(code?: number): void
	}
	export default WebSocket
}
