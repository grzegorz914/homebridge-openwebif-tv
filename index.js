const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const responseDelay = 1000;

var Accessory, Service, Characteristic, UUIDGen;
var checkingInterval;

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

		this.checkingInterval = config.checkSatateInterval || 5;
		this.checkingInterval = this.checkingInterval * 1000;
		checkingInterval = this.checkingInterval;
		this.devices = config.devices || [];

		if (this.version < 2.1) {
			throw new Error("Unexpected API version.");
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new tvClient(log, this.devices[i], api));
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

class tvClient {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.device = device;

		this.devInfoSet = false;

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

		this.getDeviceInfo();

		this.switchInfoMenu = device.switchInfoMenu;
		if (this.switchInfoMenu === true) {
			this.infoButton = '358';
			this.menuButton = '139';
		} else {
			this.infoButton = '139';
			this.menuButton = '358';
		}

		/* setup variables */
		this.connected = false;
		this.channelReferenceSet = false;
		this.channelReferences = new Array();
		this.checkAliveInterval = null;

		this.prefsDir = ppath('openwebifTv/');
		this.channelsFile = this.prefsDir + 'channels_' + this.host.split('.').join('');

		if (this.auth == true) {
			this.authData = ('http://' + this.user + ':' + this.pass + '@');
		} else {
			this.authData = ('http://');
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefsDir.endsWith('/') === false) {
			this.prefsDir = this.prefsDir + '/';
		}

		// check if the directory exists, if not then create it
		if (fs.existsSync(this.prefsDir) === false) {
			mkdirp(this.prefsDir);
		}

		if (fs.existsSync(this.channelsFile) === false) {
			this.printBouquets();
			this.log.info("Channels file for device: %s, will be created and saved in %s", this.host, this.prefsDir);
		}

