'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const openwebif = require('./src/openwebif')
const API_URL = require('./src/apiurl.json');

const PLUGIN_NAME = 'homebridge-openwebif-tv';
const PLATFORM_NAME = 'OpenWebIfTv';

const INPUT_SOURCE_TYPES = ['OTHER', 'HOME_SCREEN', 'TUNER', 'HDMI', 'COMPOSITE_VIDEO', 'S_VIDEO', 'COMPONENT_VIDEO', 'DVI', 'AIRPLAY', 'USB', 'APPLICATION'];

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
			log('No configuration found for %s', PLUGIN_NAME);
			return;
		}
		this.log = log;
		this.api = api;
		this.devices = config.devices || [];
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				if (!device.name) {
					this.log.warn('Device Name Missing');
				} else {
					new openwebIfTvDevice(this.log, device, this.api);
				}
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
		this.name = config.name || 'Sat Receiver';
		this.host = config.host || '';
		this.port = config.port || 80;
		this.auth = config.auth || false;
		this.user = config.user || '';
		this.pass = config.pass || '';
		this.disableLogInfo = config.disableLogInfo || false;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];

		//get config info
		this.manufacturer = config.manufacturer || 'Manufacturer';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.startPrepareAccessory = true;

		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();

		this.powerState = false;
		this.volume = 0;
		this.muteState = true;
		this.infoMenuState = false;
		this.setStartInput = false;

		this.inputName = '';
		this.inputEventName = '';
		this.inputType = 0;
		this.inputMode = 0;
		this.inputIdentifier = 0;

		this.brightness = 0;
		this.pictureMode = 0;

		this.prefDir = path.join(api.user.storagePath(), 'openwebifTv');
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;
		this.channelsFile = `${this.prefDir}/channels_${this.host.split('.').join('')}`;

		this.prepareDirectoryAndFiles();

		this.openwebif = new openwebif({
			host: this.host,
			port: this.port,
			user: this.user,
			pass: this.pass,
			auth: this.auth,
			devInfoFile: this.devInfoFile,
			channelsFile: this.channelsFile,
		});

		this.openwebif.on('connected', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('error', (error) => {
				this.log('Device: %s %s, %s', this.host, this.name, error);
			})
			.on('debug', (message) => {
				const debug = this.enableDebugMode ? this.log('Device: %s %s, debug: %s', this.host, this.name, message) : false;
			})
			.on('message', (message) => {
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('deviceInfo', (response) => {
				const manufacturer = response.data.brand || this.manufacturer;
				const modelName = response.data.model || this.modelName;
				const serialNumber = response.data.webifver || this.serialNumber;
				const firmwareRevision = response.data.imagever || this.firmwareRevision;
				const kernelVer = response.data.kernelver || 'Unknown';
				const chipset = response.data.chipset || 'Unknown';
				const mac = response.data.ifaces[0].mac || this.name;

				this.log('-------- %s --------', this.name);
				this.log('Manufacturer: %s', manufacturer);
				this.log('Model: %s', modelName);
				this.log('Kernel: %s', kernelVer);
				this.log('Chipset: %s', chipset);
				this.log('Webif version: %s', serialNumber);
				this.log('Firmware: %s', firmwareRevision);
				this.log('----------------------------------');

				this.manufacturer = manufacturer;
				this.modelName = modelName;
				this.serialNumber = serialNumber;
				this.firmwareRevision = firmwareRevision;
				this.mac = mac;

				//start prepare accessory
				if (this.startPrepareAccessory) {
					this.prepareAccessory();
				};
			})
			.on('deviceState', (power, name, eventName, reference, volume, mute) => {
				const inputIdentifier = (this.inputsReference.indexOf(reference) >= 0) ? this.inputsReference.indexOf(reference) : this.inputIdentifier;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, power)

					if (this.setStartInput) {
						setTimeout(() => {
							this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier)
						}, 1200);
					} else {
						this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
					}
					this.setStartInput = (this.inputIdentifier == inputIdentifier) ? false : true;
				}

				if (this.speakerService) {
					this.speakerService
						.updateCharacteristic(Characteristic.Volume, volume)
						.updateCharacteristic(Characteristic.Mute, mute);
					if (this.volumeService && this.volumeControl == 1) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					}
					if (this.volumeServiceFan && this.volumeControl == 2) {
						this.volumeServiceFan
							.updateCharacteristic(Characteristic.RotationSpeed, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					}
				}

				this.powerState = power;
				this.inputName = name;
				this.inputEventName = eventName;
				this.volume = volume;
				this.muteState = mute;
				this.inputIdentifier = inputIdentifier;
			})
			.on('disconnected', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			});
	}

	async prepareDirectoryAndFiles() {
		const debug = this.enableDebugMode ? this.log('Device: %s %s, prepare directory and files.', this.host, this.name) : false;

		try {
			//check if the directory exists, if not then create it
			if (fs.existsSync(this.prefDir) == false) {
				await fsPromises.mkdir(this.prefDir);
			}
			if (fs.existsSync(this.devInfoFile) == false) {
				await fsPromises.writeFile(this.devInfoFile, '');
			}
			if (fs.existsSync(this.inputsFile) == false) {
				await fsPromises.writeFile(this.inputsFile, '');
			}
			if (fs.existsSync(this.inputsNamesFile) == false) {
				await fsPromises.writeFile(this.inputsNamesFile, '');
			}
			if (fs.existsSync(this.inputsTargetVisibilityFile) == false) {
				await fsPromises.writeFile(this.inputsTargetVisibilityFile, '');
			}
			if (fs.existsSync(this.channelsFile) == false) {
				await fsPromises.writeFile(this.channelsFile, '');
			}

			//save inputs to the file
			const inputs = this.inputs;
			const obj = JSON.stringify(inputs, null, 2);
			const writeInputs = await fsPromises.writeFile(this.inputsFile, obj);
			const debug = this.enableDebugMode ? this.log('Device: %s %s, save inputs succesful, inputs: %s', this.host, this.name, obj) : false;
		} catch (error) {
			this.log.error('Device: %s %s, save inputs error: %s', this.host, this.name, error);
		};
	};


	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = AccessoryUUID.generate(this.mac);
		const accessoryCategory = Categories.TV_SET_TOP_BOX;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');

		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation(accessoryName);
		informationService
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
		accessory.addService(informationService);

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName}Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.powerState;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				const newState = state ? '4' : '5';
				try {
					const setPower = (state != this.powerState) ? await this.openwebif.send(API_URL.SetPower + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power state successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputEventName = this.inputEventName;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Channel: %s, Event: %s, Reference: %s', this.host, accessoryName, inputName, inputEventName, inputReference);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				try {
					const setInput = (this.powerState && inputReference != undefined) ? await this.openwebif.send(API_URL.SetChannel + inputReference) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Channel successful, name: %s, reference: %s', this.host, accessoryName, inputName, inputReference);
					this.inputIdentifier = inputIdentifier;
					this.setStartInput = this.powerState ? false : true;
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
						command = this.switchInfoMenu ? '358' : '139';
						break;
				}
				try {
					const setCommand = (this.powerState) ? await this.openwebif.send(API_URL.SetRcCommand + command) : false;
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
					this.brightness = value;
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

		//this.televisionService.getCharacteristic(Characteristic.DisplayOrder)
		//	.onGet(async () => {
		//		const tag = 0x02;
		//		const length = 0x01;
		//		const value = 0x01;
		//		const data = [tag, length, value];
		//		const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get display order successful: %s %', this.host, accessoryName, data);
		//		return data;
		//	})
		//	.onSet(async (data) => {
		//		const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set display order successful: %s.', this.host, accessoryName, data);
		//	});

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
						command = this.infoMenuState ? '174' : (this.switchInfoMenu ? '139' : '358');
						this.infoMenuState = !this.infoMenuState;
						break;
					case Characteristic.PowerModeSelection.HIDE:
						command = '174';
						break;
				}
				try {
					const setCommand = (this.powerState) ? await this.openwebif.send(API_URL.SetRcCommand + command) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
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
					const setCommand = (this.powerState) ? await this.openwebif.send(API_URL.SetRcCommand + command) : false;
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
				if (volume == 0 || volume == 100) {
					volume = this.volume;
				}
				try {
					const setVolume = await this.openwebif.send(API_URL.SetVolume + volume);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Volume level successful: %s', this.host, accessoryName, volume);
				} catch (error) {
					this.log.error('Device: %s %s, can not set Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.muteState;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				try {
					const toggleMute = (this.powerState && state != this.muteState) ? await this.openwebif.send(API_URL.ToggleMute) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				} catch (error) {
					this.log.error('Device: %s %s, can not set Mute. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
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
						const state = !this.muteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});

				accessory.addService(this.volumeService);
			}

			if (this.volumeControl == 2) {
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
						const state = !this.muteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});

				accessory.addService(this.volumeServiceFan);
			}
		}

		//Prepare inputs services
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		const debug = this.enableDebugMode ? this.log('Device: %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, savedInputs) : false;

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log('Device: %s %s, read savedInputsNames: %s', this.host, accessoryName, savedInputsNames) : false;

		const savedTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log('Device: %s %s, read savedTargetVisibility: %s', this.host, accessoryName, savedTargetVisibility) : false;

		//check available inputs and possible inputs count (max 94)
		const inputs = (savedInputs.length > 0) ? savedInputs : this.inputs;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount < 94) ? inputsCount : 94;
		for (let i = 0; i < maxInputsCount; i++) {

			//get input reference
			const inputReference = (inputs[i].reference != undefined) ? inputs[i].reference : undefined;

			//get input name		
			const inputName = (savedInputsNames[inputReference] != undefined) ? savedInputsNames[inputReference] : inputs[i].name;

			//get input type
			const inputType = 0;

			//get input mode
			const inputMode = 0;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = (savedTargetVisibility[inputReference] != undefined) ? savedTargetVisibility[inputReference] : 0;
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
					const nameIdentifier = (inputReference != undefined) ? inputReference : false;
					let newName = savedInputsNames;
					newName[nameIdentifier] = name;
					const newCustomName = JSON.stringify(newName);
					try {
						const writeNewCustomName = (nameIdentifier != false) ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const debug = this.enableDebugMode ? this.log('Device: %s %s, saved new Input successful, savedInputsNames: %s', this.host, accessoryName, newCustomName) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
					} catch (error) {
						this.log.error('Device: %s %s, new Input name saved failed, error: %s', this.host, accessoryName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					const targetVisibilityIdentifier = (inputReference != undefined) ? inputReference : false;
					let newState = savedTargetVisibility;
					newState[targetVisibilityIdentifier] = state;
					const newTargetVisibility = JSON.stringify(newState);
					try {
						const writeNewTargetVisibility = (targetVisibilityIdentifier != false) ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const debug = this.enableDebugMode ? this.log('Device: %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, newTargetVisibility) : false;
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

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		}

		//Prepare inputs button services
		this.log.debug('prepareInputsButtonService');

		//check available buttons and possible buttons count (max 94 - inputsCount)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const maxButtonsCount = ((inputsCount + buttonsCount) < 94) ? buttonsCount : 94 - inputsCount;
		for (let i = 0; i < maxButtonsCount; i++) {

			//get button mode
			const buttonMode = buttons[i].mode;

			//get button reference
			const buttonReference = buttons[i].reference;

			//get button command
			const buttonCommand = buttons[i].command;

			//get button name
			const buttonName = (buttons[i].name != undefined) ? buttons[i].name : [buttonReference, buttonCommand][buttonMode];

			const buttonService = new Service.Switch(`${accessoryName} ${buttonName}`, `Button ${i}`);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					return state;
				})
				.onSet(async (state) => {
					try {
						const setInput = (state && this.powerState && buttonMode == 0) ? await this.openwebif.send(API_URL.SetChannel + buttonReference) : false;
						const setCommand = (state && this.powerState && buttonMode == 1) ? await this.openwebif.send(API_URL.SetRcCommand + buttonCommand) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, ['Channel', 'Command'][buttonMode], buttonName, [buttonReference, buttonCommand][buttonMode]);
					} catch (error) {
						this.log.error('Device: %s %s, set %s error: %s', this.host, accessoryName, ['Channel', 'Command'][buttonMode], error);
					};
					setTimeout(() => {
						buttonService
							.updateCharacteristic(Characteristic.On, false);
					}, 150);
				});

			accessory.addService(buttonService);
		}

		this.startPrepareAccessory = false;
		const debug3 = this.enableDebugMode ? this.log('Device: %s %s, publishExternalAccessories.', this.host, accessoryName) : false;
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};