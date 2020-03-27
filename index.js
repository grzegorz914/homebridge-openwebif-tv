const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform('homebridge-openwebif-tv', 'OpenWebIfTv', openwebIfTvPlatform, true);
};

class openwebIfTvPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		this.devices = config.devices || [];
		this.tvAccessories = [];

		if (this.version < 2.1) {
			throw new Error('Unexpected API version.');
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new openwebIfTvDevice(log, this.devices[i], api));
		}

		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
	configureAccessory() { }
	removeAccessory() { }
	didFinishLaunching() {
		var me = this;
		me.log.debug('didFinishLaunching');
	};
}

class openwebIfTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;

		//device configuration
		this.device = device;
		this.name = device.name;
		this.host = device.host;
		this.port = device.port || 80;
		this.auth = device.auth || false;
		this.user = device.user || 'root';
		this.pass = device.pass || '';
		this.switchInfoMenu = device.switchInfoMenu;
		this.bouquets = device.bouquets;

		//authentication basic
		this.url = this.auth ? ('http://' + this.user + ':' + this.pass + '@' + this.host + ':' + this.port) : ('http://' + this.host + ':' + this.port);

		//get Device info
		this.manufacturer = device.manufacturer || 'openWebIf';
		this.modelName = device.modelName || 'homebridge-openwebif-tv';
		this.serialNumber = device.serialNumber || 'SN0000001';
		this.firmwareRevision = device.firmwareRevision || 'FW0000001';

		//setup variables
		this.channelReferences = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentChannelReference = null;
		this.currentInfoMenuState = false;
		this.prefDir = ppath('openwebifTv/');
		this.channelsFile = this.prefDir + 'channels_' + this.host.split('.').join('');

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			mkdirp(this.prefDir);
		}

		//Check net state
		setInterval(function () {
			var me = this;
			request(me.url + '/api/deviceinfo', function (error, response, data) {
				if (error) {
					me.log('Device: %s, name: %s, state: Offline', me.host, me.name);
					me.connectionStatus = false;
				} else {
					if (!me.connectionStatus) {
						me.log('Device: %s, name: %s, state: Online', me.host, me.name);
						me.connectionStatus = true;
						if (fs.existsSync(me.channelsFile) === false) {
							me.getBouquets();
						}
						var json = JSON.parse(data);
						me.manufacturer = json.brand;
						me.modelName = json.mname;
						me.log('-------- %s --------', me.name);
						me.log('Manufacturer: %s', json.brand);
						me.log('Model: %s', json.mname);
						me.log('Kernel: %s', json.kernelver);
						me.log('Chipset: %s', json.chipset);
						me.log('Webif version.: %s', json.webifver);
						me.log('Firmware: %s', json.enigmaver);
						me.log('----------------------------------');
					}
				}
			});
		}.bind(this), 5000);

		this.prepareTvService();
	}

	//Prepare TV service 
	prepareTvService() {
		this.log.debug('prepareTvService');
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.host + this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', this.getChannel.bind(this))
			.on('set', (inputIdentifier, callback) => {
				this.setChannel(callback, this.channelReferences[inputIdentifier]);
			});

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);
		this.prepareTvSpeakerService();
		this.prepareInputServices();

		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-openwebif-tv', [this.tvAccesory]);
	}

	//Prepare speaker service 
	prepareTvSpeakerService() {
		this.log.debug('prepareTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.volumeSelectorPress.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	//Prepare Input services 
	prepareInputServices() {
		this.log.debug('prepareInputServices');
		if (this.bouquets === undefined || this.bouquets === null || this.bouquets.length <= 0) {
			return;
		}

		if (Array.isArray(this.bouquets) === false) {
			this.bouquets = [this.bouquets];
		}

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.channelsFile));
		} catch (err) {
			this.log.debug('Device: %s, channels file does not exist', this.host);
		}

		this.bouquets.forEach((bouquet, i) => {

			//get channel reference
			let channelReference = null;

			if (bouquet.reference !== undefined) {
				channelReference = bouquet.reference;
			} else {
				channelReference = bouquet;
			}

			//get channel name		
			let channelName = channelReference;

			if (savedNames && savedNames[channelReference]) {
				channelName = savedNames[channelReference];
			} else if (bouquet.name) {
				channelName = bouquet.name;
			}

			//If reference not null or empty add the input
			if (channelReference !== undefined && channelReference !== null && channelReference !== '') {
				channelReference = channelReference.replace(/\s/g, ''); // remove all white spaces from the string

				let tempInput = new Service.InputSource(channelReference, 'channel' + i);
				tempInput
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, channelName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tempInput
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (name, callback) => {
						this.bouquets[channelReference] = name;
						fs.writeFile(this.channelsFile, JSON.stringify(this.bouquets), (error) => {
							if (error) {
								this.log.debug('Device: %s, can not write new channel name, error: %s', this.host, error);
							} else {
								this.log('Device: %s, saved new channel successfull, name: %s, reference: %s', this.host, name, channelReference);
							}
						});
						callback()
					});
				this.tvAccesory.addService(tempInput);
				if (!tempInput.linked)
					this.tvService.addLinkedService(tempInput);
				this.channelReferences.push(channelReference);
			}

		});
	}

	getPowerState(callback) {
		var me = this;
		request(me.url + '/api/statusinfo', function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				var json = JSON.parse(data);
				var state = (json.inStandby == 'false');
				me.log('Device: %s, get current Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
				me.currentPowerState = state;
				callback(null, state);
			}
		});
	}

	setPowerState(state, callback) {
		var me = this;
		me.getPowerState(function (error, currentPowerState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Power for new state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (state !== currentPowerState) {
					var newState = state ? '4' : '5';
					request(me.url + '/api/powerstate?newstate=' + newState, function (error, response, data) {
						if (error) {
							me.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
							callback(error);
						} else {
							me.log('Device: %s, set new Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
							me.currentPowerState = state;
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getMute(callback) {
		var me = this;
		request(me.url + '/api/statusinfo', function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				var json = JSON.parse(data);
				var state = (json.muted == true);
				me.log('Device: %s, get current Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
				me.currentMuteState = state;
				callback(null, state);
			}
		});
	}

	setMute(state, callback) {
		var me = this;
		me.getMute(function (error, currentMuteState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Mute for new state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (state !== currentMuteState) {
					request(me.url + '/api/vol?set=mute', function (error, response, data) {
						if (error) {
							me.log.debug('Device: %s, can not set Mute. Might be due to a wrong settings in config, error: %s', me.host, error);
							callback(error);
						} else {
							me.log('Device: %s, set Mute successfull: %s', me.host, state ? 'ON' : 'OFF');
							me.currentMuteState = state;
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		request(me.url + '/api/statusinfo', function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				var json = JSON.parse(data);
				var volume = parseFloat(json.volume);
				me.log('Device: %s, get current Volume level successfull: %s', me.host, volume);
				me.currentVolume = volume;
				callback(null, volume);
			}
		});
	}

	setVolume(volume, callback) {
		var me = this;
		var targetVolume = parseInt(volume);
		request(me.url + '/api/vol?set=set' + targetVolume, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, set new Volume level successfull: %s', me.host, volume);
				me.currentVolume = volume;
				callback(null, volume);
			}
		});
	}

	getChannel(callback) {
		var me = this;
		request(me.url + '/api/statusinfo', function (error, response, data) {
			if (error) {
				me.log.debug('Devive: %s, can not get current Channel. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				var json = JSON.parse(data);
				var channelReference = json.currservice_serviceref;
				var channelName = json.currservice_station;
				for (let i = 0; i < me.channelReferences.length; i++) {
					if ((channelReference !== me.channelReferences[i]) || (!me.connectionStatus || channelReference === '' || channelReference === undefined || channelReference === null)) {
						me.tvService
							.getCharacteristic(Characteristic.ActiveIdentifier)
							.updateValue(0);
						callback(null, channelReference);
					} else {
						me.tvService
							.getCharacteristic(Characteristic.ActiveIdentifier)
							.updateValue(i);
						me.log('Device: %s, get current Channel successfull: %s %s', me.host, channelName, channelReference);
						me.currentChannelReference = channelReference;
						callback(null, channelReference);
					}
				}
			}
		});
	}

	setChannel(callback, channelReference) {
		var me = this;
		me.getChannel(function (error, currentChannelReference) {
			if (error) {
				me.log.debug('Devive: %s, can not get current Channel for new Channel. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (channelReference !== currentChannelReference) {
					request(me.url + '/api/zap?sRef=' + channelReference, function (error, response, data) {
						if (error) {
							me.log.debug('Device: %s, can not set new Channel. Might be due to a wrong settings in config, error: %s.', me.host, error);
							callback(error);
						} else {
							me.log('Device: %s, set new Channel successfull: %s', me.host, channelReference);
							me.currentChannelReference = channelReference;
							callback(null, channelReference);
						}
					});
				}
			}
		});
	}

	setPowerModeSelection(state, callback) {
		var me = this;
		var command = '500';
		if (me.currentInfoMenuState) {
			command = '174';
		} else {
			command = me.switchInfoMenu ? '139' : '358';
		}
		request(me.url + '/api/remotecontrol?command=' + command, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s can not send RC Command. Might be due to a wrong settings in config, error: %s', me.host, error);
			} else {
				me.log('Device: %s, setPowerModeSelection successfull, state: %s, command: %s', me.host, state ? 'HIDDEN' : 'SHOW', command);
				me.currentInfoMenuState = !me.currentInfoMenuState;
				callback(null, state);
			}
		});
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		var command = '500';
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = '115';
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = '114';
				break;
		}
		request(me.url + '/api/remotecontrol?command=' + command, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s can not send RC Command. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, send RC Command successfull: %s', me.host, command);
				callback(null, remoteKey);
			}
		});
	}

	remoteKeyPress(remoteKey, callback) {
		var me = this;
		var command = '500';
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
		request(me.url + '/api/remotecontrol?command=' + command, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s can not send RC Command. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, send RC Command successfull, remoteKey: %s, command: %s', me.host, command, remoteKey);
				callback(null, remoteKey);
			}
		});
	}


	getBouquets() {
		var me = this;
		request(me.url + '/api/getservices', function (error, response, data) {
			if (error) {
			} else {
				var json = JSON.parse(data);
				var bouquetsList = json.services;
				var arrayLength = bouquetsList.length;
				for (var i = 0; i < arrayLength; i++) { }
				me.log.debug('Bouquets list', bouquetsList);
				me.saveBouquetsChannels(bouquetsList, new Array());
			}
		});
	}

	saveBouquetsChannels(bouquets, printArray) {
		var me = this;
		let bouquet = bouquets[0];
		bouquets.shift();
		let bouquetReference = bouquet.servicereference;
		request(me.url + '/api/getservices?sRef=' + bouquetReference, function (error, response, data) {
			if (error) {
			} else {
				var json = JSON.parse(data);
				var servicesList = json.services;
				if (servicesList.length > 96) {
					var arrayLength = 96;
				} else {
					var arrayLength = servicesList.length;
				}
				for (var i = 0; i < arrayLength; i++) {
					var service = servicesList[i];
					let name = service.servicename;
					let ref = service.servicereference;
					var object = { 'name': name, 'reference': ref };
					me.log.debug('Prepare channels to save in file', object);
					printArray.push(object);
				}
				var string = JSON.stringify(printArray, null, 2);
				me.log('Device: %s, saved channels successfull in: %s', me.host, me.prefDir);
				fs.writeFileSync(me.channelsFile, string, 'utf8', (error) => {
					if (error) {
						me.log.debug('Device: %s, can not create channels file, error: %s', me.host, error);
					}
				});
			}
		});
	}
};
