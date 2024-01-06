'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const Mqtt = require('./mqtt.js');
const OpenWebIf = require('./openwebif.js')
const CONSTANS = require('./constans.json');
let Accessory, Characteristic, Service, Categories, Encode, UUID;

class OpenWebIfDevice extends EventEmitter {
    constructor(api, prefDir, config) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        UUID = api.hap.uuid;

        //device configuration
        this.name = config.name;
        this.host = config.host;
        this.port = config.port;
        this.getInputsFromDevice = config.getInputsFromDevice || false;
        this.bouquets = config.bouquets || [];
        this.inputsDisplayOrder = config.inputsDisplayOrder || 0;
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

        //external integrations
        this.mqttConnected = false;

        //services
        this.allServices = [];
        this.inputsSwitchesButtonsServices = [];
        this.sensorsInputsServices = [];
        this.buttonsServices = [];

        //inputs 
        this.inputsConfigured = [];
        this.inputsSwitchesButtonsConfigured = [];
        this.inputIdentifier = 1;

        //sensors
        this.sensorsInputsConfigured = [];
        this.sensorVolumeState = false;
        this.sensorInputState = false;

        //buttons
        this.buttonsConfigured = [];

        //state variable
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = true;
        this.brightness = 0;
        this.playPause = false;

        //check files exists, if not then create it
        const postFix = this.host.split('.').join('');
        this.devInfoFile = `${prefDir}/devInfo_${postFix}`;
        this.inputsFile = `${prefDir}/inputs_${postFix}`;
        this.inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
        this.inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;
        this.channelsFile = `${prefDir}/channels_${postFix}`;

