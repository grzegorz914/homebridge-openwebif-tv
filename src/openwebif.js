'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const ImpulseGenerator = require('./impulsegenerator.js');
const CONSTANTS = require('./constants.json');

class OPENWEBIF extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const port = config.port;
        const user = config.user;
        const pass = config.pass;
        const auth = config.auth;
        this.inputs = config.inputs;
        this.bouquets = config.bouquets
        this.devInfoFile = config.devInfoFile;
        this.channelsFile = config.channelsFile;
        this.inputsFile = config.inputsFile;
        this.getInputsFromDevice = config.getInputsFromDevice;
        this.debugLog = config.debugLog;
        this.disableLogConnectError = config.disableLogConnectError;

        const baseUrl = `http://${host}:${port}`;
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 5000,
            withCredentials: auth,
            auth: {
                username: user,
                password: pass
            }
        });

        this.power = false;
        this.name = '';
        this.eventName = '';
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.devInfo = '';

        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('checkState', async () => {
            try {
                await this.checkState();
            } catch (error) {
                await this.impulseGenerator.stop();
                this.emit('error', `Impulse generator check state error: ${error.message || error}}, check again in 15s.`);
            };
        }).on('state', (state) => { });
    };

    async connect() {
        try {
            const deviceInfo = await this.axiosInstance(CONSTANTS.ApiUrls.DeviceInfo);
            const devInfo = deviceInfo.data;
            const debug = this.debugLog ? this.emit('debug', `Connect data: ${JSON.stringify(devInfo, null, 2)}`) : false;
            this.devInfo = devInfo;

            const manufacturer = devInfo.brand || 'undefined';
            const modelName = devInfo.model || 'undefined';
            const serialNumber = devInfo.webifver || 'undefined';
            const firmwareRevision = devInfo.imagever || 'undefined';
            const kernelVer = devInfo.kernelver || 'undefined';
            const chipset = devInfo.chipset || 'undefined';
            const mac = devInfo.ifaces[0].mac || false;

            if (!mac) {
                await this.impulseGenerator.stop();
                this.emit('error', `Missing Mac Address: ${mac}, check again in 15s.`);
                return;
            }

            //save device info to the file
            await this.saveData(this.devInfoFile, devInfo);

            //get all channels
            const channelsInfo = await this.axiosInstance(CONSTANTS.ApiUrls.GetAllServices);
            const allChannels = channelsInfo.data.services;
            const debug1 = this.debugLog ? this.emit('debug', `Channels info: ${channelsInfo}`) : false;

            //save all channels
            await this.saveData(this.channelsFile, allChannels);

            //prepare channels
            const channels = await this.getInputs(allChannels, this.bouquets, this.inputs, this.getInputsFromDevice);
            if (!channels) {
                await this.impulseGenerator.stop();
                this.emit('error', `Found: ${channels} channels, check again in 15s.`);
                return;
            }

            //save channels
            await this.saveData(this.inputsFile, channels);

            //connect to deice success
            this.emit('success', `Connect Success.`)

            //emit device info
            this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac);

            //start external integration
            this.emit('externalIntegration');

            //prepare accessory
            this.emit('prepareAccessory', channels);

            return true;
        } catch (error) {
            if (this.disableLogConnectError) {
                return true;
            };
            await this.impulseGenerator.stop();
            throw new Error(`Connect error: ${error.message || error}}, check again in 15s.`);

        };
    };

    async checkState() {
        try {
            const deviceState = await this.axiosInstance(CONSTANTS.ApiUrls.DeviceStatus);
            const devState = deviceState.data;
            const debug = this.debugLog ? this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`) : false;

            //mqtt
            this.emit('mqtt', 'Info', this.devInfo);
            this.emit('mqtt', 'State', devState);

            const power = devState.inStandby === 'false';
            const name = devState.currservice_station;
            const eventName = devState.currservice_name;
            const reference = devState.currservice_serviceref;
            const volume = devState.volume;
            const mute = devState.muted;

            //update only if value change
            if (power === this.power && name === this.name && eventName === this.eventName && reference === this.reference && volume === this.volume && mute === this.mute) {
                return;
            };

            this.power = power;
            this.name = name;
            this.eventName = eventName;
            this.reference = reference;
            this.volume = volume;
            this.mute = mute;

            //emit state changed
            this.emit('stateChanged', power, name, eventName, reference, volume, mute);

            return true;
        } catch (error) {
            if (this.disableLogConnectError) {
                return true;
            };
            await this.impulseGenerator.stop();
            throw new Error(`Check state error: ${error.message || error}}, check again in 15s.`);
        };
    };

    async getInputs(allChannels, bouquets, inputs, getInputsFromDevice) {
        try {
            //save channels to the file
            const bouquetChannelsArr = [];
            for (const bouquet of bouquets) {
                const bouquetName = bouquet.name;
                const displayType = bouquet.displayType ?? 0;
                const bouquetChannels = allChannels.find(service => service.servicename === bouquetName);

                if (bouquetChannels) {
                    for (const channel of bouquetChannels.subservices) {
                        const name = channel.servicename;
                        const reference = channel.servicereference;

                        const obj = {
                            'name': name,
                            'reference': reference,
                            'displayType': displayType
                        }
                        bouquetChannelsArr.push(obj);
                    };
                    this.bouquetName = bouquetName;
                } else {
                    this.emit('warn', `Bouquet: ${bouquetName}, was not found.`);
                }
            }

            //chack duplicated channels
            const channelArr = [];
            const channelsArr = !getInputsFromDevice || bouquetChannelsArr.length === 0 ? inputs : bouquetChannelsArr;
            for (const input of channelsArr) {
                const inputName = input.name;
                const inputReference = input.reference;
                const inputDisplayType = input.displayType ?? 0;
                const obj = {
                    'name': inputName,
                    'reference': inputReference,
                    'displayType': inputDisplayType
                }

                const duplicatedInput = channelArr.some(input => input.reference === inputReference);
                const push = inputName && inputReference && !duplicatedInput ? channelArr.push(obj) : false;
            };

            const channels = channelArr.length > 0 ? channelArr : false;
            return channels;
        } catch (error) {
            throw new Error(`Get inputus error: ${error}`);
        };
    };

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            const debug = this.debugLog ? this.emit('debug', `Saved data: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error.message || error}}`);
        };
    };

    async send(apiUrl) {
        try {
            await this.axiosInstance(apiUrl);
            return true;
        } catch (error) {
            throw new Error(error);
        };
    };
};
module.exports = OPENWEBIF;
