'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const Mqtt = require('./mqtt.js');
const OpenWebIf = require('./openwebif.js')
const CONSTANTS = require('./constants.json');
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class OpenWebIfDevice extends EventEmitter {
    constructor(api, prefDir, device) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        AccessoryUUID = api.hap.uuid;

        //device configuration
        this.name = device.name;
        this.host = device.host;
        this.port = device.port;
        this.auth = device.auth || false;
        this.user = device.user || '';
        this.pass = device.pass || '';
        this.getInputsFromDevice = device.getInputsFromDevice || false;
        this.bouquets = device.bouquets || [];
        this.inputsDisplayOrder = device.inputsDisplayOrder || 0;
        this.inputs = device.inputs || [];
        this.buttons = device.buttons || [];
        this.sensorPower = device.sensorPower || false;
        this.sensorVolume = device.sensorVolume || false;
        this.sensorMute = device.sensorMute || false;
        this.sensorChannel = device.sensorChannel || false;
        this.sensorInputs = device.sensorInputs || [];
        this.enableDebugMode = device.enableDebugMode || false;
        this.disableLogInfo = device.disableLogInfo || false;
        this.disableLogDeviceInfo = device.disableLogDeviceInfo || false;
        this.disableLogConnectError = device.disableLogConnectError || false;
        this.infoButtonCommand = device.infoButtonCommand || '139';
        this.volumeControlNamePrefix = device.volumeControlNamePrefix || false;
        this.volumeControlName = device.volumeControlName || 'Volume';
        this.volumeControl = device.volumeControl || false;
        this.refreshInterval = device.refreshInterval * 1000 || 5000;
        this.mqtt = device.mqtt || {};

        //external integrations
        this.mqttConnected = false;

        //services
        this.allServices = [];
        this.inputsButtonsServices = [];
        this.sensorsInputsServices = [];
        this.buttonsServices = [];

        //inputs variable
        this.inputsConfigured = [];
        this.inputIdentifier = 1;
        this.inputsButtonsConfigured = [];

        //sensors variable
        this.sensorsInputsConfigured = [];
        for (const sensor of this.sensorInputs) {
            const sensorInputName = sensor.name ?? false;
            const sensorInputReference = sensor.reference ?? false;
            const sensorInputDisplayType = sensor.displayType ?? 0;
            if (sensorInputName && sensorInputReference && sensorInputDisplayType > 0) {
                sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                sensor.state = false;
                this.sensorsInputsConfigured.push(sensor);
            } else {
                const log = sensorInputDisplayType === 0 ? false : this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
            };
        }
        this.sensorsInputsConfiguredCount = this.sensorsInputsConfigured.length || 0;
        this.sensorVolumeState = false;
        this.sensorInputState = false;

        //buttons variable
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const buttonName = button.name ?? false;
            const buttonMode = button.mode ?? -1;
            const buttonReferenceCommand = [button.reference, button.command][buttonMode] ?? false;
            const buttonDisplayType = button.displayType ?? 0;
            if (buttonName && buttonMode >= 0 && buttonReferenceCommand && buttonDisplayType > 0) {
                button.serviceType = ['', Service.Outlet, Service.Switch][buttonDisplayType];
                button.state = false;
                this.buttonsConfigured.push(button);
            } else {
                const log = buttonDisplayType === 0 ? false : this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand ? buttonReferenceCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}.`);
            };
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;

        //state variable
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = true;
        this.brightness = 0;
        this.playPause = false;

        //check files exists, if not then create it
        const postFix = this.host.split('.').join('');
        const devInfoFile = `${prefDir}/devInfo_${postFix}`;
        const inputsFile = `${prefDir}/inputs_${postFix}`;
        const channelsFile = `${prefDir}/channels_${postFix}`;
        this.inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
        this.inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;

        try {
            const files = [
                devInfoFile,
                inputsFile,
                channelsFile,
                this.inputsNamesFile,
                this.inputsTargetVisibilityFile
            ];

            files.forEach((file) => {
                if (!fs.existsSync(file)) {
                    fs.writeFileSync(file, '');
                }
            });
        } catch (error) {
            this.emit('error', `prepare files error: ${error}`);
        }

        //openwebif client
        this.openwebif = new OpenWebIf({
            host: this.host,
            port: this.port,
            user: this.user,
            pass: this.pass,
            auth: this.auth,
            inputs: this.inputs,
            bouquets: this.bouquets,
            devInfoFile: devInfoFile,
            inputsFile: inputsFile,
            channelsFile: channelsFile,
            getInputsFromDevice: this.getInputsFromDevice,
            disableLogConnectError: this.disableLogConnectError,
            debugLog: this.enableDebugMode,
            refreshInterval: this.refreshInterval,
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

                //sensors
                if (this.sensorPowerService) {
                    this.sensorPowerService
                        .updateCharacteristic(Characteristic.ContactSensorState, power)
                }

                if (this.sensorVolumeService && volume !== this.volume) {
                    for (let i = 0; i < 2; i++) {
                        const state = power ? [true, false][i] : false;
                        this.sensorVolumeService
                            .updateCharacteristic(Characteristic.ContactSensorState, state)
                        this.sensorVolumeState = state;
                    }
                }

                if (this.sensorMuteService) {
                    const state = power ? mute : false;
                    this.sensorMuteService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (this.sensorInputService && reference !== this.reference) {
                    for (let i = 0; i < 2; i++) {
                        const state = power ? [true, false][i] : false;
                        this.sensorInputService
                            .updateCharacteristic(Characteristic.ContactSensorState, state)
                        this.sensorInputState = state;
                    }
                }

                if (this.sensorsInputsServices) {
                    for (let i = 0; i < this.sensorsInputsConfiguredCount; i++) {
                        const sensorInput = this.sensorsInputsConfigured[i];
                        const state = power ? sensorInput.reference === reference : false;
                        sensorInput.state = state;
                        const characteristicType = sensorInput.characteristicType;
                        this.sensorsInputsServices[i]
                            .updateCharacteristic(characteristicType, state);
                    }
                }

                //inputs buttons
                if (this.inputsButtonsServices) {
                    for (let i = 0; i < this.inputsButtonsConfigured.length; i++) {
                        const inputButton = this.inputsButtonsConfigured[i];
                        const state = power ? inputButton.reference === reference : false;
                        inputButton.state = state;
                        this.inputsButtonsServices[i]
                            .updateCharacteristic(Characteristic.On, state);
                    }
                }

                //buttons
                if (this.buttonsServices) {
                    for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                        const button = this.buttonsConfigured[i];
                        const state = this.power ? button.reference === reference : false;
                        button.state = state;
                        this.buttonsServices[i]
                            .updateCharacteristic(Characteristic.On, state);
                    }
                }

                this.inputIdentifier = inputIdentifier;
                this.power = power;
                this.reference = reference;
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
            .on('prepareAccessory', async (channels) => {
                //mqtt client
                const mqttEnabled = this.mqtt.enable || false;
                if (mqttEnabled) {
                    this.mqtt = new Mqtt({
                        host: this.mqtt.host,
                        port: this.mqtt.port || 1883,
                        clientId: this.mqtt.clientId || `openwebif_${Math.random().toString(16).slice(3)}`,
                        prefix: `${this.mqtt.prefix}/${device.name}`,
                        user: this.mqtt.user,
                        passwd: this.mqtt.passwd,
                        debug: this.mqtt.debug || false
                    });

                    this.mqtt.on('connected', (message) => {
                        this.emit('message', message);
                        this.mqttConnected = true;
                    })
                        .on('subscribed', (message) => {
                            this.emit('message', message);
                        })
                        .on('subscribedMessage', async (key, value) => {
                            try {
                                switch (key) {
                                    case 'Power':
                                        const state = value ? '4' : '5';
                                        await this.openwebif.send(CONSTANTS.ApiUrls.SetPower + state);
                                        break;
                                    case 'Channel':
                                        await this.openwebif.send(CONSTANTS.ApiUrls.SetChannel + value);
                                        break;
                                    case 'Volume':
                                        const volume = (value < 0 || value > 100) ? this.volume : value;
                                        await this.openwebif.send(CONSTANTS.ApiUrls.SetVolume + volume);
                                        break;
                                    case 'Mute':
                                        await this.openwebif.send(CONSTANTS.ApiUrls.ToggleMute);
                                        break;
                                    case 'RcControl':
                                        await this.openwebif.send(CONSTANTS.ApiUrls.SetRcCommand + value);
                                        break;
                                    default:
                                        this.emit('message', `MQTT Received unknown key: ${key}, value: ${value}`);
                                        break;
                                };
                            } catch (error) {
                                this.emit('error', `MQTT send error: ${error}.`);
                            };
                        })
                        .on('debug', (debug) => {
                            this.emit('debug', debug);
                        })
                        .on('error', (error) => {
                            this.emit('error', error);
                        });
                };

                try {
                    //read inputs names from file
                    const savedInputsNames = await this.readData(this.inputsNamesFile);
                    this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs/Channels: Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

                    //read inputs visibility from file
                    const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
                    this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
                    const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs/Channels: Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

                    //prepare accessory
                    const accessory = await this.prepareAccessory(channels);
                    this.emit('publishAccessory', accessory);

                    //sort inputs list
                    const sortInputsDisplayOrder = this.televisionService ? await this.displayOrder() : false;

                    //start check state
                    this.openwebif.impulseGenerator.start([{ timerName: 'checkState', sampling: this.refreshInterval }]);
                } catch (error) {
                    this.emit('error', `Prepare accessory error: ${error}. try again in 15s.`);
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    this.openwebif.impulseGenerator.emit('checkDeviceInfo');
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
                const mqtt = this.mqttConnected ? this.mqtt.emit('publish', topic, message) : false;
            })
            .on('disconnected', (message) => {
                this.emit('message', message);
            });
    }

    async displayOrder() {
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
            return true;
        } catch (error) {
            this.emit('erroe', error);
        };
    }

    async saveData(path, data) {
        try {
            await fsPromises.writeFile(path, JSON.stringify(data, null, 2));
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved data: ${JSON.stringify(data, null, 2)}`);
            return true;
        } catch (error) {
            this.emit('erroe', error);
        };
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Read data: ${JSON.stringify(data, null, 2)}`);
            return data;;
        } catch (error) {
            this.emit('erroe', `Read saved data error: ${error}`);
        };
    }

    //prepare accessory
    async prepareAccessory(channels) {
        try {
            //accessory
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.mac);
            const accessoryCategory = Categories.TV_SET_TOP_BOX;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //information service
            const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Prepare information service`);
            const manufacturer = this.manufacturer.replace(/[^a-zA-Z0-9\s']/g, '');
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, manufacturer)
                .setCharacteristic(Characteristic.Model, this.modelName)
                .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);
            this.allServices.push(this.informationService);

            //prepare television service
            const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Prepare television service`);
            this.televisionService = accessory.addService(Service.Television, `${accessoryName} Television`, 'Television');
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
                        await this.openwebif.send(CONSTANTS.ApiUrls.SetPower + newState);
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
                                await this.openwebif.send(CONSTANTS.ApiUrls.SetChannel + inputReference);
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

                        await this.openwebif.send(CONSTANTS.ApiUrls.SetRcCommand + command);
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

                        await this.openwebif.send(CONSTANTS.ApiUrls.SetRcCommand + command);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Power Mode Selection: ${command === '139' ? 'SHOW' : 'HIDE'}`);
                    } catch (error) {
                        this.emit('error', `set Power Mode Selection error: ${error}`);
                    };
                });
            this.allServices.push(this.televisionService);

            //prepare speaker service
            const debug3 = !this.enableDebugMode ? false : this.emit('debug', `Prepare speaker service`);
            this.speakerService = accessory.addService(Service.TelevisionSpeaker, `${accessoryName} Speaker`, 'Speaker');
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

                        await this.openwebif.send(CONSTANTS.ApiUrls.SetRcCommand + command);
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
                .onSet(async (volume) => {
                    try {
                        await this.openwebif.send(CONSTANTS.ApiUrls.SetVolume + volume);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
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
                        await this.openwebif.send(CONSTANTS.ApiUrls.ToggleMute);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                    } catch (error) {
                        this.emit('error', `set Mute error: ${error}`);
                    };
                });
            this.allServices.push(this.tvSpeakerService);

            //prepare inputs service
            const debug4 = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs servics`);

            //check possible inputs count (max 85)
            const inputs = channels;
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
                const savedInputName = this.savedInputsNames[inputReference] ?? false;
                input.name = savedInputName ? savedInputName : input.name;

                //get input type
                const inputSourceType = 0;

                //get input configured
                const isConfigured = 1;

                //get visibility
                input.visibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                //add identifier to the input
                input.identifier = inputIdentifier;

                //input service
                const inputService = accessory.addService(Service.InputSource, input.name, `Input ${inputIdentifier}`);
                inputService
                    .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                    .setCharacteristic(Characteristic.Name, input.name)
                    .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                    .setCharacteristic(Characteristic.InputSourceType, inputSourceType)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, input.visibility)

                inputService.getCharacteristic(Characteristic.ConfiguredName)
                    .onGet(async () => {
                        return input.name;
                    })
                    .onSet(async (value) => {
                        if (value === this.savedInputsNames[inputReference]) {
                            return;
                        }

                        try {
                            input.name = value;
                            this.savedInputsNames[inputReference] = value;
                            await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved Input, Name: ${value}, Reference: ${inputReference}`);

                            //sort inputs
                            const index = this.inputsConfigured.findIndex(input => input.reference === inputReference);
                            this.inputsConfigured[index].name = value;
                            await this.displayOrder();
                        } catch (error) {
                            this.emit('error', `save Input Name error: ${error}`);
                        }
                    });

                inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                    .onGet(async () => {
                        return input.visibility;
                    })
                    .onSet(async (state) => {
                        if (state === this.savedInputsTargetVisibility[inputReference]) {
                            return;
                        }

                        try {
                            input.visibility = state;
                            this.savedInputsTargetVisibility[inputReference] = state;
                            await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved Input: ${input.name}, Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`);
                        } catch (error) {
                            this.emit('error', `save Target Visibility error: ${error}`);
                        }
                    });
                this.inputsConfigured.push(input);
                this.televisionService.addLinkedService(inputService);
                this.allServices.push(inputService);
            }

            //prepare volume service
            if (this.volumeControl) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume service`);
                const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                if (this.volumeControl === 1) {
                    this.volumeService = accessory.addService(Service.Lightbulb, `${volumeServiceName}`, 'Volume');
                    this.volumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.volumeService.setCharacteristic(Characteristic.ConfiguredName, `${volumeServiceName}`);
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
                }

                if (this.volumeControl === 2) {
                    this.volumeServiceFan = accessory.addService(Service.Fan, `${volumeServiceName}`, 'Volume');
                    this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, `${volumeServiceName}`);
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
                }
            }

            //prepare sensor service
            if (this.sensorPower) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare power sensor service`);
                this.sensorPowerService = accessory.addService(Service.ContactSensor, `${accessoryName} Power Sensor`, `Power Sensor`);
                this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    });
                this.allServices.push(this.sensorPowerService);
            };

            if (this.sensorVolume) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume sensor service`);
                this.sensorVolumeService = accessory.addService(Service.ContactSensor, `${accessoryName} Volume Sensor`, `Volume Sensor`);
                this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorVolumeState;
                        return state;
                    });
                this.allServices.push(this.sensorVolumeService);
            };

            if (this.sensorMute) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare mute sensor service`);
                this.sensorMuteService = accessory.addService(Service.ContactSensor, `${accessoryName} Mute Sensor`, `Mute Sensor`);
                this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.mute : false;
                        return state;
                    });
                this.allServices.push(this.sensorMuteService);
            };

            if (this.sensorInput) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare input sensor service`);
                this.sensorInputService = accessory.addService(Service.ContactSensor, `${accessoryName} Input Sensor`, `Input Sensor`);
                this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorInputState;
                        return state;
                    });
                this.allServices.push(this.sensorInputService);
            };

            //prepare inputs switch sensor service
            const possibleInputsButtonsCount = 99 - this.allServices.length;
            const maxInputsSwitchesButtonsCount = this.inputsConfigured.length >= possibleInputsButtonsCount ? possibleInputsButtonsCount : this.inputsConfigured.length;
            if (maxInputsSwitchesButtonsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs buttons services`);
                for (let i = 0; i < maxInputsSwitchesButtonsCount; i++) {
                    //get switch
                    const inputButton = this.inputsConfigured[i];

                    //get switch name		
                    const inputName = inputButton.name ?? false;

                    //get switch reference
                    const inputReference = inputButton.reference ?? false;

                    //get switch display type
                    const inputDisplayType = inputButton.displayType || 0;

                    //get sensor name prefix
                    const namePrefix = inputButton.namePrefix || false;

                    //add state to the input
                    inputButton.state = false;

                    if (inputReference && inputName && inputDisplayType > 0) {
                        const serviceName = namePrefix ? `${accessoryName} ${inputName}` : inputName;
                        const serviceType = ['', Service.Outlet, Service.Switch][inputDisplayType];
                        const inputButtonService = new serviceType(serviceName, `Switch ${i}`);
                        inputButtonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        inputButtonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                        inputButtonService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = inputButton.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const setSwitchInput = state ? await this.openwebif.send(CONSTANTS.ApiUrls.SetChannel + inputReference) : false;
                                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Set Channel Name: ${inputName}, Reference: ${inputReference}`);
                                } catch (error) {
                                    this.emit('error', `set Channel error: ${error}`);
                                };
                            });
                        this.inputsButtonsConfigured.push(inputButton);
                        this.inputsButtonsServices.push(inputButtonService);
                        this.allServices.push(inputButtonService);
                        accessory.addService(inputButtonService);
                    } else {
                        const log = inputDisplayType === 0 ? false : this.emit('message', `Input Button Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);
                    };
                }
            }

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.allServices.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensors services`);
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    //get sensor
                    const sensorInput = this.sensorsInputsConfigured[i];

                    //get sensor name		
                    const sensorInputName = sensorInput.name;

                    //get sensor name prefix
                    const namePrefix = sensorInput.namePrefix || false;

                    //get service type
                    const serviceType = sensorInput.serviceType;

                    //get service type
                    const characteristicType = sensorInput.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${sensorInputName}` : sensorInputName;
                    const sensorInputService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorInputService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorInputService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensorInput.state
                            return state;
                        });
                    this.sensorsInputsServices.push(sensorInputService);
                    this.allServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }

            //prepare buttons service
            const possibleButtonsCount = 99 - this.allServices.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs buttons services`);
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttonsConfigured[i];

                    //get button name
                    const buttonName = button.name;

                    //get button mode
                    const buttonMode = button.mode;

                    //get button command
                    const buttonReference = button.reference;

                    //get button command
                    const buttonCommand = button.command;

                    //get button name prefix
                    const namePrefix = button.namePrefix || 0;

                    //get service type
                    const serviceType = button.serviceType;

                    const serviceName = namePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                    const buttonService = new serviceType(serviceName, `Button ${i}`);
                    buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    buttonService.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = button.state;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                switch (buttonMode) {
                                    case 0: //Channel control
                                        const send = this.power && state ? await this.openwebif.send(CONSTANTS.ApiUrls.SetChannel + buttonReference) : false;
                                        const debug0 = state && this.enableDebugMode ? this.emit('debug', `Set Channel, Name: ${buttonName}, Reference: ${buttonReference}`) : false;
                                        break;
                                    case 1: //RC Control
                                        const send1 = state ? await this.openwebif.send(CONSTANTS.ApiUrls.SetRcCommand + buttonCommand) : false;
                                        const debug1 = state && this.enableDebugMode ? this.emit('debug', `Set Command, Name: ${buttonName}, Reference: ${buttonCommand}`) : false;
                                        button.state = false;
                                        break;
                                    default:
                                        const debug2 = this.enableDebugMode ? this.emit('debug', `Set Unknown Button Mode: ${buttonMode}.`) : false;
                                        button.state = false;
                                        break;
                                };
                            } catch (error) {
                                this.emit('error', `set ${['Channel', 'Command'][buttonMode]} error: ${error}`);
                            };
                        });
                    this.buttonsServices.push(buttonService);
                    this.allServices.push(buttonService);
                    accessory.addService(buttonService);
                };
            }

            return accessory;
        } catch (error) {
            this.emit('erroe', error)
        };
    }
};
module.exports = OpenWebIfDevice;
