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
				if (device.disableAccessory) continue;

				const { name, host, port, refreshInterval = 5 } = device;
				if (!name || !host || !port) {
					log.warn(`Invalid config for device: Name: ${name || 'missing'}, Host: ${host || 'missing'}, Port: ${port || 'missing'}`);
					continue;
				}

				const enableDebugMode = !!device.enableDebugMode;
				const logLevel = {
					debug: enableDebugMode,
					info: !device.disableLogInfo,
					success: !device.disableLogSuccess,
					warn: !device.disableLogWarn,
					error: !device.disableLogError,
					devInfo: !device.disableLogDeviceInfo,
				};

				if (enableDebugMode) {
					log.info(`Device: ${host} ${name}, did finish launching.`);
					const safeConfig = {
						...device,
						pass: 'removed',
						mqtt: {
							...device.mqtt,
							passwd: 'removed',
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
					const deviceInstance = new OpenWebIfDevice(api, device, files.devInfo, files.inputs, files.channels, files.inputsNames, files.inputsVisibility, refreshInterval * 1000)
						.on('devInfo', (info) => logLevel.devInfo && log.info(info))
						.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
						.on('info', (msg) => logLevel.info && log.info(`Device: ${host} ${name}, ${msg}`))
						.on('debug', (msg) => logLevel.debug && log.info(`Device: ${host} ${name}, debug: ${msg}`))
						.on('warn', (msg) => logLevel.warn && log.warn(`Device: ${host} ${name}, ${msg}`))
						.on('error', (msg) => logLevel.error && log.error(`Device: ${host} ${name}, ${msg}`));

					const impulseGenerator = new ImpulseGenerator()
						.on('start', async () => {
							try {
								const accessory = await deviceInstance.start();
								if (accessory) {
									api.publishExternalAccessories(PluginName, [accessory]);
									if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);

									await impulseGenerator.stop();
									await deviceInstance.startImpulseGenerator();
								}
							} catch (error) {
								if (logLevel.error) log.error(`Device: ${host} ${name}, ${error.message ?? error}, trying again.`);
							}
						})
						.on('state', (state) => {
							if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
						});

					await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
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

