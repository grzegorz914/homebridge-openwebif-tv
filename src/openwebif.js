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

        const baseUrl = `http://${host}:${port}`;
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 10000,
            withCredentials: auth,
            auth: {
                username: user,
                password: pass
            }
        });

        this.connected = false;
        this.startPrepareAccessory = true;
        this.emitDeviceInfo = true;
        this.power = false;
        this.name = '';
        this.eventName = '';
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.devInfo = '';

        this.on('checkDeviceInfo', async () => {
            try {
                const deviceInfo = await this.axiosInstance(CONSTANS.ApiUrls.DeviceInfo);
                const devInfo = deviceInfo.data;
                const debug = debugLog ? this.emit('debug', `Info: ${JSON.stringify(devInfo, null, 2)}`) : false;
                this.devInfo = devInfo;

                const manufacturer = devInfo.brand || 'undefined';
                const modelName = devInfo.model || 'undefined';
                const serialNumber = devInfo.webifver || 'undefined';
                const firmwareRevision = devInfo.imagever || 'undefined';
                const kernelVer = devInfo.kernelver || 'undefined';
                const chipset = devInfo.chipset || 'undefined';
                const mac = devInfo.ifaces[0].mac || false;

                if (!mac) {
                    const debug = debugLog ? this.emit('debug', `Missing Mac Address: ${mac}, reconnect in 15s.`) : false;
                    this.checkDeviceInfo();
                    return;
                }

                const channelsInfo = await this.axiosInstance(CONSTANS.ApiUrls.GetAllServices);
                const allChannels = channelsInfo.data;
                const debu1g = debugLog ? this.emit('debug', `Channels info: ${JSON.stringify(channelsInfo, null, 2)}`) : false;

                //emit device info
                const emitDeviceInfo = this.emitDeviceInfo ? this.emit('deviceInfo', devInfo, allChannels, manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac) : false;
                this.emitDeviceInfo = false;

                //prepare accessory
                const prepareAccessory = this.startPrepareAccessory ? this.emit('prepareAccessory') : false;
                const awaitPrepareAccessory = this.startPrepareAccessory ? await new Promise(resolve => setTimeout(resolve, 3000)) : false;
                this.startPrepareAccessory = false;

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

                    const power = devState.inStandby === 'false';
                    const name = devState.currservice_station;
                    const eventName = devState.currservice_name;
                    const reference = devState.currservice_serviceref;
                    const volume = devState.volume;
                    const mute = devState.muted;

                    this.power = power;
                    this.name = name;
                    this.eventName = eventName;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;

                    const emitConnected = !this.connected ? this.emit('message', `Connected.`) : false;
                    this.connected = true;

                    //emit state changed
                    this.emit('stateChanged', power, name, eventName, reference, volume, mute);
                    const mqtt = mqttEnabled ? this.emit('mqtt', 'Info', this.devInfo) : false;
                    const mqtt1 = mqttEnabled ? this.emit('mqtt', 'State', devState) : false;

                    this.checkState();
                } catch (error) {
                    const debug = disableLogConnectError ? false : this.emit('error', `State error: ${error}, reconnect in 15s.`);
                    this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                this.emit('stateChanged', false, this.name, this.eventName, this.reference, this.volume, this.mute);
                this.emit('disconnected', 'Disconnected.');
                this.connected = false;
                this.checkState();
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
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = OPENWEBIF;
