var Service, Characteristic;

var Openwebif = require('./openwebif');
var inherits = require('util').inherits;
var Package = require('./package.json');

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-openwebif-tv", "OpenWebIfTv", OpenWebIfTvAccessory);
};

function OpenWebIfTvAccessory(log, config) {
	this.log = log;
	log("startup " + Openwebif.RemoteKey.FAST_FORWARD);
	this.config = config
	this.name = config["name"];

	//required
	this.host = config["host"];
	this.port = config["port"] || 80;
	this.openwebif = new Openwebif(this.host, this.port, this.log);
	this.log("openwebif " + this.openwebif);
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
		.on('get', this.openwebif.getPowerState.bind(this.openwebif))
		.on('set', this.openwebif.setPowerState.bind(this.openwebif));

		// Identifier of Current Active imput.
		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
		.on('set', (inputIdentifier, callback) => {
			this.log("new input " + inputIdentifier);
			var channel = this.inputChannels[inputIdentifier]
			this.openwebif.setCurrentChannelWithsRef(channel.reference, callback);
		})
		.on('get', (callback) => {
			me.log.error("received information");
			me.openwebif.getCurrentChannelWithsRef(function(error, ref) {
				for (var i = 0; i < me.inputChannels.length; i++) {
					var channel = me.inputChannels[i];
					if (channel.reference == ref) {
						me.log("found reference: " + i);
						me.log("current channel: " + channel.name);
						callback(null, i);
						return;
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
		    .on('get', this.openwebif.getVolume.bind(this.openwebif))
		    .on('set', this.openwebif.setVolume.bind(this.openwebif));
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector) //increase/decrease volume
                    .on('set', this.VolumeSelectorPress.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
		    .on('get', this.openwebif.getMute.bind(this.openwebif))
		    .on('set', this.openwebif.setMute.bind(this.openwebif));

		this.speakerService.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

		return this.speakerService;
	},

	generateInputServices() {
                // TODO load persisted Names

		this.inputServices = new Array();
		this.inputChannels = new Array();
		var counter = 0;
		this.bouquets.forEach((bouquet, i) => {
			 bouquet.channels.forEach((channel, i) => {
				this.log("Adding Channel " + channel.name);

				let tmpInput = new Service.InputSource(channel.name, "channelLink" + counter);
				tmpInput
				.setCharacteristic(Characteristic.Identifier, counter)
				.setCharacteristic(Characteristic.ConfiguredName, channel.name)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tmpInput
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					// TODO: persist name
					callback()
				});

				this.inputChannels.push(channel);
				this.inputServices.push(tmpInput);
				counter++;
			});
		});
		if (counter == 0){
			this.openwebif._printBouquets()
		}
		return this.inputServices;
	},

	VolumeSelectorPress(remoteKey, callback) {
		this.log('remote key pressed: %d', remoteKey);
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
			command = Openwebif.RemoteKey.INCREMENT;
			break;
			case Characteristic.VolumeSelector.DECREMENT:
			command = Openwebif.RemoteKey.DECREMENT;
			break;
		}
		this.openwebif.sendCommand(command, callback);
	},

	remoteKeyPress(remoteKey, callback) {
		this.log('remote key pressed: %d', remoteKey);
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
			command = Openwebif.RemoteKey.REWIND;
			break;
			case Characteristic.RemoteKey.FAST_FORWARD:
			command = Openwebif.RemoteKey.FAST_FORWARD;
			break;
			case Characteristic.RemoteKey.NEXT_TRACK:
			command = Openwebif.RemoteKey.NEXT_TRACK;
			break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
			command = Openwebif.RemoteKey.PREVIOUS_TRACK;
			break;
			case Characteristic.RemoteKey.ARROW_UP:
			command = Openwebif.RemoteKey.ARROW_UP;
			break;
			case Characteristic.RemoteKey.ARROW_DOWN:
			command = Openwebif.RemoteKey.ARROW_DOWN;
			break;
			case Characteristic.RemoteKey.ARROW_LEFT:
			command = Openwebif.RemoteKey.ARROW_LEFT;
			break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
			command = Openwebif.RemoteKey.ARROW_RIGHT;
			break;
			case Characteristic.RemoteKey.SELECT:
			command = Openwebif.RemoteKey.SELECT;
			break;
			case Characteristic.RemoteKey.BACK:
			command = Openwebif.RemoteKey.BACK;
			break;
			case Characteristic.RemoteKey.EXIT:
			command = Openwebif.RemoteKey.EXIT;
			break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
			command = Openwebif.RemoteKey.PLAY_PAUSE;
			break;
			case Characteristic.RemoteKey.INFORMATION:
			command = Openwebif.RemoteKey.INFORMATION;
			break;
		}
		this.openwebif.sendCommand(command, callback);
	},
	
	getDiscSpace(callback) {
		var me = this;
		this.openwebif.getDiscSpace(callback);
	},

        identify(callback) {
		this.log("Identify requested!");
		callback();
	},

	getServices() {
		var informationService = new Service.AccessoryInformation();
		informationService
		.setCharacteristic(Characteristic.Manufacturer, "Sat Receiver")
		.setCharacteristic(Characteristic.Model, "OpenWebIfTv")
		.setCharacteristic(Characteristic.SerialNumber, "1314232425")
		.setCharacteristic(Characteristic.FirmwareRevision, Package.version);

		var tvService  = this.generateTVService();
		var services = [informationService, tvService];

		var inputServices = this.generateInputServices();
		inputServices.forEach((service, i) => {
			tvService.addLinkedService(service);
			services.push(service);
		});

		if (!this.excludeSpeakerService){
			this.log("Adding SpeakerService");
			let speakerService = this.generateSpeakerService();
			services.push(speakerService);
			tvService.addLinkedService(speakerService);
		}
		return services;
	},

	/**
	* Custom characteristic for DiscSpace
	*
	* @return {Characteristic} The DiscSpace characteristic
	*/
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

	/**
	* Custom characteristic for Hostname /IP
	*
	* @return {Characteristic} The characteristic
	*/
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
};
