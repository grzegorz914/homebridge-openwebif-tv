import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import Mqtt from './mqtt.js';
import OpenWebIf from './openwebif.js';
import { ApiUrls, DiacriticsMap } from './constants.js';
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class OpenWebIfDevice extends EventEmitter {
    constructor(api, device, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile) {
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
        this.auth = device.auth || {};
        this.displayType = device.displayType;
        this.getInputsFromDevice = device.inputs.getFromDevice || false;
        this.inputsDisplayOrder = device.inputs.displayOrder || 0;
        this.bouquets = device.inputs.bouquets || [];
        this.inputs = device.inputs.channels || [];
        this.buttons = device.buttons || [];
        this.sensorPower = device.sensors.power || false;
        this.sensorVolume = device.sensors.volume || false;
        this.sensorMute = device.sensors.mute || false;
        this.sensorChannel = device.sensors.channel || false;
        this.sensorChannels = device.sensors.channels || [];
        this.volumeControl = device.volume.displayType || false;
        this.volumeControlName = device.volume.name || 'Volume';
        this.volumeControlNamePrefix = device.volume.namePrefix || false;
        this.logInfo = device.log.info || false;
        this.logWarn = device.log.warn || false;
        this.logDebug = device.log.debug || false;
        this.infoButtonCommand = device.infoButtonCommand || '139';
        this.refreshInterval = (device.refreshInterval ?? 5) * 1000;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.channelsFile = channelsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;

        //mqtt
        this.mqtt = device.mqtt ?? {};
        this.mqttConnected = false;

        //inputs variable
        this.inputIdentifier = 1;

        //sensors
        this.sensorsChannelsConfigured = [];
        for (const sensor of this.sensorChannels) {
            const name = sensor.name;
            const reference = sensor.reference;
            const displayType = sensor.displayType;
            if (!displayType || !name || !reference) {
                if (this.logWarn && displayType) this.emit('warn', `Sensor Name: ${name ? name : 'Missing'}, Reference: ${reference ? reference : 'Missing'}`);
                continue;
            }

            sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][displayType];
            sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
            sensor.state = false;
            this.sensorsChannelsConfigured.push(sensor);
        }
        this.sensorsChannelsConfiguredCount = this.sensorsChannelsConfigured.length || 0;

        //buttons
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const name = button.name;
            const mode = button.mode;
            const reference = [button.reference, button.command, button.powerCommand][mode];
            const displayType = button.displayType;
            if (!displayType || !name || !reference) {
                if (this.logWarn && displayType) this.emit('warn', `Button Name: ${name ? name : 'Missing'}, ${['Reference:', 'Command:', 'Power Command:'][mode]} ${reference ? reference : 'Missing'}, Mode: ${mode ? mode : 'Missing'}`);
                continue;
            }

            button.serviceType = ['', Service.Outlet, Service.Switch][displayType];
            button.state = false;
            this.buttonsConfigured.push(button);
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;

        //state variable
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.brightness = 0;
        this.playPause = false;
    }

    async saveData(path, data) {
        try {
            await fsPromises.writeFile(path, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        }
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;
        } catch (error) {
            throw new Error(`Read data error: ${error}`);
        }
    }

    async sanitizeString(str) {
        if (!str) return '';

        // Replace diacritics using map
        str = str.replace(/[^\u0000-\u007E]/g, ch => DiacriticsMap[ch] || ch);

        // Replace separators between words with space
        str = str.replace(/(\w)[.:;+\-\/]+(\w)/g, '$1 $2');

        // Replace remaining standalone separators with space
        str = str.replace(/[.:;+\-\/]/g, ' ');

        // Remove remaining invalid characters (keep letters, digits, space, apostrophe)
        str = str.replace(/[^A-Za-z0-9 ']/g, ' ');

        // Collapse multiple spaces
        str = str.replace(/\s+/g, ' ');

        // Trim
        return str.trim();
    }

    async externalIntegrations() {
        try {
            //mqtt client
            const mqttEnabled = this.mqtt.enable || false;
            if (mqttEnabled) {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `openwebif_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `openwebif_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `openwebif/${this.mqtt.prefix}/${this.name}` : `openwebif/${this.name}`,
                    user: this.mqtt.auth.user,
                    passwd: this.mqtt.auth.passwd,
                    debug: this.mqtt.debug || false
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.mqttConnected = true;
                    })
                    .on('subscribed', (message) => {
                        this.emit('success', message);
                    })
                    .on('set', async (key, value) => {
                        try {
                            switch (key) {
                                case 'Power':
                                    const state = value ? '4' : '5';
                                    await this.openwebif.send(ApiUrls.SetPower + state);
                                    break;
                                case 'Channel':
                                    await this.openwebif.send(ApiUrls.SetChannel + value);
                                    break;
                                case 'Volume':
                                    const volume = (value < 0 || value > 100) ? this.volume : value;
                                    await this.openwebif.send(ApiUrls.SetVolume + volume);
                                    break;
                                case 'Mute':
                                    await this.openwebif.send(ApiUrls.ToggleMute);
                                    break;
                                case 'RcControl':
                                    await this.openwebif.send(ApiUrls.SetRcCommand + value);
                                    break;
                                default:
                                    this.emit('info', `MQTT Received key: ${key}, value: ${value}`);
                                    break;
                            }
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `MQTT set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            };

            return true;
        } catch (error) {
            if (this.logWarn) this.emit('warn', `External integration start error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            const savedInfo = await this.readData(this.devInfoFile);
            this.savedInfo = savedInfo.toString().trim() !== '' ? JSON.parse(savedInfo) : {};
            if (this.logDebug) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);

            //read inputs file
            const savedInputs = await this.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : [];
            if (this.logDebug) this.emit('debug', `Read saved Inputs/Channels: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read inputs names from file
            const savedNames = await this.readData(this.inputsNamesFile);
            this.savedInputsNames = savedNames.toString().trim() !== '' ? JSON.parse(savedNames) : {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs/Channels: Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs/Channels: Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return this.savedInfo.adressMac;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
    }

    async startImpulseGenerator() {
        try {
            //start impulse generator 
            await this.openwebif.impulseGenerator.start([{ name: 'checkChannels', sampling: 60000 }, { name: 'checkState', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async displayOrder() {
        try {
            const sortStrategies = {
                1: (a, b) => a.name.localeCompare(b.name),      // A → Z
                2: (a, b) => b.name.localeCompare(a.name),      // Z → A
                3: (a, b) => a.reference.localeCompare(b.reference),
                4: (a, b) => b.reference.localeCompare(a.reference),
            };

            const sortFn = sortStrategies[this.inputsDisplayOrder];
            if (!sortFn) return;

            // Sort inputs in memory
            this.inputsServices.sort(sortFn);

            // Debug dump
            if (this.logDebug) {
                const orderDump = this.inputsServices.map(svc => ({ name: svc.name, reference: svc.reference, identifier: svc.identifier, }));
                this.emit('debug', `Inputs display order:\n${JSON.stringify(orderDump, null, 2)}`);
            }

            // Update DisplayOrder characteristic (base64 encoded)
            const displayOrder = this.inputsServices.map(svc => svc.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');
            this.televisionService.updateCharacteristic(Characteristic.DisplayOrder, encodedOrder);
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    async addRemoveOrUpdateInput(inputs, remove = false) {
        try {
            if (!this.inputsServices) return;

            for (const input of inputs) {
                if (this.inputsServices.length >= 85 && !remove) continue;

                const inputReference = input.reference;
                const savedName = this.savedInputsNames[inputReference] ?? input.name;
                const sanitizedName = await this.sanitizeString(savedName);
                const inputMode = input.mode ?? 0;
                const inputDisplayType = input.displayType;
                const inputDamePrefix = input.namePrefix;
                const inputVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                if (remove) {
                    const svc = this.inputsServices.find(s => s.reference === inputReference);
                    if (svc) {
                        if (this.logDebug) this.emit('debug', `Removing input: ${input.name}, reference: ${inputReference}`);
                        this.accessory.removeService(svc);
                        this.inputsServices = this.inputsServices.filter(s => s.reference !== inputReference);
                        await this.displayOrder();
                    }
                    continue;
                }

                let inputService = this.inputsServices.find(s => s.reference === inputReference);
                if (inputService) {
                    const nameChanged = inputService.name !== sanitizedName;
                    if (nameChanged) {
                        inputService.name = sanitizedName;
                        inputService
                            .updateCharacteristic(Characteristic.Name, sanitizedName)
                            .updateCharacteristic(Characteristic.ConfiguredName, sanitizedName);
                        if (this.logDebug) this.emit('debug', `Updated Input: ${input.name}, reference: ${inputReference}`);
                    }
                } else {
                    const identifier = this.inputsServices.length + 1;
                    inputService = this.accessory.addService(Service.InputSource, sanitizedName, `Input ${identifier}`);
                    inputService.identifier = identifier;
                    inputService.reference = inputReference;
                    inputService.name = sanitizedName;
                    inputService.mode = inputMode;
                    inputService.displayType = inputDisplayType;
                    inputService.namePrefix = inputDamePrefix;
                    inputService.visibility = inputVisibility;

                    inputService
                        .setCharacteristic(Characteristic.Identifier, identifier)
                        .setCharacteristic(Characteristic.Name, sanitizedName)
                        .setCharacteristic(Characteristic.ConfiguredName, sanitizedName)
                        .setCharacteristic(Characteristic.IsConfigured, 1)
                        .setCharacteristic(Characteristic.InputSourceType, inputMode)
                        .setCharacteristic(Characteristic.CurrentVisibilityState, inputVisibility)
                        .setCharacteristic(Characteristic.TargetVisibilityState, inputVisibility);

                    // ConfiguredName persistence
                    inputService.getCharacteristic(Characteristic.ConfiguredName)
                        .onSet(async (value) => {
                            try {
                                value = await this.sanitizeString(value);
                                inputService.name = value;
                                this.savedInputsNames[inputReference] = value;
                                await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                                if (this.logDebug) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}`);
                                await this.displayOrder();
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Save Input Name error: ${error}`);
                            }
                        });

                    // TargetVisibility persistence
                    inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                        .onSet(async (state) => {
                            try {
                                inputService.visibility = state;
                                this.savedInputsTargetVisibility[inputReference] = state;
                                await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                                if (this.logDebug) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}, target visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Save Target Visibility error: ${error}`);
                            }
                        });

                    this.inputsServices.push(inputService);
                    this.televisionService.addLinkedService(inputService);

                    if (this.logDebug) this.emit('debug', `Added Input: ${input.name}, reference: ${inputReference}`);
                }
            }

            await this.displayOrder();
            return true;
        } catch (error) {
            throw new Error(`Add/Remove/Update input error: ${error}`);
        }
    }

    //prepare accessory
    async prepareAccessory(mac) {
        try {
            //accessory
            if (this.logDebug) this.emit('debug', `Prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(mac);
            const accessoryCategory = [Categories.OTHER, Categories.TELEVISION, Categories.TV_SET_TOP_BOX, Categories.TV_STREAMING_STICK, Categories.AUDIO_RECEIVER][this.displayType];
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
            this.accessory = accessory;

            //information service
            if (this.logDebug) this.emit('debug', `Prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer.replace(/[^a-zA-Z0-9\s']/g, ''))
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName)
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //prepare television service
            if (this.logDebug) this.emit('debug', `Prepare television service`);
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
                        await this.openwebif.send(ApiUrls.SetPower + newState);
                        if (this.logInfo) this.emit('info', `set Power: ${state ? 'ON' : 'OFF'}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Power error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                .onGet(async () => this.inputIdentifier)
                .onSet(async (activeIdentifier) => {
                    try {
                        const input = this.inputsServices.find(i => i.identifier === activeIdentifier);
                        if (!input) {
                            if (this.logWarn) this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
                            return;
                        }

                        if (!this.power) {
                            if (this.inputIdentifier === activeIdentifier) {
                                return;
                            }

                            if (this.logDebug) {
                                this.emit('debug', `TV is off, deferring input switch to '${activeIdentifier}'`);
                            }

                            // Retry mechanism in the background
                            (async () => {
                                for (let attempt = 0; attempt < 10; attempt++) {
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    if (this.power) {
                                        if (this.logDebug) {
                                            this.emit('debug', `TV powered on, retrying input switch`);
                                        }
                                        this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier);
                                        break;
                                    }
                                }
                            })();

                            return;
                        }

                        const encodedRef = encodeURIComponent(input.reference);
                        await this.openwebif.send(`${ApiUrls.SetChannel}${encodedRef}`);

                        if (this.logInfo) {
                            this.emit('info', `Set Channel: ${input.name}, Reference: ${encodedRef}`);
                        }
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `Set Channel error: ${error}`);
                    }
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

                        await this.openwebif.send(ApiUrls.SetRcCommand + command);
                        if (this.logInfo) this.emit('info', `set Remote Key: ${command}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Remote Key error: ${error}`);
                    }
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
                        if (this.logInfo) this.emit('info', `set Brightness: ${value}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Brightness error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
                .onGet(async () => {
                    const state = 0;
                    return state;
                })
                .onSet(async (state) => {
                    if (this.logInfo) this.emit('info', `set Closed Ccaptions: ${state}`);
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
                        if (this.logInfo) this.emit('info', `set Target Media State: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Target Media state error: ${error}`);
                    }
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

                        await this.openwebif.send(ApiUrls.SetRcCommand + command);
                        if (this.logInfo) this.emit('info', `set Power Mode Selection: ${command === '139' ? 'SHOW' : 'HIDE'}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Power Mode Selection error: ${error}`);
                    }
                });

            //prepare inputs service
            if (this.logDebug) this.emit('debug', `Prepare inputs services`);
            this.inputsServices = [];
            await this.addRemoveOrUpdateInput(this.savedInputs, false);

            //Prepare volume service
            if (this.volumeControl > 0) {
                const debug3 = this.logDebug ? this.emit('debug', `Prepare television speaker service`) : false;
                const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceName, 'TV Speaker');
                this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    })
                    .onSet(async (state) => {
                    });
                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                    .onGet(async () => {
                        const state = 3; //none, relative, relative with current, absolute
                        return state;
                    });
                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
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

                            await this.openwebif.send(ApiUrls.SetRcCommand + command);
                            if (this.logInfo) this.emit('info', `set Volume Selector: ${command}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Volume Selector command error: ${error}`);
                        }
                    });
                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                    .onGet(async () => {
                        const volume = this.volume;
                        return volume;
                    })
                    .onSet(async (volume) => {
                        try {
                            await this.openwebif.send(ApiUrls.SetVolume + volume);
                            if (this.logInfo) this.emit('info', `set Volume: ${volume}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Volume level error: ${error}`);
                        }
                    });
                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                    .onGet(async () => {
                        const state = this.mute;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            await this.openwebif.send(ApiUrls.ToggleMute);
                            if (this.logInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                        }
                    });

                //legacy control
                switch (this.volumeControl) {
                    case 1: //lightbulb
                        const debug = this.logDebug ? this.emit('debug', `Prepare volume service lightbulb`) : false;
                        this.volumeServiceLightbulb = accessory.addService(Service.Lightbulb, volumeServiceName, 'Lightbulb Speaker');
                        this.volumeServiceLightbulb.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceLightbulb.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, !state);
                            });
                        break;
                    case 2: //fan
                        const debug1 = this.logDebug ? this.emit('debug', `Prepare volume service fan`) : false;
                        this.volumeServiceFan = accessory.addService(Service.Fan, volumeServiceName, 'Fan Speaker');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, !state);
                            });
                        break;
                    case 3: // speaker
                        const debug2 = this.logDebug ? this.emit('debug', `Prepare volume service speaker`) : false;
                        this.volumeServiceSpeaker = accessory.addService(Service.Speaker, volumeServiceName, 'Speaker');
                        this.volumeServiceSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, state);
                            });
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => {
                            });
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });
                        break;
                }
            }

            //prepare sensor service
            if (this.sensorPower) {
                if (this.logDebug) this.emit('debug', `Prepare power sensor service`);
                this.sensorPowerService = accessory.addService(Service.ContactSensor, `${accessoryName} Power Sensor`, `Power Sensor`);
                this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    });
            }

            if (this.sensorVolume) {
                if (this.logDebug) this.emit('debug', `Prepare volume sensor service`);
                this.sensorVolumeService = accessory.addService(Service.ContactSensor, `${accessoryName} Volume Sensor`, `Volume Sensor`);
                this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorVolumeState;
                        return state;
                    });
            }

            if (this.sensorMute) {
                if (this.logDebug) this.emit('debug', `Prepare mute sensor service`);
                this.sensorMuteService = accessory.addService(Service.ContactSensor, `${accessoryName} Mute Sensor`, `Mute Sensor`);
                this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.mute;
                        return state;
                    });
            }

            if (this.sensorChannel) {
                if (this.logDebug) this.emit('debug', `Prepare input sensor service`);
                this.sensorChannelService = accessory.addService(Service.ContactSensor, `${accessoryName} Input Sensor`, `Input Sensor`);
                this.sensorChannelService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorChannelService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorChannelService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorChannelState;
                        return state;
                    });
            }

            //prepare inputs switch sensor service
            const possibleInputsButtonsCount = 99 - this.accessory.services.length;
            const maxInputsSwitchesButtonsCount = this.inputsServices.length >= possibleInputsButtonsCount ? possibleInputsButtonsCount : this.inputsServices.length;
            if (maxInputsSwitchesButtonsCount > 0) {
                this.inputButtonServices = [];
                if (this.logDebug) this.emit('debug', `Prepare inputs buttons services`);
                for (let i = 0; i < maxInputsSwitchesButtonsCount; i++) {
                    const button = this.inputsServices[i];

                    //get switch name		
                    const name = button.name;

                    //get switch reference
                    const reference = encodeURIComponent(button.reference);

                    //get switch display type
                    const displayType = button.displayType;

                    //get sensor name prefix
                    const namePrefix = button.namePrefix;

                    //get button state
                    const buttonState = button.state;

                    if (displayType > 0) {
                        const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                        const serviceType = ['', Service.Outlet, Service.Switch][displayType];
                        const inputButtonService = new serviceType(serviceName, `Button Input ${i}`);
                        inputButtonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        inputButtonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                        inputButtonService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = buttonState;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const setSwitchInput = state ? await this.openwebif.send(`${ApiUrls.SetChannel}${reference}`) : false;
                                    if (this.logDebug) this.emit('debug', `Set Channel Name: ${name}, Reference: ${reference}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Channel error: ${error}`);
                                }
                            });
                        inputButtonService.name = name;
                        inputButtonService.reference = reference;
                        inputButtonService.displayType = displayType;
                        inputButtonService.namePrefix = namePrefix;
                        inputButtonService.state = buttonState;
                        this.inputButtonServices.push(inputButtonService);
                        accessory.addService(inputButtonService);
                    }
                }
            }

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.accessory.services.length;
            const maxSensorInputsCount = this.sensorsChannelsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsChannelsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                this.sensorChannelsServices = [];
                if (this.logDebug) this.emit('debug', `Prepare inputs sensors services`);
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    const sensor = this.sensorsChannelsConfigured[i];

                    //get sensor name		
                    const name = sensor.name;

                    //get sensor name prefix
                    const namePrefix = sensor.namePrefix || false;

                    //get service type
                    const serviceType = sensor.serviceType;

                    //get characteristic type
                    const characteristicType = sensor.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const sensorChannelsService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorChannelsService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorChannelsService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorChannelsService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensor.state;
                            return state;
                        });
                    this.sensorChannelsServices.push(sensorChannelsService);
                    accessory.addService(sensorChannelsService);
                }
            }

            //prepare buttons service
            const possibleButtonsCount = 99 - this.accessory.services.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                this.buttonServices = [];
                if (this.logDebug) this.emit('debug', `Prepare buttons services`);
                for (let i = 0; i < maxButtonsCount; i++) {
                    const button = this.buttonsConfigured[i];

                    //get button name
                    const name = button.name;

                    //get button mode
                    const mode = button.mode;

                    //get button command
                    const reference = encodeURIComponent(button.reference);

                    //get button command
                    const command = mode === 1 ? button.command : button.powerCommand;

                    //get button name prefix
                    const namePrefix = button.namePrefix || 0;

                    //get service type
                    const serviceType = button.serviceType;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
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
                                switch (mode) {
                                    case 0: //Channel control
                                        const send = this.power && state ? await this.openwebif.send(`${ApiUrls.SetChannel}${reference}`) : false;
                                        const debug0 = state && this.logDebug ? this.emit('debug', `Set Channel, Name: ${name}, Reference: ${reference}`) : false;
                                        break;
                                    case 1: //RC Control
                                        const send1 = state ? await this.openwebif.send(ApiUrls.SetRcCommand + command) : false;
                                        const debug1 = state && this.logDebug ? this.emit('debug', `Set Command, Name: ${name}, Reference: ${command}`) : false;
                                        button.state = false;
                                        break;
                                    case 2: //Power Control
                                        const send2 = state ? await this.openwebif.send(ApiUrls.SetPower + command) : false;
                                        const debug2 = state && this.logDebug ? this.emit('debug', `Set Power Control, Name: ${name}, Reference: ${command}`) : false;
                                        button.state = false;
                                        break;
                                    default:
                                        const debug3 = this.logDebug ? this.emit('debug', `Set Unknown Button Mode: ${mode}`) : false;
                                        button.state = false;
                                        break;
                                }
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set ${['Channel', 'Command'][mode]} error: ${error}`);
                            }
                        });
                    this.buttonServices.push(buttonService);
                    accessory.addService(buttonService);
                }
            }

            return accessory;
        } catch (error) {
            throw new Error(error)
        }
    }

    //start
    async start() {
        try {
            //openwebif client
            this.openwebif = new OpenWebIf({
                host: this.host,
                port: this.port,
                auth: this.auth,
                inputs: this.inputs,
                bouquets: this.bouquets,
                getInputsFromDevice: this.getInputsFromDevice,
                logWarn: this.logWarn,
                logDebug: this.logDebug,
                devInfoFile: this.devInfoFile,
                inputsFile: this.inputsFile,
                channelsFile: this.channelsFile
            })
                .on('deviceInfo', (info) => {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer: ${info.manufacturer}`);
                    this.emit('devInfo', `Model: ${info.modelName}`);
                    this.emit('devInfo', `Kernel: ${info.kernelVer}`);
                    this.emit('devInfo', `Chipset: ${info.chipset}`);
                    this.emit('devInfo', `Webif version: ${info.serialNumber}`);
                    this.emit('devInfo', `Firmware: ${info.firmwareRevision}`);
                    this.emit('devInfo', `----------------------------------`)

                    this.informationService?.setCharacteristic(Characteristic.FirmwareRevision, info.firmwareRevision);
                })
                .on('addRemoveOrUpdateInput', async (inputs, remove) => {
                    await this.addRemoveOrUpdateInput(inputs, remove);
                })
                .on('stateChanged', (power, name, eventName, reference, volume, mute) => {
                    const input = this.inputsServices?.find(input => input.reference === reference) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    mute = power ? mute : true;

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;

                    this.televisionService
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

                    this.volumeServiceTvSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    const muteV = this.power ? !mute : false;
                    this.volumeServiceLightbulb
                        ?.updateCharacteristic(Characteristic.Brightness, volume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceFan
                        ?.updateCharacteristic(Characteristic.RotationSpeed, volume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    //sensors
                    this.sensorPowerService?.updateCharacteristic(Characteristic.ContactSensorState, power);

                    if (volume !== this.volume) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorVolumeService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorVolumeState = state;
                        }
                    }

                    this.sensorMuteService?.updateCharacteristic(Characteristic.ContactSensorState, power ? mute : false);

                    if (reference !== this.reference) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorChannelService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorChannelState = state;
                        }
                    }

                    if (this.sensorsChannelsConfiguredCount > 0) {
                        this.sensorsChannelsConfigured.forEach((sensor, i) => {
                            const state = power ? sensor.reference === reference : false;
                            sensor.state = state;
                            const characteristicType = sensor.characteristicType;
                            this.sensorChannelsServices?.[i]?.updateCharacteristic(characteristicType, state);
                        });
                    }

                    //inputs buttons
                    if (this.inputButtonServices.length > 0) {
                        this.inputButtonServices.forEach((button, i) => {
                            const state = power ? button.reference === reference : false;
                            button.state = state;
                            this.inputButtonServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        });
                    }

                    //buttons
                    if (this.buttonsConfiguredCount > 0) {
                        this.buttonsConfigured.forEach((button, i) => {
                            const state = this.power ? (button.mode === 1 ? (button.command === 'MUTE' ? muteV : button.command === 'POWER' ? power : button.state) : button.reference === reference) : false;
                            button.state = state;
                            this.buttonServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        });
                    }

                    if (this.logInfo) {
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                        this.emit('info', `Channel Name: ${name}`);
                        this.emit('info', `Event Name: ${eventName}`);
                        this.emit('info', `Reference: ${reference}`);
                        this.emit('info', `Volume: ${volume}%`);
                        this.emit('info', `Mute: ${mute ? 'ON' : 'OFF'}`);
                        this.emit('info', `Closed Captions: 0`);
                        this.emit('info', `Media State: ${['PLAY', 'PAUSE', 'STOPPED', 'LOADING', 'INTERRUPTED'][2]}`);
                    }
                })
                .on('success', (success) => this.emit('success', success))
                .on('info', (info) => this.emit('info', info))
                .on('debug', (debug) => this.emit('debug', debug))
                .on('warn', (warn) => this.emit('warn', warn))
                .on('error', (error) => this.emit('error', error))
                .on('mqtt', (topic, message) => {
                    if (this.mqttConnected) this.mqtt1.emit('publish', topic, message);
                });

            //connect to receiver
            const connect = await this.openwebif.connect();
            if (!connect) {
                return false;
            }

            //prepare data for accessory
            const macAdress = await this.prepareDataForAccessory();
            if (!macAdress) {
                this.emit('error', `Missing Mac Address`);
                return false;
            }

            //start external integrations
            if (this.mqtt.enable) await this.externalIntegrations();

            //prepare accessory
            const accessory = await this.prepareAccessory(macAdress);
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
}
export default OpenWebIfDevice;
