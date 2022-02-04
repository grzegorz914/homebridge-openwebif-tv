const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events').EventEmitter;
const axios = require('axios');
const API_URL = require('./apiurl.json');


class OPENWEBIF extends EventEmitter {
    constructor(config) {
        super();
        this.host = config.host;
        this.port = config.port;
        this.user = config.user;
        this.pass = config.pass;
        this.auth = config.auth;
        this.devInfoFile = config.devInfoFile;
        this.channelsFile = config.channelsFile;

        const url = `http://${this.host}:${this.port}`;
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: url,
            timeout: 2500,
            withCredentials: this.auth,
            auth: {
                username: this.user,
                password: this.pass
            },
        });

        this.firstStart = true;
        this.checkStateOnFirstRun = false;
        this.isConnected = false;
        this.power = false;
        this.name = '';
        this.eventName = '';
        this.reference = '';
        this.volume = 0;
        this.mute = false;

        this.on('connect', () => {
                this.isConnected = true;
                this.checkStateOnFirstRun = true;
                this.emit('connected', 'Connected.');

                this.chackState = setInterval(() => {
                    this.emit('checkState');
                }, 2500)
            })
            .on('checkState', async () => {
                try {
                    const deviceStatusData = await this.axiosInstance(API_URL.DeviceStatus);
                    const power = (deviceStatusData.data.inStandby == 'false');
                    const name = deviceStatusData.data.currservice_station;
                    const eventName = deviceStatusData.data.currservice_name;
                    const reference = deviceStatusData.data.currservice_serviceref;
                    const volume = deviceStatusData.data.volume;
                    const mute = power ? (deviceStatusData.data.muted == true) : true;
                    if (this.checkStateOnFirstRun == true || power != this.power || name != this.name || eventName != this.eventName || reference != this.reference || volume != this.volume || mute != this.mute) {
                        this.power = power;
                        this.name = name;
                        this.eventName = eventName;
                        this.reference = reference;
                        this.volume = volume;
                        this.mute = mute;
                        this.checkStateOnFirstRun = false;
                        this.emit('debug', `Device status data: ${deviceStatusData.data}`);
                        this.emit('stateChanged', this.isConnected, power, name, eventName, reference, volume, mute);
                    };
                } catch (error) {
                    this.emit('debug', `Device state error: ${error}`);
                    this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                if (this.isConnected || this.firstStart) {
                    clearInterval(this.chackState);
                    this.isConnected = false;
                    this.firstStart = false;
                    this.emit('stateChanged', this.isConnected, this.power, this.name, this.eventName, this.reference, this.volume, this.mute);
                    this.emit('disconnected', 'Disconnected.');

                    setTimeout(async () => {
                        try {
                            await this.reconnect();
                        } catch (error) {
                            this.emit('debug', `Reconnect error: ${error}`);
                        };
                    }, 7500);
                };
            });

        this.connect();
    };

    async connect() {
        try {
            await this.getDeviceInfo();
        } catch (error) {
            this.emit('debug', `Connect error: ${error}, trying to reconnect.`);
            this.emit('disconnect');
        };
    };

    getDeviceInfo() {
        return new Promise(async (resolve, reject) => {
            try {
                const response = await this.axiosInstance(API_URL.DeviceInfo);
                const manufacturer = response.data.brand || this.manufacturer;
                const modelName = response.data.model || this.modelName;
                const serialNumber = response.data.webifver || this.serialNumber;
                const firmwareRevision = response.data.imagever || this.firmwareRevision;
                const kernelVer = response.data.kernelver || 'Unknown';
                const chipset = response.data.chipset || 'Unknown';
                const mac = response.data.ifaces[0].mac || this.name;

                const devInfo = JSON.stringify(response.data, null, 2);
                const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);

                const response1 = await this.axiosInstance(API_URL.GetAllServices);
                const channels = JSON.stringify(response1.data, null, 2);
                const writeChannels = await fsPromises.writeFile(this.channelsFile, channels);
                this.emit('debug', `Response: ${response.data}, response1: ${response1.data}`);
                this.emit('connect');
                this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac);
                resolve(true);
            } catch (error) {
                this.emit('debug', `Get device info error: ${error}`);
                this.emit('disconnect');
                reject(error);
            };
        });
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                this.emit('message', `Send command: ${apiUrl}`);
                resolve(true);
            } catch (error) {
                this.emit('error', `Send command error: ${error}`);
                reject(error);
            };
        });
    };

    reconnect() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.getDeviceInfo();
                resolve(true);
            } catch (error) {
                this.emit('debug', `Reconnect error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = OPENWEBIF;