import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import OpenWebIfDevice from './src/openwebifdevice.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class OpenWebIfPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${PluginName}.`);
			return;
		}
		this.accessories = [];

		//check if prefs directory exist
		const prefDir = join(api.user.storagePath(), 'openwebifTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error}.`);
			return;
		}

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
				const disableLogConnectError = device.disableLogConnectError || false;
				const debug = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, did finish launching.`) : false;
				const config = {
					...device,
					pass: 'removed',
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}.`) : false;

				//refresh interval
				const refreshInterval = device.refreshInterval * 1000 || 5000;

				//check files exists, if not then create it
				const postFix = host.split('.').join('');
				const devInfoFile = `${prefDir}/devInfo_${postFix}`;
				const inputsFile = `${prefDir}/inputs_${postFix}`;
				const channelsFile = `${prefDir}/channels_${postFix}`;
				const inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
				const inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;

				try {
					const files = [
						devInfoFile,
						inputsFile,
						channelsFile,
						inputsNamesFile,
						inputsTargetVisibilityFile
					];

					files.forEach((file) => {
						if (!existsSync(file)) {
							writeFileSync(file, '');
						}
					});
				} catch (error) {
					log.error(`Device: ${host} ${deviceName}, Prepare files error: ${error}.`);
					return;
				}

				//openwebif device
				try {
					const openWebIfDevice = new OpenWebIfDevice(api, device, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
					openWebIfDevice.on('publishAccessory', (accessory) => {
						api.publishExternalAccessories(PluginName, [accessory]);
						log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
					})
						.on('devInfo', (devInfo) => {
							log.info(devInfo);
						})
						.on('success', (message) => {
							log.success(`Device: ${host} ${deviceName}, ${message}.`);
						})
						.on('message', (message) => {
							log.info(`Device: ${host} ${deviceName}, ${message}.`);
						})
						.on('debug', (debug) => {
							log.info(`Device: ${host} ${deviceName}, debug: ${debug}.`);
						})
						.on('warn', (warn) => {
							log.warn(`Device: ${host} ${deviceName}, ${warn}.`);
						})
						.on('error', async (error) => {
							log.error(`Device: ${host} ${deviceName}, ${error}.`);
						});

					//create impulse generator
					const impulseGenerator = new ImpulseGenerator();
					impulseGenerator.on('start', async () => {
						try {
							await openWebIfDevice.start();
							impulseGenerator.stop();
						} catch (error) {
							const logError = disableLogConnectError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
						};
					}).on('state', (state) => {
						const debug = enableDebugMode ? state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`) : false;
					});

					//start impulse generator
					impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
				} catch (error) {
					log.error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}.`);
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
};

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, OpenWebIfPlatform, true);
};
