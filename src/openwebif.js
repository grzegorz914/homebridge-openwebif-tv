import { promises as fsPromises } from 'fs';
import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls } from './constants.js';

class OpenWebIf extends EventEmitter {
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
        this.enableDebugMode = config.enableDebugMode;

        const baseUrl = `http://${host}:${port}`;
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 15000,
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
                const logError = config.disableLogError ? false : this.emit('error', `Impulse generator error: ${error}`);
            };
        }).on('state', (state) => {
            const emitState = state ? this.emit('success', `Impulse generator started`) : this.emit('warn', `Impulse generator stopped`);
        });
    };

    async connect() {
        try {
            const deviceInfo = await this.axiosInstance(ApiUrls.DeviceInfo);
            const devInfo = deviceInfo.data;
            const debug = this.enableDebugMode ? this.emit('debug', `Connect data: ${JSON.stringify(devInfo, null, 2)}`) : false;
            this.devInfo = devInfo;

            const manufacturer = devInfo.brand || 'undefined';
            const modelName = devInfo.model || 'undefined';
            const serialNumber = devInfo.webifver || 'undefined';
            const firmwareRevision = devInfo.imagever || 'undefined';
            const kernelVer = devInfo.kernelver || 'undefined';
            const chipset = devInfo.chipset || 'undefined';
            const mac = devInfo.ifaces[0].mac || false;

            if (!mac) {
                this.emit('error', `Missing Mac Address`);
                return false;
            }

            //save device info to the file
            await this.saveData(this.devInfoFile, devInfo);

            //get all channels
            const channelsInfo = this.getInputsFromDevice ? await this.axiosInstance(ApiUrls.GetAllServices) : false;
            const allChannels = channelsInfo ? channelsInfo.data.services : false;
            const debug1 = this.enableDebugMode ? this.emit('debug', `Channels info: ${channelsInfo}`) : false;

            //prepare channels
            let channels = await this.getInputs(allChannels, this.bouquets, this.inputs, this.getInputsFromDevice);
            if (!channels) {
                this.emit('warn', `Found: 0 channels, adding 1 default channel`);
                channels = [{
                    name: "CNN HD",
                    reference: "1:0:1:1C8A:1CE8:71:820000:0:0:0::CNN HD",
                    displayType: 0
                }];
            };

            //save channels
            await this.saveData(this.inputsFile, channels);

            //connect to deice success
            this.emit('success', `Connect Success`)

            //emit device info
            this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac);

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error}`);

        };
    };

    async checkState() {
        try {
            const deviceState = await this.axiosInstance(ApiUrls.DeviceStatus);
            const devState = deviceState.data;
            const debug = this.enableDebugMode ? this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`) : false;

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
            throw new Error(`Check state error: ${error}`);
        };
    };

    async getInputs(allChannels, bouquets, inputs, getInputsFromDevice) {
        try {
            //get channels by bouquet
            const bouquetChannelsArr = [];
            if (getInputsFromDevice) {
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
                    } else {
                        this.emit('warn', `Bouquet: ${bouquetName}, was not found`);
                    }
                }
            }

            //chack duplicated channels
            const channelArr = [];
            const channelsArr = !getInputsFromDevice ? inputs : bouquetChannelsArr;
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
            const debug = this.enableDebugMode ? this.emit('debug', `Saved data: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        };
    };

    async send(apiUrl) {
        try {
            await this.axiosInstance(apiUrl);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        };
    };
};
export default OpenWebIf;
