'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const Mqtt = require('./mqtt.js');
const OpenWebIf = require('./openwebif.js')
const CONSTANS = require('./constans.json');
let Accessory, Characteristic, Service, Categories, UUID;

class OpenWebIfDevice extends EventEmitter {
    constructor(api, prefDir, config) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        UUID = api.hap.uuid;

        //device configuration
        this.name = config.name;
        this.host = config.host;
        this.port = config.port;
        this.inputs = config.inputs || [];
        this.buttons = config.buttons || [];
        this.sensorPower = config.sensorPower || false;
        this.sensorVolume = config.sensorVolume || false;
        this.sensorMute = config.sensorMute || false;
        this.sensorChannel = config.sensorChannel || false;
        this.sensorInputs = config.sensorInputs || [];
        this.auth = config.auth || false;
        this.user = config.user || '';
        this.pass = config.pass || '';
        this.enableDebugMode = config.enableDebugMode || false;
        this.disableLogInfo = config.disableLogInfo || false;
        this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
        this.disableLogConnectError = config.disableLogConnectError || false;
        this.infoButtonCommand = config.infoButtonCommand || '139';
        this.volumeControl = config.volumeControl >= 0 ? config.volumeControl : -1;
        this.refreshInterval = config.refreshInterval || 5;
        this.mqttEnabled = config.enableMqtt || false;
        this.mqttHost = config.mqttHost;
        this.mqttPort = config.mqttPort || 1883;
        this.mqttClientId = config.mqttClientId || `openwebif_${Math.random().toString(16).slice(3)}`;
        this.mqttPrefix = config.mqttPrefix;
        this.mqttAuth = config.mqttAuth || false;
        this.mqttUser = config.mqttUser;
        this.mqttPasswd = config.mqttPasswd;
        this.mqttDebug = config.mqttDebug || false;

        //get config info
        this.manufacturer = 'Manufacturer';
        this.modelName = 'Model Name';
        this.serialNumber = 'Serial Number';
        this.firmwareRevision = 'Firmware Revision';

        //setup variables
        this.startPrepareAccessory = true;
        this.mqttConnected = false;
        this.firstRun = true;

        this.services = [];
        this.inputsReference = [];
        this.inputsName = [];
        this.inputsDisplayType = [];
        this.inputsSwitchesButtons = [];
        this.inputSwitchesButtonServices = [];

        this.sensorInputsServices = [];
        this.sensorInputsReference = [];
        this.sensorInputsDisplayType = [];
        this.buttonsServices = [];

        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = true;
        this.inputIdentifier = 0;
        this.channelName = '';
        this.channelEventName = '';
        this.brightness = 0;
        this.sensorVolumeState = false;
        this.sensorInputState = false;
        this.playPause = false;

        this.devInfoFile = `${prefDir}/devInfo_${this.host.split('.').join('')}`;
        this.inputsFile = `${prefDir}/inputs_${this.host.split('.').join('')}`;
        this.inputsNamesFile = `${prefDir}/inputsNames_${this.host.split('.').join('')}`;
        this.inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;
        this.channelsFile = `${prefDir}/channels_${this.host.split('.').join('')}`;

        //mqtt client
        if (this.mqttEnabled) {
            this.mqtt = new Mqtt({
                host: this.mqttHost,
                port: this.mqttPort,
                clientId: this.mqttClientId,
                user: this.mqttUser,
                passwd: this.mqttPasswd,
                prefix: `${this.mqttPrefix}/${this.name}`,
                debug: this.mqttDebug
            });

            this.mqtt.on('connected', (message) => {
                this.emit('message', message);
                this.mqttConnected = true;
            })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        };

        //openwebif client
        this.openwebif = new OpenWebIf({
            host: this.host,
            port: this.port,
            user: this.user,
            pass: this.pass,
            auth: this.auth,
            disableLogConnectError: this.disableLogConnectError,
            debugLog: this.enableDebugMode,
            refreshInterval: this.refreshInterval,
            mqttEnabled: this.mqttEnabled
        });

