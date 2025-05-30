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

				//check accessory is enabled
				const disableAccessory = device.disableAccessory || false;
				if (disableAccessory) {
					continue;
				}

				const name = device.name;
				const host = device.host;
				const port = device.port;

				if (!name || !host || !port) {
					log.warn(`Name: ${name ? 'OK' : name}, host: ${host ? 'OK' : host}, port: ${port ? 'OK' : port}, in config missing.`);
					return;
				}

				//log config
				const enableDebugMode = device.enableDebugMode || false;
				const disableLogDeviceInfo = device.disableLogDeviceInfo || false;
				const disableLogInfo = device.disableLogInfo || false;
				const disableLogSuccess = device.disableLogSuccess || false;
				const disableLogWarn = device.disableLogWarn || false;
				const disableLogError = device.disableLogError || false;
				const debug = !enableDebugMode ? false : log.info(`Device: ${host} ${name}, did finish launching.`);
				const config = {
					...device,
					pass: 'removed',
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				}
				const debug1 = !enableDebugMode ? false : log.info(`Device: ${host} ${name}, Config: ${JSON.stringify(config, null, 2)}.`);

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
					const emitLog = disableLogError ? false : log.error(`Device: ${host} ${name}, Prepare files error: ${error}.`);
					return;
				}

				//openwebif device
				try {
					const openWebIfDevice = new OpenWebIfDevice(api, device, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
					openWebIfDevice.on('publishAccessory', (accessory) => {
						api.publishExternalAccessories(PluginName, [accessory]);
						const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${name}, Published as external accessory.`);
					})
						.on('devInfo', (devInfo) => {
							const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
						})
						.on('success', (success) => {
							const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${name}, ${success}.`);
						})
						.on('info', (info) => {
							const emitLog = disableLogInfo ? false : log.info(`Device: ${host} ${name}, ${info}.`);
						})
						.on('debug', (debug) => {
							const emitLog = !enableDebugMode ? false : log.info(`Device: ${host} ${name}, debug: ${debug}.`);
						})
						.on('warn', (warn) => {
							const lemitLogog = disableLogWarn ? false : log.warn(`Device: ${host} ${name}, ${warn}.`);
						})
						.on('error', (error) => {
							const emitLog = disableLogError ? false : log.error(`Device: ${host} ${name}, ${error}.`);
						});

					//create impulse generator
					const impulseGenerator = new ImpulseGenerator();
					impulseGenerator.on('start', async () => {
						try {
							const startDone = await openWebIfDevice.start();
							const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;

							//start device impulse generator 
							const startImpulseGenerator = startDone ? await openWebIfDevice.startImpulseGenerator() : false;
						} catch (error) {
							const emitLog = disableLogError ? false : log.error(`Device: ${host} ${name}, ${error}, trying again.`);
						}
					}).on('state', (state) => {
						const emitLog = !enableDebugMode ? false : state ? log.info(`Device: ${host} ${name}, Start impulse generator started.`) : log.info(`Device: ${host} ${name}, Start impulse generator stopped.`);
					});

					//start impulse generator
					await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
				} catch (error) {
					const emitLog = disableLogError ? false : log.error(`Device: ${host} ${name}, Did finish launching error: ${error}.`);
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, OpenWebIfPlatform);
}
