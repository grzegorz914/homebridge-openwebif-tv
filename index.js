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
		this.sensorVolume = config.sensorVolume || false
		this.sensorMute = config.sensorMute || false
		this.volumeControl = config.volumeControl || 0;
		this.infoButtonCommand = config.infoButtonCommand || '139';
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];
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

		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();

		this.switches = new Array();
		this.switchsDisplayType = new Array();

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

		this.prefDir = path.join(api.user.storagePath(), 'openwebifTv');
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;
		this.channelsFile = `${this.prefDir}/channels_${this.host.split('.').join('')}`;

		//mqtt client
		this.mqtt = new Mqtt({
			enabled: this.mqttEnabled,
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

		//openwebif client
		this.openwebif = new OpenWebIf({
			host: this.host,
			port: this.port,
			user: this.user,
			pass: this.pass,
			auth: this.auth,
			debugLog: this.enableDebugMode,
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
				await fsPromises.writeFile(this.devInfoFile, devInfo);
				await fsPromises.writeFile(this.channelsFile, channels);

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

				this.manufacturer = manufacturer;
				this.modelName = modelName;
				this.serialNumber = serialNumber;
				this.firmwareRevision = firmwareRevision;
				this.mac = mac;
			})
			.on('stateChanged', (power, name, eventName, reference, volume, mute) => {
				const inputIdentifier = (this.inputsReference.indexOf(reference) >= 0) ? this.inputsReference.indexOf(reference) : this.inputIdentifier;

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
					const state = (this.volume !== volume) ? true : false;
					this.sensorVolumeService
						.updateCharacteristic(Characteristic.MotionDetected, state)
					this.sensorVolumeState = state;
				}

				if (this.sensorMuteService) {
					const state = power ? this.mute : false;
					this.sensorMuteService
						.updateCharacteristic(Characteristic.MotionDetected, state)
				}

				if (this.switchServices) {
					const switchServicesCount = this.switchServices.length;
					for (let i = 0; i < switchServicesCount; i++) {
						const index = this.switches[i];
						const state = power ? (this.inputsReference[index] === reference) : false;
						const displayType = this.switchsDisplayType[index];
						const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected][displayType];
						this.switchServices[i]
							.updateCharacteristic(characteristicType, state);
					}
				}

				this.power = power;
				this.reference = reference;
				this.channelName = name;
				this.channelEventName = eventName;
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
	async prepareAccessory() {
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
		accessory.getService(Service.AccessoryInformation)
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
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				const newState = state ? '4' : '5';
				try {
					const setPower = (state !== this.power) ? await this.openwebif.send(CONSTANS.ApiUrls.SetPower + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power state successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					this.power = state;
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const channelEventName = this.channelEventName;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Channel: %s, Event: %s, Reference: %s', this.host, accessoryName, inputName, channelEventName, inputReference);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				try {
					const setInput = await this.openwebif.send(CONSTANS.ApiUrls.SetChannel + inputReference);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Channel successful, name: %s, reference: %s', this.host, accessoryName, inputName, inputReference);
					this.inputIdentifier = inputIdentifier;
				} catch (error) {
					this.log.error('Device: %s %s, can not set Channel. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
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
				try {
					const setCommand = (this.power) ? await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Remote Key successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, can not set Remote Key command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		//optional television characteristics
		this.televisionService.getCharacteristic(Characteristic.Brightness)
			.onGet(async () => {
				const brightness = this.brightness;
				return brightness;
			})
			.onSet(async (value) => {
				const brightness = value;
				const setBrightness = false
				try {
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Brightness successful, brightness: %s', this.host, accessoryName, value);
				} catch (error) {
					this.log.error('Device: %s %s, can not set Brightness. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
			.onGet(async () => {
				const state = 0;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Closed captions successful: %s', this.host, accessoryName, state);
				return state;
			})
			.onSet(async (state) => {
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Closed captions successful: %s', this.host, accessoryName, state);
			});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				const value = 0;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				const value = 0;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Target Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				return value;
			})
			.onSet(async (value) => {
				const newMediaState = value;
				try {
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Media state successful, state: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				} catch (error) {
					this.log.error('Device: %s %s %s, set Media state error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				switch (command) {
					case Characteristic.PowerModeSelection.SHOW:
						command = this.infoMenuState ? '174' : '139';
						this.infoMenuState = !this.infoMenuState;
						break;
					case Characteristic.PowerModeSelection.HIDE:
						command = '174';
						break;
				}
				try {
					const setCommand = (this.power) ? await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
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
				switch (command) {
					case Characteristic.VolumeSelector.INCREMENT:
						command = '115';
						break;
					case Characteristic.VolumeSelector.DECREMENT:
						command = '114';
						break;
				}
				try {
					const setCommand = (this.power) ? await this.openwebif.send(CONSTANS.ApiUrls.SetRcCommand + command) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Volume Selector successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, can not set Volume Selector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Volume level successful: %s', this.host, accessoryName, volume);
				return volume;
			})
			.onSet(async (volume) => {
				if (volume === 0 || volume === 100) {
					volume = this.volume;
				}
				try {
					const setVolume = await this.openwebif.send(CONSTANS.ApiUrls.SetVolume + volume);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Volume level successful: %s', this.host, accessoryName, volume);
					this.volume = volume;
				} catch (error) {
					this.log.error('Device: %s %s, can not set Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.mute;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				try {
					const toggleMute = (this.power && state !== this.mute) ? await this.openwebif.send(CONSTANS.ApiUrls.ToggleMute) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					this.mute = state;
				} catch (error) {
					this.log.error('Device: %s %s, can not set Mute. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
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

		//prepare inputs service
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		const debug = this.enableDebugMode ? this.log('Device: %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, savedInputs) : false;

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log('Device: %s %s, read savedInputsNames: %s', this.host, accessoryName, savedInputsNames) : false;

		const savedInputsTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log('Device: %s %s, read savedTargetVisibility: %s', this.host, accessoryName, savedTargetVisibility) : false;

		//check available inputs and possible inputs count (max 94)
		const inputs = (savedInputs.length > 0) ? savedInputs : this.inputs;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount < 94) ? inputsCount : 94;
		for (let i = 0; i < maxInputsCount; i++) {
			//input
			const input = inputs[i];

			//get input reference
			const inputReference = (input.reference) ? input.reference : undefined;

			//get input name		
			const inputName = (savedInputsNames[inputReference]) ? savedInputsNames[inputReference] : input.name;

			//get input type
			const inputType = 0;

			//get input mode
			const inputMode = 0;

			//get input switch
			const inputSwitch = (input.switch) ? input.switch : false;

			//get input switch
			const switchDisplayType = (input.displayType) ? input.displayType : 0;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = (savedInputsTargetVisibility[inputReference]) ? savedInputsTargetVisibility[inputReference] : 0;
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
					const nameIdentifier = (inputReference) ? inputReference : false;
					savedInputsNames[nameIdentifier] = name;
					const newCustomName = JSON.stringify(savedInputsNames, null, 2);
					try {
						const writeNewCustomName = nameIdentifier ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, accessoryName, newCustomName, inputReference);
					} catch (error) {
						this.log.error('Device: %s %s, new Input name saved failed, error: %s', this.host, accessoryName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					const targetVisibilityIdentifier = (inputReference) ? inputReference : false;
					savedInputsTargetVisibility[targetVisibilityIdentifier] = state;
					const newTargetVisibility = JSON.stringify(savedInputsTargetVisibility, null, 2);
					try {
						const writeNewTargetVisibility = targetVisibilityIdentifier ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN')
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s, Input: %s, saved target visibility state error: %s', this.host, accessoryName, error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);
			this.switchsDisplayType.push(switchDisplayType);
			const pushSwitchIndex = inputSwitch ? this.switches.push(i) : false;

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		}

		//prepare switch service
		//check available switchs and possible switchs count (max 94)
		const switches = this.switches;
		const switchsCount = switches.length;
		const availableSwitchsCount = 94 - maxInputsCount;
		const maxSwitchesCount = (availableSwitchsCount > 0) ? (availableSwitchsCount > switchsCount) ? switchsCount : availableSwitchsCount : 0;
		if (maxSwitchesCount > 0) {
			this.log.debug('prepareSwitchsService');
			this.switchServices = new Array();
			for (let i = 0; i < maxSwitchesCount; i++) {
				//get switch
				const inputSwitch = switches[i];

				//get switch reference
				const switchReference = this.inputsReference[inputSwitch];

				//get switch name		
				const switchName = this.inputsName[inputSwitch];

				//get switch display type
				const switchDisplayType = this.switchsDisplayType[inputSwitch];

				const serviceType = [Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor][switchDisplayType];
				const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected][switchDisplayType];
				const switchService = new serviceType(`${accessoryName} ${switchName}`, `Sensor ${i}`);
				switchService.getCharacteristic(characteristicType)
					.onGet(async () => {
						const state = this.power ? (switchReference === this.reference) : false;
						return state;
					})
					.onSet(async (state) => {
						if (switchDisplayType <= 1) {
							try {
								const setSwitchInput = (state && this.power) ? await this.openwebif.send(CONSTANS.ApiUrls.SetChannel + switchReference) : false;
								const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set new Channel successful, name: %s, reference: %s', this.host, accessoryName, switchName, switchReference);
							} catch (error) {
								this.log.error('Device: %s %s, can not set new Channel. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
							};
						};
					});

				this.switchServices.push(switchService);
				accessory.addService(this.switchServices[i]);
			}
		}

		//prepare buttons service
		//check available buttons and possible buttons count (max 94 - inputsCount)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const availableButtonsCount = (94 - (maxInputsCount + maxSwitchesCount));
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
						let url = '';
						switch (buttonMode) {
							case 0:
								url = CONSTANS.ApiUrls.SetChannel + buttonReference;
								break;
							case 1:
								url = CONSTANS.ApiUrls.SetRcCommand + buttonCommand;
								break;
						};

						try {
							const send = (state && this.power) ? await this.openwebif.send(url) : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, ['Channel', 'Command'][buttonMode], buttonName, [buttonReference, buttonCommand][buttonMode]);

							setTimeout(() => {
								const setChar = (state && this.power && buttonMode === 1) ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
							}, 300)
						} catch (error) {
							this.log.error('Device: %s %s, set %s error: %s', this.host, accessoryName, ['Channel', 'Command'][buttonMode], error);
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