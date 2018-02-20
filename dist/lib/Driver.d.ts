/// <reference types="node" />
import { EventEmitter } from 'events';
/**
 * Main interface for interacting with Rocket.Chat
 * @param asteroid  An Asteroid instance to connect to Meteor server
 */
export declare class Driver extends EventEmitter {
    host: string;
    private asteroid;
    /**
     * Creates a new driver instance with given options or defaults
     * @param host  Rocket.Chat instance Host URL:PORT (without protocol)
     */
    constructor(host?: string);
}
