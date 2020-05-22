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
			log('No configuration found for homebridge-openwebif-tv');
			return;
		}
		this.log = log;
		this.config = config;
		this.api = api;
		this.devices = config.devices || [];
		this.accessories = [];

		if (this.api) {
			if (this.api.version < 2.1) {
				throw new Error('Unexpected API version.');
			}
			this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
		}
	}

	didFinishLaunching() {
		this.log.debug('didFinishLaunching');
		for (let i = 0, len = this.devices.length; i < len; i++) {
			let deviceName = this.devices[i];
			if (!deviceName.name) {
				this.log.warn('Device Name Missing')
			} else {
				this.accessories.push(new openwebIfTvDevice(this.log, deviceName, this.api));
			}
		}
	}

	configureAccessory(platformAccessory) {
		this.log.debug('configureAccessory');
		if (this.accessories) {
			this.accessories.push(platformAccessory);
		}
	}

	removeAccessory(platformAccessory) {
		this.log.debug('removeAccessory');
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
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs;

		//get config info
		this.manufacturer = config.manufacturer || 'openWebIf';
		this.modelName = config.modelName || PLUGIN_NAME;
		this.serialNumber = config.serialNumber || 'SN0000001';
		this.firmwareRevision = config.firmwareRevision || 'FW0000001';

		//setup variables
		this.inputNames = new Array();
		this.inputEventNames = new Array();
		this.inputReferences = new Array();
		this.connectionStatus = false;
		this.deviceStatusResponse = null;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = null;
		this.currentInputEventName = null;
		this.currentInputReference = null;
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

		//Check net state
		setInterval(function () {
			axios.get(this.url + '/api/statusinfo').then(response => {
				this.deviceStatusResponse = response;
				if (!this.connectionStatus) {
					this.log.info('Device: %s %s, state: Online', this.host, this.name);
					this.connectionStatus = true;
					setTimeout(this.getDeviceInfo.bind(this), 750);
				} else {
					this.getDeviceState();
				}
			}).catch(error => {
				this.log.debug('Device: %s %s, state: Offline', this.host, this.name);
				this.connectionStatus = false;
				this.currentPowerState = false;
				return;
			});
		}.bind(this), 2000);

		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1500);
	}

	getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting config information.', me.host, me.name);
		axios.get(me.url + '/api/getallservices').then(response => {
			let channels = JSON.stringify(response.data.services, null, 2);
			fs.writeFile(me.inputsFile, channels, (error) => {
				if (error) {
					me.log.error('Device: %s %s, could not write Channels to the file, error: %s', me.host, me.name, error);
				} else {
					me.log.debug('Device: %s %s, saved Channels successful in: %s', me.host, me.name, me.prefDir);
				}
			});
		}).catch(error => {
			me.log.error('Device: %s %s, get Channels list error: %s', me.host, me.name, error);
		});

		axios.get(me.url + '/api/deviceinfo').then(response => {
			me.manufacturer = response.data.brand;
			me.modelName = response.data.mname;
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
		}).catch(error => {
			me.log.error('Device: %s %s, getDeviceInfo eror: %s', me.host, me.name, error);
		});
	}

	getDeviceState() {
		var me = this;
		let response = me.deviceStatusResponse;
		let powerState = (response.data.inStandby === 'false');
		if (me.televisionService) {
			if (powerState && !me.currentPowerState) {
				me.televisionService.updateCharacteristic(Characteristic.Active, true);
				me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name);
				me.currentPowerState = true;
			} else {
				if (!powerState && me.currentPowerState) {
					me.televisionService.updateCharacteristic(Characteristic.Active, false);
					me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name);
					me.currentPowerState = false;
				}
			}
		}

		let inputName = response.data.currservice_station;
		let inputEventName = response.data.currservice_name;
		let inputReference = response.data.currservice_serviceref;
		let inputIdentifier = me.inputReferences.indexOf(inputReference);
		if (me.televisionService) {
			me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
			me.log.debug('Device: %s %s, get current Channel successful: %s (%s) %s', me.host, me.name, inputName, inputEventName, inputReference);
			me.currentInputName = inputName;
			me.currentInputEventName = inputEventName;
			me.currentInputReference = inputReference;
		}

		let mute = (response.data.muted == true);
		let muteState = powerState ? mute : true;
		let volume = parseInt(response.data.volume);
		if (me.speakerService) {
			me.speakerService.updateCharacteristic(Characteristic.Mute, muteState);
			me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
			if (me.volumeControl && me.volumeService) {
				me.volumeService.updateCharacteristic(Characteristic.On, !muteState);
				me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
			}
			me.log.debug('Device: %s %s, get current Mute state: %s', me.host, me.name, muteState ? 'ON' : 'OFF');
			me.log.debug('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
			me.currentMuteState = muteState;
			me.currentVolume = volume;
		}
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		this.accessory = new Accessory(accessoryName, accessoryUUID);
		this.accessory.category = Categories.TELEVISION;

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
		this.prepareInputsService();
		if (this.volumeControl) {
			this.prepareVolumeService();
		}

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
		this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
		this.volumeService.getCharacteristic(Characteristic.On)
			.on('get', this.getMuteSlider.bind(this))
			.on('set', (newValue, callback) => {
				this.speakerService.setCharacteristic(Characteristic.Mute, !newValue);
				callback(null);
			});
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

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
			} else if (input.name) {
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
			this.accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);
		});
	}

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState
		me.log.info('Device: %s %s, get current Power state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		let newState = state ? '4' : '5';
		if ((state && !me.currentPowerState) || (!state && me.currentPowerState)) {
			axios.get(me.url + '/api/powerstate?newstate=' + newState).then(response => {
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
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log.info('Device: %s %s, get current Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	getMuteSlider(callback) {
		var me = this;
		let state = me.currentPowerState ? !me.currentMuteState : false;
		me.log.debug('Device: %s %s, get current Mute state successful: %s', me.host, me.name, !state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		if (me.currentPowerState) {
			axios.get(me.url + '/api/vol?set=mute').then(response => {
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
		let volume = me.currentVolume;
		me.log.info('Device: %s %s, get current Volume level successful: %s', me.host, me.name, volume);
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		let targetVolume = parseInt(volume);
		axios.get(me.url + '/api/vol?set=set' + targetVolume).then(response => {
			me.log.info('Device: %s %s, set new Volume level successful: %s', me.host, me.name, volume);
			callback(null);
		}).catch(error => {
			me.log.error('Device: %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
			callback(error);
		});
	}

	getInput(callback) {
		var me = this;
		let inputName = me.currentInputName;
		let inputReference = me.currentInputReference;
		if (!me.currentPowerState || inputReference === undefined || inputReference === null || inputReference === '') {
			me.televisionService
				.updateCharacteristic(Characteristic.ActiveIdentifier, 0);
			callback(null, 0);
		} else {
			let inputIdentifier = me.inputReferences.indexOf(inputReference);
			if (inputReference === me.inputReferences[inputIdentifier]) {
				me.televisionService
					.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				me.log.info('Device: %s %s, get current Channel successful: %s %s', me.host, me.name, inputName, inputReference);
			}
			me.getInputEventName();
			callback(null, inputIdentifier);
		}
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		setTimeout(() => {
			let inputReference = me.inputReferences[inputIdentifier];
			let inputName = me.inputNames[inputIdentifier];
			axios.get(me.url + '/api/zap?sRef=' + inputReference).then(response => {
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
		let inputEventName = me.currentInputEventName;
		me.log.info('Device: %s %s, get current Event successful: %s', me.host, me.name, inputEventName);
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
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(response => {
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
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(response => {
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
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(response => {
				me.log.info('Device: %s %s, setRemoteKey successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
				callback(error);
			});
		}
	}
};
