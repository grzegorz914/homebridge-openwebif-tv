import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import Mqtt from './mqtt.js';
import OpenWebIf from './openwebif.js';
import { ApiUrls } from './constants.js';
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class OpenWebIfDevice extends EventEmitter {
    constructor(api, device, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval) {
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
        this.disableLogError = device.disableLogError || false;
        this.infoButtonCommand = device.infoButtonCommand || '139';
        this.volumeControlNamePrefix = device.volumeControlNamePrefix || false;
        this.volumeControlName = device.volumeControlName || 'Volume';
        this.volumeControl = device.volumeControl || false;
        this.refreshInterval = refreshInterval;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.channelsFile = channelsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;
        this.startPrepareAccessory = true;

        //external integrations
        //mqtt
        this.mqtt = device.mqtt ?? {};
        this.mqttConnected = false;

        //services
        this.allServices = [];

        //inputs variable
        this.inputsConfigured = [];
        this.inputIdentifier = 1;
        this.inputButtonConfigured = [];

        //sensors
        this.sensorsInputsConfigured = [];
        for (const sensor of this.sensorInputs) {
            const displayType = sensor.displayType ?? 0;
            if (displayType === 0) {
                continue;
            };

            sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][displayType];
            sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
            sensor.name = sensor.name || 'Sensor Input';
            sensor.state = false;
            this.sensorsInputsConfigured.push(sensor);
        }
        this.sensorsInputsConfiguredCount = this.sensorsInputsConfigured.length || 0;

        //buttons
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const displayType = button.displayType ?? 0;
            if (displayType === 0) {
                continue;
            };

            button.serviceType = ['', Service.Outlet, Service.Switch][displayType];
            button.name = button.name || 'Button';
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
        // Replace dots, colons, and semicolons inside words with a space
        str = str.replace(/(\w)[.:;]+(\w)/g, '$1 $2');

        // Remove remaining dots, colons, semicolons, plus, and minus anywhere in the string
        str = str.replace(/[.:;+\-]/g, '');

        // Replace all other invalid characters (anything not A-Z, a-z, 0-9, space, or apostrophe) with a space
        str = str.replace(/[^A-Za-z0-9 ']/g, ' ');

        // Trim leading and trailing spaces
        str = str.trim();

        return str;
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
                    user: this.mqtt.user,
                    passwd: this.mqtt.passwd,
                    debug: this.mqtt.debug || false
                });

                this.mqtt1.on('connected', (message) => {
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
                            this.emit('warn', `MQTT set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('warn', (warn) => {
                        this.emit('warn', warn);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    });
            };

            return true;
        } catch (error) {
            this.emit('warn', `External integration start error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read inputs file
            const savedInputs = await this.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : this.inputs;
            const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels: ${JSON.stringify(this.savedInputs, null, 2)}`) : false;

            //read inputs names from file
            const savedNames = await this.readData(this.inputsNamesFile);
            this.savedInputsNames = savedNames.toString().trim() !== '' ? JSON.parse(savedNames) : {};
            const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs/Channels: Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs/Channels: Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return true;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
    }

    async startImpulseGenerator() {
        try {
            //start impulse generator 
            await this.openwebif.impulseGenerator.start([{ name: 'checkState', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async displayOrder() {
        try {
            const sortStrategies = {
                1: (a, b) => a.name.localeCompare(b.name),
                2: (a, b) => b.name.localeCompare(a.name),
                3: (a, b) => a.reference.localeCompare(b.reference),
                4: (a, b) => b.reference.localeCompare(a.reference),
            };

            const sortFn = sortStrategies[this.inputsDisplayOrder];
            if (!sortFn) return;

            this.inputsConfigured.sort(sortFn);

            if (this.enableDebugMode) {
                this.emit('debug', `Inputs display order:\n${JSON.stringify(this.inputsConfigured, null, 2)}`);
            }

            const displayOrder = this.inputsConfigured.map(input => input.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');

            this.televisionService.setCharacteristic(Characteristic.DisplayOrder, encodedOrder);
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    //prepare accessory
    async prepareAccessory() {
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
                .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);
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
                        await this.openwebif.send(ApiUrls.SetPower + newState);
                        const info = this.disableLogInfo ? false : this.emit('info', `set Power: ${state ? 'ON' : 'OFF'}`);
                    } catch (error) {
                        this.emit('warn', `set Power error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                .onGet(async () => this.inputIdentifier)
                .onSet(async (activeIdentifier) => {
                    try {
                        const input = this.inputsConfigured.find(i => i.identifier === activeIdentifier);
                        if (!input) {
                            this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
                            return;
                        }

                        if (!this.power) {
                            if (this.inputIdentifier === activeIdentifier) {
                                return;
                            }

                            if (this.enableDebugMode) {
                                this.emit('debug', `TV is off, deferring input switch to '${activeIdentifier}'`);
                            }

                            // Retry mechanism in the background
                            (async () => {
                                for (let attempt = 0; attempt < 10; attempt++) {
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    if (this.power) {
                                        if (this.enableDebugMode) {
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

                        if (!this.disableLogInfo) {
                            this.emit('info', `Set Channel: ${input.name}, Reference: ${encodedRef}`);
                        }
                    } catch (error) {
                        this.emit('warn', `Set Channel error: ${error}`);
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
                        const info = this.disableLogInfo ? false : this.emit('info', `set Remote Key: ${command}`);
                    } catch (error) {
                        this.emit('warn', `set Remote Key error: ${error}`);
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
                        const info = this.disableLogInfo ? false : this.emit('info', `set Brightness: ${value}`);
                    } catch (error) {
                        this.emit('warn', `set Brightness error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
                .onGet(async () => {
                    const state = 0;
                    return state;
                })
                .onSet(async (state) => {
                    const info = this.disableLogInfo ? false : this.emit('info', `set Closed Ccaptions: ${state}`);
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
                        const info = this.disableLogInfo ? false : this.emit('info', `set Target Media State: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                    } catch (error) {
                        this.emit('warn', `set Target Media state error: ${error}`);
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
                        const info = this.disableLogInfo ? false : this.emit('info', `set Power Mode Selection: ${command === '139' ? 'SHOW' : 'HIDE'}`);
                    } catch (error) {
                        this.emit('warn', `set Power Mode Selection error: ${error}`);
                    }
                });
            this.allServices.push(this.televisionService);

            //Prepare volume service
            if (this.volumeControl > 0) {
                const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare television speaker service`) : false;
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
                            const info = this.disableLogInfo ? false : this.emit('info', `set Volume Selector: ${command}`);
                        } catch (error) {
                            this.emit('warn', `set Volume Selector command error: ${error}`);
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
                            const info = this.disableLogInfo ? false : this.emit('info', `set Volume: ${volume}`);
                        } catch (error) {
                            this.emit('warn', `set Volume level error: ${error}`);
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
                            const info = this.disableLogInfo ? false : this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('warn', `set Mute error: ${error}`);
                        }
                    });
                this.allServices.push(this.tvSpeakerService);

                //legacy control
                switch (this.volumeControl) {
                    case 1: //lightbulb
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare volume service lightbulb`) : false;
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
                        this.allServices.push(this.volumeServiceLightbulb);
                        break;
                    case 2: //fan
                        const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare volume service fan`) : false;
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
                        this.allServices.push(this.volumeServiceFan);
                        break;
                    case 3: // speaker
                        const debug2 = this.enableDebugMode ? this.emit('debug', `Prepare volume service speaker`) : false;
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
                        this.allServices.push(this.volumeServiceSpeaker);
                        break;
                }
            }

            //prepare inputs service
            const debug4 = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs servics`);

            //check possible inputs count (max 85)
            if (this.enableDebugMode) this.emit('debug', 'Prepare inputs services');

            const inputs = this.savedInputs;
            const maxInputs = Math.min(inputs.length, 85 - this.allServices.length);

            for (let i = 0; i < maxInputs; i++) {
                const input = inputs[i];
                const inputIdentifier = i + 1;
                const reference = input.reference;

                // Set name and visibility
                const savedName = this.savedInputsNames[reference];
                input.name = (savedName || input.name || `Input ${inputIdentifier}`).substring(0, 64);
                input.identifier = inputIdentifier;
                input.visibility = this.savedInputsTargetVisibility[reference] ?? 0;

                // Create input service
                const nameSanitized = await this.sanitizeString(input.name);
                const inputService = accessory.addService(Service.InputSource, nameSanitized, `Input ${inputIdentifier}`);
                inputService
                    .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                    .setCharacteristic(Characteristic.Name, nameSanitized)
                    .setCharacteristic(Characteristic.IsConfigured, 1)
                    .setCharacteristic(Characteristic.InputSourceType, 0)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, input.visibility);

                // Configured Name
                inputService.getCharacteristic(Characteristic.ConfiguredName)
                    .onGet(async () => nameSanitized)
                    .onSet(async (value) => {
                        try {
                            input.name = value;
                            this.savedInputsNames[reference] = value;
                            await this.saveData(this.inputsNamesFile, this.savedInputsNames);

                            const index = this.inputsConfigured.findIndex(i => i.reference === reference);
                            if (index >= 0) this.inputsConfigured[index].name = value;

                            await this.displayOrder();
                            if (this.enableDebugMode) this.emit('debug', `Saved Input Name: ${value}, Reference: ${reference}`);
                        } catch (err) {
                            this.emit('warn', `Save Input Name Error: ${err}`);
                        }
                    });

                // Target Visibility
                inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                    .onGet(async () => input.visibility)
                    .onSet(async (state) => {
                        try {
                            input.visibility = state;
                            this.savedInputsTargetVisibility[reference] = state;
                            await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                            if (this.enableDebugMode) this.emit('debug', `Saved Input: ${input.name}, Visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);
                        } catch (err) {
                            this.emit('warn', `Save Target Visibility Error: ${err}`);
                        }
                    });

                this.inputsConfigured.push(input);
                this.televisionService.addLinkedService(inputService);
                this.allServices.push(inputService);
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
            }

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
            }

            if (this.sensorMute) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare mute sensor service`);
                this.sensorMuteService = accessory.addService(Service.ContactSensor, `${accessoryName} Mute Sensor`, `Mute Sensor`);
                this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.mute;
                        return state;
                    });
                this.allServices.push(this.sensorMuteService);
            }

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
            }

            //prepare inputs switch sensor service
            const possibleInputsButtonsCount = 99 - this.allServices.length;
            const maxInputsSwitchesButtonsCount = this.inputsConfigured.length >= possibleInputsButtonsCount ? possibleInputsButtonsCount : this.inputsConfigured.length;
            if (maxInputsSwitchesButtonsCount > 0) {
                this.inputButtonServices = [];
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs buttons services`);
                for (let i = 0; i < maxInputsSwitchesButtonsCount; i++) {
                    const button = this.inputsConfigured[i];

                    //get switch name		
                    const name = button.name ?? false;

                    //get switch reference
                    const reference = encodeURIComponent(button.reference) ?? false;

                    //get switch display type
                    const displayType = button.displayType ?? 0;

                    //get sensor name prefix
                    const namePrefix = button.namePrefix || false;

                    //add state to the input
                    button.state = false;

                    if (reference && name && displayType > 0) {
                        const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                        const serviceType = ['', Service.Outlet, Service.Switch][displayType];
                        const inputButtonService = new serviceType(serviceName, `Switch ${i}`);
                        inputButtonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        inputButtonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                        inputButtonService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = button.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const setSwitchInput = state ? await this.openwebif.send(`${ApiUrls.SetChannel}${reference}`) : false;
                                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Set Channel Name: ${name}, Reference: ${reference}`);
                                } catch (error) {
                                    this.emit('warn', `set Channel error: ${error}`);
                                }
                            });
                        this.inputButtonConfigured.push(button);
                        this.inputButtonServices.push(inputButtonService);
                        this.allServices.push(inputButtonService);
                        accessory.addService(inputButtonService);
                    } else {
                        const log = displayType === 0 ? false : this.emit('info', `Input Button Name: ${name ? name : 'Missing'}, Reference: ${reference ? reference : 'Missing'}`);
                    }
                }
            }

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.allServices.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                this.sensorInputServices = [];
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensors services`);
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    const sensor = this.sensorsInputsConfigured[i];

                    //get sensor name		
                    const name = sensor.name;

                    //get sensor name prefix
                    const namePrefix = sensor.namePrefix || false;

                    //get service type
                    const serviceType = sensor.serviceType;

                    //get service type
                    const characteristicType = sensor.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const sensorInputService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorInputService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorInputService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensor.state;
                            return state;
                        });
                    this.sensorInputServices.push(sensorInputService);
                    this.allServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }

            //prepare buttons service
            const possibleButtonsCount = 99 - this.allServices.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                this.buttonServices = [];
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs buttons services`);
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
                                        const debug0 = state && this.enableDebugMode ? this.emit('debug', `Set Channel, Name: ${name}, Reference: ${reference}`) : false;
                                        break;
                                    case 1: //RC Control
                                        const send1 = state ? await this.openwebif.send(ApiUrls.SetRcCommand + command) : false;
                                        const debug1 = state && this.enableDebugMode ? this.emit('debug', `Set Command, Name: ${name}, Reference: ${command}`) : false;
                                        button.state = false;
                                        break;
                                    case 2: //Power Control
                                        const send2 = state ? await this.openwebif.send(ApiUrls.SetPower + command) : false;
                                        const debug2 = state && this.enableDebugMode ? this.emit('debug', `Set Power Control, Name: ${name}, Reference: ${command}`) : false;
                                        button.state = false;
                                        break;
                                    default:
                                        const debug3 = this.enableDebugMode ? this.emit('debug', `Set Unknown Button Mode: ${mode}`) : false;
                                        button.state = false;
                                        break;
                                }
                            } catch (error) {
                                this.emit('warn', `set ${['Channel', 'Command'][mode]} error: ${error}`);
                            }
                        });
                    this.buttonServices.push(buttonService);
                    this.allServices.push(buttonService);
                    accessory.addService(buttonService);
                }
            }

            //sort inputs list
            await this.displayOrder();

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
                user: this.user,
                pass: this.pass,
                auth: this.auth,
                inputs: this.inputs,
                bouquets: this.bouquets,
                devInfoFile: this.devInfoFile,
                inputsFile: this.inputsFile,
                channelsFile: this.channelsFile,
                getInputsFromDevice: this.getInputsFromDevice,
                enableDebugMode: this.enableDebugMode,
                disableLogError: this.disableLogError
            });

            this.openwebif.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac) => {
                this.emit('devInfo', `-------- ${this.name} --------`);
                this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                this.emit('devInfo', `Model: ${modelName}`);
                this.emit('devInfo', `Kernel: ${kernelVer}`);
                this.emit('devInfo', `Chipset: ${chipset}`);
                this.emit('devInfo', `Webif version: ${serialNumber}`);
                this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                this.emit('devInfo', `----------------------------------`)

                this.manufacturer = manufacturer || 'Manufacturer';
                this.modelName = modelName || 'Model Name';
                this.serialNumber = serialNumber || 'Serial Number';
                this.firmwareRevision = firmwareRevision || 'Firmware Revision';
                this.mac = mac;
            })
                .on('stateChanged', (power, name, eventName, reference, volume, mute) => {
                    const input = this.inputsConfigured.find(input => input.reference === reference) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    mute = power ? mute : true;

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;

                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                    }

                    if (this.volumeServiceTvSpeaker) {
                        this.volumeServiceTvSpeaker
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.Volume, volume)
                            .updateCharacteristic(Characteristic.Mute, mute);
                    }

                    if (this.volumeServiceLightbulb) {
                        const muteV = this.power ? !mute : false;
                        this.volumeServiceLightbulb
                            .updateCharacteristic(Characteristic.Brightness, volume)
                            .updateCharacteristic(Characteristic.On, muteV);
                    }

                    if (this.volumeServiceFan) {
                        const muteV = this.power ? !mute : false;
                        this.volumeServiceFan
                            .updateCharacteristic(Characteristic.RotationSpeed, volume)
                            .updateCharacteristic(Characteristic.On, muteV);
                    }

                    if (this.volumeServiceSpeaker) {
                        this.volumeServiceSpeaker
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.Volume, volume)
                            .updateCharacteristic(Characteristic.Mute, mute);
                    }

                    //sensors
                    if (this.sensorPowerService) {
                        this.sensorPowerService
                            .updateCharacteristic(Characteristic.ContactSensorState, power)
                    }

                    if (volume !== this.volume) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            if (this.sensorVolumeService) {
                                this.sensorVolumeService
                                    .updateCharacteristic(Characteristic.ContactSensorState, state);
                                this.sensorVolumeState = state;
                            }
                        }
                    }

                    if (this.sensorMuteService) {
                        const state = power ? mute : false;
                        this.sensorMuteService
                            .updateCharacteristic(Characteristic.ContactSensorState, state);
                    }

                    if (reference !== this.reference) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            if (this.sensorInputService) {
                                this.sensorInputService
                                    .updateCharacteristic(Characteristic.ContactSensorState, state);
                                this.sensorInputState = state;
                            }
                        }
                    }

                    if (this.sensorsInputsConfiguredCount > 0) {
                        this.sensorsInputsConfigured.forEach((sensor, i) => {
                            const state = power ? sensor.reference === reference : false;
                            sensor.state = state;
                            if (this.sensorInputServices) {
                                const characteristicType = sensor.characteristicType;
                                this.sensorInputServices[i]
                                    .updateCharacteristic(characteristicType, state);
                            }
                        });
                    }

                    //inputs buttons
                    if (this.inputButtonConfigured.length > 0) {
                        this.inputButtonConfigured.forEach((button, i) => {
                            const state = power ? button.reference === reference : false;
                            button.state = state;
                            if (this.inputButtonServices) {
                                this.inputButtonServices[i]
                                    .updateCharacteristic(Characteristic.On, state);
                            }
                        });
                    }

                    //buttons
                    if (this.buttonsConfiguredCount > 0) {
                        this.buttonsConfigured.forEach((button, i) => {
                            const state = this.power ? button.reference === reference : false;
                            button.state = state;
                            if (this.buttonServices) {
                                this.buttonServices[i]
                                    .updateCharacteristic(Characteristic.On, state);
                            }
                        });
                    }

                    if (!this.disableLogInfo) {
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
                .on('success', (success) => {
                    this.emit('success', success);
                })
                .on('info', (info) => {
                    this.emit('info', info);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('warn', (warn) => {
                    this.emit('warn', warn);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                })
                .on('mqtt', (topic, message) => {
                    const mqtt = this.mqttConnected ? this.mqtt1.emit('publish', topic, message) : false;
                });

            //connect to receiver
            const connect = await this.openwebif.connect();
            if (!connect) {
                return false;
            }

            //start external integrations
            const startExternalIntegrations = this.mqtt.enable ? await this.externalIntegrations() : false;

            //prepare data for accessory
            await this.prepareDataForAccessory();

            //prepare accessory
            if (this.startPrepareAccessory) {
                const accessory = await this.prepareAccessory();
                this.emit('publishAccessory', accessory);
                this.startPrepareAccessory = false;
            }

            return true;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
}
export default OpenWebIfDevice;
