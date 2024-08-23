'use strict';
const path = require('path');
const fs = require('fs');
const OpenWebIfDevice = require('./src/openwebifdevice.js');
const CONSTANTS = require('./src/constants.json');

class OpenWebIfPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${CONSTANTS.PluginName}`);
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
				const deviceName = device.name;
				const host = device.host;
				const port = device.port;

				if (!deviceName || !host || !port) {
					log.warn(`Name: ${deviceName ? 'OK' : deviceName}, host: ${host ? 'OK' : host}, port: ${port ? 'OK' : port}, in config missing.`);
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 500))

				//debug config
				const enableDebugMode = device.enableDebugMode || false;
				const debug = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, did finish launching.`) : false;
				const config = {
					...device,
					pass: 'removed',
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

				//openwebif device
				const openWebIfDevice = new OpenWebIfDevice(api, prefDir, device);
				openWebIfDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
					log.success(`Device: ${host} ${deviceName}, published as external accessory.`);
				})
					.on('devInfo', (devInfo) => {
						log.info(devInfo);
					})
					.on('success', (message) => {
						log.success(`Device: ${host} ${deviceName}, ${message}`);
					})
					.on('message', (message) => {
						log.info(`Device: ${host} ${deviceName}, ${message}`);
					})
					.on('debug', (debug) => {
						log.info(`Device: ${host} ${deviceName}, debug: ${debug}`);
					})
					.on('warn', (warn) => {
						log.warn(`Device: ${host} ${deviceName}, ${warn}`);
					})
					.on('error', (error) => {
						log.error(`Device: ${host} ${deviceName}, ${error}`);
					});
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
};

module.exports = (api) => {
	api.registerPlatform(CONSTANTS.PluginName, CONSTANTS.PlatformName, OpenWebIfPlatform, true);
};
