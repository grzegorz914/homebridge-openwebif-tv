'use strict';

const axios = require('axios').default;
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const PLUGIN_NAME = 'homebridge-openwebif-tv';
const PLATFORM_NAME = 'OpenWebIfTv';

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
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

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const deviceName = this.devices[i];
				if (!deviceName.name) {
					this.log.warn('Device Name Missing')
				} else {
					new openwebIfTvDevice(this.log, deviceName, this.api);
				}
			}
		});
	}

	configureAccessory(platformAccessory) {
		this.log.debug('configurePlatformAccessory');
	}

	removeAccessory(platformAccessory) {
		this.log.debug('removePlatformAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
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
		this.inputsName = new Array();
		this.inputsReference = new Array();
		this.checkDeviceInfo = true;
		this.checkDeviceState = false;
		this.startPrepareAccessory = true;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputEventName = '';
		this.currentInputReference = '';
		this.currentInputIdentifier = 0;
		this.currentInfoMenuState = false;
		this.prefDir = path.join(api.user.storagePath(), 'openwebifTv');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.url = this.auth ? ('http://' + this.user + ':' + this.pass + '@' + this.host + ':' + this.port) : ('http://' + this.host + ':' + this.port);

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}
		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fsPromises.mkdir(this.prefDir);
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.inputsFile) === false) {
			fsPromises.writeFile(this.inputsFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.customInputsFile) === false) {
			fsPromises.writeFile(this.customInputsFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devInfoFile) === false) {
			fsPromises.writeFile(this.devInfoFile, '{}');
		}

		//Check device state
		setInterval(function () {
			if (this.checkDeviceInfo) {
				this.getDeviceInfo();
			} else if (!this.checkDeviceInfo && this.checkDeviceState) {
				this.updateDeviceState();
			}
		}.bind(this), this.refreshInterval * 1000);
	}

	async getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting Device Info.', this.host, this.name);
		try {
			const [response, response1] = await axios.all([axios.get(this.url + '/api/getallservices'), axios.get(this.url + '/api/deviceinfo')]);
			this.log.debug('Device: %s %s, debug response: %s, response1: %s', this.host, this.name, response.data, response1.data);

			const channels = JSON.stringify(response.data.services, null, 2);
			const writeChannelsFile = await fsPromises.writeFile(this.inputsFile, channels);
			this.log.debug('Device: %s %s, saved Channels successful.', this.host, this.name);

			const devInfo = JSON.stringify(response1.data, null, 2);
			const writeDevInfoFile = await fsPromises.writeFile(this.devInfoFile, devInfo);
			this.log.debug('Device: %s %s, saved Device Info successful.', this.host, this.name);

			const manufacturer = response1.data.brand;
			const modelName = response1.data.model;
			const serialNumber = response1.data.webifver;
			const firmwareRevision = response1.data.imagever;
			const kernelVer = response1.data.kernelver;
			const chipset = response1.data.chipset;

			this.manufacturer = manufacturer;
			this.modelName = modelName;
			this.serialNumber = serialNumber;
			this.firmwareRevision = firmwareRevision;

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

			this.checkDeviceInfo = false;
			this.updateDeviceState();
		} catch (error) {
			this.log.error('Device: %s %s, Device Info eror: %s, state: Offline, trying to reconnect', this.host, this.name, error);
			this.checkDeviceInfo = true;
		};
	}

	async updateDeviceState() {
		this.log.debug('Device: %s %s, requesting Device state.', this.host, this.name);
		try {
			const response = await axios.get(this.url + '/api/statusinfo');
			this.log.debug('Device: %s %s, debug response: %s', this.host, this.name, response.data);
			const powerState = (response.data.inStandby === 'false');
			if (this.televisionService && (powerState !== this.currentPowerState)) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, powerState ? 1 : 0);
			}
			this.currentPowerState = powerState;

			const inputReference = response.data.currservice_serviceref;
			const inputIdentifier = (this.inputsReference.indexOf(inputReference) > 0) ? this.inputsReference.indexOf(inputReference) : 0;
			if (this.televisionService) {
				this.televisionService
					.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
			}
			this.currentInputReference = inputReference;
			this.currentInputIdentifier = inputIdentifier;

			const volume = response.data.volume;
			const mute = powerState ? (response.data.muted === true) : true;
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
			this.currentMuteState = mute;
			this.currentVolume = volume;
			this.checkDeviceState = true;

			//start prepare accessory
			if (this.startPrepareAccessory) {
				this.prepareAccessory();
			}
		} catch (error) {
			this.log.error('Device: %s %s, update Device state error: %s, state: Offline', this.host, this.name, error);
			this.checkDeviceState = false;
			this.checkDeviceInfo = true;
		};
	}

	//Prepare accessory
	prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		const accessoryCategory = Categories.TV_SET_TOP_BOX;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');
		let devInfo = { 'brand': 'Manufacturer', 'model': 'Model name', 'webifver': 'Serial number', 'imagever': 'Firmware' };
		try {
			devInfo = JSON.parse(fs.readFileSync(this.devInfoFile));
			this.log.debug('Device: %s %s, read devInfo: %s', this.host, accessoryName, devInfo)
		} catch (error) {
			this.log.error('Device: %s %s, read devInfo failed, error: %s', this.host, accessoryName, error)
		}

		const manufacturer = devInfo.brand;
		const modelName = devInfo.model;
		const serialNumber = devInfo.webifver;
		const firmwareRevision = devInfo.imagever;

		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Name, accessoryName)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
		accessory.addService(informationService);

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				try {
					const response = await axios.get(this.url + '/api/statusinfo');
					const state = (response.data.inStandby === 'false');
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
					return state;
				} catch (error) {
					this.log.error('Device: %s %s, get current Power state error: %s', this.host, accessoryName, error);
					return 0;
				};
			})
			.onSet(async (state) => {
				if (state != this.currentPowerState) {
					try {
						const newState = state ? '4' : '5';
						const response = await axios.get(this.url + '/api/powerstate?newstate=' + newState);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set new Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					} catch (error) {
						this.log.error('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
					};
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				try {
					const response = await axios.get(this.url + '/api/statusinfo');
					const inputName = response.data.currservice_station;
					const inputReference = response.data.currservice_serviceref;
					const inputIdentifier = (this.inputsReference.indexOf(inputReference) > 0) ? this.inputsReference.indexOf(inputReference) : 0;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current Channel successful: %s %s', this.host, accessoryName, inputName, inputReference);
					}
					const inputEventName = response.data.currservice_name;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current Event successful: %s', this.host, accessoryName, inputEventName);
					}
					return inputIdentifier;
				} catch (error) {
					this.log.error('Device: %s %s, get current Channel error: %s', this.host, accessoryName, error);
					return 0;
				};
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputReference = this.inputsReference[inputIdentifier];
					const response = await axios.get(this.url + '/api/zap?sRef=' + inputReference);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Channel successful: %s %s', this.host, accessoryName, inputName, inputReference);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Channel. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
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
						this.log('Device: %s %s, setRemoteKey successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				try {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.currentInfoMenuState ? '174' : (this.switchInfoMenu ? '139' : '358');
							this.currentInfoMenuState = !this.currentInfoMenuState;
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = '174';
							break;
					}
					const response = await axios.get(this.url + '/api/remotecontrol?command=' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setPowerModeSelection successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not setPowerModeSelection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName + ' Speaker', 'speakerService');
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
						this.log('Device: %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				try {
					const response = await axios.get(this.url + '/api/statusinfo');
					const volume = response.data.volume;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current Volume level successful: %s', this.host, accessoryName, volume);
					}
					return volume;
				} catch (error) {
					this.log.error('Device: %s %s, get current Volume error: %s', this.host, accessoryName, error);
					return 0;
				};
			})
			.onSet(async (volume) => {
				try {
					if (volume == 0 || volume == 100) {
						volume = this.currentVolume;
					}
					const response = await axios.get(this.url + '/api/vol?set=set' + volume);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Volume level successful: %s', this.host, accessoryName, volume);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				try {
					const response = await axios.get(this.url + '/api/statusinfo');
					const state = this.currentPowerState ? (response.data.muted === true) : true;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
					return state;
				} catch (error) {
					this.log.error('Device: %s %s, get current Mute state error: %s', this.host, accessoryName, error);
					return true;
				};
			})
			.onSet(async (state) => {
				if (state !== this.currentMuteState) {
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

		accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'volumeService');
				this.volumeService.getCharacteristic(Characteristic.Brightness)
					.onGet(async () => {
						const volume = this.currentVolume;
						return volume;
					})
					.onSet(async (volume) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !this.currentMuteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeService);
				this.volumeService.addLinkedService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'volumeServiceFan');
				this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
					.onGet(async () => {
						const volume = this.currentVolume;
						return volume;
					})
					.onSet(async (volume) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !this.currentMuteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeServiceFan);
				this.televisionService.addLinkedService(this.volumeServiceFan);
			}
		}

		//Prepare inputs services
		if (this.inputs.length > 0) {
			this.log.debug('prepareInputsService');
			this.inputsService = new Array();

			let savedNames = {};
			try {
				savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
				this.log.debug('Device: %s %s, read devInfo: %s', this.host, accessoryName, savedNames)
			} catch (error) {
				this.log.error('Device: %s %s, channels file does not exist', this.host, accessoryName);
			}

			const inputs = this.inputs;
			let inputsLength = inputs.length;
			if (inputsLength > 94) {
				inputsLength = 94
			}

			for (let i = 0; i < inputsLength; i++) {

				//get input reference
				const inputReference = inputs[i].reference;

				//get input name		
				let inputName = inputs[i].name;
				if (savedNames && savedNames[inputReference]) {
					inputName = savedNames[inputReference];
				} else {
					inputName = (inputs[i].name !== undefined) ? inputs[i].name : inputs[i].reference;;
				}

				const inputService = new Service.InputSource(inputReference, 'input' + i);
				inputService
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					//.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
					.setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.SHOWN);

				inputService
					.getCharacteristic(Characteristic.ConfiguredName)
					.onSet(async (name) => {
						try {
							savedNames[inputReference] = name;
							await fsPromises.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2));
							this.log.debug('Device: %s %s, saved new Input successful, savedNames: %s', this.host, accessoryName, JSON.stringify(savedNames, null, 2));
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, saved new Input successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
							}
						} catch (error) {
							this.log.error('Device: %s %s, can not write new Input name, error: %s', this.host, accessoryName, error);
						}
					});

				this.inputsReference.push(inputReference);
				this.inputsName.push(inputName);

				this.inputsService.push(inputService);
				accessory.addService(this.inputsService[i]);
				this.televisionService.addLinkedService(this.inputsService[i]);
			};
		}

		//Prepare inputs button services
		if (this.buttons.length > 0) {
			this.log.debug('prepareInputsButtonService');
			this.buttonsService = new Array();
			this.buttonsName = new Array();
			this.buttonsReference = new Array();
			for (let i = 0; i < this.buttons.length; i++) {
				const buttonName = (buttons[i].name !== undefined) ? buttons[i].name : buttons[i].reference;
				const buttonReference = this.buttons[i].reference;
				const buttonService = new Service.Switch(accessoryName + ' ' + this.buttons[i].name, 'buttonService' + i);
				buttonService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = false;
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, get current state successful: %s', this.host, accessoryName, state);
						}
						return state;
					})
					.onSet(async (state) => {
						if (state && this.currentPowerState) {
							try {
								const response = await axios.get(this.url + '/api/zap?sRef=' + buttonReference);
								if (!this.disableLogInfo) {
									this.log('Device: %s %s, set new Channel successful: %s %s', this.host, accessoryName, buttonName, buttonReference);
								}
								setTimeout(() => {
									buttonService.getCharacteristic(Characteristic.On).updateValue(false);
								}, 350);
							} catch (error) {
								this.log.error('Device: %s %s, can not set new Channel. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
							};
						} else {
							setTimeout(() => {
								buttonService.getCharacteristic(Characteristic.On).updateValue(false);
							}, 350);
						}
					});
				this.buttonsReference.push(buttonReference);
				this.buttonsName.push(buttonName);

				this.buttonsService.push(buttonService)
				accessory.addService(this.buttonsService[i]);
				this.televisionService.addLinkedService(this.buttonsService[i]);
			}
		}

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};
