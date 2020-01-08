const net = require('net');
const request = require('request');
const fs = require('fs');
const mkdirp = require('mkdirp');
const ppath = require('persist-path');
var Package = require('./package.json');

var Service, Characteristic;
var inherits = require('util').inherits;

module.exports = function(homebridge) {
        Service = homebridge.hap.Service;
        Characteristic = homebridge.hap.Characteristic;
        homebridge.registerAccessory("homebridge-openwebif-tv", "OpenWebIfTv", OpenWebIfTvAccessory);
};

function OpenWebIfTvAccessory(log, config) {
	this.log = log;
	this.config = config
	this.name = config["name"];

	//required
	this.host = config["host"];
	this.port = config["port"] || 80;
	this.speakerService = config["speakerService"] || true;
	this.bouquets = config["bouquets"];
	var me = this;
	

}	

OpenWebIfTvAccessory.prototype = {

	generateTVService() {
		var me = this;
		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
		.on('get', this.getPowerState.bind(this))
		.on('set', this.setPowerState.bind(this));

		// Identifier of Current Active imput.
		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
		.on('set', (inputIdentifier, callback) => {
			this.log("new input " + inputIdentifier);
			var bouquet = this.inputReference[inputIdentifier]
			this.setCurrentChannelWithsRef(bouquet.reference, callback);
		})
		.on('get', (callback) => {
                      me.getPowerState (function(error, state) {
                      this.receiverstate = state;
                      });
       
			me.getCurrentChannelWithsRef(function(error, channelReference) {
				if (this.bouquets == undefined || this.bouquets == null || this.bouquets.length <= 0) {
                    callback(null);
                    return;
                    } 
                    if (this.receiverstate == false) {
				        callback(null, 0);
				        return;
                    } else {
						for (var i = 0; i < me.inputReference.length; i++) {
							var bouquet = me.inputReference[i];
							if (bouquet.reference == channelReference) {
							   me.log("current channel: " + i + " " + bouquet.name + " reference: " + channelReference);
							   callback(null, i);
							   return;
				                      }
			                      }
		                       }
				callback("no reference found");
			});
		});

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
		    .on('set', this.remoteKeyPress.bind(this));
		this.tvService.addCharacteristic(this.makeDiscSpaceCharacteristic())
		    .on('get', this.getDiscSpace.bind(this))

		if (this.config["includeIP"] || false) {
			this.tvService.setCharacteristic(this.makeIPCharacteristic(this.host), this.host);
		}
		return this.tvService;
	},
	
	generateSpeakerService() {
		this.speakerService = new Service.TelevisionSpeaker(this.name);
		this.speakerService.getCharacteristic(Characteristic.Volume)
		    .on('get', this.getVolume.bind(this))
		    .on('set', this.setVolume.bind(this));
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector) //increase/decrease volume
                    .on('set', this.volumeSelectorPress.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
		    .on('get', this.getMute.bind(this))
		    .on('set', this.setMute.bind(this));

		this.speakerService.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

		return this.speakerService;
	},

	generateInputServices() {
		var bouquets = this.bouquets;
		
		this.channelName = new Array();
		this.channelReference = new Array();
		var counter = 0;
	
		    bouquets.forEach((bouquet, i) => {
				this.log("Added channel " + bouquet.name);

				let tmpInput = new Service.InputSource(bouquet.name, "channel number" + counter);
				tmpInput
				.setCharacteristic(Characteristic.Identifier, counter)
				.setCharacteristic(Characteristic.ConfiguredName, bouquet.name)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tmpInput
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					// TODO: persist name
					callback()
				});

				this.channelReference.push(bouquet);
				this.channelName.push(tmpInput);
				counter++;
		});
               if (counter == 0){
			this.printBouquets()
		}
		return this.channelName;
	},

	volumeSelectorPress(remoteKey, callback) {
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
			command = 115;
			break;
			case Characteristic.VolumeSelector.DECREMENT:
			command = 114;
			break;
		}
        this.log('remote key pressed: %s', remoteKey, "remote command send: %s", command);
		this.sendRemoteControlCommand(command, callback);
	},

	remoteKeyPress(remoteKey, callback) {
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
			command = 168;
			break;
			case Characteristic.RemoteKey.FAST_FORWARD:
			command = 159;
			break;
			case Characteristic.RemoteKey.NEXT_TRACK:
			command = 407;
			break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
			command = 412;
			break;
			case Characteristic.RemoteKey.ARROW_UP:
			command = 103;
			break;
			case Characteristic.RemoteKey.ARROW_DOWN:
			command = 108;
			break;
			case Characteristic.RemoteKey.ARROW_LEFT:
			command = 105;
			break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
			command = 106;
			break;
			case Characteristic.RemoteKey.SELECT:
			command = 352;
			break;
			case Characteristic.RemoteKey.BACK:
			command = 174;
			break;
			case Characteristic.RemoteKey.EXIT:
			command = 174;
			break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
			command = 164;
			break;
			case Characteristic.RemoteKey.INFORMATION:
			command = 139;
			break;
		}
        this.log('remote key pressed: %s', remoteKey, "remote command send: %s", command);
		this.sendRemoteControlCommand(command, callback);
	},

	getServices() {
		var informationService = new Service.AccessoryInformation();
		informationService
		.setCharacteristic(Characteristic.Manufacturer, "OpenWebIf")
		.setCharacteristic(Characteristic.Model, "Sat Receiver")
		.setCharacteristic(Characteristic.SerialNumber, "00000001")
		.setCharacteristic(Characteristic.FirmwareRevision, Package.version);
		var tvService  = this.generateTVService();
		var services = [informationService, tvService];

		var inputServices = this.generateInputServices();
		inputServices.forEach((service, i) => {
			tvService.addLinkedService(service);
			services.push(service);
		});

		if (this.speakerService){
			this.log("Adding SpeakerService");
			let speakerService = this.generateSpeakerService();
			services.push(speakerService);
			tvService.addLinkedService(speakerService);
		}
		return services;
	},

	makeDiscSpaceCharacteristic() {
		var discSpaceChar = function() {
			Characteristic.call(this, 'DiscSpace', 'B795302F-FFBA-41D9-9076-337986B81D27');
			this.setProps({
				format: Characteristic.Formats.INT,
				unit: Characteristic.Units.PERCENTAGE,
				maxValue: 100,
				minValue: 0,
				minStep: 1,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
			});
			this.value = 0;
		}
		inherits(discSpaceChar, Characteristic);
		return discSpaceChar;
	},

	makeIPCharacteristic(ip) {
		var volumeCharacteristic = function() {
			Characteristic.call(this, 'IP', 'B795302F-FFBA-41D9-9076-337986B81D29');
			this.setProps({
				format: Characteristic.Formats.STRING,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
			});
			this.value = ip;
		}
		inherits(volumeCharacteristic, Characteristic);
		return volumeCharacteristic;
	},

	checkHostIsReachable(host, port, callback) {
		var timeout = 2000;
		var callbackCalled = false;
		
		var client = new net.Socket();
		client.on('error', function (err) {
			clearTimeout(timer);
			client.destroy();
			if (!callbackCalled) {
				callback(false);
				callbackCalled = true;
			}
		})
		
		client.connect(port, host, function () {
			clearTimeout(timer);
			client.end();
			if (!callbackCalled) {
				callback(true);
				callbackCalled = true;
			}
		});
		
		var timer = setTimeout(function() {
			client.end();
			if (!callbackCalled) {
				callback(false);
				callbackCalled = true;
			}
		}, timeout);
	  },
	  
	  httpGetForMethod(method, callback) {
		if (!this.host) {
		  this.log.error("No Host defined in method: " + method);
		  callback(new Error("No host defined."));
		}
		if (!this.port) {
		  this.log.error("No port defined in method: " + method);
		  callback(new Error("No port defined."));
		}
		var me = this;
		me.checkHostIsReachable(this.host, this.port, function(reachable) {
		  if (reachable) {
			me.httpRequest('http://' + me.host + ':' + me.port + method , '', 'GET', function(error, response, responseBody) {
			  if (error) {
				callback(error)
			  } else {
				try {
				  var result = JSON.stringify(responseBody, function(err, data) {
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
		  } else {
			me.log.error("Device not reachable" + me.host + ":" + me.port + " in method: " + method);
			callback(new Error("device is not reachable, please check connection and all config data"), null); //receiver is off
			return;
		  }
		});
	  },
	  
	  httpRequest(url, body, method, callback) {
		request({
		  url: url,
		  body: body,
		  method: method,
		  rejectUnauthorized: false
		},
		  function(error, response, body) {
		  callback(error, response, body);
		});
	  },
	  
	  getDiscSpace(callback) {
        var me = this;
		this.httpGetForMethod("/api/about", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data);
			var freeDiscSpaceValue = json.info.hdd[0].free;
			var freeDouble = parseFloat(freeDiscSpaceValue);
			var capacityDiscSpaceValue = json.info.hdd[0].capacity;
			var capacityDouble = parseFloat(capacityDiscSpaceValue);
			var percentage = (freeDouble / capacityDouble) * 100;
			me.log('getDiscSpace() succeded, free: %s', percentage);
			callback(null, percentage);
		  }
		});
	  },

	  getDeviceInfo(callback) {
        var me = this;
		this.httpGetForMethod("/api/about", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data);
			var brand = json.info.brand;
			var model = json.info.bname;
			var firmware = json.info.enigmaver;
			var serial = json.ifaces[0].mac;
			me.log('getDeviceInfo() succeded, free: %s', data);
			callback(null, json);
		  }
		});
	  },
	  
	  getPowerState(callback) {
        var me = this;
		this.httpGetForMethod("/api/statusinfo", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data); 
			var state = (json.inStandby == "false");
			me.log('getPowerState() succeded: %s', state? 'ON':'OFF');
			callback(null, state);
		  }
		});
	  },
	  
	  setPowerState(state, callback) {
        var me = this;
		var state = state? true : false; //number to boolean
		me.getPowerState(function(error, currentState) {
		  if(error){
			callback(null, state? false : true); //receiver is off
		  } else {
			if (currentState == state) { //state like expected
			  callback(null, state);
			} else { //set new state
			  me.httpGetForMethod("/api/powerstate?newstate=0", function(error) {
				if (error){
				  callback(error)
				} else {
				  me.log('setPowerState() succeded %s', state? 'ON':'OFF');
				  callback(null, state);
				}
			  });
			}
		  }
		});
	  },
	  
	  getMute(callback) {
          var me = this;
		  this.httpGetForMethod("/api/statusinfo", function(error,data) {
		  if (error){
			  callback(error)
		  } else {
			var json = JSON.parse(data);
			var state = (json.muted == false);
			me.log('getMute() succeded: %s', state? 'OFF':'ON');
			callback(null, state);
		  }
		});
	  },
	  
	  setMute(state, callback) {
        var me = this;
		var state = state? false : true; //number to boolean
		me.getMute(function(error, currentState) {
		  if (error){
			callback(null, state? true : false); //receiver is off
		  } else {
			if (currentState == state) { //state like expected
				callback(null, state);
			} else { //set new state
			  me.httpGetForMethod("/api/vol?set=mute", function(error) {
				if (error){
					callback(error)
				} else {
				  me.log('setMute() succeded %s',  state? 'OFF':'ON');
				  callback(null, state);
				}
			  });
			}
		  }
		});
	  },
	  
	  getVolume(callback) {
        var me = this;
		this.httpGetForMethod("/api/statusinfo", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data);
			var volume = parseFloat(json.volume);
			me.log('getVolume() succeded: %s', volume);
			callback(null, volume);
		  }
		});
	  },
	  
	  setVolume(volume, callback) {
        var me = this;
		var targetVolume = parseInt(volume);
		this.httpGetForMethod("/api/vol?set=set" + targetVolume, function(error) {
		  if (error){
			callback(error)
		  } else {
			me.log('setVolume() succesed %s', targetVolume);
			callback(null, targetVolume);
		  }
		});
	  },

	  getCurrentChannelWithsRef(callback) {
          var me = this;
		  this.httpGetForMethod("/api/statusinfo", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var json = JSON.parse(data);
			var channelReference = json.currservice_serviceref;
			me.log('getCurrentChannelWithsRef() succeded: %s', channelReference); 
			callback(null, channelReference);
			}
		});
	  },
	  
	  setCurrentChannelWithsRef(ref, callback){
          var me = this;
		  this.httpGetForMethod("/api/zap?sRef=" + channelReference,  function(error) {
		  if (error){
			 callback(error)
		  } else { 
			   me.log('setCurrentChannelWithsRef() succeded: %s', channelReference);     
			   callback(null, channelReference);
		  } 
		});
	  },
	  
	  sendRemoteControlCommand(command, callback) {
          var me = this;
		  this.httpGetForMethod("/api/remotecontrol?command=" + command, function(error) {
		  if (error){
			 callback(error)
		  } else { 
			   me.log('sendCommand() succeded: %s', command);     
			   callback(null, command);
		  }
		});
	  },
	  
	  
	  printBouquets() {
		var me = this;
		this.httpGetForMethod("/api/getservices", function(error,data) {
		  if (error){
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
	  },
	  
	  printBouquetsDetail(bouquets, printArray) {
		if (bouquets == undefined || bouquets == null || bouquets.length <= 0) {
		  var string =  JSON.stringify(printArray, null, 2);
		  this.log('Add this to bouquet array in config: %s', string);
		  return;
		}
		let bouquet = bouquets[0];
		bouquets.shift();
	  
		let name = bouquet.servicename;
		let ref = bouquet.servicereference;
		var me = this;
		this.httpGetForMethod("/api/getservices?sRef=" + ref, function(error,data) {
		  if (error){
		  } else {
			var json = JSON.parse(data);
			var servicesList = json.services;
			var arr = [];
			var arrayLength = servicesList.length;
			for (var i = 0; i < arrayLength; i++) {
			  var service = servicesList[i];
			  let name = service.servicename;
			  let ref = service.servicereference;
			  var object = {"name": name, "reference": ref};
			  arr.push(object);
			}
			var jsonobj = {"add this to bouquets in config": arr };
			printArray.push(jsonobj)
			me.printBouquetsDetail(bouquets, printArray);
		  }
		});
	  },
};


};



