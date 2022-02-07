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

        this.isConnected = false;
        this.firstStart = true;
        this.checkStateOnFirstRun = false;
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
                    this.emit('error', `Device state error: ${error}`);
                    this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                if (this.isConnected || this.firstStart) {
                    clearInterval(this.chackState);
                    this.isConnected = false;
                    this.firstStart = false;
                    this.emit('stateChanged', this.isConnected, this.power, this.name, this.eventName, this.reference, this.volume, this.mute);
                    this.emit('disconnected', 'Disconnected, trying to reconnect.');

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
            this.emit('error', `Connect error: ${error}.`);
        };
    };

    getDeviceInfo() {
        return new Promise(async (resolve, reject) => {
            try {
                const deviceInfo = await this.axiosInstance(API_URL.DeviceInfo);
                const manufacturer = deviceInfo.data.brand || this.manufacturer;
                const modelName = deviceInfo.data.model || this.modelName;
                const serialNumber = deviceInfo.data.webifver || this.serialNumber;
                const firmwareRevision = deviceInfo.data.imagever || this.firmwareRevision;
                const kernelVer = deviceInfo.data.kernelver || 'Unknown';
                const chipset = deviceInfo.data.chipset || 'Unknown';
                const mac = deviceInfo.data.ifaces[0].mac || this.name;

                const devInfo = JSON.stringify(deviceInfo.data, null, 2);
                this.emit('debug', `Device info: ${devInfo}`);
                const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);

                const channelsInfo = await this.axiosInstance(API_URL.GetAllServices);
                const channels = JSON.stringify(channelsInfo.data, null, 2);
                this.emit('debug', `Channels info: ${channels}`);
                const writeChannels = await fsPromises.writeFile(this.channelsFile, channels);

                this.emit('connect');
                this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac);
                resolve(true);
            } catch (error) {
                this.emit('debug', `Get device info error: ${error}`);
                reject(error);

                //disconnect
                this.emit('disconnect');
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
                this.emit('debug', `Reconnect device error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = OPENWEBIF;