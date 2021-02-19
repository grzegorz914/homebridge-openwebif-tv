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
				let deviceName = this.devices[i];
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
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs;

		//get config info
		this.manufacturer = config.manufacturer || 'Manufacturer';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.checkDeviceInfo = true;
		this.checkDeviceState = false;
		this.startPrepareAccessory = true;
		this.currentPowerState = false;
		this.inputNames = new Array();
		this.inputEventNames = new Array();
		this.inputReferences = new Array();
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputEventName = '';
		this.currentInputReference = '';
		this.currentInputIdentifier = 0;
		this.currentInfoMenuState = false;
		this.prefDir = path.join(api.user.storagePath(), 'openwebifTv');
		this.inputsFile = this.prefDir + '/' + 'channels_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customChannels_' + this.host.split('.').join('');
		this.url = this.auth ? ('http://' + this.user + ':' + this.pass + '@' + this.host + ':' + this.port) : ('http://' + this.host + ':' + this.port);

		if (!Array.isArray(this.inputs) || this.inputs === undefined || this.inputs === null) {
			let defaultInputs = [
				{
					name: 'No channels configured',
					reference: 'No references configured'
				}
			];
			this.inputs = defaultInputs;
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fs.mkdir(this.prefDir, { recursive: false }, (error) => {
				if (error) {
					this.log.error('Device: %s %s, create directory: %s, error: %s', this.host, this.name, this.prefDir, error);
				} else {
					this.log.debug('Device: %s %s, create directory successful: %s', this.host, this.name, this.prefDir);
				}
			});
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
		var me = this;
		me.log.debug('Device: %s %s, requesting config information.', me.host, me.name);
		try {
			const [response, response1] = await axios.all([axios.get(me.url + '/api/getallservices'), axios.get(me.url + '/api/deviceinfo')]);
			if (!me.disableLogInfo) {
				me.log('Device: %s %s, state: Online.', me.host, me.name);
			}
			let channels = JSON.stringify(response.data.services, null, 2);
			const writeFile = await fsPromises.writeFile(me.inputsFile, channels);
			me.log.debug('Device: %s %s, saved Channels successful in: %s %s', me.host, me.name, me.prefDir, channels);

			let manufacturer = response1.data.brand;
			if (typeof response1.data.mname !== 'undefined') {
				var modelName = response1.data.mname;
			} else {
				modelName = response1.data.model;
			};
			let serialNumber = response1.data.webifver;
			let firmwareRevision = response1.data.imagever;
			let kernelVer = response1.data.kernelver;
			let chipset = response1.data.chipset;
			me.log('-------- %s --------', me.name);
			me.log('Manufacturer: %s', manufacturer);
			me.log('Model: %s', modelName);
			me.log('Kernel: %s', kernelVer);
			me.log('Chipset: %s', chipset);
			me.log('Webif version: %s', serialNumber);
			me.log('Firmware: %s', firmwareRevision);
			me.log('----------------------------------');

			me.manufacturer = manufacturer;
			me.modelName = modelName;
			me.serialNumber = serialNumber;
			me.firmwareRevision = firmwareRevision;

			me.checkDeviceInfo = false;
			me.updateDeviceState();
		} catch (error) {
			me.log.error('Device: %s %s, Device Info eror: %s, state: Offline, trying to reconnect', me.host, me.name, error);
			me.checkDeviceInfo = true;
		};
	}

	async updateDeviceState() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		try {
			const response = await axios.get(me.url + '/api/statusinfo');
			let powerState = (response.data.inStandby === 'false');
			if (me.televisionService && (powerState !== me.currentPowerState)) {
				me.televisionService.updateCharacteristic(Characteristic.Active, powerState ? 1 : 0);
			}
			me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, powerState ? 'ON' : 'OFF');
			me.currentPowerState = powerState;

			if (powerState) {
				let inputName = response.data.currservice_station;
				let inputEventName = response.data.currservice_name;
				let inputReference = response.data.currservice_serviceref;
				let inputIdentifier = 0;
				if (me.inputReferences.indexOf(inputReference) >= 0) {
					inputIdentifier = me.inputReferences.indexOf(inputReference);
				}
				if (me.televisionService && (inputReference !== me.currentInputReference)) {
					me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}
				me.log.debug('Device: %s %s, get current Channel successful: %s (%s) %s', me.host, me.name, inputName, inputEventName, inputReference);
				me.currentInputReference = inputReference;
				me.currentInputIdentifier = inputIdentifier;

				let mute = powerState ? (response.data.muted == true) : true;
				let volume = response.data.volume;
				if (me.speakerService) {
					me.speakerService.updateCharacteristic(Characteristic.Mute, mute);
					me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
					if (me.volumeService && me.volumeControl == 1) {
						me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
						me.volumeService.updateCharacteristic(Characteristic.On, !mute);
					}
					if (me.volumeServiceFan && me.volumeControl == 2) {
						me.volumeServiceFan.updateCharacteristic(Characteristic.RotationSpeed, volume);
						me.volumeServiceFan.updateCharacteristic(Characteristic.On, !mute);
					}
				}
				me.log.debug('Device: %s %s, get current Mute state: %s', me.host, me.name, mute ? 'ON' : 'OFF');
				me.log.debug('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
				me.currentMuteState = mute;
				me.currentVolume = volume;
			}
			me.checkDeviceState = true;

			//start prepare accessory
			if (me.startPrepareAccessory) {
				me.prepareAccessory();
			}
		} catch (error) {
			me.log.error('Device: %s %s, update Device state error: %s, state: Offline', me.host, me.name, error);
			me.checkDeviceState = false;
			me.checkDeviceInfo = true;
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
		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

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
					let state = (response.data.inStandby === 'false');
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
						let newState = state ? '4' : '5';
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
					let inputIdentifier = 0;
					let inputName = response.data.currservice_station;
					let inputReference = response.data.currservice_serviceref;
					if (this.inputReferences.indexOf(inputReference) !== -1) {
						inputIdentifier = this.inputReferences.indexOf(inputReference);
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current Channel successful: %s %s', this.host, accessoryName, inputName, inputReference);
					}
					let inputEventName = response.data.currservice_name;
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
					let inputName = this.inputNames[inputIdentifier];
					let inputReference = this.inputReferences[inputIdentifier];
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
					let volume = response.data.volume;
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
					let currentVolume = this.currentVolume;
					if (volume == 0 || volume == 100) {
						volume = currentVolume;
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
					let state = this.currentPowerState ? (response.data.muted == true) : true;
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
					.on('get', (callback) => {
						let volume = this.currentVolume;
						callback(null, volume);
					})
					.on('set', (volume, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
						callback(null);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.on('get', (callback) => {
						let state = this.currentPowerState ? this.currentMuteState : true;
						callback(null, !state);
					})
					.on('set', (state, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
						callback(null);
					});
				accessory.addService(this.volumeService);
				this.volumeService.addLinkedService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'volumeServiceFan');
				this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
					.on('get', (callback) => {
						let volume = this.currentVolume;
						callback(null, volume);
					})
					.on('set', (volume, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
						callback(null);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.on('get', (callback) => {
						let state = this.currentPowerState ? this.currentMuteState : true;
						callback(null, !state);
					})
					.on('set', (state, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
						callback(null);
					});
				accessory.addService(this.volumeServiceFan);
				this.televisionService.addLinkedService(this.volumeServiceFan);
			}
		}

		//Prepare inputs services
		this.log.debug('prepareInputsService');
		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, channels file does not exist', this.host, accessoryName);
		}

		let inputs = this.inputs;
		let inputsLength = inputs.length;
		if (inputsLength > 94) {
			inputsLength = 94
		}

		for (let i = 0; i < inputsLength; i++) {

			//get input reference
			let inputReference = inputs[i].reference;

			//get input name		
			let inputName = inputs[i].name;
			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = inputs[i].name;
			}

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				//.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
				.setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onSet(async (name) => {
					try {
						savedNames[inputReference] = name;
						await fsPromises.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2));
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, saved new Input successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, can not write new Input name, error: %s', this.host, accessoryName, error);
					}
				});

			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);

			accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
		};

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};
