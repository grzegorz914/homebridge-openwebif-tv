'use strict';

const hap = require("hap-nodejs");
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const Characteristic = hap.Characteristic;
const CharacteristicEventTypes = hap.CharacteristicEventTypes;
const Service = hap.Service;
const UUID = hap.uuid;

const PLUGIN_NAME = 'homebridge-openwebif-tv';
const PLATFORM_NAME = 'OpenWebIfTv';

let Accessory;

module.exports = api => {
	Accessory = api.platformAccessory;
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
		this.devices = config.devices || [];
		this.accessories = [];

		if (api) {
			this.api = api;
			if (this.version < 2.1) {
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
	constructor(log, device, api) {
		this.log = log;
		this.device = device;
		this.api = api;
		this.device = device;

		//device configuration
		this.name = device.name;
		this.host = device.host;
		this.port = device.port;
		this.auth = device.auth;
		this.user = device.user;
		this.pass = device.pass;
		this.volumeControl = device.volumeControl;
		this.switchInfoMenu = device.switchInfoMenu;
		this.inputs = device.inputs;

		//get Device info
		this.manufacturer = device.manufacturer || 'openWebIf';
		this.modelName = device.modelName || PLUGIN_NAME;
		this.serialNumber = device.serialNumber || 'SN0000001';
		this.firmwareRevision = device.firmwareRevision || 'FW0000001';

		//setup variables
		this.inputReferences = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputReference = null;
		this.currentInputName = null;
		this.currentInfoMenuState = false;
		this.prefDir = path.join(api.user.storagePath(), 'openwebifTv');
		this.inputsFile = this.prefDir + '/' + 'channels_' + this.host.split('.').join('');
		this.url = this.auth ? ('http://' + this.user + ':' + this.pass + '@' + this.host + ':' + this.port) : ('http://' + this.host + ':' + this.port);

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fs.mkdir(this.prefDir, { recursive: false }, (error) => {
				if (error) {
					this.log.debug('Device: %s %s, create directory: %s, error: %s', this.host, this.name, this.prefDir, error);
				}
			});
		}

		//Check net state
		setInterval(function () {
			var me = this;
			axios.get(me.url + '/api/deviceinfo').then(response => {
				if (!me.connectionStatus) {
					me.log('Device: %s %s, state: Online', me.host, me.name);
					me.connectionStatus = true;
					me.getDeviceInfo();
				} else {
					if (me.connectionStatus) {
						me.getDeviceState();
					}
				}
			}).catch(error => {
				if (error) {
					me.log.debug('Device: %s %s %s, state: Offline', me.host, me.name, me.zoneName);
					me.connectionStatus = false;
					return;
				}
			});
		}.bind(this), 3000);

		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1000);
	}

	getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		axios.get(me.url + '/api/getallservices').then(response => {
			if (fs.existsSync(me.inputsFile) === false) {
				let channels = response.data.services;
				me.log.debug('Device: %s %s, get Channels list successful: %s', me.host, me.name, JSON.stringify(channels, null, 2));
				fs.writeFile(me.inputsFile, JSON.stringify(channels), (error) => {
					if (error) {
						me.log.debug('Device: %s %s, could not write Channels to the file, error: %s', me.host, me.name, error);
					} else {
						me.log('Device: %s %s, saved Channels successful in: %s', me.host, me.name, me.prefDir);
					}
				});
			} else {
				me.log.debug('Device: %s %s, Channels file already exists, not saving', me.host, me.name);
			}
		}).catch(error => {
			if (error) {
				me.log.debug('Device: %s %s, get Channels list error: %s', me.host, me.name, error);
			}
		});

		axios.get(me.url + '/api/deviceinfo').then(response => {
			me.manufacturer = response.data.brand;
			me.modelName = response.data.mname;
			me.log('-------- %s --------', me.name);
			me.log('Manufacturer: %s', response.data.brand);
			me.log('Model: %s', response.data.mname);
			me.log('Kernel: %s', response.data.kernelver);
			me.log('Chipset: %s', response.data.chipset);
			me.log('Webif version.: %s', response.data.webifver);
			me.log('Firmware: %s', response.data.enigmaver);
			me.log('----------------------------------');
		}).catch(error => {
			if (error) {
				me.log.debug('Device: %s %s, getDeviceInfo eror: %s', me.host, me.name, error);
			}
		});
	}

	getDeviceState() {
		var me = this;
		axios.get(me.url + '/api/statusinfo').then(response => {
			let powerState = (response.data.inStandby == 'false');
			if (me.televisionService && (powerState !== me.currentPowerState)) {
				me.televisionService.getCharacteristic(Characteristic.Active).updateValue(powerState);
				me.log('Device: %s %s, get current Power state successful: %s', me.host, me.name, powerState ? 'ON' : 'STANDBY');
				me.currentPowerState = powerState;
			}
			let inputReference = response.data.currservice_serviceref;
			let inputName = response.data.currservice_station;
			if (me.televisionService && powerState && (me.currentInputReference !== inputReference)) {
				if (me.inputReferences && me.inputReferences.length > 0) {
					let inputIdentifier = me.inputReferences.indexOf(inputReference);
					me.televisionService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(inputIdentifier);
					me.log('Device: %s %s, get current Channel successful: %s %s', me.host, me.name, inputName, inputReference);
					me.currentInputReference = inputReference;
				}
			}
			let muteState = powerState ? (response.data.muted == true) : true;
			let volume = parseInt(response.data.volume);
			if (me.speakerService && powerState && (me.currentMuteState !== muteState || me.currentVolume !== volume)) {
				me.speakerService.getCharacteristic(Characteristic.Mute).updateValue(muteState);
				me.speakerService.getCharacteristic(Characteristic.Volume).updateValue(volume);
				if (me.volumeControl && me.volumeService) {
					me.volumeService.getCharacteristic(Characteristic.On).updateValue(!muteState);
					me.volumeService.getCharacteristic(Characteristic.Brightness).updateValue(volume);
				}
				me.log('Device: %s %s, get current Mute state: %s', me.host, me.name, muteState ? 'ON' : 'OFF');
				me.log('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
				me.currentMuteState = muteState;
				me.currentVolume = volume;
			}
		}).catch(error => {
			if (error) {
				me.log.debug('Device: %s %s, getDeviceState error: %s', me.host, me.name, error);
			}
		});
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		this.accessoryUUID = UUID.generate(this.name);
		this.accessory = new Accessory(this.name, this.accessoryUUID);
		this.accessory.category = 31;

		this.televisionService = new Service.Television(this.name, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, this.name);
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


		this.accessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.accessory.addService(this.televisionService);
		this.prepareSpeakerService();
		this.prepareInputsService();
		if (this.volumeControl) {
			this.prepareVolumeService();
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, this.name);
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
			.on('get', this.getMuteSlider.bind(this));
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');
		if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
			return;
		}

		if (Array.isArray(this.inputs) === false) {
			this.inputs = [this.inputs];
		}

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.inputsFile));
		} catch (err) {
			this.log.debug('Device: %s %s, channels file does not exist', this.host, this.name);
		}

		this.inputs.forEach((input, i) => {

			//get channel reference
			let inputReference = null;

			if (input.reference !== undefined) {
				inputReference = input.reference;
			} else {
				inputReference = input;
			}

			//get channel name		
			let inputName = inputReference;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else if (input.name) {
				inputName = input.name;
			}

			//If reference not null or empty add the input
			if (inputReference !== undefined && inputReference !== null || inputReference !== '') {

				this.inputsService = new Service.InputSource(inputReference, 'channel' + i);
				this.inputsService
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				this.inputsService
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (newInputName, callback) => {
						this.inputs[inputReference] = newInputName;
						fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
							if (error) {
								this.log.debug('Device: %s %s, can not write new Channel name, error: %s', this.host, this.name, error);
							} else {
								this.log('Device: %s %s, saved new Channel successful, name: %s, reference: %s', this.host, this.name, newInputName, inputReference);
							}
						});
						callback(null, newInputName)
					});
				this.accessory.addService(this.inputsService);
				this.televisionService.addLinkedService(this.inputsService);
				this.inputReferences.push(inputReference);
			}
		});
	}

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState
		me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, state ? 'ON' : 'STANDBY');
		me.currentPowerState = state;
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		if (state !== me.currentPowerState) {
			let newState = state ? '4' : '5';
			axios.get(me.url + '/api/powerstate?newstate=' + newState).then(response => {
				me.log('Device: %s %s, set new Power state successful: %s', me.host, me.name, state ? 'ON' : 'STANDBY');
				me.currentPowerState = state;
				callback(null, state);
			}).catch(error => {
				if (error) {
					me.log.debug('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
					callback(error);
				}
			});
		}
	}

	getMute(callback) {
		var me = this;
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log.debug('Device: %s %s, get current Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
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
		if (state !== me.currentMuteState) {
			axios.get(me.url + '/api/vol?set=mute').then(response => {
				me.log('Device: %s %s, set Mute successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
				callback(null, state);
			}).catch(error => {
				if (error) {
					me.log.debug('Device: %s %s, can not set Mute. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
					callback(error);
				}
			});
		}
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log.debug('Device: %s %s, get current Volume level successful: %s', me.host, me.name, volume);
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		let targetVolume = parseInt(volume);
		axios.get(me.url + '/api/vol?set=set' + targetVolume).then(response => {
			me.log('Device: %s %s, set new Volume level successful: %s', me.host, me.name, volume);
			callback(null, volume);
		}).catch(error => {
			if (error) {
				me.log.debug('Device: %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
				callback(error);
			}
		});
	}

	getInput(callback) {
		var me = this;
		let inputReference = me.currentInputReference;
		let inputName = me.currentInputName;
		if (!me.connectionStatus || inputReference === undefined || inputReference === null) {
			me.televisionService
				.getCharacteristic(Characteristic.ActiveIdentifier)
				.updateValue(0);
			callback(null);
		} else {
			let inputIdentifier = me.inputReferences.indexOf(inputReference);
			if (inputReference === me.inputReferences[inputIdentifier]) {
				me.televisionService
					.getCharacteristic(Characteristic.ActiveIdentifier)
					.updateValue(inputIdentifier);
				me.log.debug('Device: %s %s, get current Channel successful: %s %s', me.host, me.name, inputName, inputReference);
			}
			callback(null, inputIdentifier);
		}
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		let inputReference = me.inputReferences[inputIdentifier];
		if (inputReference !== me.currentInputReference) {
			axios.get(me.url + '/api/zap?sRef=' + inputReference).then(response => {
				me.log('Device: %s %s, set new Channel successful: %s', me.host, me.name, inputReference);
				callback(null, inputIdentifier);
			}).catch(error => {
				if (error) {
					me.log.debug('Device: %s %s, can not set new Channel. Might be due to a wrong settings in config, error: %s.', me.host, me.name, error);
					callback(error);
				}
			});
		}
	}

	setPowerModeSelection(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = '500';
			switch (remoteKey) {
				case Characteristic.PowerModeSelection.SHOW:
					if (me.currentInfoMenuState) {
						command = '174';
					} else {
						command = me.switchInfoMenu ? '139' : '358';
					}
					break;
				case Characteristic.PowerModeSelection.HIDE:
					command = '174';
					break;
			}
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(response => {
				me.log('Device: %s %s, setPowerModeSelection successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
				me.currentInfoMenuState = !me.currentInfoMenuState;
				callback(null, remoteKey);
			}).catch(error => {
				if (error) {
					me.log.debug('Device: %s %s, can not setPowerModeSelection. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
					callback(error);
				}
			});
		}
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = '500';
			switch (remoteKey) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = '115';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = '114';
					break;
			}
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(response => {
				me.log('Device: %s %s, setVolumeSelector successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
				callback(null, remoteKey);
			}).catch(error => {
				if (error) {
					me.log.debug('Device: %s %s, can not setVolumeSelector. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
					callback(error);
				}
			});
		}
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = '500';
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
					command = this.switchInfoMenu ? '358' : '139';
					break;
			}
			axios.get(me.url + '/api/remotecontrol?command=' + command).then(response => {
				me.log('Device: %s %s, setRemoteKey successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
				callback(null, remoteKey);
			}).catch(error => {
				if (error) {
					me.log.debug('Device: %s %s, can not setRemoteKey. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
					callback(error);
				}
			});
		}
	}
};
