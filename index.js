'use strict';

const fs = require('fs');
const axios = require('axios');
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
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0, len = this.devices.length; i < len; i++) {
				let deviceName = this.devices[i];
				if (!deviceName.name) {
					this.log.warn('Device Name Missing')
				} else {
					this.accessories.push(new openwebIfTvDevice(this.log, deviceName, this.api));
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
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs;

		//get config info
		this.manufacturer = config.manufacturer || 'Manufacturer';
		this.modelName = config.modelName || 'Model';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.checkDeviceInfo = false;
		this.checkDeviceState = false;
		this.currentPowerState = false;
		this.inputNames = new Array();
		this.inputEventNames = new Array();
		this.inputReferences = new Array();
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputEventName = '';
		this.currentInputReference = '';
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

		//update device state
		setInterval(function () {
			if (this.checkDeviceInfo) {
				this.getDeviceInfo();
			}
			if (this.checkDeviceState) {
				this.updateDeviceState();
			}
		}.bind(this), 3000);

		this.prepareTelevisionService();
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		this.accessory = new Accessory(accessoryName, accessoryUUID);
		this.accessory.category = Categories.TV_SET_TOP_BOX;

		this.accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPower.bind(this))
			.on('set', this.setPower.bind(this));

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', this.getInput.bind(this))
			.on('set', this.setInput.bind(this));

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.setRemoteKey.bind(this));

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));

		this.accessory.addService(this.televisionService);

		this.prepareSpeakerService();
		if (this.volumeControl >= 1) {
			this.prepareVolumeService();
		}
		this.prepareInputsService();

		this.checkDeviceInfo = true;

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
	}

	//Prepare speaker service
	prepareSpeakerService() {
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(this.name + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.setVolumeSelector.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);
	}

	//Prepare volume service
	prepareVolumeService() {
		this.log.debug('prepareVolumeService');
		if (this.volumeControl == 1) {
			this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
			this.volumeService.getCharacteristic(Characteristic.Brightness)
				.on('get', this.getVolume.bind(this))
				.on('set', (volume, callback) => {
					this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					callback(null);
				});
		}
		if (this.volumeControl == 2) {
			this.volumeService = new Service.Fan(this.name + ' Volume', 'volumeService');
			this.volumeService.getCharacteristic(Characteristic.RotationSpeed)
				.on('get', this.getVolume.bind(this))
				.on('set', (volume, callback) => {
					this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					callback(null);
				});
		}
		this.volumeService.getCharacteristic(Characteristic.On)
			.on('get', (callback) => {
				let state = !this.currentMuteState;
				callback(null, state);
			})
			.on('set', (state, callback) => {
				this.speakerService.setCharacteristic(Characteristic.Mute, !state);
				callback(null);
			});

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, channels file does not exist', this.host, this.name);
		}

		this.inputs.forEach((input, i) => {

			//get channel reference
			let inputReference = input.reference;

			//get channel name		
			let inputName = input.name;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = input.name;
			}

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					savedNames[inputReference] = name;
					fs.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2), (error) => {
						if (error) {
							this.log.error('Device: %s %s, can not write new Channel name, error: %s', this.host, this.name, error);
						} else {
							this.log.info('Device: %s %s, saved new Channel successful, name: %s, reference: %s', this.host, this.name, name, inputReference);
						}
					});
					callback(null)
				});
			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);

			this.accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
		});
	}

	getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting config information.', me.host, me.name);
		axios.get(me.url + '/api/getallservices').then(response => {
			me.log.info('Device: %s %s, state: Online.', me.host, me.name);
			let channels = JSON.stringify(response.data.services, null, 2);
			fs.writeFile(me.inputsFile, channels, (error) => {
				if (error) {
					me.log.error('Device: %s %s, could not write Channels to the file, error: %s', me.host, me.name, error);
				} else {
					me.log.debug('Device: %s %s, saved Channels successful in: %s %s', me.host, me.name, me.prefDir, channels);
				}
			});
		}).catch(error => {
			me.log.error('Device: %s %s, get Channels list error: %s', me.host, me.name, error);
		});

		axios.get(me.url + '/api/deviceinfo').then(response => {
			me.manufacturer = response.data.brand;
			if (typeof response.data.mname !== 'undefined') {
				me.modelName = response.data.mname;
			} else {
				me.modelName = response.data.model;
			};
			me.serialNumber = response.data.webifver;
			me.firmwareRevision = response.data.enigmaver;
			me.kernelVer = response.data.kernelver;
			me.chipset = response.data.chipset;
			me.log('-------- %s --------', me.name);
			me.log('Manufacturer: %s', me.manufacturer);
			me.log('Model: %s', me.modelName);
			me.log('Kernel: %s', me.kernelVer);
			me.log('Chipset: %s', me.chipset);
			me.log('Webif version: %s', me.serialNumber);
			me.log('Firmware: %s', me.firmwareRevision);
			me.log('----------------------------------');
			me.checkDeviceInfo = false;
			me.checkDeviceState = true;
		}).catch(error => {
			me.log.error('Device: %s %s, getDeviceInfo eror: %s, state: Offline', me.host, me.name, error);
			me.checkDeviceInfo = true;
			me.checkDeviceState = false;
		});
	}

	updateDeviceState() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		axios.get(this.url + '/api/statusinfo').then(response => {
			let powerState = (response.data.inStandby === 'false');
			if (me.televisionService && (powerState !== me.currentPowerState)) {
				me.televisionService.updateCharacteristic(Characteristic.Active, powerState ? 1 : 0);
			}
			me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, powerState ? 'ON' : 'OFF');
			me.currentPowerState = powerState;

			let inputName = response.data.currservice_station;
			let inputEventName = response.data.currservice_name;
			let inputReference = response.data.currservice_serviceref;
			let inputIdentifier = me.inputReferences.indexOf(inputReference);
			if (me.televisionService && (inputReference !== me.currentInputReference)) {
				me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
			}
			me.log.debug('Device: %s %s, get current Channel successful: %s (%s) %s', me.host, me.name, inputName, inputEventName, inputReference);
			me.currentInputReference = inputReference;

			let mute = powerState ? (response.data.muted == true) : true;
			let volume = response.data.volume;
			if (me.speakerService) {
				me.speakerService.updateCharacteristic(Characteristic.Mute, mute);
				me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
				if (me.volumeService && me.volumeControl >= 1) {
					me.volumeService.updateCharacteristic(Characteristic.On, !mute);
				}
				if (me.volumeService && me.volumeControl == 1) {
					me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
				}
				if (me.volumeService && me.volumeControl == 2) {
					me.volumeService.updateCharacteristic(Characteristic.RotationSpeed, volume);
				}
			}
			me.log.debug('Device: %s %s, get current Mute state: %s', me.host, me.name, mute ? 'ON' : 'OFF');
			me.log.debug('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
			me.currentMuteState = mute;
			me.currentVolume = volume;
		}).catch(error => {
			me.log.error('Device: %s %s, update Device state error: %s, state: Offline', me.host, me.name, error);
		});
	}

	getPower(callback) {
		var me = this;
		axios.get(this.url + '/api/statusinfo').then(response => {
			let state = (response.data.inStandby === 'false');
			me.log.info('Device: %s %s, get current Power state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
			callback(null, state);
		}).catch(error => {
			me.log.error('Device: %s %s, get current Power state error: %s', me.host, me.name, error);
		});
	}

	setPower(state, callback) {
		var me = this;
		let newState = state ? '4' : '5';
		if ((state && !me.currentPowerState) || (!state && me.currentPowerState)) {
			axios.get(me.url + '/api/powerstate?newstate=' + newState).then(result => {
				me.log.info('Device: %s %s, set new Power state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
				callback(error);
			});
		}
	}

	getMute(callback) {
		var me = this;
		axios.get(this.url + '/api/statusinfo').then(response => {
			let state = me.currentPowerState ? (response.data.muted == true) : true;
			me.log.info('Device: %s %s, get current Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
			callback(null, state);
		}).catch(error => {
			me.log.error('Device: %s %s, get current Mute state error: %s', me.host, me.name, error);
		});
	}

	setMute(state, callback) {
		var me = this;
		let muteState = me.currentMuteState;
		if (me.currentPowerState && state !== muteState) {
			axios.get(me.url + '/api/vol?set=mute').then(result => {
				me.log.info('Device: %s %s, set Mute successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, can not set Mute. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
				callback(error);
			});
		}
	}

	getVolume(callback) {
		var me = this;
		axios.get(this.url + '/api/statusinfo').then(response => {
			let volume = response.data.volume;
			me.log.info('Device: %s %s, get current Volume level successful: %s', me.host, me.name, volume);
			callback(null, volume);
		}).catch(error => {
			me.log.error('Device: %s %s, get current Volume error: %s', me.host, me.name, error);
		});
	}

	setVolume(volume, callback) {
		var me = this;
		let currentVolume = me.currentVolume;
		if (volume == 0 || volume == 100) {
			volume = currentVolume;
		}
		axios.get(me.url + '/api/vol?set=set' + volume).then(result => {
			me.log.info('Device: %s %s, set new Volume level successful: %s', me.host, me.name, volume);
			callback(null);
		}).catch(error => {
			me.log.error('Device: %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
			callback(error);
		});
	}

	getInput(callback) {
		var me = this;
		axios.get(this.url + '/api/statusinfo').then(response => {
			let inputName = response.data.currservice_station;
			let inputReference = response.data.currservice_serviceref;
			let inputIdentifier = me.inputReferences.indexOf(inputReference);
			me.log.info('Device: %s %s, get current Channel successful: %s %s', me.host, me.name, inputName, inputReference);
			me.getInputEventName();
			callback(null, inputIdentifier);
		}).catch(error => {
			me.log.error('Device: %s %s, get current Channel error: %s', me.host, me.name, error);
		});
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		let inputName = me.inputNames[inputIdentifier];
		let inputReference = me.inputReferences[inputIdentifier];
		setTimeout(() => {
			axios.get(me.url + '/api/zap?sRef=' + inputReference).then(result => {
				me.log.info('Device: %s %s, set new Channel successful: %s %s', me.host, me.name, inputName, inputReference);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, can not set new Channel. Might be due to a wrong settings in config, error: %s.', me.host, me.name, error);
				callback(error);
			});
		}, 250);
	}

	getInputEventName() {
		var me = this;
		axios.get(this.url + '/api/statusinfo').then(response => {
			let inputEventName = response.data.currservice_name;
			me.log.info('Device: %s %s, get current Event successful: %s', me.host, me.name, inputEventName);
		}).catch(error => {
			me.log.error('Device: %s %s, get current Event error: %s', me.host, me.name, error);
		});
	}

	setPowerModeSelection(state, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState) {
			switch (state) {
				case Characteristic.PowerModeSelection.SHOW:
					command = me.currentInfoMenuState ? '174' : (me.switchInfoMenu ? '139' : '358');
					me.currentInfoMenuState = !me.currentInfoMenuState;
					break;
				case Characteristic.PowerModeSelection.HIDE:
					command = '174';
					break;
			}
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(result => {
				me.log.info('Device: %s %s, setPowerModeSelection successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, can not setPowerModeSelection command. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
				callback(error);
			});
		}
	}

	setVolumeSelector(state, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState) {
			switch (state) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = '115';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = '114';
					break;
			}
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(result => {
				me.log.info('Device: %s %s, setVolumeSelector successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
				callback(error);
			});
		}
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState) {
			switch (remoteKey) {
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
					command = me.switchInfoMenu ? '358' : '139';
					break;
			}
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(result => {
				me.log.info('Device: %s %s, setRemoteKey successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
				callback(error);
			});
		}
	}
};
