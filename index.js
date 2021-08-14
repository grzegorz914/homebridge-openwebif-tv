'use strict';

const axios = require('axios').default;
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

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
		this.config = config;
		this.api = api;
		this.devices = config.devices;
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				const deviceName = device.name;
				if (!deviceName) {
					this.log.warn('Device Name Missing')
				} else {
					this.log.info('Adding new accessory:', deviceName);
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
		this.config = config;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.port = config.port;
		this.auth = config.auth;
		this.user = config.user;
		this.pass = config.pass;
		this.refreshInterval = config.refreshInterval || 5;
		this.disableLogInfo = config.disableLogInfo;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];

		//get config info
		this.manufacturer = config.manufacturer || 'Manufacturer';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.checkDeviceInfo = true;
		this.checkDeviceState = false;

		this.inputsService = new Array();
		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();

		this.buttonsService = new Array();
		this.buttonsReference = new Array();
		this.buttonsName = new Array();

		this.powerState = false;
		this.volume = 0;
		this.muteState = false;
		this.infoMenuState = false;

		this.setStartInput = false;
		this.setStartInputIdentifier = 0;

		this.inputName = '';
		this.inputEventName = '';
		this.inputReference = '';
		this.inputIdentifier = 0;

		this.prefDir = path.join(api.user.storagePath(), 'openwebifTv');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.inputsNamesFile = this.prefDir + '/' + 'inputsNames_' + this.host.split('.').join('');
		this.targetVisibilityInputsFile = this.prefDir + '/' + 'targetVisibilityInputs_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.url = this.auth ? ('http://' + this.user + ':' + this.pass + '@' + this.host + ':' + this.port) : ('http://' + this.host + ':' + this.port);

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') == false) {
			this.prefDir = this.prefDir + '/';
		}
		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) == false) {
			fsPromises.mkdir(this.prefDir);
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.inputsFile) == false) {
			fsPromises.writeFile(this.inputsFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.inputsNamesFile) == false) {
			fsPromises.writeFile(this.inputsNamesFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.targetVisibilityInputsFile) == false) {
			fsPromises.writeFile(this.targetVisibilityInputsFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devInfoFile) == false) {
			fsPromises.writeFile(this.devInfoFile, '');
		}

		//Check device state
		setInterval(function () {
			if (this.checkDeviceInfo) {
				this.getDeviceInfo();
			}
			if (!this.checkDeviceInfo && this.checkDeviceState) {
				this.updateDeviceState();
			}
		}.bind(this), this.refreshInterval * 1000);

		this.prepareAccessory();
	}

	async getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting Device Info.', this.host, this.name);
		try {
			const [response, response1] = await axios.all([axios.get(this.url + '/api/deviceinfo'), axios.get(this.url + '/api/getallservices')]);
			this.log.debug('Device: %s %s, debug response: %s, response1: %s', this.host, this.name, response.data, response1.data);
			const result = (response.data.brand != undefined) ? response : {
				'data': {
					'brand': this.manufacturer,
					'model': this.modelName,
					'webifver': this.serialNumber,
					'imagever': this.firmwareRevision,
					'kernel': 'undefined',
					'chipset': 'undefined'
				}
			};
			const obj = (result.data.brand != undefined) ? {
				'data': {
					'brand': result.data.brand,
					'model': result.data.model,
					'webifver': result.data.webifver,
					'imagever': result.data.imagever,
					'kernel': result.data.kernelver,
					'chipset': result.data.chipset
				}
			} : result;
			const devInfo = JSON.stringify(obj, null, 2);
			const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);
			this.log.debug('Device: %s %s, saved device info successful: %s', this.host, this.name, devInfo);

			const channels = JSON.stringify(response1.data.services, null, 2);
			const writeChannels = await fsPromises.writeFile(this.inputsFile, channels);
			this.log.debug('Device: %s %s, saved channels successful.', this.host, this.name);

			const manufacturer = result.data.brand;
			const modelName = result.data.model;
			const serialNumber = result.data.webifver;
			const firmwareRevision = result.data.imagever;
			const kernelVer = result.data.kernelver;
			const chipset = result.data.chipset;

			if (!this.disableLogInfo) {
				this.log('Device: %s %s, state: Online.', this.host, this.name);
			}
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

			this.checkDeviceInfo = false;
			const updateDeviceState = !this.checkDeviceState ? this.updateDeviceState() : false;
		} catch (error) {
			this.log.debug('Device: %s %s, get device info eror: %s, device offline, trying to reconnect', this.host, this.name, error);
			this.checkDeviceState = false;
			this.checkDeviceInfo = true;
		};
	}

	async updateDeviceState() {
		this.log.debug('Device: %s %s, requesting Device state.', this.host, this.name);
		try {
			const response = await axios.get(this.url + '/api/statusinfo');
			this.log.debug('Device: %s %s, debug response: %s', this.host, this.name, response.data);

			const powerState = (response.data.inStandby == 'false');
			const inputName = response.data.currservice_station;
			const inputEventName = response.data.currservice_name;
			const inputReference = response.data.currservice_serviceref;
			const volume = response.data.volume;
			const muteState = powerState ? (response.data.muted == true) : true;

			const currentInputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : 0;
			const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;

			if (this.televisionService) {
				if (powerState) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, true)
					this.powerState = true;
				}

				if (!powerState) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, false);
					this.powerState = false;
				}

				const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
					this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				this.setStartInput = (inputIdentifier == inputIdentifier) ? false : true;

				this.inputName = inputName;
				this.inputEventName = inputEventName;
				this.inputReference = inputReference;
				this.inputIdentifier = inputIdentifier;
			}

			if (this.speakerService) {
				this.speakerService
					.updateCharacteristic(Characteristic.Volume, volume)
					.updateCharacteristic(Characteristic.Mute, muteState);
				if (this.volumeService && this.volumeControl == 1) {
					this.volumeService
						.updateCharacteristic(Characteristic.Brightness, volume)
						.updateCharacteristic(Characteristic.On, !muteState);
				}
				if (this.volumeServiceFan && this.volumeControl == 2) {
					this.volumeServiceFan
						.updateCharacteristic(Characteristic.RotationSpeed, volume)
						.updateCharacteristic(Characteristic.On, !muteState);
				}
				this.volume = volume;
				this.muteState = this.muteState;
			}
			this.checkDeviceState = true;
		} catch (error) {
			this.log.debug('Device: %s %s, update device state error: %s', this.host, this.name, error);
			this.checkDeviceState = false;
			this.checkDeviceInfo = true;
		};
	}

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = AccessoryUUID.generate(accessoryName);
		const accessoryCategory = Categories.TV_SET_TOP_BOX;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');
		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = (readDevInfo != undefined) ? JSON.parse(readDevInfo) : {
				'data': {
					'brand': this.manufacturer,
					'model': this.modelName,
					'webifver': this.serialNumber,
					'imagever': this.firmwareRevision,
					'kernel': 'undefined',
					'chipset': 'undefined'
				}
			};
			this.log.debug('Device: %s %s, read devInfo: %s', this.host, accessoryName, devInfo)

			const manufacturer = devInfo.data.brand;
			const modelName = devInfo.data.model;
			const serialNumber = devInfo.data.webifver;
			const firmwareRevision = devInfo.data.imagever;

			accessory.removeService(accessory.getService(Service.AccessoryInformation));
			const informationService = new Service.AccessoryInformation(accessoryName);
			informationService
				.setCharacteristic(Characteristic.Manufacturer, manufacturer)
				.setCharacteristic(Characteristic.Model, modelName)
				.setCharacteristic(Characteristic.SerialNumber, serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
			accessory.addService(informationService);
		} catch (error) {
			this.log.debug('Device: %s %s, prepareInformationService error: %s', this.host, accessoryName, error);
		};

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				try {
					const state = this.powerState;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
					return state;
				} catch (error) {
					this.log.error('Device: %s %s, get Power state error: %s', this.host, accessoryName, error);
				};
			})
			.onSet(async (state) => {
				try {
					if (state != this.powerState) {
						const newState = state ? '4' : '5';
						const response = await axios.get(this.url + '/api/powerstate?newstate=' + newState);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not new Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				try {
					const inputName = this.inputName;
					const inputEventName = this.inputEventName;
					const inputReference = this.inputReference;
					const inputIdentifier = this.inputIdentifier;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Channel successful: %s %s', this.host, accessoryName, inputName, inputReference);
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Event successful: %s', this.host, accessoryName, inputEventName);
					}
					return inputIdentifier;
				} catch (error) {
					this.log.error('Device: %s %s, get Channel error: %s', this.host, accessoryName, error);
					return 0;
				};
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputReference = (this.inputsReference[inputIdentifier] != undefined) ? this.inputsReference[inputIdentifier] : 0;
					const response = await axios.get(this.url + '/api/zap?sRef=' + inputReference);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Channel successful: %s %s', this.host, accessoryName, inputName, inputReference);
					}
					this.setStartInputIdentifier = inputIdentifier;
					this.setStartInput = this.powerState ? false : true;
				} catch (error) {
					this.log.error('Device: %s %s, can not set Channel. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
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
							command = this.switchInfoMenu ? '358' : '139';
							break;
					}
					const response = await axios.get(this.url + '/api/remotecontrol?command=' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Remote Key successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set Remote Key command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				try {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.infoMenuState ? '174' : (this.switchInfoMenu ? '139' : '358');
							this.infoMenuState = !this.infoMenuState;
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = '174';
							break;
					}
					const response = await axios.get(this.url + '/api/remotecontrol?command=' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName, 'Speaker');
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
					const response = await axios.get(this.url + '/api/remotecontrol?command=' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Volume Selector successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set Volume Selector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				try {
					const volume = this.volume;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Volume level successful: %s', this.host, accessoryName, volume);
					}
					return volume;
				} catch (error) {
					this.log.error('Device: %s %s, get Volume error: %s', this.host, accessoryName, error);
					return 0;
				};
			})
			.onSet(async (volume) => {
				try {
					if (volume == 0 || volume == 100) {
						volume = this.volume;
					}
					const response = await axios.get(this.url + '/api/vol?set=set' + volume);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Volume level successful: %s', this.host, accessoryName, volume);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				try {
					const state = this.powerState ? this.muteState : true;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
					return state;
				} catch (error) {
					this.log.error('Device: %s %s, get Mute state error: %s', this.host, accessoryName, error);
					return true;
				};
			})
			.onSet(async (state) => {
				if (state != this.muteState) {
					try {
						const response = await axios.get(this.url + '/api/vol?set=mute');
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					} catch (error) {
						this.log.error('Device: %s %s, can not set Mute. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
					};
				}
			});

		this.televisionService.addLinkedService(this.speakerService);
		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
				this.volumeService = new Service.Lightbulb(accessoryName, 'Volume');
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
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				this.televisionService.addLinkedService(this.volumeService);
				accessory.addService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName, 'Volume');
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
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				this.televisionService.addLinkedService(this.volumeServiceFan);
				accessory.addService(this.volumeServiceFan);
			}
		}

		//Prepare inputs services
		this.log.debug('prepareInputsService');

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		this.log.debug('Device: %s %s, read savedInputsNames: %s', this.host, accessoryName, savedInputsNames)

		const savedTargetVisibility = ((fs.readFileSync(this.targetVisibilityInputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.targetVisibilityInputsFile)) : {};
		this.log.debug('Device: %s %s, read savedTargetVisibility: %s', this.host, accessoryName, savedTargetVisibility);

		//check available inputs and possible inputs count (max 94)
		const inputs = this.inputs;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount > 94) ? 94 : inputsCount;
		for (let i = 0; i < maxInputsCount; i++) {

			//get input reference
			const inputReference = (inputs[i].reference != undefined) ? inputs[i].reference : '0';

			//get input name		
			const inputName = (savedInputsNames[inputReference] != undefined) ? savedInputsNames[inputReference] : (inputs[i].name != undefined) ? inputs[i].name : inputs[i].reference;

			//get input type
			const inputType = (inputs[i].type != undefined) ? INPUT_SOURCE_TYPES.indexOf(inputs[i].type) : 3;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const targetVisibility = (savedTargetVisibility[inputReference] != undefined) ? savedTargetVisibility[inputReference] : 0;
			const currentVisibility = targetVisibility;

			const inputService = new Service.InputSource(accessoryName, 'Input ' + i);
			inputService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.IsConfigured, isConfigured);

			inputService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onGet(async () => {
					const value = inputName;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, Input name: %s', this.host, accessoryName, value);
					}
					return value;
				})
				.onSet(async (name) => {
					try {
						let newName = savedInputsNames;
						newName[inputReference] = name;
						const newCustomName = JSON.stringify(newName);
						const writeNewCustomName = await fsPromises.writeFile(this.inputsNamesFile, newCustomName);
						this.log.debug('Device: %s %s, saved new Input successful, savedInputsNames: %s', this.host, accessoryName, newCustomName);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, new Input name saved failed, error: %s', this.host, accessoryName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.InputSourceType)
				.onGet(async () => {
					const value = inputType;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Input Source Type successful, input: %s, state: %s', this.host, accessoryName, inputName, INPUT_SOURCE_TYPES[value]);
					}
					return value;
				});

			inputService
				.getCharacteristic(Characteristic.CurrentVisibilityState)
				.onGet(async () => {
					const state = currentVisibility;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, Input: %s, get current visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
					}
					return state;
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onGet(async () => {
					const state = targetVisibility;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, Input: %s, get target visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
					}
					return state;
				})
				.onSet(async (state) => {
					try {
						let newState = savedTargetVisibility;
						newState[inputReference] = state;
						const newTargetVisibility = JSON.stringify(newState);
						await fsPromises.writeFile(this.targetVisibilityInputsFile, newTargetVisibility);
						this.log.debug('Device: %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, newTargetVisibility);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
						}
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s, Input: %s, saved target visibility state error: %s', this.host, accessoryName, error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);

			this.inputsService.push(inputService);
			this.televisionService.addLinkedService(this.inputsService[i]);
			accessory.addService(this.inputsService[i]);
		}

		//Prepare inputs button services
		this.log.debug('prepareInputsButtonService');

		//check available buttons and possible buttons count (max 94 - inputsCount)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const maxButtonsCount = ((inputsCount + buttonsCount) < 94) ? buttonsCount : 94 - inputsCount;
		for (let i = 0; i < maxButtonsCount; i++) {

			//get button reference
			const buttonReference = buttons[i].reference;

			//get button name
			const buttonName = (buttons[i].name != undefined) ? buttons[i].name : buttons[i].reference;

			const buttonService = new Service.Switch(accessoryName, 'Button ' + i);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current state successful: %s', this.host, accessoryName, state);
					}
					return state;
				})
				.onSet(async (state) => {
					if (state && this.powerState) {
						try {
							const response = await axios.get(this.url + '/api/zap?sRef=' + buttonReference);
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set new Channel successful: %s %s', this.host, accessoryName, buttonName, buttonReference);
							}
							setTimeout(() => {
								buttonService
									.updateCharacteristic(Characteristic.On, false);
							}, 250);
						} catch (error) {
							this.log.error('Device: %s %s, can not set new Channel. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
							setTimeout(() => {
								buttonService
									.updateCharacteristic(Characteristic.On, false);
							}, 250);
						};
					} else {
						setTimeout(() => {
							buttonService
								.updateCharacteristic(Characteristic.On, false);
						}, 250);
					}
				});
			this.buttonsReference.push(buttonReference);
			this.buttonsName.push(buttonName);

			this.buttonsService.push(buttonService)
			this.televisionService.addLinkedService(this.buttonsService[i]);
			accessory.addService(this.buttonsService[i]);
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};