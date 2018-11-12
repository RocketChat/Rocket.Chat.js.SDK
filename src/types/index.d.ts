declare module 'universal-websocket-client'
declare module 'create-hash'
declare module 'paho-mqtt'
declare module 'paho-mqtt/src/paho-mqtt'
declare module 'msgpack-lite'
declare module 'mem'
declare module 'js-sha256' {
	export function sha256( data:string) : string
}

declare namespace NodeJS {
	interface Global {
		fetch: any
	}
}
