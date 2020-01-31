const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const responseDelay = 1000;

var Accessory, Service, Characteristic, UUIDGen;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform('homebridge-openwebif-tv', 'OpenWebIfTv', openwebifPlatform, true);
};


class openwebifPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		this.tvAccessories = [];

		this.checkStateInterval = config.checkStateInterval || 5;
		this.checkIntervel = this.checkStateInterval * 1000;
		this.devices = config.devices || [];

		if (this.version < 2.1) {
			throw new Error('Unexpected API version.');
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new openwebifTvDevice(log, this.devices[i], api));
		}

		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
	configureAccessory() { }
	removeAccessory() { }
	didFinishLaunching() {
		var me = this;
		setTimeout(function () {
			me.log.debug('didFinishLaunching');
		}, (this.devices.length + 1) * responseDelay);
	}
}

class openwebifTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.device = device;

		this.manufacturer = device.manufacturer || 'OpenWebIf';
		this.modelName = device.model || 'homebridge-openwebif-tv';
		this.serialNumber = device.serialNumber || 'SN00000001';
		this.firmwareRevision = device.firmwareRevision || 'FW00000002';

		// devices configuration
		this.name = device.name || 'Sat Receiver';
		this.host = device.host;
		this.port = device.port || 80;
		this.auth = device.auth || false;
		this.user = device.user || 'root';
		this.pass = device.pass || '';
		this.bouquets = device.bouquets;

		if (this.auth == true) {
			this.authData = ('http://' + this.user + ':' + this.pass + '@');
		} else {
			this.authData = ('http://');
		}

		this.switchInfoMenu = device.switchInfoMenu;
		if (this.switchInfoMenu === true) {
			this.infoButton = '358';
			this.menuButton = '139';
		} else {
			this.infoButton = '139';
			this.menuButton = '358';
		}

		//setup variables
		this.connected = false;
		this.channelReferences = new Array();

		this.getDeviceInfo();

		this.prefsDir = ppath('openwebifTv/');
		this.channelsFile = this.prefsDir + 'channels_' + this.host.split('.').join('');

		//check if prefs directory ends with a /, if not then add it
		if (this.prefsDir.endsWith('/') === false) {
			this.prefsDir = this.prefsDir + '/';
		}

		// check if the directory exists, if not then create it
		if (fs.existsSync(this.prefsDir) === false) {
			mkdirp(this.prefsDir);
		}

		if (fs.existsSync(this.channelsFile) === false) {
			this.getBouquets();
			this.log.info('Channels for device: %s, will be created and saved in %s', this.host, this.prefsDir);
		}

		//Delay to wait for retrieve device info
		setTimeout(this.prepareTvService.bind(this), responseDelay);
	}

	getDeviceInfo() {
		var me = this;
		request(this.authData + this.host + ':' + this.port + '/api/about', function (error, response, body) {
			if (error) {
				me.log.error('Openwebif - Error: %s', error);
			} else {
				try {
					var json = JSON.parse(body);
					me.manufacturer = json.info.brand;
					me.modelName = json.info.mname;
					me.serialNumber = json.info.kernelver;
					me.firmwareRevision = json.info.enigmaver;
					var chipset = json.info.chipset;
					var webifver = json.info.webifver;

					me.log('-----Device %s-----', me.host);
					me.log('Manufacturer: %s', me.manufacturer);
					me.log('Model: %s', me.modelName);
					me.log('Kernel: %s', me.serialNumber);
					me.log('Chipset: %s', chipset);
					me.log('Firmware: %s', me.firmwareRevision);
					me.log('Webif version.: %s', webifver);
				} catch (error) {
					me.log.error('Device: %s, not reachable %s.', me.host, error);
				}
			}
		});
	}

	//Start of TV integration service 
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
			.on('set', (inputIdentifier, callback) => {
				this.setChannel(callback, this.channelReferences[inputIdentifier]);
			})
			.on('get', this.getChannel.bind(this));

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', (newValue, callback) => {
				if (this.connected) {
					this.httpGET('/api/remotecontrol?command=' + this.menuButton, function (error, data) { });
				}
				callback();
			});


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);

		this.prepareTvSpeakerService();
		this.prepareInputServices();


		this.log.debug('publishExternalAccessories for device: %s', this.host);
		this.api.publishExternalAccessories('homebridge-openwebif-tv', [this.tvAccesory]);
	}

	prepareTvSpeakerService() {
		this.log.debug('prepareTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
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

	prepareInputServices() {
		this.log.debug('prepareInputServices');
		if (this.bouquets === undefined || this.bouquets === null || this.bouquets.length <= 0) {
			return;
		}

		if (Array.isArray(this.bouquets) === false) {
			this.bouquets = [this.bouquets];
		}

		let savedNames = {};

		this.bouquets.forEach((bouquet, i) => {

			// get channel reference
			let channelReference = null;

			if (bouquet.reference !== undefined) {
				channelReference = bouquet.reference;
			} else {
				channelReference = bouquet;
			}

			// get channel name		
			let channelName = channelReference;

			if (savedNames && savedNames[channelReference]) {
				channelName = savedNames[channelReference];
			} else if (bouquet.name) {
				channelName = bouquet.name;
			}

			// if reference not null or empty add the input
			if (channelReference !== undefined && channelReference !== null && channelReference !== '') {
				channelReference = channelReference.replace(/\s/g, ''); // remove all white spaces from the string

				let tempInput = new Service.InputSource(channelReference, 'channel' + i);
				tempInput
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, channelName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tempInput
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (name, callback) => {
						this.bouquets[channelReference] = name;
						fs.writeFile(this.channelsFile, JSON.stringify(this.bouquets), (err) => {
							if (err) {
								this.log('Error occuredon device: %s, could not write new channel name %s', me.host, err);
							} else {
								this.log('New channel name for device: %s, successfully saved! New name: %s reference: %s', me.host, name, channelReference);
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

	httpGET(apipath, callback) {
		var me = this;
		me.httpRequest(me.authData + me.host + ':' + me.port + apipath, '', 'GET', function (error, response, responseBody) {
			if (error) {
				callback(error);
				me.log.error('Device: %s, not reachable.', me.host + ':' + me.port + apipath);
				return;
			} else {
				try {
					var result = JSON.stringify(responseBody, function (err, data) {
						if (err) {
							callback(err);
						} else {
							me.log.debug('result %s', data);
							me.connected = true;
							callback(null, data);
						}
					});
				} catch (e) {
					callback(e, null);
					me.log.error('error: ' + e);
				}
			}
		}.bind(this));
	}

	httpRequest(url, body, apipath, callback) {
		request({
			url: url,
			body: body,
			method: apipath
		},
			function (error, response, body) {
				callback(error, response, body);
			});
	}

	getPowerState(callback) {
		var me = this;
		this.httpGET('/api/statusinfo', function (error, data) {
			if (error) {
				me.log.error('Can not acces device: %s and get Power. Might be due to a wrong settings in config, error %s:', me.host, error);
				if (callback)
					callback(error);
			} else {
				var json = JSON.parse(data);
				var state = (json.inStandby == 'false');
				me.log('Device: %s, get Power succeded: %s', me.host, state ? 'ON' : 'STANDBY');
				callback(null, state);
			}
		});
	}

	setPowerState(state, callback) {
		var me = this;
		var state = state ? true : false; //number to boolean
		me.getPowerState(function (error, currentState) {
			if (error) {
				me.log.error('Can not acces device: %s and get current Power state. Might be due to a wrong settings in config, error %s:', me.host, error);
				if (callback)
					callback(null, state ? false : true); //receiver is off
			} else {
				if (currentState == state) { //state like expected
					callback(null, state);
				} else { //set new state
					me.httpGET('/api/powerstate?newstate=0', function (error) {
						if (error) {
							me.log.error('Can not acces device: %s and set Power. Might be due to a wrong settings in config, error %s:', me.host, error);
							callback(error);
						} else {
							me.log('Device: %s, set Power succeded: %s', me.host, currentState ? 'STANDBY' : 'ON');
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getMute(callback) {
		var me = this;
		this.httpGET('/api/statusinfo', function (error, data) {
			if (error) {
				me.log.error('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
				if (callback)
					callback(error);
			} else {
				var json = JSON.parse(data);
				var state = (json.muted == false);
				me.log('Device: %s, get Mute succeded: %s', me.host, state ? 'OFF' : 'ON');
				callback(null, state);
			}
		});
	}

	setMute(state, callback) {
		var me = this;
		var state = state ? false : true; //number to boolean
		me.getMute(function (error, currentState) {
			if (error) {
				me.log.error('Can not acces device: %s and get current Mute state. Might be due to a wrong settings in config, error %s:', me.host, error);
				if (callback)
					callback(null, state ? true : false); //receiver is off
			} else {
				if (currentState == state) { //state like expected
					callback(null, state);
				} else { //set new state
					me.httpGET('/api/vol?set=mute', function (error) {
						if (error) {
							me.log.error('Can not acces device: %s and set Mute. Might be due to a wrong settings in config, error %s:', me.host, error);
							callback(error);
						} else {
							me.log('Device: %s, set Mute succeded: %s', me.host, currentState ? 'OFF' : 'ON');
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		this.httpGET('/api/statusinfo', function (error, data) {
			if (error) {
				me.log.error('Can not acces device: %s and get Volume. Might be due to a wrong settings in config, error %s:', me.host, error);
				if (callback)
					callback(error);
			} else {
				var json = JSON.parse(data);
				var volume = parseFloat(json.volume);
				me.log('Device: %s, get Volume succeded: %s', me.host, volume);
				callback(null, volume);
			}
		});
	}

	setVolume(volume, callback) {
		var me = this;
		var targetVolume = parseInt(volume);
		this.httpGET('/api/vol?set=set' + targetVolume, function (error, data) {
			if (error) {
				me.log.error('Can not acces device: %s and set Volume. Might be due to a wrong settings in config, error %s:', me.host, error);
				if (callback)
					callback(error);
			} else {
				me.log('Device: %s, set Volume succesed: %s', me.host, targetVolume);
				callback(null, volume);
			}
		});

	}

	getChannel(callback) {
		var me = this;
		this.httpGET('/api/statusinfo', function (error, data) {
			if (error) {
				me.log.error('Can not acces devive: %s and get Channel. Might be due to a wrong settings in config, error %s:', me.host, error);
				if (callback)
					callback();
			} else {
				var json = JSON.parse(data);
				let channelReference = json.currservice_serviceref;
				for (let i = 0; i < me.channelReferences.length; i++) {
					if (channelReference === me.channelReferences[i]) {
						me.tvService
							.getCharacteristic(Characteristic.ActiveIdentifier)
							.updateValue(i);
						me.log('Device: %s, get Channel succesed %s:', me.host, channelReference);
					}
				}
				callback(null, channelReference);
			}
		});
	}

	setChannel(callback, channelReference) {
		var me = this;
		me.channelReferenceSet = true;
		this.httpGET('/api/zap?sRef=' + channelReference, function (error, data) {
			if (error) {
				me.log.error('Can not acces device: %s and set Channel. Might be due to a wrong settings in config, error: %s.', me.host, error);
				if (callback)
					callback();
			} else {
				me.log('Device: %s, set Channel succesed %s:', me.host, channelReference);
				if (callback)
					callback(null, channelReference);
			}
		});
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = '115';
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = '114';
				break;
		}
		me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	remoteKeyPress(remoteKey, callback) {
		var me = this;
		var command = 0;
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
				command = '139';
				break;
		}
		me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		this.httpGET('/api/remotecontrol?command=' + command, function (error) {
			if (error) {
				callback(error)
			} else {
				me.log('Device: %s, send Command succeded: %s', me.host, command);
				callback(null, command);
			}
		});
	}

	getBouquets() {
		var me = this;
		this.httpGET('/api/getservices', function (error, data) {
			if (error) {
			} else {
				var json = JSON.parse(data);
				var servicesList = json.services;
				me.saveBouquetsChannels(servicesList, new Array());
				var arrayLength = servicesList.length;
				for (var i = 0; i < arrayLength; i++) {
					var service = servicesList[i];
				}
			}
		});
	}

	saveBouquetsChannels(bouquets, printArray) {

		//bouquets
		let bouquet = bouquets[0];
		bouquets.shift();
		let name = bouquet.servicename;
		let ref = bouquet.servicereference;

		//channels
		var me = this;
		this.httpGET('/api/getservices?sRef=' + ref, function (error, data) {
			if (error) {
			} else {
				var json = JSON.parse(data);
				var servicesList = json.services;
				var arr = [];
				var arrayLength = 96;
				for (var i = 0; i < arrayLength; i++) {
					var service = servicesList[i];
					let name = service.servicename;
					let ref = service.servicereference;
					var object = { 'name': name, 'reference': ref };
					printArray.push(object);
				}
				var string = JSON.stringify(printArray, null, 2);
				me.log.info('Device: %s, saved channels file successfully in %s:', me.host, me.prefsDir);
				fs.writeFileSync(me.channelsFile, string, 'utf8', (err) => {
					if (err) throw err;
				});
			}
		});
	}
}