        this.openwebif.on('deviceInfo', async (devInfo, channels, manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac) => {
            this.emit('message', `Connected.`);
            try {
                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                    this.emit('devInfo', `Model: ${modelName}`);
                    this.emit('devInfo', `Kernel: ${kernelVer}`);
                    this.emit('devInfo', `Chipset: ${chipset}`);
                    this.emit('devInfo', `Webif version: ${serialNumber}`);
                    this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                    this.emit('devInfo', `----------------------------------`)
                }

                if (this.informationService) {
                    this.informationService
                        .setCharacteristic(Characteristic.Manufacturer, manufacturer)
                        .setCharacteristic(Characteristic.Model, modelName)
                        .setCharacteristic(Characteristic.SerialNumber, serialNumber)
                        .setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
                };

                this.manufacturer = manufacturer;
                this.modelName = modelName;
                this.serialNumber = serialNumber;
                this.firmwareRevision = firmwareRevision;
                this.mac = mac;

                // Create files if it doesn't exist
                const object = JSON.stringify({});
                const array = JSON.stringify([]);
                if (!fs.existsSync(this.devInfoFile)) {
                    await fsPromises.writeFile(this.devInfoFile, object);
                }
                if (!fs.existsSync(this.inputsFile)) {
                    await fsPromises.writeFile(this.inputsFile, array);
                }
                if (!fs.existsSync(this.channelsFile)) {
                    await fsPromises.writeFile(this.channelsFile, array);
                }
                if (!fs.existsSync(this.inputsNamesFile)) {
                    await fsPromises.writeFile(this.inputsNamesFile, object);
                }
                if (!fs.existsSync(this.inputsTargetVisibilityFile)) {
                    await fsPromises.writeFile(this.inputsTargetVisibilityFile, object);
                }

                //save device info to the file
                try {
                    const devInfo1 = JSON.stringify(devInfo, null, 2);
                    await fsPromises.writeFile(this.devInfoFile, devInfo1);
                    const debug = this.enableDebugMode ? this.emit('debug', `Saved device info: ${devInfo1}`) : false;
                } catch (error) {
                    this.emit('error', `save device info error: ${error}`);
                };

                //save inputs to the file
                try {
                    const inputs = JSON.stringify(this.inputs, null, 2);
                    await fsPromises.writeFile(this.inputsFile, inputs);
                    const debug = this.enableDebugMode ? this.emit('debug', `Saved inputs: ${inputs}`) : false;
                } catch (error) {
                    this.emit('error', `save inputs error: ${error}`);
                };

                //save channels to the file
                try {
                    const channels1 = JSON.stringify(channels, null, 2);
                    await fsPromises.writeFile(this.channelsFile, channels1);
                    const debug = this.enableDebugMode ? this.emit('debug', `Saved channels: ${channels1}`) : false;
                } catch (error) {
                    this.emit('error', `save channels error: ${error}`);
                };
            } catch (error) {
                this.emit('error', `create files error: ${error}`);
            };
        })
            .on('stateChanged', async (power, name, eventName, reference, volume, mute) => {
                const inputIdentifier = this.inputsReference.includes(reference) ? this.inputsReference.findIndex(index => index === reference) : this.inputIdentifier;
                mute = power ? mute : true;

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                }

                if (this.speakerService) {
                    this.speakerService
                        .updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    if (this.volumeService) {
                        this.volumeService
                            .updateCharacteristic(Characteristic.Brightness, volume)
                            .updateCharacteristic(Characteristic.On, !mute);
                    }

                    if (this.volumeServiceFan) {
                        this.volumeServiceFan
                            .updateCharacteristic(Characteristic.RotationSpeed, volume)
                            .updateCharacteristic(Characteristic.On, !mute);
                    }
                }

                if (this.sensorPowerService) {
                    this.sensorPowerService
                        .updateCharacteristic(Characteristic.ContactSensorState, power)
                }

                if (this.sensorVolumeService) {
                    const state = power ? (this.volume !== volume) : false;
                    this.sensorVolumeService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorVolumeState = state;
                }

                if (this.sensorMuteService) {
                    const state = power ? this.mute : false;
                    this.sensorMuteService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (this.sensorInputService) {
                    const state = power ? (this.inputIdentifier !== inputIdentifier) : false;
                    this.sensorInputService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorInputState = state;
                }

                if (this.inputSwitchButtonServices) {
                    const switchServicesCount = this.inputSwitchButtonServices.length;
                    for (let i = 0; i < switchServicesCount; i++) {
                        const index = this.inputsSwitchesButtons[i];
                        const state = power ? (this.inputsReference[index] === reference) : false;
                        this.inputSwitchButtonServices[i]
                            .updateCharacteristic(Characteristic.On, state);
                    }
                }

                if (this.sensorInputsServices) {
                    const servicesCount = this.sensorInputsServices.length;
                    for (let i = 0; i < servicesCount; i++) {
                        const state = power ? (this.sensorInputsReference[i] === reference) : false;
                        const displayType = this.sensorInputsDisplayType[i];
                        const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                        this.sensorInputsServices[i]
                            .updateCharacteristic(characteristicType, state);
                    }
                }

                this.power = power;
                this.channelName = name;
                this.channelEventName = eventName;
                this.reference = reference;
                this.volume = volume;
                this.mute = mute;
                this.inputIdentifier = inputIdentifier;

                //start prepare accessory
                if (this.startPrepareAccessory) {
                    try {
                        const accessory = await this.prepareAccessory();
                        this.emit('publishAccessory', accessory);
                        this.startPrepareAccessory = false;
                    } catch (error) {
                        this.emit('error', `Prepare accessory error: ${error}`);
                    };
                };
            })
            .on('message', (message) => {
                this.emit('message', message);
            })
            .on('debug', (debug) => {
                this.emit('debug', debug);
            })
            .on('error', (error) => {
                this.emit('error', error);
            })
            .on('mqtt', (topic, message) => {
                const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
            })
            .on('disconnected', (message) => {
                this.emit('message', message);
            });
    }

    //prepare accessory
    prepareAccessory() {
        return new Promise((resolve, reject) => {
            try {
                //accessory
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare accessory`);
                const accessoryName = this.name;
                const accessoryUUID = UUID.generate(this.mac);
                const accessoryCategory = Categories.TV_SET_TOP_BOX;
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //information service
                const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Prepare information service`);
                this.informationService = accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                    .setCharacteristic(Characteristic.Model, this.modelName)
                    .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                    .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);
                this.services.push(this.informationService);

                //prepare television service
                const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Prepare television service`);
                this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
                this.televisionService.getCharacteristic(Characteristic.ConfiguredName)
                    .onGet(async () => {
                        const info = this.disableLogInfo ? false : this.emit('message', `Accessory Name: ${accessoryName}.`);
                        return accessoryName;
                    })
                    .onSet(async (value) => {
                        try {
                            this.name = value;
                            const info = this.disableLogInfo ? false : this.emit('message', `set Accessory Name: ${value}`);
                        } catch (error) {
                            this.emit('error', `set Brightness error: ${error}`);
                        };
                    });
                this.televisionService.getCharacteristic(Characteristic.SleepDiscoveryMode)
                    .onGet(async () => {
                        const state = 1;
                        const info = this.disableLogInfo ? false : this.emit('message', `Discovery Mode: ${state ? 'Always discoverable' : 'Not discoverable'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            const info = this.disableLogInfo ? false : this.emit('message', `set Discovery Mode: ${state ? 'Always discoverable' : 'Not discoverable'}`);
                        } catch (error) {
                            this.emit('error', `set Discovery Mode error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        const info = this.disableLogInfo ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            const newState = state ? '4' : '5';
                            const setPower = state != this.power ? await this.openwebif.send(CONSTANS.ApiUrls.SetPower + newState) : false;
                            const info = this.disableLogInfo || (state === this.power) ? false : this.emit('message', `set Power: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Power error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                    .onGet(async () => {
                        const inputIdentifier = this.inputIdentifier;
                        const channelEventName = this.channelEventName;
                        const inputName = this.inputsName[inputIdentifier];
                        const inputReference = this.inputsReference[inputIdentifier];
                        const info = this.disableLogInfo ? false : this.emit('message', `Channel: ${inputName}, Event: ${channelEventName}, Reference: ${inputReference}`);
                        return inputIdentifier;
                    })
                    .onSet(async (inputIdentifier) => {
                        try {
                            const inputName = this.inputsName[inputIdentifier];
                            const inputReference = this.inputsReference[inputIdentifier];

                            switch (this.power) {
                                case false:
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                    this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                                    break;
                                case true:
                                    await this.openwebif.send(CONSTANS.ApiUrls.SetChannel + inputReference);
                                    const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Channel: ${inputName}, Reference: ${inputReference}`);
                                    break;
                            }
                        } catch (error) {
                            this.emit('error', `set Channel error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.RemoteKey)
                    .onSet(async (command) => {
                        try {
                            switch (command) {
                                case Characteristic.RemoteKey.REWIND:
                                    command = '168';
                                    break;
                                case Characteristic.RemoteKey.FAST_FORWARD:
                                    command = '159';
                                    break;
                                case Characteristic.RemoteKey.NEXT_TRACK:
                                    command = '407';
                                    break;
                                case Characteristic.RemoteKey.PREVIOUS_TRACK:
                                    command = '412';
                                    break;
                                case Characteristic.RemoteKey.ARROW_UP:
                                    command = '103';
                                    break;
                                case Characteristic.RemoteKey.ARROW_DOWN:
                                    command = '108';
                                    break;
                                case Characteristic.RemoteKey.ARROW_LEFT:
                                    command = '105';
                                    break;
                                case Characteristic.RemoteKey.ARROW_RIGHT:
                                    command = '106';
                                    break;
                                case Characteristic.RemoteKey.SELECT:
                                    command = '352';
                                    break;
                                case Characteristic.RemoteKey.BACK:
                                    command = '174';
                                    break;
                                case Characteristic.RemoteKey.EXIT:
                                    command = '174';
                                    break;
                                case Characteristic.RemoteKey.PLAY_PAUSE:
                                    command = this.playPause ? '119' : '207';
                                    this.playPause = !this.playPause;
                                    break;
                                case Characteristic.RemoteKey.INFORMATION:
                                    command = this.infoButtonCommand;
                                    break;
                            }

                            await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Remote Key: ${command}`);
                        } catch (error) {
                            this.emit('error', `set Remote Key error: ${error}`);
                        };
                    });

                //optional television characteristics
                this.televisionService.getCharacteristic(Characteristic.Brightness)
                    .onGet(async () => {
                        const brightness = this.brightness;
                        return brightness;
                    })
                    .onSet(async (value) => {
                        try {
                            const brightness = value;
                            const setBrightness = false
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Brightness: ${value}`);
                        } catch (error) {
                            this.emit('error', `set Brightness error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
                    .onGet(async () => {
                        const state = 0;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Closed Captions: ${state}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Closed Ccaptions: ${state}`);
                    });

                this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
                    .onGet(async () => {
                        //apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
                        const value = 0;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Current Media State: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        return value;
                    });

                this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
                    .onGet(async () => {
                        const value = 0;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Target Media State: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            const newMediaState = value;
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Target Media State: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        } catch (error) {
                            this.emit('error', `set Target Media state error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
                    .onSet(async (command) => {
                        try {
                            switch (command) {
                                case Characteristic.PowerModeSelection.SHOW:
                                    command = '139';
                                    break;
                                case Characteristic.PowerModeSelection.HIDE:
                                    command = '174';
                                    break;
                            }

                            await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Power Mode Selection: ${command === '139' ? 'SHOW' : 'HIDE'}`);
                        } catch (error) {
                            this.emit('error', `set Power Mode Selection error: ${error}`);
                        };
                    });

                this.services.push(this.televisionService);
                accessory.addService(this.televisionService);

                //prepare speaker service
                const debug3 = !this.enableDebugMode ? false : this.emit('debug', `Prepare speaker service`);
                this.speakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
                this.speakerService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    })
                    .onSet(async (state) => {
                    });

                this.speakerService.getCharacteristic(Characteristic.VolumeControlType)
                    .onGet(async () => {
                        const state = 3; //none, relative, relative with current, absolute
                        return state;
                    });

                this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
                    .onSet(async (command) => {
                        try {
                            switch (command) {
                                case Characteristic.VolumeSelector.INCREMENT:
                                    command = '115';
                                    break;
                                case Characteristic.VolumeSelector.DECREMENT:
                                    command = '114';
                                    break;
                            }

                            await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Volume Selector: ${command}`);
                        } catch (error) {
                            this.emit('error', `set Volume Selector command error: ${error}`);
                        };
                    });

                this.speakerService.getCharacteristic(Characteristic.Volume)
                    .onGet(async () => {
                        const volume = this.volume;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Volume: ${volume}`);
                        return volume;
                    })
                    .onSet(async (value) => {
                        try {
                            if (value === 0 || value === 100) {
                                value = this.volume;
                            }

                            await this.openwebif.send(CONSTANS.ApiUrls.SetVolume + value);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Volume: ${value}`);
                        } catch (error) {
                            this.emit('error', `set Volume level error: ${error}`);
                        };
                    });

                this.speakerService.getCharacteristic(Characteristic.Mute)
                    .onGet(async () => {
                        const state = this.mute;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Mute: ${state ? 'ON' : 'OFF'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            await this.openwebif.send(CONSTANS.ApiUrls.ToggleMute);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Mute error: ${error}`);
                        };
                    });

                this.services.push(this.tvSpeakerService);
                accessory.addService(this.speakerService);

                //prepare inputs service
                const savedInputs = fs.readFileSync(this.inputsFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsFile)) : this.inputs;
                const debug4 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs: ${JSON.stringify(savedInputs, null, 2)}`) : false;

                const savedInputsNames = fs.readFileSync(this.inputsNamesFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
                const debug5 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

                const savedInputsTargetVisibility = fs.readFileSync(this.inputsTargetVisibilityFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
                const debug6 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(savedInputsTargetVisibility, null, 2)}`) : false;

                //check possible inputs and possible inputs count (max 80)
                const inputs = savedInputs;
                const inputsCount = inputs.length;
                const possibleInputsCount = 90 - this.services.length;
                const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
                for (let i = 0; i < maxInputsCount; i++) {
                    //input
                    const input = inputs[i];

                    //get input reference
                    const inputReference = input.reference;

                    //get input name		
                    const inputName = savedInputsNames[inputReference] || input.name;

                    //get input switch
                    const inputDisplayType = input.displayType >= 0 ? input.displayType : -1;

                    //get input type
                    const inputType = 0;

                    //get input configured
                    const isConfigured = 1;

                    //get input visibility state
                    const currentVisibility = savedInputsTargetVisibility[inputReference] || 0;

                    if (inputReference && inputName) {
                        const inputService = new Service.InputSource(inputName, `Input ${i}`);
                        inputService
                            .setCharacteristic(Characteristic.Identifier, i)
                            .setCharacteristic(Characteristic.Name, inputName)
                            .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                            .setCharacteristic(Characteristic.InputSourceType, inputType)
                            .setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)

                        inputService.getCharacteristic(Characteristic.ConfiguredName)
                            .onGet(async () => {
                                return inputName;
                            })
                            .onSet(async (value) => {
                                try {
                                    savedInputsNames[inputReference] = value;
                                    const newCustomName = JSON.stringify(savedInputsNames, null, 2);

                                    await fsPromises.writeFile(this.inputsNamesFile, newCustomName);
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved Input, Name: ${value}, Reference: ${inputReference}`) : false;
                                    inputService.setCharacteristic(Characteristic.Name, value);
                                } catch (error) {
                                    this.emit('error', `save Input Name error: ${error}`);
                                }
                            });

                        inputService
                            .getCharacteristic(Characteristic.TargetVisibilityState)
                            .onGet(async () => {
                                return currentVisibility;
                            })
                            .onSet(async (state) => {
                                try {
                                    savedInputsTargetVisibility[inputReference] = state;
                                    const newTargetVisibility = JSON.stringify(savedInputsTargetVisibility, null, 2);

                                    await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility);
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved Input: ${inputName}, Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
                                    inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
                                } catch (error) {
                                    this.emit('error', `save Target Visibility error: ${error}`);
                                }
                            });

                        this.inputsReference.push(inputReference);
                        this.inputsName.push(inputName);
                        this.inputsDisplayType.push(inputDisplayType);
                        const pushInputSwitchIndex = inputDisplayType >= 0 ? this.inputsSwitchesButtons.push(i) : false;

                        this.televisionService.addLinkedService(inputService);
                        this.services.push(inputService);
                        accessory.addService(inputService);
                    } else {
                        this.emit('message', `Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);

                    };
                }

                //prepare volume service
                if (this.volumeControl >= 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume service`);

                    if (this.volumeControl === 0) {
                        this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
                        this.volumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume`);
                        this.volumeService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (volume) => {
                                this.speakerService.setCharacteristic(Characteristic.Volume, volume);
                            });
                        this.volumeService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = !this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.speakerService.setCharacteristic(Characteristic.Mute, !state);
                            });

                        this.services.push(this.volumeService);
                        accessory.addService(this.volumeService);
                    }

                    if (this.volumeControl === 1) {
                        this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume`);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (volume) => {
                                this.speakerService.setCharacteristic(Characteristic.Volume, volume);
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = !this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.speakerService.setCharacteristic(Characteristic.Mute, !state);
                            });

                        this.services.push(this.volumeServiceFan);
                        accessory.addService(this.volumeServiceFan);
                    }
                }

                //prepare sensor service
                if (this.sensorPower) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare power sensor service`);
                    this.sensorPowerService = new Service.ContactSensor(`${accessoryName} Power Sensor`, `Power Sensor`);
                    this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                    this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power;
                            return state;
                        });
                    this.services.push(this.sensorPowerService);
                    accessory.addService(this.sensorPowerService);
                };

                if (this.sensorVolume) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume sensor service`);
                    this.sensorVolumeService = new Service.ContactSensor(`${accessoryName} Volume Sensor`, `Volume Sensor`);
                    this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                    this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.sensorVolumeState;
                            return state;
                        });
                    this.services.push(this.sensorVolumeService);
                    accessory.addService(this.sensorVolumeService);
                };

                if (this.sensorMute) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare mute sensor service`);
                    this.sensorMuteService = new Service.ContactSensor(`${accessoryName} Mute Sensor`, `Mute Sensor`);
                    this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                    this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.mute : false;
                            return state;
                        });
                    this.services.push(this.sensorMuteService);
                    accessory.addService(this.sensorMuteService);
                };

                if (this.sensorInput) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare input sensor service`);
                    this.sensorInputService = new Service.ContactSensor(`${accessoryName} Input Sensor`, `Input Sensor`);
                    this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                    this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.sensorInputState;
                            return state;
                        });
                    this.services.push(this.sensorInputService);
                    accessory.addService(this.sensorInputService);
                };

                //prepare inputs switch sensor service
                const inputsSwitchesButtons = this.inputsSwitchesButtons;
                const inputsSwitchesButtonsCount = inputsSwitchesButtons.length;
                const possibleInputsSwitchesButtonsCount = 99 - this.services.length;
                const maxInputsSwitchesButtonsCount = inputsSwitchesButtonsCount >= possibleInputsSwitchesButtonsCount ? possibleInputsSwitchesButtonsCount : inputsSwitchesButtonsCount;
                if (maxInputsSwitchesButtonsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare button service`);
                    for (let i = 0; i < maxInputsSwitchesButtonsCount; i++) {
                        //get switch
                        const index = inputsSwitchesButtons[i];

                        //get switch name		
                        const inputName = this.inputsName[index];

                        //get switch reference
                        const inputReference = this.inputsReference[index];

                        //get switch display type
                        const inputDisplayType = this.inputsDisplayType[index] >= 0 ? this.inputsDisplayType[index] : -1;

                        if (inputDisplayType >= 0) {
                            if (inputReference && inputName) {
                                const serviceType = [Service.Outlet, Service.Switch][inputDisplayType];
                                const inputSwitchButtonService = new serviceType(`${accessoryName} ${inputName}`, `Switch ${i}`);
                                inputSwitchButtonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                inputSwitchButtonService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${inputName}`);
                                inputSwitchButtonService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = this.power ? (inputReference === this.reference) : false;
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            const setSwitchInput = state ? await this.openwebif.send(CONSTANS.ApiUrls.SetChannel + inputReference) : false;
                                            const debug = this.enableDebugMode ? this.emit('debug', `Set Channel Name: ${inputName}, Reference: ${inputReference}`) : false;
                                        } catch (error) {
                                            this.emit('error', `set Channel error: ${error}`);
                                        };
                                    });

                                this.inputSwitchesButtonServices.push(inputSwitchButtonService);
                                this.services.push(inputSwitchButtonService);
                                accessory.addService(this.inputSwitchesButtonServices[i]);
                            } else {
                                this.emit('message', `Input Button Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);
                            };
                        }
                    }
                }

                //prepare sonsor service
                const sensorInputs = this.sensorInputs;
                const sensorInputsCount = sensorInputs.length;
                const possibleSensorInputsCount = 99 - this.services.length;
                const maxSensorInputsCount = sensorInputsCount >= possibleSensorInputsCount ? possibleSensorInputsCount : sensorInputsCount;
                if (maxSensorInputsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensor service`);
                    for (let i = 0; i < maxSensorInputsCount; i++) {
                        //get sensor
                        const sensorInput = sensorInputs[i];

                        //get sensor name		
                        const sensorInputName = sensorInput.name;

                        //get sensor reference
                        const sensorInputReference = sensorInput.reference;

                        //get sensor display type
                        const sensorInputDisplayType = sensorInput.displayType >= 0 ? sensorInput.displayType : -1;

                        if (sensorInputDisplayType >= 0) {
                            if (sensorInputName && sensorInputReference) {
                                const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                                const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                                const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${i}`);
                                sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${sensorInputName}`);
                                sensorInputService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = this.power ? (sensorInputReference === this.reference) : false;
                                        return state;
                                    });

                                this.sensorInputsReference.push(sensorInputReference);
                                this.sensorInputsDisplayType.push(sensorInputDisplayType);
                                this.sensorInputsServices.push(sensorInputService);
                                this.services.push(sensorInputService);
                                accessory.addService(this.sensorInputsServices[i]);
                            } else {
                                this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
                            };
                        }
                    }
                }

                //prepare buttons service
                const buttons = this.buttons;
                const buttonsCount = buttons.length;
                const possibleButtonsCount = 99 - this.services.length;
                const maxButtonsCount = buttonsCount >= possibleButtonsCount ? possibleButtonsCount : buttonsCount;
                if (maxButtonsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs button service`);
                    for (let i = 0; i < maxButtonsCount; i++) {
                        //get button
                        const button = buttons[i];

                        //get button name
                        const buttonName = button.name;

                        //get button mode
                        const buttonMode = button.mode;

                        //get button command
                        const buttonReference = button.reference;

                        //get button command
                        const buttonCommand = button.command;

                        //get button reference/command
                        const buttonReferenceCommand = buttonMode ? buttonCommand : buttonReference;

                        //get button display type
                        const buttonDisplayType = button.displayType >= 0 ? button.displayType : -1;

                        if (buttonDisplayType >= 0) {
                            if (buttonName && buttonReferenceCommand && buttonMode) {
                                const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
                                const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${buttonName}`);
                                buttonService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        let state = false;
                                        switch (buttonMode) {
                                            case 0:
                                                state = this.power ? (buttonReference === this.reference) : false;
                                                break;
                                            case 1:
                                                state = false;
                                                break;
                                        };
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            let url = '';
                                            switch (buttonMode) {
                                                case 0:
                                                    url = CONSTANS.ApiUrls.SetChannel + buttonReferenceCommand;
                                                    break;
                                                case 1:
                                                    url = CONSTANS.ApiUrls.SetRcCommand + buttonReferenceCommand;
                                                    break;
                                            };

                                            const send = state ? await this.openwebif.send(url) : false;
                                            const debug = this.enableDebugMode ? this.emit('debug', `set ${['Channel', 'Command'][buttonMode]} Name: ${buttonName}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand}`) : false;

                                            await new Promise(resolve => setTimeout(resolve, 300));
                                            const setChar = buttonMode === 1 ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
                                        } catch (error) {
                                            this.emit('error', `set ${['Channel', 'Command'][buttonMode]} error: ${error}`);
                                        };
                                    });
                                this.buttonsServices.push(buttonService);
                                this.services.push(buttonService);
                                accessory.addService(this.buttonsServices[i]);
                            } else {
                                this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand ? buttonReferenceCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}..`);
                            };
                        }
                    };
                }

                this.firstRun = false;
                resolve(accessory);
            } catch (error) {
                reject(error)
            };
        });
    }
};
module.exports = OpenWebIfDevice;
