'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
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
        const inputs = config.inputs;
        const bouquets = config.bouquets
        const devInfoFile = config.devInfoFile;
        const channelsFile = config.channelsFile;
        const inputsFile = config.inputsFile;
        const getInputsFromDevice = config.getInputsFromDevice;
        const disableLogConnectError = config.disableLogConnectError;
        const refreshInterval = config.refreshInterval;
        const debugLog = config.debugLog;
        const mqttEnabled = config.mqttEnabled;

        this.debugLog = debugLog;
        this.refreshInterval = refreshInterval;

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
                const allChannels = channelsInfo.data.services;
                const debug1 = debugLog ? this.emit('debug', `Channels info: ${channelsInfo}`) : false;

                //save device info to the file
                await this.saveDevInfo(devInfoFile, devInfo)

                //save inputs to the file
                const channels = await this.saveInputs(channelsFile, inputsFile, allChannels, bouquets, inputs, getInputsFromDevice);

                //emit device info
                const emitDeviceInfo = this.emitDeviceInfo ? this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac) : false;
                this.emitDeviceInfo = false;

                //prepare accessory
                const prepareAccessory = this.startPrepareAccessory ? this.emit('prepareAccessory', channels) : false;
                const awaitPrepareAccessory = this.startPrepareAccessory ? await new Promise(resolve => setTimeout(resolve, 2500)) : false;
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

                    //update only if value change
                    if (power === this.power && name === this.name && eventName === this.eventName && reference === this.reference && volume === this.volume && mute === this.mute) {
                        this.checkState();
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

                    //mqtt
                    const mqtt = mqttEnabled ? this.emit('mqtt', 'Info', this.devInfo) : false;
                    const mqtt1 = mqttEnabled ? this.emit('mqtt', 'State', devState) : false;

                    this.checkState();
                } catch (error) {
                    const debug = disableLogConnectError ? false : this.emit('error', `State error: ${error}, reconnect in ${this.refreshInterval}s.`);
                    this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                this.emit('stateChanged', false, this.name, this.eventName, this.reference, this.volume, this.mute);
                const debug = disableLogConnectError ? false : this.emit('disconnected', 'Disconnected.');
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

    saveDevInfo(path, devInfo) {
        return new Promise(async (resolve, reject) => {
            try {
                const info = JSON.stringify(devInfo, null, 2);
                await fsPromises.writeFile(path, info);
                const debug = this.debugLog ? this.emit('debug', `Saved device info: ${info}`) : false;

                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    saveInputs(channelsFile, inputsFile, allChannels, bouquets, inputs, getInputsFromDevice) {
        return new Promise(async (resolve, reject) => {
            try {
                const channels = JSON.stringify(allChannels, null, 2);
                await fsPromises.writeFile(channelsFile, channels);
                const debug = this.debugLog ? this.emit('debug', `Saved all channels: ${channels}`) : false;
            } catch (error) {
                this.emit('error', `Save all channels error: ${error}`);
            };

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
                        this.emit('message', `Bouquet: ${bouquetName}, was not found.`);
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

                const channels = JSON.stringify(channelArr, null, 2);
                await fsPromises.writeFile(inputsFile, channels);
                const debug = this.debugLog ? this.emit('debug', `Saved channels: ${channels}.`) : false;

                resolve(channelArr);
            } catch (error) {
                reject(error);
            };
        });
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.axiosInstance(apiUrl);
                await new Promise(resolve => setTimeout(resolve, 250));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = OPENWEBIF;
