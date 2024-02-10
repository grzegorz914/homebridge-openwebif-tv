'use strict';
const path = require('path');
const fs = require('fs');
const OpenWebIfDevice = require('./src/openwebifdevice.js');
const CONSTANS = require('./src/constans.json');

class OpenWebIfPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${CONSTANS.PluginName}`);
			return;
		}
		this.accessories = [];

		//check if prefs directory exist
		const prefDir = path.join(api.user.storagePath(), 'openwebifTv');
		if (!fs.existsSync(prefDir)) {
			fs.mkdirSync(prefDir);
		};

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {
				if (!device.name || !device.host || !device.port) {
					log.warn(`Name: ${device.name ? 'OK' : device.name}, host: ${device.host ? 'OK' : device.host}, port: ${device.port ? 'OK' : device.port}, in config missing.`);
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 500))

				//debug config
				const debug = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, did finish launching.`) : false;
				const config = {
					...device,
					user: 'removed',
					pass: 'removed',
					mqttUser: 'removed',
					mqttPasswd: 'removed'
				};
				const debug1 = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, Config: ${JSON.stringify(config, null, 2)}`) : false;

				//openwebif device
				const openWebIfDevice = new OpenWebIfDevice(api, prefDir, device);
				openWebIfDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
					const debug = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, published as external accessory.`) : false;
				})
					.on('devInfo', (devInfo) => {
						log(devInfo);
					})
					.on('message', (message) => {
						log(`Device: ${device.host} ${device.name}, ${message}`);
					})
					.on('debug', (debug) => {
						log(`Device: ${device.host} ${device.name}, debug: ${debug}`);
					})
					.on('error', (error) => {
						log.error(`Device: ${device.host} ${device.name}, ${error}`);
					});
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
};

module.exports = (api) => {
	api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, OpenWebIfPlatform, true);
};
