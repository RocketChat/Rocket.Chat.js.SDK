declare module 'tiny-events' {
	export class EventEmitter {
		_listeners: any
		on(event: string, listener: Function): EventEmitter;
		once(event: string, listener: Function): EventEmitter;
		off(event?: string, listener?: Function): EventEmitter;
		emit(event: string, ...args: any[]): boolean;
		listeners(event: string): Function[];
		removeAllListeners(event?: string): Function[];
		hasListeners(event: string): boolean;
	}
}