        try {
            const files = [
                this.devInfoFile,
                this.inputsFile,
                this.inputsNamesFile,
                this.inputsTargetVisibilityFile,
                this.channelsFile
            ];

            files.forEach((file) => {
                if (!fs.existsSync(file)) {
                    fs.writeFileSync(file, '');
                }
            });
        } catch (error) {
            this.emit('error', `prepare files error: ${error}`);
        }

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
            inputs: this.inputs,
            bouquets: this.bouquets,
            devInfoFile: this.devInfoFile,
            channelsFile: this.channelsFile,
            inputsFile: this.inputsFile,
            getInputsFromDevice: this.getInputsFromDevice,
            disableLogConnectError: this.disableLogConnectError,
            debugLog: this.enableDebugMode,
            refreshInterval: this.refreshInterval,
            mqttEnabled: this.mqttEnabled
        });

        this.openwebif.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac) => {
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

            this.manufacturer = manufacturer || 'Manufacturer';
            this.modelName = modelName || 'Model Name';
            this.serialNumber = serialNumber || 'Serial Number';
            this.firmwareRevision = firmwareRevision || 'Firmware Revision';
            this.mac = mac;
        })
            .on('stateChanged', (power, name, eventName, reference, volume, mute) => {
                const index = this.inputsConfigured.findIndex(input => input.reference === reference) ?? -1;
                const inputIdentifier = index !== -1 ? this.inputsConfigured[index].identifier : this.inputIdentifier;
                mute = power ? mute : true;

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.Active, power)
                }

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier)
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

                if (reference !== undefined) {
                    if (this.inputsSwitchesButtonsServices) {
                        const switchServicesCount = this.inputsSwitchesButtonsServices.length;
                        for (let i = 0; i < switchServicesCount; i++) {
                            const state = power ? (this.inputsSwitchesButtonsConfigured[i].reference === reference) : false;
                            this.inputsSwitchesButtonsServices[i]
                                .updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (this.sensorsInputsServices) {
                        const servicesCount = this.sensorsInputsServices.length;
                        for (let i = 0; i < servicesCount; i++) {
                            const state = power ? (this.sensorsInputsConfigured[i].reference === reference) : false;
                            const displayType = this.sensorsInputsConfigured[i].displayType;
                            const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                            this.sensorsInputsServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }
                    this.reference = reference;
                }

                this.inputIdentifier = inputIdentifier;
                this.power = power;
                this.volume = volume;
                this.mute = mute;

                if (!this.disableLogInfo) {
                    this.emit('message', `Power: ${power ? 'ON' : 'OFF'}`);
                    this.emit('message', `Channel Name: ${name}`);
                    this.emit('message', `Event Name: ${eventName}`);
                    this.emit('message', `Reference: ${reference}`);
                    this.emit('message', `Volume: ${volume}%`);
                    this.emit('message', `Mute: ${mute ? 'ON' : 'OFF'}`);
                    this.emit('message', `Closed Captions: 0`);
                    this.emit('message', `Media State: ${['PLAY', 'PAUSE', 'STOPPED', 'LOADING', 'INTERRUPTED'][2]}`);
                };
            })
            .on('prepareAccessory', async () => {
                try {
                    //read inputs file
                    try {
                        const data = await fsPromises.readFile(this.inputsFile);
                        this.savedInputs = data.toString().trim() !== '' ? JSON.parse(data) : this.inputs;
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs/Channels: ${JSON.stringify(this.savedInputs, null, 2)}`);
                    } catch (error) {
                        this.emit('error', `Read saved Channels error: ${error}`);
                    };

                    //read inputs names from file
                    try {
                        const data = await fsPromises.readFile(this.inputsNamesFile);
                        this.savedInputsNames = data.toString().trim() !== '' ? JSON.parse(data) : {};
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs/Channels: Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);
                    } catch (error) {
                        this.emit('error', `Read saved Channels Names error: ${error}`);
                    };

                    //read inputs visibility from file
                    try {
                        const data = await fsPromises.readFile(this.inputsTargetVisibilityFile);
                        this.savedInputsTargetVisibility = data.toString().trim() !== '' ? JSON.parse(data) : {};
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs/Channels: Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);
                    } catch (error) {
                        this.emit('error', `Read saved Channels Target Visibility error: ${error}`);
                    };

                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const accessory = await this.prepareAccessory();
                    this.emit('publishAccessory', accessory);

                    //sort inputs list
                    const sortInputsDisplayOrder = this.televisionService ? await this.displayOrder() : false;
                } catch (error) {
                    this.emit('error', `Prepare accessory error: ${error}`);
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

    displayOrder() {
        return new Promise((resolve, reject) => {
            try {
                switch (this.inputsDisplayOrder) {
                    case 0:
                        this.inputsConfigured.sort((a, b) => a.identifier - b.identifier);
                        break;
                    case 1:
                        this.inputsConfigured.sort((a, b) => a.name.localeCompare(b.name));
                        break;
                    case 2:
                        this.inputsConfigured.sort((a, b) => b.name.localeCompare(a.name));
                        break;
                    case 3:
                        this.inputsConfigured.sort((a, b) => a.reference.localeCompare(b.reference));
                        break;
                    case 4:
                        this.inputsConfigured.sort((a, b) => b.reference.localeCompare(a.reference));
                        break;
                }
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Inputs display order: ${JSON.stringify(this.inputsConfigured, null, 2)}`);

                const displayOrder = this.inputsConfigured.map(input => input.identifier);
                this.televisionService.setCharacteristic(Characteristic.DisplayOrder, Encode(1, displayOrder).toString('base64'));
                resolve();
            } catch (error) {
                reject(error);
            };
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
                this.allServices.push(this.informationService);

                //prepare television service
                const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Prepare television service`);
                this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
                this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
                this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);
                this.televisionService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    })
                    .onSet(async (state) => {
                        if (this.power == state) {
                            return;
                        }

                        try {
                            const newState = state ? '4' : '5';
                            await this.openwebif.send(CONSTANS.ApiUrls.SetPower + newState);
                            const info = this.disableLogInfo ? false : this.emit('message', `set Power: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Power error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                    .onGet(async () => {
                        const inputIdentifier = this.inputIdentifier;
                        return inputIdentifier;
                    })
                    .onSet(async (activeIdentifier) => {
                        try {
                            const index = this.inputsConfigured.findIndex(input => input.identifier === activeIdentifier);
                            const inputName = this.inputsConfigured[index].name;
                            const inputReference = this.inputsConfigured[index].reference;

                            switch (this.power) {
                                case false:
                                    await new Promise(resolve => setTimeout(resolve, 4000));
                                    const tryAgain = this.power ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier) : false;
                                    break;
                                case true:
                                    await this.openwebif.send(CONSTANS.ApiUrls.SetChannel + inputReference);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Channel: ${inputName}, Reference: ${inputReference}`);
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
                            const info = this.disableLogInfo ? false : this.emit('message', `set Remote Key: ${command}`);
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
                            const info = this.disableLogInfo ? false : this.emit('message', `set Brightness: ${value}`);
                        } catch (error) {
                            this.emit('error', `set Brightness error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
                    .onGet(async () => {
                        const state = 0;
                        return state;
                    })
                    .onSet(async (state) => {
                        const info = this.disableLogInfo ? false : this.emit('message', `set Closed Ccaptions: ${state}`);
                    });

                this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
                    .onGet(async () => {
                        //apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
                        const value = 0;
                        return value;
                    });

                this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
                    .onGet(async () => {
                        const value = 0;
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            const newMediaState = value;
                            const info = this.disableLogInfo ? false : this.emit('message', `set Target Media State: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
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
                            const info = this.disableLogInfo ? false : this.emit('message', `set Power Mode Selection: ${command === '139' ? 'SHOW' : 'HIDE'}`);
                        } catch (error) {
                            this.emit('error', `set Power Mode Selection error: ${error}`);
                        };
                    });

                this.allServices.push(this.televisionService);
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
                            const info = this.disableLogInfo ? false : this.emit('message', `set Volume Selector: ${command}`);
                        } catch (error) {
                            this.emit('error', `set Volume Selector command error: ${error}`);
                        };
                    });

                this.speakerService.getCharacteristic(Characteristic.Volume)
                    .onGet(async () => {
                        const volume = this.volume;
                        return volume;
                    })
                    .onSet(async (value) => {
                        try {
                            if (value === 0 || value === 100) {
                                value = this.volume;
                            }

                            await this.openwebif.send(CONSTANS.ApiUrls.SetVolume + value);
                            const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${value}`);
                        } catch (error) {
                            this.emit('error', `set Volume level error: ${error}`);
                        };
                    });

                this.speakerService.getCharacteristic(Characteristic.Mute)
                    .onGet(async () => {
                        const state = this.mute;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            await this.openwebif.send(CONSTANS.ApiUrls.ToggleMute);
                            const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Mute error: ${error}`);
                        };
                    });

                this.allServices.push(this.tvSpeakerService);
                accessory.addService(this.speakerService);

                //prepare inputs service
                const debug4 = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs service`);

                //check possible inputs count (max 85)
                const inputs = this.getInputsFromDevice ? this.savedInputs : this.inputs;
                const inputsCount = inputs.length;
                const possibleInputsCount = 85 - this.allServices.length;
                const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
                for (let i = 0; i < maxInputsCount; i++) {
                    //input
                    const input = inputs[i];
                    const inputIdentifier = i + 1;

                    //get input reference
                    const inputReference = input.reference;

                    //get input name
                    const name = input.name ?? `Channel ${inputIdentifier}`;
                    const savedInputsNames = this.savedInputsNames[inputReference] ?? false;
                    const inputName = savedInputsNames ? savedInputsNames : name;
                    input.name = inputName;

                    //get input display rype
                    const inputDisplayType = input.displayType ?? -1;
                    input.displayType = inputDisplayType;

                    //get input type
                    const inputSourceType = 0;

                    //get input configured
                    const isConfigured = 1;

                    //get visibility
                    const currentVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;
                    input.visibility = currentVisibility;

                    //add identifier to the input
                    input.identifier = inputIdentifier;

                    //input service
                    if (inputName && inputReference) {
                        const inputService = new Service.InputSource(inputName, `Input ${inputIdentifier}`);
                        inputService
                            .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                            .setCharacteristic(Characteristic.Name, inputName)
                            .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                            .setCharacteristic(Characteristic.InputSourceType, inputSourceType)
                            .setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)

                        inputService.getCharacteristic(Characteristic.ConfiguredName)
                            .onGet(async () => {
                                return inputName;
                            })
                            .onSet(async (value) => {
                                if (value === this.savedInputsNames[inputReference]) {
                                    return;
                                }

                                try {
                                    this.savedInputsNames[inputReference] = value;
                                    await fsPromises.writeFile(this.inputsNamesFile, JSON.stringify(this.savedInputsNames, null, 2));
                                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved Input, Name: ${value}, Reference: ${inputReference}`);

                                    //sort inputs
                                    const index = this.inputsConfigured.findIndex(input => input.reference === inputReference);
                                    this.inputsConfigured[index].name = value;
                                    await this.displayOrder();
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
                                if (state === this.savedInputsTargetVisibility[inputReference]) {
                                    return;
                                }

                                try {
                                    this.savedInputsTargetVisibility[inputReference] = state;
                                    await fsPromises.writeFile(this.inputsTargetVisibilityFile, JSON.stringify(this.savedInputsTargetVisibility, null, 2));
                                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved Input: ${inputName}, Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`);
                                } catch (error) {
                                    this.emit('error', `save Target Visibility error: ${error}`);
                                }
                            });

                        this.inputsConfigured.push(input);
                        this.televisionService.addLinkedService(inputService);
                        this.allServices.push(inputService);
                        accessory.addService(inputService);
                    } else {
                        this.emit('message', `Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);
                    };
                }

                if (this.inputsConfigured.length === 0) {
                    this.emit('message', `No any inputs are configured, check your config and settings.`);
                    return;
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

                        this.allServices.push(this.volumeService);
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

                        this.allServices.push(this.volumeServiceFan);
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
                    this.allServices.push(this.sensorPowerService);
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
                    this.allServices.push(this.sensorVolumeService);
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
                    this.allServices.push(this.sensorMuteService);
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
                    this.allServices.push(this.sensorInputService);
                    accessory.addService(this.sensorInputService);
                };

                //prepare inputs switch sensor service
                const inputsSwitchesButtons = [];
                for (const inputSwitchButton of this.inputsConfigured) {
                    const pushInputSwitchIndex = inputSwitchButton.displayType >= 0 ? inputsSwitchesButtons.push(inputSwitchButton) : false;
                };

                const inputsSwitchesButtonsCount = inputsSwitchesButtons.length;
                const possibleInputsSwitchesButtonsCount = 99 - this.allServices.length;
                const maxInputsSwitchesButtonsCount = inputsSwitchesButtonsCount >= possibleInputsSwitchesButtonsCount ? possibleInputsSwitchesButtonsCount : inputsSwitchesButtonsCount;
                if (maxInputsSwitchesButtonsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare button service`);
                    for (let i = 0; i < maxInputsSwitchesButtonsCount; i++) {
                        //get switch
                        const inputSwitchButton = inputsSwitchesButtons[i];

                        //get switch name		
                        const inputName = inputSwitchButton.name;

                        //get switch reference
                        const inputReference = inputSwitchButton.reference;

                        //get switch display type
                        const inputDisplayType = inputSwitchButton.displayType >= 0 ? inputSwitchButton.displayType : -1;

                        //get sensor name prefix
                        const namePrefix = inputSwitchButton.namePrefix ?? false

                        if (inputDisplayType >= 0) {
                            if (inputReference && inputName) {
                                const serviceName = namePrefix ? `${accessoryName} ${inputName}` : inputName;
                                const serviceType = [Service.Outlet, Service.Switch][inputDisplayType];
                                const inputSwitchButtonService = new serviceType(serviceName, `Switch ${i}`);
                                inputSwitchButtonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                inputSwitchButtonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                                inputSwitchButtonService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = this.power ? (inputReference === this.reference) : false;
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            const setSwitchInput = state ? await this.openwebif.send(CONSTANS.ApiUrls.SetChannel + inputReference) : false;
                                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Set Channel Name: ${inputName}, Reference: ${inputReference}`);
                                        } catch (error) {
                                            this.emit('error', `set Channel error: ${error}`);
                                        };
                                    });

                                this.inputsSwitchesButtonsConfigured.push(inputSwitchButton)
                                this.inputsSwitchesButtonsServices.push(inputSwitchButtonService);
                                this.allServices.push(inputSwitchButtonService);
                                accessory.addService(inputSwitchButtonService);
                            } else {
                                this.emit('message', `Input Button Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);
                            };
                        }
                    }
                }

                //prepare sonsor service
                const sensorInputs = this.sensorInputs;
                const sensorInputsCount = sensorInputs.length;
                const possibleSensorInputsCount = 99 - this.allServices.length;
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

                        //get sensor name prefix
                        const namePrefix = sensorInput.namePrefix ?? false;

                        if (sensorInputDisplayType >= 0) {
                            if (sensorInputName && sensorInputReference) {
                                const serviceName = namePrefix ? `${accessoryName} ${sensorInputName}` : sensorInputName;
                                const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                                const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                                const sensorInputService = new serviceType(serviceName, `Sensor ${i}`);
                                sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                sensorInputService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                                sensorInputService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = this.power ? (sensorInputReference === this.reference) : false;
                                        return state;
                                    });

                                this.sensorsInputsConfigured.push(sensorInput);
                                this.sensorsInputsServices.push(sensorInputService);
                                this.allServices.push(sensorInputService);
                                accessory.addService(sensorInputService);
                            } else {
                                this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
                            };
                        }
                    }
                }

                //prepare buttons service
                const buttons = this.buttons;
                const buttonsCount = buttons.length;
                const possibleButtonsCount = 99 - this.allServices.length;
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

                        //get button name prefix
                        const namePrefix = button.namePrefix ?? false;

                        if (buttonDisplayType >= 0) {
                            if (buttonName && buttonReferenceCommand && buttonMode) {
                                const serviceName = namePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                                const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
                                const buttonService = new serviceType(serviceName, `Button ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
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
                                            const debug = !this.enableDebugMode ? false : this.emit('debug', `set ${['Channel', 'Command'][buttonMode]} Name: ${buttonName}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand}`);

                                            await new Promise(resolve => setTimeout(resolve, 300));
                                            const setChar = buttonMode === 1 ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
                                        } catch (error) {
                                            this.emit('error', `set ${['Channel', 'Command'][buttonMode]} error: ${error}`);
                                        };
                                    });

                                this.buttonsConfigured.push(button);
                                this.buttonsServices.push(buttonService);
                                this.allServices.push(buttonService);
                                accessory.addService(buttonService);
                            } else {
                                this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand ? buttonReferenceCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}..`);
                            };
                        }
                    };
                }

                resolve(accessory);
            } catch (error) {
                reject(error)
            };
        });
    }
};
module.exports = OpenWebIfDevice;
