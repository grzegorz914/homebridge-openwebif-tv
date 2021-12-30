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

        setInterval(() => {
            const chackState = this.isConnected ? this.emit('checkState') : false;
        }, 2750)

        this.on('connect', () => {
                this.isConnected = true;
                this.checkStateOnFirstRun = true;
                this.emit('connected', 'Connected.');
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
                        this.emit('debug', `deviceStatusData: ${deviceStatusData.data}`);
                        this.emit('stateChanged', power, name, eventName, reference, volume, mute);
                        this.power = power;
                        this.name = name;
                        this.eventName = eventName;
                        this.reference = reference;
                        this.volume = volume;
                        this.mute = mute;
                        this.checkStateOnFirstRun = false;
                    };
                } catch (error) {
                    this.emit('debug', `device state error: ${error}`);
                    this.emit('disconnect');
                };
            })
        this.on('disconnect', () => {
            if (this.isConnected || this.firstStart) {
                this.emit('stateChanged', this.power, this.name, this.eventName, this.reference, this.volume, this.mute);
                this.emit('disconnected', 'Disconnected.');
                this.isConnected = false;
                this.firstStart = false;
            };

            setTimeout(() => {
                this.getDeviceInfo();
            }, 7500);
        });

        this.getDeviceInfo();
    };

    async getDeviceInfo() {
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
            this.emit('debug', `response: ${response.data}, response1: ${response1.data}`);
            this.emit('connect');
            this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac);
        } catch (error) {
            this.emit('debug', `device info error: ${error}`);
            this.emit('disconnect');
        };
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                this.emit('message', `send command: ${apiUrl}`);
                resolve(true);
            } catch (error) {
                this.emit('error', `send command error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = OPENWEBIF;