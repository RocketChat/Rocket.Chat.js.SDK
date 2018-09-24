/// <reference types="node" />
import { EventEmitter } from 'events';
/**
 * Asteroid DDP - add known properties to avoid TS lint errors
 */
export interface IAsteroidDDP extends EventEmitter {
    readyState: 1 | 0;
}
/**
 * Asteroid type
 * @todo Update with typing from definitely typed (when available)
 */
export interface IAsteroid extends EventEmitter {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    createUser: (usernameOrEmail: string, password: string, profile: IUserOptions) => Promise<any>;
    loginWithLDAP: (...params: any[]) => Promise<any>;
    loginWithFacebook: (...params: any[]) => Promise<any>;
    loginWithGoogle: (...params: any[]) => Promise<any>;
    loginWithTwitter: (...params: any[]) => Promise<any>;
    loginWithGithub: (...params: any[]) => Promise<any>;
    loginWithPassword: (usernameOrEmail: string, password: string) => Promise<any>;
    logout: () => Promise<null>;
    subscribe: (name: string, ...params: any[]) => ISubscription;
    subscriptions: ISubscription[];
    call: (method: string, ...params: any[]) => IMethodResult;
    apply: (method: string, params: any[]) => IMethodResult;
    getCollection: (name: string) => ICollection;
    resumeLoginPromise: Promise<string>;
    ddp: IAsteroidDDP;
}
/**
 * Asteroid user options type
 * @todo Update with typing from definitely typed (when available)
 */
export interface IUserOptions {
    username?: string;
    email?: string;
    password: string;
}
/**
 * Asteroid subscription type.
 * ID is populated when ready promise resolves.
 * @todo Update with typing from definitely typed (when available)
 */
export interface ISubscription {
    stop: () => void;
    ready: Promise<IReady>;
    id?: string;
}
export interface IReady {
    state: string;
    value: string;
}
/**
 * If the method is successful, the `result` promise will be resolved with the
 * return value passed by the server. The `updated` promise will be resolved
 * with nothing once the server emits the updated message, that tells the client
 * that any side-effect that the method execution caused on the database has
 * been reflected on the client (for example, if the method caused the insertion
 * of an item into a collection, the client has been notified of said
 * insertion).
 *
 * If the method fails, the `result` promise will be rejected with the error
 * returned by the server. The `updated` promise will be rejected as well
 * (with nothing).
 */
export interface IMethodResult {
    result: Promise<any>;
    updated: Promise<any>;
}
/**
 *
 */
export interface ICollection {
    name: string;
    insert: (item: any) => ICollectionResult;
    update: (id: string, item: any) => ICollectionResult;
    remove: (id: string) => ICollectionResult;
    reactiveQuery: (selector: object | Function) => IReactiveQuery;
}
/**
 * The `local` promise is immediately resolved with the `_id` of the updated
 * item. That is, unless an error occurred. In that case, an exception will be
 * raised.
 * The `remote` promise is resolved with the `_id` of the updated item if the
 * remote update is successful. Otherwise it's rejected with the reason of the
 * failure.
 */
export interface ICollectionResult {
    local: Promise<any>;
    remote: Promise<any>;
}
/**
 * A reactive subset of a collection. Possible events are:
 * `change`: emitted whenever the result of the query changes. The id of the
 * item that changed is passed to the handler.
 */
export interface IReactiveQuery {
    on: (event: string, handler: Function) => void;
    result: any[];
}
/** Credentials for Asteroid login method */
export interface ICredentials {
    password: string;
    username?: string;
    email?: string;
    ldap?: boolean;
    ldapOptions?: object;
}
