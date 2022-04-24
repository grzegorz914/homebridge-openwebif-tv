const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
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
            timeout: 10000,
            withCredentials: this.auth,
            auth: {
                username: this.user,
                password: this.pass
            },
        });

        this.firstDisconnect = false;
        this.checkStateOnFirstRun = false;
        this.power = false;
        this.name = '';
        this.eventName = '';
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.devInfo = '';

        this.on('connect', () => {
                this.firstDisconnect = true;
                this.checkStateOnFirstRun = true;
                this.emit('connected', 'Connected.');
                this.checkState();
            })
            .on('checkDeviceInfo', async () => {
                try {
                    const deviceInfo = await this.axiosInstance(API_URL.DeviceInfo);
                    const devInfo = JSON.stringify(deviceInfo.data, null, 2);
                    this.emit('debug', `Device info data: ${devInfo}`);
                    const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);
                    this.devInfo = devInfo;

                    const manufacturer = deviceInfo.data.brand || 'Unknown';
                    const modelName = deviceInfo.data.model || 'Unknown';
                    const serialNumber = deviceInfo.data.webifver || 'Unknown';
                    const firmwareRevision = deviceInfo.data.imagever || 'Unknown';
                    const kernelVer = deviceInfo.data.kernelver || 'Unknown';
                    const chipset = deviceInfo.data.chipset || 'Unknown';
                    const mac = deviceInfo.data.ifaces[0].mac;

                    const channelsInfo = await this.axiosInstance(API_URL.GetAllServices);
                    const channels = JSON.stringify(channelsInfo.data, null, 2);
                    this.emit('debug', `Channels info: ${channels}`);
                    const writeChannels = await fsPromises.writeFile(this.channelsFile, channels);

                    if (mac !== null && mac !== undefined) {
                        this.emit('connect');
                        this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac);
                    } else {
                        this.emit('debug', `Device mac address unknown: ${mac}`);
                        this.checkDeviceInfo();
                    }
                } catch (error) {
                    this.emit('debug', `Device info error: ${error}`);
                    this.checkDeviceInfo();
                };
            })
            .on('checkState', async () => {
                try {
                    const deviceState = await this.axiosInstance(API_URL.DeviceStatus);
                    this.emit('debug', `State data: ${JSON.stringify(deviceState.data, null, 2)}`);

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
                    this.emit('mqtt', 'Info', this.devInfo);
                    this.emit('mqtt', 'State', JSON.stringify(deviceState.data, null, 2));
                    this.checkState();
                } catch (error) {
                    this.emit('debug', `Device state error: ${error}`);
                    const firstRun = this.checkStateOnFirstRun ? this.checkDeviceInfo() : this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                if (this.firstDisconnect) {
                    this.firstDisconnect = false;
                    this.emit('disconnected', 'Disconnected, trying to reconnect.');
                };

                this.emit('stateChanged', false, this.name, this.eventName, this.reference, this.volume, true);
                this.checkDeviceInfo();
            });

        this.emit('checkDeviceInfo');
    };

    checkState() {
        setTimeout(() => {
            this.emit('checkState');
        }, 1500)
    };

    checkDeviceInfo() {
        setTimeout(() => {
            this.emit('checkDeviceInfo');
        }, 7500);
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
};
module.exports = OPENWEBIF;