import axios from 'axios';
import EventEmitter from 'events';
import Functions from './functions.js';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls } from './constants.js';

class OpenWebIf extends EventEmitter {
    constructor(config, devInfoFile, inputsFile, channelsFile) {
        super();
        const host = config.host;
        const port = config.port;
        const auth = config.auth?.enable || false;
        const user = config.auth?.user;
        const passwd = config.auth?.passwd;
        this.getInputsFromDevice = config.inputs?.getFromDevice;
        this.inputs = (config.inputs?.channels || []).filter(input => input.name && input.reference);
        this.bouquets = (config.inputs?.bouquets || []).filter(bouquet => bouquet.name);
        this.logWarn = config.log?.warn;
        this.logDebug = config.log?.debug;
        this.devInfoFile = devInfoFile;
        this.channelsFile = channelsFile;
        this.inputsFile = inputsFile;

        const baseUrl = `http://${host}:${port}`;
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 10000,
            withCredentials: auth,
            auth: {
                username: user,
                password: passwd
            }
        });

        this.functions = new Functions();
        this.power = false;
        this.name = '';
        this.eventName = '';
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.recording = false;
        this.streaming = false;
        this.devInfo = {};

        //lock flags
        this.locks = {
            checkChannels: false,
            checkState: false,
        };
        this.impulseGenerator = new ImpulseGenerator()
            .on('checkChannels', () => this.handleWithLock('checkChannels', async () => {
                await this.checkChannels();
            }))
            .on('checkState', () => this.handleWithLock('checkState', async () => {
                await this.checkState();
            }))
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });
    }


    async handleWithLock(lockKey, fn) {
        if (this.locks[lockKey]) return;

        this.locks[lockKey] = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks[lockKey] = false;
        }
    }

    async prepareInputs(deviceChannels, bouquets, inputs, getInputsFromDevice) {
        try {
            const channels = [];

            if (getInputsFromDevice) {
                const channelsMap = new Map(deviceChannels.map(channel => [channel.servicename, channel.subservices || []]));

                for (const bouquet of bouquets) {
                    const name = bouquet.name;
                    const displayType = bouquet.displayType ?? 0;
                    const namePrefix = bouquet.namePrefix ?? false;

                    const subservices = channelsMap.get(name) || [];
                    const validSubservices = subservices.filter(channel => channel.servicename && channel.servicereference);

                    if (validSubservices.length === 0 && this.logWarn) {
                        this.emit('warn', `No channels found in bouquet: ${name}`);
                        continue;
                    }

                    for (const channel of validSubservices) {
                        channels.push({
                            name: channel.servicename,
                            reference: channel.servicereference,
                            mode: 1,
                            displayType,
                            namePrefix
                        });
                    }
                }
            } else {
                for (const input of inputs) {

                    channels.push({
                        name: input.name,
                        reference: input.reference,
                        mode: 1,
                        displayType: input.displayType ?? 0,
                        namePrefix: input.namePrefix ?? false
                    });
                }
            }

            if (this.logWarn && channels.length === 0) this.emit('warn', `No channels found`);

            await this.functions.saveData(this.inputsFile, channels);
            return channels;
        } catch (error) {
            throw new Error(`Get inputs error: ${error.message || error}`);
        }
    }

    async checkChannels() {
        try {
            // Get all channels
            const channelsInfo = this.getInputsFromDevice ? await this.axiosInstance(ApiUrls.GetAllServices) : false;
            const deviceChannels = channelsInfo ? channelsInfo.data.services : [];

            // Prepare inputs
            const inputs = await this.prepareInputs(deviceChannels, this.bouquets, this.inputs, this.getInputsFromDevice);

            // Emit inputs
            this.emit('addRemoveOrUpdateInput', inputs, false);

            return true;
        } catch (error) {
            throw new Error(`Check channels error: ${error}`);
        }
    }

    async checkState() {
        try {
            const deviceState = await this.axiosInstance(ApiUrls.DeviceStatus);
            const devState = deviceState.data;
            if (this.logDebug) this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`);

            //mqtt
            this.emit('mqtt', 'Info', this.devInfo);
            this.emit('mqtt', 'State', devState);

            const power = devState.inStandby === 'false';
            const name = devState.currservice_station;
            const eventName = devState.currservice_name;
            const reference = devState.currservice_serviceref;
            const volume = devState.volume;
            const mute = devState.muted;
            const recording = devState.isRecording;
            const streaming = devState.isStreaming;

            //update only if value change
            if (power === this.power && name === this.name && eventName === this.eventName && reference === this.reference && volume === this.volume && mute === this.mute && recording === this.recording && streaming === this.streaming) return;

            this.power = power;
            this.name = name;
            this.eventName = eventName;
            this.reference = reference;
            this.volume = volume;
            this.mute = mute;
            this.recording = recording;
            this.streaming = streaming;

            //emit state changed
            this.emit('stateChanged', power, name, eventName, reference, volume, mute, recording, streaming);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error}`);
        }
    }

    async connect() {
        try {
            // Get device info
            const deviceInfo = await this.axiosInstance(ApiUrls.DeviceInfo);
            const devInfo = deviceInfo.data;
            if (this.logDebug) this.emit('debug', `Connect data: ${JSON.stringify(devInfo, null, 2)}`);

            const info = {
                manufacturer: devInfo.brand || 'undefined',
                modelName: devInfo.model || 'undefined',
                serialNumber: devInfo.webifver || 'undefined',
                firmwareRevision: devInfo.imagever || 'undefined',
                kernelVer: devInfo.kernelver || 'undefined',
                chipset: devInfo.chipset || 'undefined',
                adressMac: devInfo.ifaces?.[0]?.mac ?? false,
            };
            this.devInfo = info;

            // Save device info
            if (info.adressMac) {
                await this.functions.saveData(this.devInfoFile, info);
            }

            // Check channels
            await this.checkChannels();

            // Connect to deice success
            this.emit('success', `Connect Success`)

            // Emit device info
            this.emit('deviceInfo', info);

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error}`);

        }
    }

    async send(apiUrl) {
        try {
            await this.axiosInstance(apiUrl);
            if (this.logDebug) this.emit('debug', `Send data: ${apiUrl}`);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        }
    }
}
export default OpenWebIf;
