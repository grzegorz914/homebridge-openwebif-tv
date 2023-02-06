'use strict';
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const Mqtt = require('./src/mqtt.js');
const OpenWebIf = require('./src/openwebif.js')

const PLUGIN_NAME = 'homebridge-openwebif-tv';
const PLATFORM_NAME = 'OpenWebIfTv';
const CONSTANS = require('./src/constans.json');

let Accessory, Characteristic, Service, Categories, AccessoryUUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	AccessoryUUID = api.hap.uuid;
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, openwebIfTvPlatform, true);
};

class openwebIfTvPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log(`No configuration found for ${PLUGIN_NAME}`);
			return;
		}
		this.log = log;
		this.api = api;
		this.accessories = [];
		const devices = config.devices;

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (const device of devices) {
				if (!device.name || !device.host || !device.port) {
					this.log.warn('Device name, host or port missing!');
					return;
				}
				new openwebIfTvDevice(this.log, device, this.api);
			}
		});
	}

	configureAccessory(accessory) {
		this.log.debug('configureAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
	}
}

class openwebIfTvDevice {
	constructor(log, config, api) {
		this.log = log;
		this.api = api;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.port = config.port;
		this.auth = config.auth || false;
		this.user = config.user || '';
		this.pass = config.pass || '';
		this.sensorPower = config.sensorPower || false;
		this.sensorVolume = config.sensorVolume || false;
		this.sensorMute = config.sensorMute || false;
		this.sensorChannel = config.sensorChannel || false;
		this.volumeControl = config.volumeControl || 0;
		this.infoButtonCommand = config.infoButtonCommand || '139';
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];
		this.refreshInterval = config.refreshInterval || 5;
		this.mqttEnabled = config.enableMqtt || false;
		this.mqttHost = config.mqttHost;
		this.mqttPort = config.mqttPort || 1883;
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

		this.inputsReference = [];
		this.inputsName = [];
		this.inputsType = [];
		this.inputsMode = [];
		this.inputsDisplayType = [];

		this.inputsSwitchesSensors = [];

		this.power = false;
		this.reference = '';
		this.volume = 0;
		this.mute = true;
		this.infoMenuState = false;
		this.inputIdentifier = 0;
		this.channelName = '';
		this.channelEventName = '';
		this.brightness = 0;
		this.sensorVolumeState = false;
		this.sensorChannelState = false;

		this.prefDir = path.join(api.user.storagePath(), 'openwebifTv');
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;
		this.channelsFile = `${this.prefDir}/channels_${this.host.split('.').join('')}`;

