import { Client } from 'paho-mqtt/src/paho-mqtt';
import { EventEmitter } from 'tiny-events';
import { logger as Logger } from '../log';
export class MQTTDriver extends EventEmitter {
    constructor({ host = 'https://iot.eclipse.org', path = '/mqtt', integrationId, config, logger = Logger, ...moreConfigs }) {
        super();
        host = 'http://test.mosquitto.org';
        const [, _host = host, , port = 8080] = new RegExp('(.*?)(:([0-9]+))?$').exec(host || 'localhost:3000') || [];
        this.config = {
            ...config,
            ...moreConfigs,
            host: _host.replace(/^http/, 'ws'),
            timeout: 20000,
            port: port
            // reopen: number
            // ping: number
            // close: number
            // integration: string
        };
        this.logger = logger;
        if (/https/.test(host)) {
            this.socket = new Client(this.config.host + path, 'clientId');
        }
        else {
            this.socket = new Client((this.config.host || '').replace('http://', '').replace('ws://', ''), Number(port), path, 'clientId');
        }
        this.socket.onMessageArrived = ({ destinationName, payloadString }) => {
            if (/room-message/.test(destinationName)) {
                this.emit('message', { topic: destinationName, message: payloadString });
            }
        };
    }
    connect(options) {
        return new Promise((resolve, reject) => {
            this.socket.connect({ onSuccess: resolve, mqttVersion: 3, onFailure: reject, useSSL: /https/.test(this.config.host || '') });
        });
    }
    disconnect() {
        this.socket.end();
        return Promise.resolve(this.socket);
    }
    subscribe(topic, { qos = 0 }) {
        return new Promise((resolve, reject) => {
            this.socket.subscribe(topic, { qos, onFailure: (...args) => {
                    console.log(...args);
                    reject(args);
                }, onSuccess: (...args) => {
                    console.log(...args);
                    resolve(args);
                }
            });
        });
    }
    unsubscribe(subscription, ...args) {
        return new Promise((resolve, reject) => {
            this.socket.unsubscribe(subscription.name, [...args, (err, granted) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(granted);
                }]);
        });
    }
    unsubscribeAll() {
        return Promise.resolve();
    }
    subscribeNotifyAll() {
        return Promise.resolve();
    }
    subscribeLoggedNotify() {
        return Promise.resolve();
    }
    subscribeNotifyUser() {
        return Promise.resolve();
    }
    login(credentials, args) {
        return Promise.resolve();
    }
    // usertyping room-messages deleted messages
    subscribeRoom(rid, ...args) {
        return this.subscribe(`room-messages/${rid}`, { qos: 1 });
    }
    onMessage(cb) {
        this.on('message', ({ topic, message }) => {
            console.log(topic);
            if (/room-messages/.test(topic)) {
                cb(message); // TODO apply msgpack
            }
        });
    }
    async onTyping(cb) {
        return new Promise((resolve) => {
            resolve(this.on('notify-room', ({ fields: { args: [username, isTyping] } }) => {
                cb(username, isTyping);
            }));
        });
    }
}
//# sourceMappingURL=mqtt.js.map