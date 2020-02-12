const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const responseDelay = 1500;

var Accessory, Service, Characteristic, hap, UUIDGen;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	hap = homebridge.hap;

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
		setTimeout(function () {
			me.log.debug('didFinishLaunching');
		}, (this.devices.length + 1) * responseDelay);
	}
}

class openwebIfTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;

		//device configuration
		this.device = device;
		this.name = device.name || 'Sat Receiver';
		this.host = device.host;
		this.port = device.port || 80;
		this.auth = device.auth || false;
		this.user = device.user || 'root';
		this.pass = device.pass || '';
		this.switchInfoMenu = device.switchInfoMenu;
		this.bouquets = device.bouquets;

		//authentication basic
		this.authData = this.auth ? ('http://' + this.user + ':' + this.pass + '@') : ('http://');

		//get Device info
		this.getDeviceInfo();
		this.manufacturer = device.manufacturer || 'openWebIf';
		this.modelName = device.model || 'homebridge-openwebif-tv';
		this.serialNumber = device.serialNumber || 'SN0000001';
		this.firmwareRevision = device.firmwareRevision || 'FW0000001';

		//setup variables
		this.connectionStatus = false;
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

		//check if the channels file exists, if not then create it
		if (fs.existsSync(this.channelsFile) === false) {
			this.getBouquets();
			this.log.info('Device: %s, will create channels file in: %s', this.host, this.prefDir);
		}

		//Check net state
		setInterval(function () {
			var me = this;
			request(me.authData + me.host + ':' + me.port + '/api/statusinfo', function (error, response, body) {
				if (error) {
					me.log('Device: %s, name: %s, state: Offline', me.host, me.name);
					me.connectionStatus = false;
				} else {
					if (!me.connectionStatus) {
						me.log('Device: %s, name: %s, state: Online', me.host, me.name);
						me.connectionStatus = true;

					}
				}
			});
		}.bind(this), 5000);

		//Delay to wait for device info before publish
		setTimeout(this.prepareTvService.bind(this), responseDelay);

		var deviceName = this.name;
		var uuid = UUIDGen.generate(deviceName);
		this.tvAccesory = new Accessory(deviceName, uuid, hap.Accessory.Categories.TV);
		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-openwebif-tv', [this.tvAccesory]);
	}

	//get device info
	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			request(me.authData + me.host + ':' + me.port + '/api/about', (error, response, data) => {
				if (error) {
					me.log('Device: %s, get info error: %s', me.host, error);
				} else {
					var json = JSON.parse(data);
					me.manufacturer = json.info.brand;
					me.modelName = json.info.mname;

					me.log('-----Device: %s-----', me.host);
					me.log('Manufacturer: %s', json.info.brand);
					me.log('Model: %s', json.info.mname);
					me.log('Kernel: %s', json.info.kernelver);
					me.log('Chipset: %s', json.info.chipset);
					me.log('Webif version.: %s', json.info.webifver);
					me.log('Firmware: %s', json.info.enigmaver);
					me.log('Device: %s, getDeviceInfo successfull.', me.host);
				}
			});
		}, 200);
	}

	//Prepare TV service 
	prepareTvService() {
		this.log.debug('prepareTvService');
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
			.on('set', this.setPowerMode.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);
		this.prepareTvSpeakerService();
		this.prepareInputServices();
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

		this.channelReferences = new Array();
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
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
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

	httpGET(apipath, callback) {
		var me = this;
		me.httpRequest(me.authData + me.host + ':' + me.port + apipath, '', 'GET', function (error, response, responseBody) {
			if (error) {
				me.log.debug('Device: %s, not reachable, error: %s.', me.host, error);
				me.connectionStatus = false;
				callback(error);
				return;
			} else {
				try {
					var result = JSON.stringify(responseBody, function (error, data) {
						if (error) {
							me.log.debug('Device: %s, JSON stringify error: %s', me.host, error);
							callback(error);
						} else {
							me.log.debug('Device: %s, JSON stringify successfull: %s', me.host, data);
							callback(null, data);
						}
					});
				} catch (e) {
					callback(e, null);
					me.log.debug('error: %s', e);
				}
			}
			me.log('Device: %s, get data successfull.', me.host);
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
		if (me.connectionStatus) {
			this.httpGET('/api/statusinfo', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					var json = JSON.parse(data);
					var state = (json.inStandby == 'false');
					me.log('Device: %s, get current Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, get current Power state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setPowerState(state, callback) {
		var me = this;
		var newState = state ? '4' : '5'
		if (me.connectionStatus) {
			me.httpGET('/api/powerstate?newstate=' + newState, function (error) {
				if (error) {
					me.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set new Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, set new Power state failed, not connected to network.', me.host);
		}
	}

	getMute(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.httpGET('/api/statusinfo', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					var json = JSON.parse(data);
					var state = (json.muted == true);
					me.log('Device: %s, get current Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, get current Mute failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setMute(state, callback) {
		var me = this;
		if (me.connectionStatus) {
			me.httpGET('/api/vol?set=mute', function (error) {
				if (error) {
					me.log.debug('Device: %s, can not set Mute. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set Mute successfull: %s', me.host, state ? 'ON' : 'OFF');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, set Mute failed, not connected to network.', me.host);
		}
	}

	getVolume(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.httpGET('/api/statusinfo', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					var json = JSON.parse(data);
					var volume = parseFloat(json.volume);
					me.log('Device: %s, get current Volume level successfull: %s', me.host, volume);
					callback(null, volume);
				}
			});
		} else {
			me.log('Device: %s, get Volume level failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setVolume(volume, callback) {
		var me = this;
		if (me.connectionStatus) {
			var targetVolume = parseInt(volume);
			me.httpGET('/api/vol?set=set' + targetVolume, function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set new Volume level successfull: %s', me.host, targetVolume);
					callback(null, volume);
				}
			});
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
		}
	}

	getChannel(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.httpGET('/api/statusinfo', function (error, data) {
				if (error) {
					me.log.debug('Devive: %s, can not get current Channel. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					var json = JSON.parse(data);
					let channelReference = json.currservice_serviceref;
					for (let i = 0; i < me.channelReferences.length; i++) {
						if (channelReference === me.channelReferences[i]) {
							me.tvService
								.getCharacteristic(Characteristic.ActiveIdentifier)
								.updateValue(i);
							me.log('Device: %s, get current Channel successfull: %s', me.host, channelReference);
						}
					}
					callback(null, channelReference);
				}
			});
		} else {
			me.log('Device: %s, get current Channel failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setChannel(callback, channelReference) {
		var me = this;
		if (me.connectionStatus) {
			me.getChannel(function (error, currentChannelReference) {
				if (error) {
					me.log.debug('Device: %s, can not get current Channel Reference. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					if (currentChannelReference == channelReference) {
						callback(null, channelReference);
					} else {
						me.httpGET('/api/zap?sRef=' + channelReference, function (error, data) {
							if (error) {
								me.log.debug('Device: %s, can not set new Channel. Might be due to a wrong settings in config, error: %s.', me.host, error);
								if (callback)
									callback(error);
							} else {
								me.log('Device: %s, set new Channel successfull: %s', me.host, channelReference);
								callback(null, channelReference);
							}
						});
					}
				}
			});
		} else {
			me.log('Device: %s, set new Channel failed, not connected to network.', me.host);
		}
	}

	setPowerMode(callback, state) {
		var me = this;
		if (me.connectionStatus) {
			var command = this.menuButton ? '358' : '139';
			me.httpGET('/api/remotecontrol?command=' + command, function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not set new Power Mode. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set new Power Mode successfull, send command: %s', me.host, command);
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, set new PowerModeSelection failed, not connected to network.', me.host);
		}
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		var command = 0;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
		}
	}

	remoteKeyPress(remoteKey, callback) {
		var me = this;
		var command = 0;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, set RemoteKey failed, not connected to network.', me.host);
		}
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		if (!me.connectionStatus) {
			this.httpGET('/api/remotecontrol?command=' + command, function (error) {
				if (error) {
					me.log.debug('Device: %s can not send RC Command. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, send RC Command successfull: %s', me.host, command);
					callback(null, command);
				}
			});
		} else {
			me.log('Device: %s, send RC command failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	getBouquets() {
		var me = this;
		if (!me.connectionStatus) {
			return;
		} else {
			this.httpGET('/api/getservices', function (error, data) {
				if (error) {
				} else {
					var json = JSON.parse(data);
					var bouquetsList = json.services;
					var arrayLength = bouquetsList.length;
					for (var i = 0; i < arrayLength; i++) {
					}
					me.log.debug('Bouquets list', bouquetsList);
					me.saveBouquetsChannels(bouquetsList, new Array());
				}
			});
		}
	}

	saveBouquetsChannels(bouquets, printArray) {
		var me = this;
		let bouquet = bouquets[0];
		bouquets.shift();
		let bouquetReference = bouquet.servicereference;
		this.httpGET('/api/getservices?sRef=' + bouquetReference, function (error, data) {
			if (error) {
			} else {
				var json = JSON.parse(data);
				var servicesList = json.services;
				var arrayLength = 96;
				for (var i = 0; i < arrayLength; i++) {
					var service = servicesList[i];
					let name = service.servicename;
					let ref = service.servicereference;
					var object = { 'name': name, 'reference': ref };
					me.log.debug('Prepare channels to save in file', object);
					printArray.push(object);
				}
				var string = JSON.stringify(printArray, null, 2);
				me.log('Device: %s, saved channels successfull in %s:', me.host, me.prefDir);
				fs.writeFileSync(me.channelsFile, string, 'utf8', (error) => {
					if (error) {
						me.log.debug('Device: %s, can not create channels file, error: %s', me.host, error);
					}
				});
			}
		});
	}
}
