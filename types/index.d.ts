declare module 'universal-websocket-client'
declare module 'paho-mqtt'
declare module 'paho-mqtt/src/paho-mqtt'
declare module 'msgpack-lite'
declare module 'mem'

declare namespace NodeJS {
	interface Global {
		fetch: any
	}
}
