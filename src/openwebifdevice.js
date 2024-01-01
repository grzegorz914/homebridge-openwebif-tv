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

        //get config info
        this.manufacturer = 'Manufacturer';
        this.modelName = 'Model Name';
        this.serialNumber = 'Serial Number';
        this.firmwareRevision = 'Firmware Revision';

        //setup variables
        this.mqttConnected = false;
        this.firstRun = true;

        this.inputsConfigured = [];
        this.inputsSwitchesButtons = [];
        this.sensorInputs = [];

        this.allServices = [];
        this.inputsSwitchesButtonsService = [];
        this.sensorsInputsServices = [];
        this.buttonsServices = [];

        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = true;
        this.inputIdentifier = 0;
        this.brightness = 0;
        this.sensorVolumeState = false;
        this.sensorInputState = false;
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
            disableLogConnectError: this.disableLogConnectError,
            debugLog: this.enableDebugMode,
            refreshInterval: this.refreshInterval,
            mqttEnabled: this.mqttEnabled
        });

        this.openwebif.on('deviceInfo', async (devInfo, allChannels, manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac) => {
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

            this.manufacturer = manufacturer;
            this.modelName = modelName;
            this.serialNumber = serialNumber;
            this.firmwareRevision = firmwareRevision;
            this.mac = mac;

            //save device info to the file
            try {
                const devInfo1 = JSON.stringify(devInfo, null, 2);
                await fsPromises.writeFile(this.devInfoFile, devInfo1);
                const debug = this.enableDebugMode ? this.emit('debug', `Saved device info: ${devInfo1}`) : false;
            } catch (error) {
                this.emit('error', `save device info error: ${error}`);
            };

            //save all channels to the file
            try {
                const channels = JSON.stringify(allChannels, null, 2);
                await fsPromises.writeFile(this.channelsFile, channels);
                const debug = this.enableDebugMode ? this.emit('debug', `Saved all channels: ${channels}`) : false;
            } catch (error) {
                this.emit('error', `Save all channels error: ${error}`);
            };

            if (!this.getInputsFromDevice) {
                try {
                    const channels = JSON.stringify(this.inputs, null, 2);
                    await fsPromises.writeFile(this.inputsFile, channels);
                    const debug = this.enableDebugMode ? this.emit('debug', `Saved channels: ${channels}.`) : false;
                } catch (error) {
                    this.emit('error', `Save channels error: ${error}`);

                };
                return;
            };

            //save channels by bouquet to the file
            const bouquetChannelsArr = [];
            for (let i = 0; i < this.bouquets.length; i++) {
                const bouquet = this.bouquets[i];
                const bouquetName = bouquet.name;
                const displayType = bouquet.displayType;
                const bouquetChannels = allChannels.services.find(service => service.servicename === bouquetName);

                if (bouquetChannels) {
                    for (const channel of bouquetChannels.subservices) {
                        const pos = channel.pos;
                        const name = channel.servicename;
                        const reference = channel.servicereference;

                        const obj = {
                            'pos': pos,
                            'name': name,
                            'reference': reference,
                            'displayType': displayType
                        }
                        bouquetChannelsArr.push(obj);
                    };
                } else {
                    this.emit('message', `Bouquet: ${bouquetName}, was not found.`);
                }
            }

            if (bouquetChannelsArr.length === 0) {
                try {
                    const channels = JSON.stringify(this.inputs, null, 2);
                    await fsPromises.writeFile(this.inputsFile, channels);
                    const debug = this.enableDebugMode ? this.emit('debug', `Saved channels: ${channels}.`) : false;
                } catch (error) {
                    this.emit('error', `Save channels error: ${error}`);
                };
                return;
            }

            try {
                const channels = JSON.stringify(bouquetChannelsArr, null, 2);
                await fsPromises.writeFile(this.inputsFile, channels);
                const debug = this.enableDebugMode ? this.emit('debug', `Saved channels by bouquet: ${this.bouquetName}, channels: ${channels}.,`) : false;
            } catch (error) {
                this.emit('error', `Save channels by bouquet: ${this.bouquetName}, error: ${error}`);
            };
        })
            .on('stateChanged', (power, name, eventName, reference, volume, mute) => {
                const index = this.inputsConfigured.findIndex(input => input.reference === reference) ?? -1;
                const inputIdentifier = index !== -1 ? this.inputsConfigured[index].identifier : this.inputIdentifier;
                mute = power ? mute : true;

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.Active, power)
                }

                if (this.televisionService && inputIdentifier !== -1) {
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

                if (this.sensorInputService && inputIdentifier !== -1) {
                    const state = power ? (this.inputIdentifier !== inputIdentifier) : false;
                    this.sensorInputService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorInputState = state;
                }

                if (this.inputSwitchButtonServices) {
                    const switchServicesCount = this.inputSwitchButtonServices.length;
                    for (let i = 0; i < switchServicesCount; i++) {
                        const index = this.inputsSwitchesButtons[i];
                        const state = power ? (this.inputsConfigured[index].reference === reference) : false;
                        this.inputSwitchButtonServices[i]
                            .updateCharacteristic(Characteristic.On, state);
                    }
                }

                if (reference !== undefined) {
                    this.reference = reference;
                    if (this.sensorsInputsServices) {
                        const servicesCount = this.sensorsInputsServices.length;
                        for (let i = 0; i < servicesCount; i++) {
                            const state = power ? (this.sensorInputs[i].reference === reference) : false;
                            const displayType = this.sensorInputs[i].displayType;
                            const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                            this.sensorsInputsServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }
                }

                this.inputIdentifier = inputIdentifier;
                this.power = power;
                this.volume = volume;
                this.mute = mute;
            })
            .on('prepareAccessory', async () => {
                try {
                    //read inputs file
                    try {
                        const data = await fsPromises.readFile(this.inputsFile);
                        this.savedInputs = data.length > 0 ? JSON.parse(data) : this.inputs;
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels: ${JSON.stringify(this.savedInputs, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved Inputs error: ${error}`);
                    };

                    //read inputs names from file
                    try {
                        const data = await fsPromises.readFile(this.inputsNamesFile);
                        this.savedInputsNames = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels: Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved Inputs/Channels Names error: ${error}`);
                    };

                    //read inputs visibility from file
                    try {
                        const data = await fsPromises.readFile(this.inputsTargetVisibilityFile);
                        this.savedInputsTargetVisibility = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels: Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved Inputs/Channels Target Visibility error: ${error}`);
                    };

                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const accessory = await this.prepareAccessory();
                    this.emit('publishAccessory', accessory);
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
                        const info = this.disableLogInfo ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
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
                        const inputName = this.inputsConfigured[inputIdentifier].name;
                        const inputReference = this.inputsConfigured[inputIdentifier].reference;
                        const info = this.disableLogInfo ? false : this.emit('message', `Channel: ${inputName}, Reference: ${inputReference}`);
                        return inputIdentifier;
                    })
                    .onSet(async (inputIdentifier) => {
                        try {
                            const index = this.inputsConfigured.findIndex(input => input.identifier === inputIdentifier) ?? this.inputIdentifier;
                            const inputName = this.inputsConfigured[index].name;
                            const inputReference = this.inputsConfigured[index].reference;

                            switch (this.power) {
                                case false:
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                    const tryAgain = this.power ? false : this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
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

                this.allServices.push(this.tvSpeakerService);
                accessory.addService(this.speakerService);

                //prepare inputs service
                const debug4 = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs service`);

                 //check possible inputs count (max 85)
                const inputs = this.getInputsFromDevice ? this.savedInputs : this.inputs;
                const inputsCount = inputs.length;
                const possibleInputsCount = 85 - this.allServices.length;
                const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
                let inputIdentifier = 0;
                for (let i = 0; i < maxInputsCount; i++) {
                    //input
                    const input = inputs[i];

                    //get input reference
                    const inputReference = input.reference;

                    //get input name
                    const name = input.name ?? 'App/Input';
                    const savedInputsNames = this.savedInputsNames[inputReference] ?? false;
                    const inputName = !savedInputsNames ? name : savedInputsNames;

                    //get visibility
                    const currentVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                    input.identifier = inputIdentifier++;
                    input.name = inputName;
                    input.visibility = currentVisibility;
                    this.inputsConfigured.push(input);
                }

                //sort inputs list
                switch (this.inputsDisplayOrder) {
                    case 0:
                        this.inputsConfigured = this.inputsConfigured;
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

                for (const input of this.inputsConfigured) {
                    //get identifier
                    const inputIdentifier = input.identifier;

                    //get input reference
                    const inputReference = input.reference;

                    //get input name
                    const inputName = input.name;

                    //get input switch
                    const inputDisplayType = input.displayType >= 0 ? input.displayType : -1;

                    //get input type
                    const inputType = 0;

                    //get input configured
                    const isConfigured = 1;

                    //get input visibility state
                    const currentVisibility = input.visibility;
                    const targetVisibility = currentVisibility;

                    if (inputReference && inputName) {
                        const inputService = new Service.InputSource(`${inputName} ${inputIdentifier}`, `Input ${inputIdentifier}`);
                        inputService
                            .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                            .setCharacteristic(Characteristic.Name, inputName)
                            .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                            .setCharacteristic(Characteristic.InputSourceType, inputType)
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
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved Input, Name: ${value}, Reference: ${inputReference}`) : false;
                                } catch (error) {
                                    this.emit('error', `save Input Name error: ${error}`);
                                }
                            });

                        inputService
                            .getCharacteristic(Characteristic.TargetVisibilityState)
                            .onGet(async () => {
                                return targetVisibility;
                            })
                            .onSet(async (state) => {
                                if (state === this.savedInputsTargetVisibility[inputReference]) {
                                    return;
                                }

                                try {
                                    this.savedInputsTargetVisibility[inputReference] = state;
                                    await fsPromises.writeFile(this.inputsTargetVisibilityFile, JSON.stringify(this.savedInputsTargetVisibility, null, 2));
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved Input: ${inputName}, Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
                                } catch (error) {
                                    this.emit('error', `save Target Visibility error: ${error}`);
                                }
                            });
                        const pushInputSwitchIndex = inputDisplayType >= 0 ? this.inputsSwitchesButtons.push(inputIdentifier - 1) : false;

                        this.televisionService.addLinkedService(inputService);
                        this.allServices.push(inputService);
                        accessory.addService(inputService);
                    } else {
                        this.emit('message', `Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);

                    };
                }

                //sort inputs list
                const displayOrder = this.inputsConfigured.map(input => input.identifier);
                this.televisionService.setCharacteristic(Characteristic.DisplayOrder, Encode(1, displayOrder).toString('base64'));

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
                const inputsSwitchesButtons = this.inputsSwitchesButtons;
                const inputsSwitchesButtonsCount = inputsSwitchesButtons.length;
                const possibleInputsSwitchesButtonsCount = 99 - this.allServices.length;
                const maxInputsSwitchesButtonsCount = inputsSwitchesButtonsCount >= possibleInputsSwitchesButtonsCount ? possibleInputsSwitchesButtonsCount : inputsSwitchesButtonsCount;
                if (maxInputsSwitchesButtonsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare button service`);
                    for (let i = 0; i < maxInputsSwitchesButtonsCount; i++) {
                        //get switch
                        const index = inputsSwitchesButtons[i];

                        //get switch name		
                        const inputName = this.inputsConfigured[index].name;

                        //get switch reference
                        const inputReference = this.inputsConfigured[index].reference;

                        //get switch display type
                        const inputDisplayType = this.inputsConfigured[index].displayType >= 0 ? this.inputsConfigured[index].displayType : -1;

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

                                this.inputsSwitchesButtonsService.push(inputSwitchButtonService);
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

                                this.sensorInputs.push(sensorInput);
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
                                this.allServices.push(buttonService);
                                accessory.addService(buttonService);
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