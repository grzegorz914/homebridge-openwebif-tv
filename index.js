const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
var Package = require('./package.json');

var Service, Characteristic;

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
		this.auth = config["auth"] || false;
		this.user = config["user"] || 'root';
		this.pass = config["pass"] || '';
		this.prefsDir = ppath('openwebif/');
	    this.speakerService = config["speakerService"] || true;
		this.bouquets = config["bouquets"];

		var me = this;
		this.bouquetsFile = this.prefsDir + "bouquets.json";

		if (me.auth == true) {
			me.auth = (this.user + ':' + this.pass + '@')
		} else {
			me.auth = ''
		}

		
		if (this.bouquets == undefined || this.bouquets == null || this.bouquets.length <= 0) {
			var counter = 0
		    // check if prefs directory ends with a /, if not then add it
		if (this.prefsDir.endsWith('/') === false) {
			this.prefsDir = this.prefsDir + '/';
		}
	
		    // check if the preferences directory exists, if not then create it
		if (fs.existsSync(this.prefsDir) === false) {
			mkdirp(this.prefsDir);
		}
			// print channels if bouquets not exist in config
	    if (counter == 0){
		    counter++;
		    this.printBouquets();
			return;
			}
		}
	
    }	

OpenWebIfTvAccessory.prototype = {

	generateTVService() {
		var me = this;
        this.log("Adding Television Service...");
		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
		    .on('get', this.getPowerState.bind(this))
		    .on('set', this.setPowerState.bind(this));

		// Identifier of current active channel.
		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
		    .on('set', (inputIdentifier, callback) => {
			    var bouquet = this.inputReference[inputIdentifier]
			    me.log("new channel: " + bouquet.name);
			    this.setChannel(bouquet.reference, callback);
		    })
		    .on('get', (callback) => {
			    me.getChannel(function(error, inputReference) {
				    if (inputReference == undefined || inputReference == null || inputReference.length <= 0) {
                        callback(null);
                        return;
                    } else {
					    for (var i = 0; i < me.inputReference.length; i++) {
						     var bouquet = me.inputReference[i];
							    if (bouquet.reference == inputReference) {
							        me.log("current channel: " + i + " " + bouquet.name + " reference: " + bouquet.reference);
							        callback(null, i);
							        return;
				                }
			            }
				    }
				me.log("received information: %s", error);
				callback("no channel found");
			});
		});
               
        this.log("Adding Remote Key Service...");
		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));
			
		return this.tvService;
	},
	
	generateSpeakerService() {
        if (this.speakerService){
            this.log("Adding Speaker Service...");
        }
		this.speakerService = new Service.TelevisionSpeaker(this.name + ' Volume');
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
            .on('set', this.volumeSelectorPress.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Volume)
		    .on('get', this.getVolume.bind(this))
		    .on('set', this.setVolume.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
		    .on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));	
        this.speakerService.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		
		return this.speakerService;
	},

	generateInputServices() {	
		// Load persisted bouquets from file
		var data = fs.readFileSync(this.bouquetsFile, 'utf8');
		if (this.bouquets == undefined || this.bouquets == null || this.bouquets.length <= 0) {
			var bouquets = JSON.parse(data);
			//this.log(bouquets);
	    } else {
			var bouquets = this.bouquets;
			//this.log(bouquets);
		}

        this.inputName = new Array();
		this.inputReference = new Array();
             bouquets.forEach((bouquet, i) => {

			this.log("Adding Input Service..." + bouquet.name);
			let inputService = new Service.InputSource(bouquet.name, i);
				inputService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, bouquet.name)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				inputService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					callback()
				});
				
			this.inputReference.push(bouquet);
			this.inputName.push(inputService);
	    });
	    return this.inputName;
	},

	getServices() {

		this.log("Adding Information Service...");
		let informationService = new Service.AccessoryInformation();
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
			var speakerService = this.generateSpeakerService();
				tvService.addLinkedService(speakerService);
				services.push(speakerService);
		}
		return services;
	},
	  
	httpGet(apipath, callback) {
		if (!this.host) {
		    callback(new Error("No host defined."));
		}
		if (!this.port) {
		    callback(new Error("No port defined."));
		}

		if (this.auth) {
			if (!this.user || !this.pass) {
				callback(new Error("No authentication data defined."));
			}
		}

		var me = this;
		me.httpRequest('http://' + me.auth + me.host + ':' + me.port + apipath , '', 'GET', function(error, response, responseBody) {
			if (error) {
				callback(error);
				me.log.error("Device not reachable " + me.host + ":" + me.port + apipath);
				return;
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
	},
	  
	httpRequest(url, body, apipath, callback) {
		request({
		  url: url,
		  body: body,
		  method: apipath
		},
		  function(error, response, body) {
		  callback(error, response, body);
		});
	},

	getDeviceInfo(callback) {
        var me = this;
		this.httpGet("/api/about", function(error,data) {
		if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data);
			var brand = json.info.brand;
			var model = json.info.bname;
			var firmware = json.info.enigmaver;
			var serial = json.ifaces[0].mac;
			me.log('getDeviceInfo() succeded, free: %s', json);
			callback(null, json);
		  }
		});
	},
	  
	getPowerState(callback) {
        var me = this;
		this.httpGet("/api/statusinfo", function(error,data) {
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
			  me.httpGet("/api/powerstate?newstate=0", function(error) {
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
		  this.httpGet("/api/statusinfo", function(error,data) {
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
			  me.httpGet("/api/vol?set=mute", function(error) {
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
		this.httpGet("/api/statusinfo", function(error,data) {
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
		this.httpGet("/api/vol?set=set" + targetVolume, function(error) {
		  if (error){
			callback(error)
		  } else {
			me.log('setVolume() succesed %s', targetVolume);
			callback(null, targetVolume);
		  }
		});
	},

	getChannel(callback) {
          var me = this;
		  this.httpGet("/api/statusinfo", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var json = JSON.parse(data);
			var inputReference = json.currservice_serviceref;
			me.log('getChannel() succeded: %s', inputReference); 
			callback(null, inputReference);
			}
		});
	},
	  
	setChannel(inputReference, callback){
          var me = this;
		  this.httpGet("/api/zap?sRef=" + inputReference,  function(error) {
		  if (error){
			 callback(error)
		  } else { 
			   me.log('setChannel() succeded: %s', inputReference);     
			   callback(null, inputReference);
		  } 
		});
	  },

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
        this.log('remote key pressed: %s', remoteKey, "remote command send: %s", command);
		this.sendRemoteControlCommand(command, callback);
	},

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
        this.log('remote key pressed: %s', remoteKey, "remote command send: %s", command);
		this.sendRemoteControlCommand(command, callback);
	},

	sendRemoteControlCommand(command, callback) {
		var me = this;
		this.httpGet("/api/remotecontrol?command=" + command, function(error) {
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
		this.httpGet("/api/getservices", function(error,data) {
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
		var string = JSON.stringify(printArray, null, 2);
		this.log('Channels: %s', string);
		fs.writeFile(this.bouquetsFile, string, (err) => {
			if (err) {
				this.log.debug('Could not write ichannels file %s', err);
			} else {
				this.log.debug('Channels file successfully saved!');
			}
		});
		
		let bouquet = bouquets[0];
		    bouquets.shift();
        let ref = bouquet.servicereference;
		var me = this;
		this.httpGet("/api/getservices?sRef=" + ref, function(error,data) {
		  if (error){
		  } else {
			var json = JSON.parse(data);
			var servicesList = json.services;
			var arrayLength = 96;
			for (var i = 0; i < arrayLength; i++) {
			  var service = servicesList[i];
			  let name = service.servicename;
			  let ref = service.servicereference;
			  var object = {"name": name, "reference": ref};
			  printArray.push(object);
			}
			me.printBouquetsDetail(bouquets, printArray);
		  }
		});
	  }
};