		/* Delay to wait for retrieve device info */
		setTimeout(this.setupTvService.bind(this), responseDelay);
	}

	getDeviceInfo() {
		var me = this;
		request(this.authData + this.host + ':' + this.port + '/api/about', function (error, response, body) {
			if (error) {
				me.log.debug("Error while getting information of device: %s, error: %s", me.host, error);
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
					me.devInfoSet = true;
				} catch (error) {
					me.log('Device: %s, not reachable %s.', me.host, error);
				}
			}
		});
	}

	//Start of TV integration service 
	setupTvService() {
		this.log.debug('setupTvService');
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.host + this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', (inputIdentifier, callback) => {
				this.setChannel(true, callback, this.channelReferences[inputIdentifier]);
			})
			.on('get', this.getChannel.bind(this));

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', (newValue, callback) => {
				if (this.connected) {
					if (this.devInfoSet == false)
						this.getDeviceInfo();
					else
						this.httpGet('/api/remotecontrol?command=' + this.menuButton, function (error, data) { });
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

		this.setupTvSpeakerService();
		this.prepareInputServices();


		this.log.debug('publishExternalAccessories for device: %s', this.host);
		this.api.publishExternalAccessories('homebridge-openwebif-tv', [this.tvAccesory]);

		//start the state checking
		if (!this.checkAliveInterval) {
			this.checkAliveInterval = setInterval(this.checkDeviceState.bind(this, this.updateReceiverStatus.bind(this)), checkingInterval);
		}
	}

	setupTvSpeakerService() {
		this.log.debug('setupTvSpeakerService');
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

	updateReceiverStatus(error, tvStatus, channelReference) {
		this.log.debug('updateReceiverStatus');
	}

	checkDeviceState(callback) {
		var me = this;
		if (this.devInfoSet == false) {
			this.getDeviceInfo();
		} else {
			this.httpGet('/api/statusinfo', function (error, data) {
				if (error) {
					me.log("Error while getting device state %s", error);
					me.connected = false;
					me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
				} else {
					var json = JSON.parse(data);
					var powerState = ((json.inStandby == 'false') == true);
					if (powerState == true) {
						let channelName = json.currservice_serviceref;
						for (let i = 0; i < me.channelReferences.length; i++) {
							if (channelName === me.channelReferences[i]) {
								if (me.channelReferenceSet === false)
									me.tvService
										.getCharacteristic(Characteristic.ActiveIdentifier)
										.updateValue(i);
								else
									me.channelReferenceSet = false;
							}
						}
						me.connected = true;
						me.log.debug('Check device state, device: %s ON', me.host)
					} else {
						me.connected = false;
						me.log.debug('Device %s not reachable or power in standby.', me.host)
					}
				}
			});
		}
		callback(null, this.connected, this.channelReference);
	}

	httpGet(apipath, callback) {
		if (!this.host) {
			callback(new Error('No host defined for device: %s.', this.host));
		}
		if (!this.port) {
			callback(new Error('No port defined for device: %s.', this.host));
		}

		if (this.auth) {
			if (!this.user || !this.pass) {
				callback(new Error('No authentication data defined for device: %s.', this.host));
			}
		}

		var me = this;
		me.httpRequest(me.authData + me.host + ':' + me.port + apipath, '', 'GET', function (error, response, responseBody) {
			if (error) {
				callback(error);
				me.log.error('Device: %s, not reachable.', me.host + ":" + me.port + apipath);
				return;
			} else {
				try {
					var result = JSON.stringify(responseBody, function (err, data) {
						if (err) {
							callback(err)
						} else {
							//me.log('result %s', data);
							callback(null, data);
						}
					});
				} catch (e) {
					callback(e, null);
					me.log('error: ' + e);
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
		this.httpGet('/api/statusinfo', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				var state = (json.inStandby == "false");
				me.log('Device: %s, get Power succeded: %s', me.host, state ? 'ON' : 'OFF');
				callback(null, state);
			}
		});
	}

	setPowerState(state, callback) {
		var me = this;
		var state = state ? true : false; //number to boolean
		me.getPowerState(function (error, currentState) {
			if (error) {
				me.log("Error while set power %s", error);
				if (callback)
					callback(null, state ? false : true); //receiver is off
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				if (currentState == state) { //state like expected
					callback(null, state);
				} else { //set new state
					me.httpGet("/api/powerstate?newstate=0", function (error) {
						if (error) {
							callback(error)
						} else {
							me.log('Device: %s, set Power succeded %s', me.host, state ? 'ON' : 'OFF');
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getMute(callback) {
		var me = this;
		this.httpGet('/api/statusinfo', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				var state = (json.muted == false);
				me.log('Device: %s, get Mute succeded: %s',me.host, state ? 'OFF' : 'ON');
				callback(null, state);
			}
		});
	}

	setMute(state, callback) {
		var me = this;
		var state = state ? false : true; //number to boolean
		me.getMute(function (error, currentState) {
			if (error) {
				me.log("Error while set mute %s", error);
				if (callback)
					callback(null, state ? true : false); //receiver is off
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				if (currentState == state) { //state like expected
					callback(null, state);
				} else { //set new state
					this.httpGet('/api/vol?set=mute', function (error) {
						if (error) {
							callback(error)
						} else {
							me.log('Device: %s, set Mute succeded: %s',me.host, state ? 'OFF' : 'ON');
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		this.httpGet('/api/statusinfo', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				var volume = parseFloat(json.volume);
				me.log('Device: %s, get Volume succeded: %s',me.host, volume);
				callback(null, volume);
			}
		});
	}

	setVolume(volume, callback) {
		var me = this;
		var targetVolume = parseInt(volume);
		this.httpGet('/api/vol?set=set' + targetVolume, function (error, data) {
			if (error) {
				me.log("Error while set volume %s", error);
				if (callback)
					callback(error);
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				me.log('Device: %s, set Volume succesed: %s',me.host, targetVolume);
				callback(null, targetVolume);
			}
		});

	}

	getChannel(callback) {
		var me = this;
		this.httpGet('/api/statusinfo', function (error, data) {
			if (error) {
				me.log('Can not acces devive: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				let channelName = json.currservice_serviceref;
				for (let i = 0; i < me.channelReferences.length; i++) {
					if (channelName === me.channelReferences[i]) {
						me.tvService
							.getCharacteristic(Characteristic.ActiveIdentifier)
							.updateValue(i);
							me.log('Device: %s, get Channel succesed %s:',me.host, channelName);
					}
				}
				callback();
			}
		});
	}

	setChannel(state, callback, channelReference) {
		if (state) {
			var me = this;
			me.channelReferenceSet = true;
			this.httpGet('/api/zap?sRef=' + channelReference, function (error, data) {
				if (error) {
					me.log("Error while set channel on device: %s, error: %s", me.host, error);
					if (callback)
						callback(error);
					me.log('Can not acces device: %s. Might be due to a wrong settings in config.', me.host);
				} else {
					if (callback)
						callback();
						me.log('Device: %s, set Channel succesed %s:',me.host, channelReference);	
				}
			});
		}
	}

	volumeSelectorPress(remoteKey, callback) {
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = "115";
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = "114";
				break;
		}
		this.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	remoteKeyPress(remoteKey, callback) {
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
				command = "168";
				break;
			case Characteristic.RemoteKey.FAST_FORWARD:
				command = "159";
				break;
			case Characteristic.RemoteKey.NEXT_TRACK:
				command = "407";
				break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
				command = "412";
				break;
			case Characteristic.RemoteKey.ARROW_UP:
				command = "103";
				break;
			case Characteristic.RemoteKey.ARROW_DOWN:
				command = "108";
				break;
			case Characteristic.RemoteKey.ARROW_LEFT:
				command = "105";
				break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
				command = "106";
				break;
			case Characteristic.RemoteKey.SELECT:
				command = "352";
				break;
			case Characteristic.RemoteKey.BACK:
				command = "174";
				break;
			case Characteristic.RemoteKey.EXIT:
				command = "174";
				break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
				command = "164";
				break;
			case Characteristic.RemoteKey.INFORMATION:
				command = "139";
				break;
		}
		this.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		this.httpGet('/api/remotecontrol?command=' + command, function (error) {
			if (error) {
				callback(error)
			} else {
				me.log('Device: %s, send Command succeded: %s', me.host, command);
				callback(null, command);
			}
		});
	}

	printBouquets() {
		var me = this;
		this.httpGet('/api/getservices', function (error, data) {
const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const responseDelay = 1000;

var Accessory, Service, Characteristic, UUIDGen;
var checkingInterval;

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

		this.checkingInterval = config.checkStateInterwal || 5;
		this.checkingInterval = this.checkingInterval * 1000;
		checkingInterval = this.checkingInterval;
		this.devices = config.devices || [];

		if (this.version < 2.1) {
			throw new Error("Unexpected API version.");
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new tvClient(log, this.devices[i], api));
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

class tvClient {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.device = device;

		this.devInfoSet = false;

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

		this.getDeviceInfo();

		this.switchInfoMenu = device.switchInfoMenu;
		if (this.switchInfoMenu === true) {
			this.infoButton = '358';
			this.menuButton = '139';
		} else {
			this.infoButton = '139';
			this.menuButton = '358';
		}

		/* setup variables */
		this.connected = false;
		this.channelReferenceSet = false;
		this.channelReferences = new Array();
		this.checkAliveInterval = null;

		this.prefsDir = ppath('openwebifTv/');
		this.channelsFile = this.prefsDir + 'channels_' + this.host.split('.').join('');

		if (this.auth == true) {
			this.authData = ('http://' + this.user + ':' + this.pass + '@');
		} else {
			this.authData = ('http://');
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefsDir.endsWith('/') === false) {
			this.prefsDir = this.prefsDir + '/';
		}

		// check if the directory exists, if not then create it
		if (fs.existsSync(this.prefsDir) === false) {
			mkdirp(this.prefsDir);
		}

		if (fs.existsSync(this.channelsFile) === false) {
			this.printBouquets();
			this.log.info("Channels file for device: %s, will be created and saved in %s", this.host, this.prefsDir);
		}

		/* Delay to wait for retrieve device info */
		setTimeout(this.setupTvService.bind(this), responseDelay);
	}

	getDeviceInfo() {
		var me = this;
		request(this.authData + this.host + ':' + this.port + '/api/about', function (error, response, body) {
			if (error) {
				me.log.debug("Error while getting information of device: %s, error: %s", me.host, error);
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
					me.devInfoSet = true;
				} catch (error) {
					me.log('Device: %s, not reachable %s.', me.host, error);
				}
			}
		});
	}

	//Start of TV integration service 
	setupTvService() {
		this.log.debug('setupTvService');
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.host + this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', (inputIdentifier, callback) => {
				this.setChannel(true, callback, this.channelReferences[inputIdentifier]);
			})
			.on('get', this.getChannel.bind(this));

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', (newValue, callback) => {
				if (this.connected) {
					if (this.devInfoSet == false)
						this.getDeviceInfo();
					else
						this.httpGet('/api/remotecontrol?command=' + this.menuButton, function (error, data) { });
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

		this.setupTvSpeakerService();
		this.prepareInputServices();


		this.log.debug('publishExternalAccessories for device: %s', this.host);
		this.api.publishExternalAccessories('homebridge-openwebif-tv', [this.tvAccesory]);

		//start the state checking
		if (!this.checkAliveInterval) {
			this.checkAliveInterval = setInterval(this.checkDeviceState.bind(this, this.updateReceiverStatus.bind(this)), checkingInterval);
		}
	}

	setupTvSpeakerService() {
		this.log.debug('setupTvSpeakerService');
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

	updateReceiverStatus(error, tvStatus, channelReference) {
		this.log.debug('updateReceiverStatus');
	}

	checkDeviceState(callback) {
		var me = this;
		if (this.devInfoSet == false) {
			this.getDeviceInfo();
		} else {
			this.httpGet('/api/statusinfo', function (error, data) {
				if (error) {
					me.log("Error while getting device state %s", error);
					me.connected = false;
					me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
				} else {
					var json = JSON.parse(data);
					var powerState = ((json.inStandby == 'false') == true);
					if (powerState == true) {
						let channelName = json.currservice_serviceref;
						for (let i = 0; i < me.channelReferences.length; i++) {
							if (channelName === me.channelReferences[i]) {
								if (me.channelReferenceSet === false)
									me.tvService
										.getCharacteristic(Characteristic.ActiveIdentifier)
										.updateValue(i);
								else
									me.channelReferenceSet = false;
							}
						}
						me.connected = true;
						me.log.debug('Check device state, device: %s ON', me.host)
					} else {
						me.connected = false;
						me.log.debug('Device %s not reachable or power in standby.', me.host)
					}
				}
			});
		}
		callback(null, this.connected, this.channelReference);
	}

	httpGet(apipath, callback) {
		if (!this.host) {
			callback(new Error('No host defined for device: %s.', this.host));
		}
		if (!this.port) {
			callback(new Error('No port defined for device: %s.', this.host));
		}

		if (this.auth) {
			if (!this.user || !this.pass) {
				callback(new Error('No authentication data defined for device: %s.', this.host));
			}
		}

		var me = this;
		me.httpRequest(me.authData + me.host + ':' + me.port + apipath, '', 'GET', function (error, response, responseBody) {
			if (error) {
				callback(error);
				me.log.error('Device: %s, not reachable.', me.host + ":" + me.port + apipath);
				return;
			} else {
				try {
					var result = JSON.stringify(responseBody, function (err, data) {
						if (err) {
							callback(err)
						} else {
							//me.log('result %s', data);
							callback(null, data);
						}
					});
				} catch (e) {
					callback(e, null);
					me.log('error: ' + e);
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
		this.httpGet('/api/statusinfo', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				var state = (json.inStandby == "false");
				me.log('Device: %s, get Power succeded: %s', me.host, state ? 'ON' : 'OFF');
				callback(null, state);
			}
		});
	}

	setPowerState(state, callback) {
		var me = this;
		var state = state ? true : false; //number to boolean
		me.getPowerState(function (error, currentState) {
			if (error) {
				me.log("Error while set power %s", error);
				if (callback)
					callback(null, state ? false : true); //receiver is off
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				if (currentState == state) { //state like expected
					callback(null, state);
				} else { //set new state
					me.httpGet("/api/powerstate?newstate=0", function (error) {
						if (error) {
							callback(error)
						} else {
							me.log('Device: %s, set Power succeded %s', me.host, state ? 'ON' : 'OFF');
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getMute(callback) {
		var me = this;
		this.httpGet('/api/statusinfo', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				var state = (json.muted == false);
				me.log('Device: %s, get Mute succeded: %s',me.host, state ? 'OFF' : 'ON');
				callback(null, state);
			}
		});
	}

	setMute(state, callback) {
		var me = this;
		var state = state ? false : true; //number to boolean
		me.getMute(function (error, currentState) {
			if (error) {
				me.log("Error while set mute %s", error);
				if (callback)
					callback(null, state ? true : false); //receiver is off
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				if (currentState == state) { //state like expected
					callback(null, state);
				} else { //set new state
					this.httpGet('/api/vol?set=mute', function (error) {
						if (error) {
							callback(error)
						} else {
							me.log('Device: %s, set Mute succeded: %s',me.host, state ? 'OFF' : 'ON');
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		this.httpGet('/api/statusinfo', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				var volume = parseFloat(json.volume);
				me.log('Device: %s, get Volume succeded: %s',me.host, volume);
				callback(null, volume);
			}
		});
	}

	setVolume(volume, callback) {
		var me = this;
		var targetVolume = parseInt(volume);
		this.httpGet('/api/vol?set=set' + targetVolume, function (error, data) {
			if (error) {
				me.log("Error while set volume %s", error);
				if (callback)
					callback(error);
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				me.log('Device: %s, set Volume succesed: %s',me.host, targetVolume);
				callback(null, targetVolume);
			}
		});

	}

	getChannel(callback) {
		var me = this;
		this.httpGet('/api/statusinfo', function (error, data) {
			if (error) {
				me.log('Can not acces devive: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				let channelName = json.currservice_serviceref;
				for (let i = 0; i < me.channelReferences.length; i++) {
					if (channelName === me.channelReferences[i]) {
						me.tvService
							.getCharacteristic(Characteristic.ActiveIdentifier)
							.updateValue(i);
							me.log('Device: %s, get Channel succesed %s:',me.host, channelName);
					}
				}
				callback();
			}
		});
	}

	setChannel(state, callback, channelReference) {
		if (state) {
			var me = this;
			me.channelReferenceSet = true;
			this.httpGet('/api/zap?sRef=' + channelReference, function (error, data) {
				if (error) {
					me.log("Error while set channel on device: %s, error: %s", me.host, error);
					if (callback)
						callback(error);
					me.log('Can not acces device: %s. Might be due to a wrong settings in config.', me.host);
				} else {
					if (callback)
						callback();
						me.log('Device: %s, set Channel succesed %s:',me.host, channelReference);	
				}
			});
		}
	}

	volumeSelectorPress(remoteKey, callback) {
               var me = this;
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = "115";
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = "114";
				break;
		}
		this.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	remoteKeyPress(remoteKey, callback) {
               var me = this;
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
				command = "168";
				break;
			case Characteristic.RemoteKey.FAST_FORWARD:
				command = "159";
				break;
			case Characteristic.RemoteKey.NEXT_TRACK:
				command = "407";
				break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
				command = "412";
				break;
			case Characteristic.RemoteKey.ARROW_UP:
				command = "103";
				break;
			case Characteristic.RemoteKey.ARROW_DOWN:
				command = "108";
				break;
			case Characteristic.RemoteKey.ARROW_LEFT:
				command = "105";
				break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
				command = "106";
				break;
			case Characteristic.RemoteKey.SELECT:
				command = "352";
				break;
			case Characteristic.RemoteKey.BACK:
				command = "174";
				break;
			case Characteristic.RemoteKey.EXIT:
				command = "174";
				break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
				command = "164";
				break;
			case Characteristic.RemoteKey.INFORMATION:
				command = "139";
				break;
		}
		this.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		this.httpGet('/api/remotecontrol?command=' + command, function (error) {
			if (error) {
				callback(error)
			} else {
				me.log('Device: %s, send Command succeded: %s', me.host, command);
				callback(null, command);
			}
		});
	}

	printBouquets() {
		var me = this;
		this.httpGet('/api/getservices', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var json = JSON.parse(data);
				var servicesList = json.services;
				me.printBouquetsDetail(servicesList, new Array());
				var arrayLength = servicesList.length;
				for (var i = 0; i < arrayLength; i++) {
					var service = servicesList[i];
				}
			}
		});
	}

	printBouquetsDetail(bouquets, printArray) {
		string = JSON.stringify(printArray, null, 2);
		this.log('Device: %s, saved channels file successfully.', me.host);
		fs.writeFileSync(this.channelsFile, string, 'utf8', (err) => {
			if (err) throw err;
		});

		//bouquets
		let bouquet = bouquets[0];
		bouquets.shift();
		let name = bouquet.servicename;
		let ref = bouquet.servicereference;

		//channels
		var me = this;
		this.httpGet('/api/getservices?sRef=' + ref, function (error, data) {
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
					var object = { "name": name, "reference": ref };
					printArray.push(object);
				}
				me.printBouquetsDetail(bouquets, printArray);
			}
		});
	}
}

