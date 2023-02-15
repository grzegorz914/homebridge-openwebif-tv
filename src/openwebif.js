'use strict';
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class OPENWEBIF extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const port = config.port;
        const user = config.user;
        const pass = config.pass;
        const auth = config.auth;
        const disableLogConnectError = config.disableLogConnectError;
        const debugLog = config.debugLog;
        const mqttEnabled = config.mqttEnabled;
        this.refreshInterval = config.refreshInterval;

        const url = `http://${host}:${port}`;
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: url,
            timeout: 10000,
            withCredentials: auth,
            auth: {
                username: user,
                password: pass
            }
        });

        this.checkStateOnFirstRun = false;
        this.power = false;
        this.name = '';
        this.eventName = '';
        this.reference = '';
        this.volume = 0;
        this.devInfo = '';

        this.on('checkDeviceInfo', async () => {
            try {
                const deviceInfo = await this.axiosInstance(CONSTANS.ApiUrls.DeviceInfo);
                const devInfo = deviceInfo.data;
                const debug = debugLog ? this.emit('debug', `Info: ${JSON.stringify(devInfo, null, 2)}`) : false;
                this.devInfo = devInfo;

                const channelsInfo = await this.axiosInstance(CONSTANS.ApiUrls.GetAllServices);
                const channels = channelsInfo.data;
                const debu1g = debugLog ? this.emit('debug', `Channels info: ${JSON.stringify(devInfo, null, 2)}`) : false;

                const manufacturer = devInfo.brand || 'undefined';
                const modelName = devInfo.model || 'undefined';
                const serialNumber = devInfo.webifver || 'undefined';
                const firmwareRevision = devInfo.imagever || 'undefined';
                const kernelVer = devInfo.kernelver || 'undefined';
                const chipset = devInfo.chipset || 'undefined';
                const mac = devInfo.ifaces[0].mac || false;

                if (!mac) {
                    const debug = debugLog ? this.emit('debug', `Mac address: ${mac}, reconnect in 15s.`) : false;
                    this.checkDeviceInfo();
                    return;
                }

                this.checkStateOnFirstRun = true;
                this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac);
                await new Promise(resolve => setTimeout(resolve, 2000));
                this.emit('checkState');
            } catch (error) {
                const debug = disableLogConnectError ? false : this.emit('error', `Info error: ${error}, reconnect in 15s.`);
                this.checkDeviceInfo();
            };
        })
            .on('checkState', async () => {
                try {
                    const deviceState = await this.axiosInstance(CONSTANS.ApiUrls.DeviceStatus);
                    const devState = deviceState.data;
                    const debug = debugLog ? this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`) : false;

                    const power = (devState.inStandby == 'false');
                    const name = devState.currservice_station;
                    const eventName = devState.currservice_name;
                    const reference = devState.currservice_serviceref;
                    const volume = devState.volume;
                    const mute = power ? (devState.muted == true) : true;

                    this.checkStateOnFirstRun = false;
                    this.power = power;
                    this.name = name;
                    this.eventName = eventName;
                    this.reference = reference;
                    this.volume = volume;

                    this.emit('stateChanged', power, name, eventName, reference, volume, mute);
                    const mqtt = mqttEnabled ? this.emit('mqtt', 'Info', JSON.stringify(this.devInfo, null, 2)) : false;
                    const mqtt1 = mqttEnabled ? this.emit('mqtt', 'State', JSON.stringify(devState, null, 2)) : false;
                    this.checkState();
                } catch (error) {
                    const debug = disableLogConnectError ? false : this.emit('error', `State error: ${error}, reconnect in 15s.`);
                    const firstRun = this.checkStateOnFirstRun ? this.checkDeviceInfo() : this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                this.emit('disconnected', 'Disconnected.');
                this.emit('stateChanged', false, this.name, this.eventName, this.reference, this.volume, true);
                this.checkDeviceInfo();
            });

        this.emit('checkDeviceInfo');
    };;

    async checkDeviceInfo() {
        await new Promise(resolve => setTimeout(resolve, 15000));
        this.emit('checkDeviceInfo');
    };

    async checkState() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
        this.emit('checkState');
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.axiosInstance(apiUrl);
                resolve(true);
            } catch (error) {
                this.emit('error', error);
                reject(error);
            };
        });
    };
};
module.exports = OPENWEBIF;