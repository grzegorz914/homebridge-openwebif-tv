const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events').EventEmitter;
const axios = require('axios');

const API_URL = {
    'DeviceInfo': '/api/deviceinfo',
    'DeviceStatus': '/api/statusinfo',
    'GetAllServices': '/api/getallservices',
    'SetPower': '/api/powerstate?newstate=',
    'SetChannel': '/api/zap?sRef=',
    'SetVolume': '/api/vol?set=set',
    'ToggleMute': '/api/vol?set=mute',
    'SetRcCommand': '/api/remotecontrol?command='
};

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
            withCredentials: this.auth,
            auth: {
                username: this.user,
                password: this.pass
            },
        });

        this.isConnected = false;
        this.power = false;
        this.name = '';
        this.eventName = '';
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.checkStateOnFirstRun = false;

        this.connect();
    };

    async getDeviceInfo() {
        try {
            const [response, response1] = await axios.all([this.axiosInstance(API_URL.DeviceInfo), this.axiosInstance(API_URL.GetAllServices)]);
            const devInfo = JSON.stringify(response.data, null, 2);
            const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);
            const channels = JSON.stringify(response1.data, null, 2);
            const writeChannels = await fsPromises.writeFile(this.channelsFile, channels);
            this.emit('debug', `response: ${response.data}, response1: ${response1.data}`);
            this.emit('connect', 'Connected.');
            this.emit('deviceInfo', response);
            this.isConnected = true;
            this.updateDeviceState();
        } catch (error) {
            this.emit('error', `device info error: ${error}`);

            setTimeout(() => {
                this.connect();
            }, 5000);
        };
    };

    updateDeviceState() {
        this.checkStateOnFirstRun = true;
        setInterval(async () => {
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
                    this.emit('deviceState', power, name, eventName, reference, volume, mute);
                    this.power = power;
                    this.name = name;
                    this.eventName = eventName;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;
                    this.checkStateOnFirstRun = false;
                };
            } catch (error) {
                this.emit('error', `update device state error: ${error}`);
                this.emit('deviceState', false, '', '', '', 0, true);
                this.emit('disconnect', 'Disconnected.');
            };
        }, 750)
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

    connect() {
        if (!this.isConnected) {
            this.getDeviceInfo();
        };
    };
};
module.exports = OPENWEBIF;