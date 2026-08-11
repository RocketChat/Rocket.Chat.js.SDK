declare module 'tiny-events' {
	export class EventEmitter {
		_listeners: { [type: string]: Function[] }
		on(event: string, listener: Function): EventEmitter;
		once(event: string, listener: Function): EventEmitter;
		off(event?: string, listener?: Function): EventEmitter;
		emit(event: string, ...args: any[]): EventEmitter;
	}
}
