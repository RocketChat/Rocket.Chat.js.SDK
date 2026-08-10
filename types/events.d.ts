declare module 'tiny-events' {
	export class EventEmitter {
		_listeners: { [type: string]: Function[] }
		on(event: string, listener: Function): EventEmitter;
		once(event: string, listener: Function): EventEmitter;
		off(event?: string, listener?: Function): EventEmitter;
		emit(event: string, ...args: any[]): EventEmitter;
		// Not upstream API: installed onto the prototype by `lib/drivers/ddp.ts`
		// at module load. Declared here because the socket interface advertises it;
		// it leaves with the behaviour PR that folds it into an owned emitter.
		removeAllListeners(event?: string): Function[];
	}
}