		//mqtt client
		if (this.mqttEnabled) {
			this.mqtt = new Mqtt({
				host: this.mqttHost,
				port: this.mqttPort,
				prefix: this.mqttPrefix,
				topic: this.name,
				auth: this.mqttAuth,
				user: this.mqttUser,
				passwd: this.mqttPasswd,
				debug: this.mqttDebug
			});

			this.mqtt.on('connected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
				.on('error', (error) => {
					this.log.error(`Device: ${this.host} ${this.name}, ${error}`);
				})
				.on('debug', (message) => {
					this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
				})
				.on('message', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				})
				.on('disconnected', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				});
		};

		//openwebif client
		this.openwebif = new OpenWebIf({
			host: this.host,
			port: this.port,
			user: this.user,
			pass: this.pass,
			auth: this.auth,
			debugLog: this.enableDebugMode,
			refreshInterval: this.refreshInterval,
			mqttEnabled: this.mqttEnabled
		});

		this.openwebif.on('connected', async (devInfo, channels) => {
			this.log(`Device: ${this.host} ${this.name}, Connected.`);

			try {
				// Create pref directory if it doesn't exist
				if (!fs.existsSync(this.prefDir)) {
					await fsPromises.mkdir(this.prefDir);
				}

				// Create device info file if it doesn't exist
				if (!fs.existsSync(this.devInfoFile)) {
					await fsPromises.writeFile(this.devInfoFile, '');
				}
				await fsPromises.writeFile(this.devInfoFile, JSON.stringify(devInfo, null, 2));

				// Create inputs file if it doesn't exist
				if (!fs.existsSync(this.inputsFile)) {
					await fsPromises.writeFile(this.inputsFile, '');
				}

				// Create inputs names file if it doesn't exist
				if (!fs.existsSync(this.inputsNamesFile)) {
					await fsPromises.writeFile(this.inputsNamesFile, '');
				}

				// Create inputs target visibility file if it doesn't exist
				if (!fs.existsSync(this.inputsTargetVisibilityFile)) {
					await fsPromises.writeFile(this.inputsTargetVisibilityFile, '');
				}

				// Create channels file if it doesn't exist
				if (!fs.existsSync(this.channelsFile)) {
					await fsPromises.writeFile(this.channelsFile, '');
				}
				await fsPromises.writeFile(this.channelsFile, JSON.stringify(channels, null, 2));

				//save inputs to the file
				try {
					const inputs = JSON.stringify(this.inputs, null, 2);
					const writeInputs = await fsPromises.writeFile(this.inputsFile, inputs);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, save inputs succesful, inputs: ${inputs}`) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save inputs error: ${error}`);
				};
			} catch (error) {
				this.log.error(`Device: ${this.host} ${this.name}, ${this.zoneControl} create files, save devInfo or channels error: ${error}`);
			};
		})
			.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, kernelVer, chipset, mac) => {
				if (!this.disableLogDeviceInfo) {
					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', manufacturer);
					this.log('Model: %s', modelName);
					this.log('Kernel: %s', kernelVer);
					this.log('Chipset: %s', chipset);
					this.log('Webif version: %s', serialNumber);
					this.log('Firmware: %s', firmwareRevision);
					this.log('----------------------------------');
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
			})
			.on('stateChanged', (power, name, eventName, reference, volume, mute) => {
				const inputIdentifier = this.inputsReference.includes(reference) ? this.inputsReference.findIndex(index => index === reference) : this.inputIdentifier;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, power)
						.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}

				if (this.speakerService) {
					this.speakerService
						.updateCharacteristic(Characteristic.Volume, volume)
						.updateCharacteristic(Characteristic.Mute, mute);
					if (this.volumeService && this.volumeControl === 1) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					}
					if (this.volumeServiceFan && this.volumeControl === 2) {
						this.volumeServiceFan
							.updateCharacteristic(Characteristic.RotationSpeed, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					}
				}

				if (this.sensorPowerService) {
					this.sensorPowerService
						.updateCharacteristic(Characteristic.MotionDetected, power)
				}

				if (this.sensorVolumeService) {
					const state = power ? (this.volume !== volume) : false;
					this.sensorVolumeService
						.updateCharacteristic(Characteristic.MotionDetected, state)
					this.sensorVolumeState = state;
				}

				if (this.sensorMuteService) {
					const state = power ? this.mute : false;
					this.sensorMuteService
						.updateCharacteristic(Characteristic.MotionDetected, state)
				}

				if (this.sensorChannelService) {
					const state = power ? (this.inputIdentifier !== inputIdentifier) : false;
					this.sensorChannelService
						.updateCharacteristic(Characteristic.MotionDetected, state)
					this.sensorChannelState = state;
				}

				if (this.inputSwitchSensorServices) {
					const switchServicesCount = this.inputSwitchSensorServices.length;
					for (let i = 0; i < switchServicesCount; i++) {
						const index = this.inputsSwitchesSensors[i];
						const state = power ? (this.inputsReference[index] === reference) : false;
						const displayType = this.inputsDisplayType[index];
						const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
						this.inputSwitchSensorServices[i]
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
					this.prepareAccessory();
				};
			})
			.on('error', (error) => {
				this.log.error(`Device: ${this.host} ${this.name}, ${error}`);
			})
			.on('debug', (message) => {
				this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
			})
			.on('message', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
			.on('mqtt', (topic, message) => {
				this.mqtt.send(topic, message);
			})
			.on('disconnected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			});
	}

	//prepare accessory
	prepareAccessory() {
		this.log.debug('prepareAccessory');
		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		//accessory
		const accessoryName = this.name;
		const accessoryUUID = AccessoryUUID.generate(this.mac);
		const accessoryCategory = Categories.TV_SET_TOP_BOX;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//information service
		this.log.debug('prepareInformationService');
		this.informationService = accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

		//prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.power;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Power state successful: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const newState = state ? '4' : '5';
					const setPower = (state !== this.power) ? await this.openwebif.send(CONSTANS.ApiUrls.SetPower + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power state successful, state: ${state ? 'ON' : 'OFF'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set new Power state. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const channelEventName = this.channelEventName;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Channel: ${inputName}, Event: ${channelEventName}, Reference: ${inputReference}`);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputReference = this.inputsReference[inputIdentifier];
					const setInput = await this.openwebif.send(CONSTANS.ApiUrls.SetChannel + inputReference);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Channel successful, Name: ${inputName}, Reference: ${inputReference}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set Channel. Might be due to a wrong settings in config, error: ${error}`);
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
							command = '164';
							break;
						case Characteristic.RemoteKey.INFORMATION:
							command = this.infoButtonCommand;
							break;
					}

					const setCommand = this.power ? await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Remote Key successful, command: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set Remote Key command. Might be due to a wrong settings in config, error: ${error}`);
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
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Brightness successful, brightness: ${value}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set Brightness. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
			.onGet(async () => {
				const state = 0;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Closed captions successful: ${state}`);
				return state;
			})
			.onSet(async (state) => {
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Closed captions successful: ${state}`);
			});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				const value = 0;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Media state successful: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				const value = 0;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Target Media state successful: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				return value;
			})
			.onSet(async (value) => {
				try {
					const newMediaState = value;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Media state successful, state: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Media state error: ${error}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				try {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.infoMenuState ? '174' : '139';
							this.infoMenuState = !this.infoMenuState;
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = '174';
							break;
					}

					const setCommand = this.power ? await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power Mode Selection successful, command: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		accessory.addService(this.televisionService);

		//prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
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

					const setCommand = this.power ? await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume Selector successful, command: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set Volume Selector command. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Volume level successful: ${volume}`);
				return volume;
			})
			.onSet(async (volume) => {
				try {
					if (volume === 0 || volume === 100) {
						volume = this.volume;
					}

					const setVolume = await this.openwebif.send(CONSTANS.ApiUrls.SetVolume + volume);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume level successful: ${volume}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set Volume level. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.mute;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Mute state successful: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const toggleMute = (this.power && state !== this.mute) ? await this.openwebif.send(CONSTANS.ApiUrls.ToggleMute) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Mute successful: ${state ? 'ON' : 'OFF'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set Mute. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		accessory.addService(this.speakerService);

		//prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl === 1) {
				this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
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

				accessory.addService(this.volumeService);
			}

			if (this.volumeControl === 2) {
				this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
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

				accessory.addService(this.volumeServiceFan);
			}
		}

		//prepare sensor service
		if (this.sensorPower) {
			this.log.debug('prepareSensorPowerService')
			this.sensorPowerService = new Service.MotionSensor(`${accessoryName} Power Sensor`, `Power Sensor`);
			this.sensorPowerService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.power;
					return state;
				});
			accessory.addService(this.sensorPowerService);
		};

		if (this.sensorVolume) {
			this.log.debug('prepareSensorVolumeService')
			this.sensorVolumeService = new Service.MotionSensor(`${accessoryName} Volume Sensor`, `Volume Sensor`);
			this.sensorVolumeService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.sensorVolumeState;
					return state;
				});
			accessory.addService(this.sensorVolumeService);
		};

		if (this.sensorMute) {
			this.log.debug('prepareSensorMuteService')
			this.sensorMuteService = new Service.MotionSensor(`${accessoryName} Mute Sensor`, `Mute Sensor`);
			this.sensorMuteService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.power ? this.mute : false;
					return state;
				});
			accessory.addService(this.sensorMuteService);
		};

		if (this.sensorChannel) {
			this.log.debug('prepareSensorChannelService')
			this.sensorChannelService = new Service.MotionSensor(`${accessoryName} Channel Sensor`, `Channel Sensor`);
			this.sensorChannelService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.sensorChannelState;
					return state;
				});
			accessory.addService(this.sensorChannelService);
		};

		//prepare inputs service
		this.log.debug('prepareInputsService');
		const savedInputs = fs.readFileSync(this.inputsFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsFile)) : this.inputs;
		const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read saved Inputs successful, inpits: ${JSON.stringify(savedInputs, null, 2)}`) : false;

		const savedInputsNames = fs.readFileSync(this.inputsNamesFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read savedInputsNames: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

		const savedInputsTargetVisibility = fs.readFileSync(this.inputsTargetVisibilityFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read savedTargetVisibility: ${JSON.stringify(savedInputsTargetVisibility, null, 2)}`) : false;

		//check available inputs and possible inputs count (max 80)
		const inputs = savedInputs;
		const inputsCount = inputs.length;
		const maxInputsCount = inputsCount < 80 ? inputsCount : 80;
		for (let i = 0; i < maxInputsCount; i++) {
			//input
			const input = inputs[i];

			//get input reference
			const inputReference = input.reference || 'Undefined';

			//get input name		
			const inputName = savedInputsNames[inputReference] || input.name;

			//get input type
			const inputType = 0;

			//get input mode
			const inputMode = 0;

			//get input switch
			const inputDisplayType = input.displayType || -1;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = savedInputsTargetVisibility[inputReference] || 0;
			const targetVisibility = currentVisibility;

			const inputService = new Service.InputSource(inputName, `Input ${i}`);
			inputService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, isConfigured)
				.setCharacteristic(Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)
				.setCharacteristic(Characteristic.TargetVisibilityState, targetVisibility);

			inputService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onSet(async (name) => {
					try {
						const nameIdentifier = inputReference || false;
						savedInputsNames[nameIdentifier] = name;
						const newCustomName = JSON.stringify(savedInputsNames, null, 2);

						const writeNewCustomName = nameIdentifier ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, new Input name saved successful, name: ${name}, reference: ${inputReference}`);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, new Input name saved failed, error: ${error}`);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					try {
						const targetVisibilityIdentifier = inputReference || false;
						savedInputsTargetVisibility[targetVisibilityIdentifier] = state;
						const newTargetVisibility = JSON.stringify(savedInputsTargetVisibility, null, 2);

						const writeNewTargetVisibility = targetVisibilityIdentifier ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Input: ${inputName}, saved target visibility state: state: ${state ? 'HIDEN' : 'SHOWN'}`);
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, saved target visibility state error: ${error}`);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);
			this.inputsDisplayType.push(inputDisplayType);
			const pushInputSwitchIndex = inputDisplayType >= 0 ? this.inputsSwitchesSensors.push(i) : false;

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		}

		//prepare inputs switch sensor service
		const inputsSwitchesSensors = this.inputsSwitchesSensors;
		const inputsSwitchesSensorsCount = inputsSwitchesSensors.length;
		const availableInputsSwitchesSensorsCount = 80 - maxInputsCount;
		const maxInputsSwitchesSensorsCount = (availableInputsSwitchesSensorsCount > 0) ? (availableInputsSwitchesSensorsCount > inputsSwitchesSensorsCount) ? inputsSwitchesSensorsCount : availableInputsSwitchesSensorsCount : 0;
		if (maxInputsSwitchesSensorsCount > 0) {
			this.log.debug('prepareSwitchsService');
			this.inputSwitchSensorServices = [];
			for (let i = 0; i < maxInputsSwitchesSensorsCount; i++) {
				//get switch
				const index = inputsSwitchesSensors[i];

				//get switch reference
				const inputReference = this.inputsReference[index];

				//get switch name		
				const inputName = this.inputsName[index];

				//get switch display type
				const inputDisplayType = this.inputsDisplayType[index];

				const serviceType = [Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][inputDisplayType];
				const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][inputDisplayType];
				const inputSwitchSensorService = new serviceType(`${accessoryName} ${inputName}`, `Sensor ${i}`);
				inputSwitchSensorService.getCharacteristic(characteristicType)
					.onGet(async () => {
						const state = this.power ? (inputReference === this.reference) : false;
						return state;
					})
					.onSet(async (state) => {
						if (inputDisplayType <= 1) {
							try {
								const setSwitchInput = (state && this.power) ? await this.openwebif.send(CONSTANS.ApiUrls.SetChannel + inputReference) : false;
								const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set new Channel successful, name: ${name}, reference: ${inputReference}`);
							} catch (error) {
								this.log.error(`Device: ${this.host} ${accessoryName}, can not set new Channel. Might be due to a wrong settings in config, error: ${error}`);
							};
						};
					});

				this.inputSwitchSensorServices.push(inputSwitchSensorService);
				accessory.addService(this.inputSwitchSensorServices[i]);
			}
		}

		//prepare buttons service
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const availableButtonsCount = 80 - (maxInputsCount + maxInputsSwitchesSensorsCount);
		const maxButtonsCount = (availableButtonsCount > 0) ? (availableButtonsCount > buttonsCount) ? buttonsCount : availableButtonsCount : 0;
		if (maxButtonsCount > 0) {
			this.log.debug('prepareButtonsService');
			for (const button of buttons) {
				//get button mode
				const buttonMode = button.mode;

				//get button reference
				const buttonReference = button.reference;

				//get button command
				const buttonCommand = button.command;

				//get button name
				const buttonName = (button.name) ? button.name : [buttonReference, buttonCommand][buttonMode];

				//get button display type
				const buttonDisplayType = (button.displayType) ? button.displayType : 0;

				const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
				const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${buttonName}`);
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
									url = CONSTANS.ApiUrls.SetChannel + buttonReference;
									break;
								case 1:
									url = CONSTANS.ApiUrls.SetRcCommand + buttonCommand;
									break;
							};

							const send = (state && this.power) ? await this.openwebif.send(url) : false;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set ${['Channel', 'Command'][buttonMode]} successful, name: ${buttonName}, reference: ${[buttonReference, buttonCommand][buttonMode]}`);

							await new Promise(resolve => setTimeout(resolve, 300));
							const setChar = (state && this.power && buttonMode === 1) ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set ${['Channel', 'Command'][buttonMode]} error: ${error}`);
						};
					});

				accessory.addService(buttonService);
			}
		}

		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug3 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, published as external accessory.`) : false;
		this.startPrepareAccessory = false;
	}
};