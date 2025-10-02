import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import OpenWebIfDevice from './src/openwebifdevice.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class OpenWebIfPlatform {
	constructor(log, config, api) {
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${PluginName}.`);
			return;
		}

		this.accessories = [];

		const prefDir = join(api.user.storagePath(), 'openwebifTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {
				const displayType = device.displayType ?? 2;
				if (displayType === 0) continue;

				const { name, host, port } = device;
				if (!name || !host || !port) {
					log.warn(`Invalid config for device: Name: ${name || 'missing'}, Host: ${host || 'missing'}, Port: ${port || 'missing'}`);
					continue;
				}

				const logLevel = {
					devInfo: device.log?.deviceInfo,
					success: device.log?.success,
					info: device.log?.info,
					warn: device.log?.warn,
					error: device.log?.error,
					debug: device.log?.debug
				};

				if (logLevel.debug) {
					log.info(`Device: ${host} ${name}, did finish launching.`);
					const safeConfig = {
						...device,
						auth: {
							...device.auth,
							passwd: 'removed',
						},
						mqtt: {
							auth: {
								...device.mqtt?.auth,
								passwd: 'removed',
							}
						},
					};
					log.info(`Device: ${host} ${name}, Config: ${JSON.stringify(safeConfig, null, 2)}`);
				}

				const postFix = host.replace(/\./g, '');
				const files = {
					devInfo: `${prefDir}/devInfo_${postFix}`,
					inputs: `${prefDir}/inputs_${postFix}`,
					channels: `${prefDir}/channels_${postFix}`,
					inputsNames: `${prefDir}/inputsNames_${postFix}`,
					inputsVisibility: `${prefDir}/inputsTargetVisibility_${postFix}`,
				};

				try {
					Object.values(files).forEach((file) => {
						if (!existsSync(file)) {
							writeFileSync(file, '');
						}
					});
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Prepare files error: ${error.message ?? error}`);
					continue;
				}

				try {
					// create impulse generator
					const impulseGenerator = new ImpulseGenerator()
						.on('start', async () => {
							try {
								const deviceInstance = new OpenWebIfDevice(api, device, files.devInfo, files.inputs, files.channels, files.inputsNames, files.inputsVisibility)
									.on('devInfo', (info) => logLevel.devInfo && log.info(info))
									.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
									.on('info', (msg) => logLevel.info && log.info(`Device: ${host} ${name}, ${msg}`))
									.on('debug', (msg) => logLevel.debug && log.info(`Device: ${host} ${name}, debug: ${msg}`))
									.on('warn', (msg) => logLevel.warn && log.warn(`Device: ${host} ${name}, ${msg}`))
									.on('error', (msg) => logLevel.error && log.error(`Device: ${host} ${name}, ${msg}`));

								const accessory = await deviceInstance.start();
								if (accessory) {
									api.publishExternalAccessories(PluginName, [accessory]);
									if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);

									await impulseGenerator.stop();
									await deviceInstance.startImpulseGenerator();
								}
							} catch (error) {
								if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
							}
						})
						.on('state', (state) => {
							if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
						});

					// start impulse generator
					await impulseGenerator.start([{ name: 'start', sampling: 60000 }]);
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Did finish launching error: ${error.message ?? error}`);
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, OpenWebIfPlatform);
};

