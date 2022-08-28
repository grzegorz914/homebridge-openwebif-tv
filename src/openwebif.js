'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const axios = require('axios');
const CONSTANS = require('./constans.json');

class OPENWEBIF extends EventEmitter {
    constructor(config) {
        super();
        this.host = config.host;
        this.port = config.port;
        this.user = config.user;
        this.pass = config.pass;
        this.auth = config.auth;
        this.infoLog = config.infoLog;
        this.debugLog = config.debugLog;
        this.devInfoFile = config.devInfoFile;
        this.channelsFile = config.channelsFile;
        this.mqttEnabled = config.enableMqtt;

        const url = `http://${this.host}:${this.port}`;
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: url,
            timeout: 10000,
            withCredentials: this.auth,
            auth: {
                username: this.user,
                password: this.pass
            },
        });

        this.checkStateOnFirstRun = false;
        this.power = false;
        this.name = '';
        this.eventName = '';
        this.reference = '';
        this.volume = 0;
        this.mute = true;
        this.devInfo = '';

        this.on('connect', () => {
            this.checkStateOnFirstRun = true;
            this.emit('connected', 'Connected.');
            setTimeout(() => {
                this.emit('checkState');
            }, 500)
        })
            .on('checkDeviceInfo', async () => {
                try {
                    const deviceInfo = await this.axiosInstance(CONSTANS.ApiUrls.DeviceInfo);
                    const devInfo = JSON.stringify(deviceInfo.data, null, 2);
                    const debug = this.debugLog ? this.emit('debug', `Info data: ${devInfo}`) : false;
                    const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);
                    this.devInfo = devInfo;

                    const manufacturer = deviceInfo.data.brand || 'Unknown';
                    const modelName = deviceInfo.data.model || 'Unknown';
                    const serialNumber = deviceInfo.data.webifver || 'Unknown';
                    const firmwareRevision = deviceInfo.data.imagever || 'Unknown';
                    const kernelVer = deviceInfo.data.kernelver || 'Unknown';
                    const chipset = deviceInfo.data.chipset || 'Unknown';
                    const mac = deviceInfo.data.ifaces[0].mac;

                    const channelsInfo = await this.axiosInstance(CONSTANS.ApiUrls.GetAllServices);
                    const channels = JSON.stringify(channelsInfo.data, null, 2);
                    const debu1g = this.debugLog ? this.emit('debug', `Channels info: ${channels}`) : false;
                    const writeChannels = await fsPromises.writeFile(this.channelsFile, channels);

                    if (mac != null && mac != undefined) {
                        this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac);
                        this.emit('connect');
                    } else {
                        const debug = this.debugLog ? this.emit('debug', `Mac address unknown: ${mac}, reconnect in 15s.`) : false;
                        this.checkDeviceInfo();
                    }
                } catch (error) {
                    this.emit('error', `Info error: ${error}, reconnect in 15s.`);
                    this.checkDeviceInfo();
                };
            })
            .on('checkState', async () => {
                try {
                    const deviceState = await this.axiosInstance(CONSTANS.ApiUrls.DeviceStatus);
                    const debug = this.debugLog ? this.emit('debug', `State data: ${JSON.stringify(deviceState.data, null, 2)}`) : false;

                    const power = (deviceState.data.inStandby == 'false');
                    const name = deviceState.data.currservice_station;
                    const eventName = deviceState.data.currservice_name;
                    const reference = deviceState.data.currservice_serviceref;
                    const volume = deviceState.data.volume;
                    const mute = power ? (deviceState.data.muted == true) : true;
                    if (this.checkStateOnFirstRun == true || power != this.power || name != this.name || eventName != this.eventName || reference != this.reference || volume != this.volume || mute != this.mute) {
                        this.power = power;
                        this.name = name;
                        this.eventName = eventName;
                        this.reference = reference;
                        this.volume = volume;
                        this.mute = mute;
                        this.checkStateOnFirstRun = false;
                        this.emit('stateChanged', power, name, eventName, reference, volume, mute);
                    };
                    const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Info', this.devInfo) : false;
                    const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'State', JSON.stringify(deviceState.data, null, 2)) : false;

                    setTimeout(() => {
                        this.emit('checkState');
                    }, 1500)
                } catch (error) {
                    this.emit('error', `State error: ${error}, reconnect in 15s.`);
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

    checkDeviceInfo() {
        setTimeout(() => {
            this.emit('checkDeviceInfo');
        }, 15000);
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                const info = this.infoLog ? false : this.emit('message', `Send command: ${apiUrl}`);
                resolve(true);
            } catch (error) {
                this.emit('error', `Send command error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = OPENWEBIF;