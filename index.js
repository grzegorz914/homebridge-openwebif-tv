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

		api.on('didFinishLaunching', () => {
			// Each device is set up independently — a failure in one does not
			// block the others. Promise.allSettled runs all in parallel.
			Promise.allSettled(
				config.devices.map(device =>
					this.setupDevice(device, prefDir, log, api)
				)
			).then(results => {
				results.forEach((result, i) => {
					if (result.status === 'rejected') {
						log.error(`Device[${i}] setup error: ${result.reason?.message ?? result.reason}`);
					}
				});
			});
		});
	}

	// ── Per-device setup ──────────────────────────────────────────────────────

	async setupDevice(device, prefDir, log, api) {
		const { name, host, port, displayType } = device;

		if (!name || !host || !port || !displayType) {
			log.warn(`Device: ${host || 'host missing'}, ${name || 'name missing'}, ${port || 'port missing'}${!displayType ? ', display type disabled' : ''} in config, will not be published in the Home app`);
			return;
		}

		const logLevel = {
			devInfo: device.log?.deviceInfo,
			success: device.log?.success,
			info: device.log?.info,
			warn: device.log?.warn,
			error: device.log?.error,
			debug: device.log?.debug,
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
					},
				},
			};
			log.info(`Device: ${host} ${name}, Config: ${JSON.stringify(safeConfig, null, 2)}`);
		}

		const refreshInterval = (device.refreshInterval ?? 5) * 1000;
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
			return;
		}

		// The startup impulse generator retries the full connect+start cycle
		// every 120 s until it succeeds, then hands off to the device
		// impulse generator and stops itself.
		const impulseGenerator = new ImpulseGenerator()
			.on('start', async () => {
				try {
					await this.startDevice(
						device, name, host, refreshInterval,
						files, logLevel, log, api, impulseGenerator
					);
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
				}
			})
			.on('state', (state) => {
				if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
			});

		await impulseGenerator.state(true, [{ name: 'start', sampling: 120_000 }]);
	}

	// ── Connect and register accessory for one device ─────────────────────────

	async startDevice(device, name, host, refreshInterval, files, logLevel, log, api, impulseGenerator) {
		const deviceInstance = new OpenWebIfDevice(api, device, files.devInfo, files.inputs, files.channels, files.inputsNames, files.inputsVisibility)
			.on('devInfo', (info) => logLevel.devInfo && log.info(info))
			.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
			.on('info', (msg) => log.info(`Device: ${host} ${name}, ${msg}`))
			.on('debug', (msg) => log.info(`Device: ${host} ${name}, debug: ${msg}`))
			.on('warn', (msg) => log.warn(`Device: ${host} ${name}, ${msg}`))
			.on('error', (msg) => log.error(`Device: ${host} ${name}, ${msg}`));

		const accessory = await deviceInstance.start();
		if (!accessory) return;

		api.publishExternalAccessories(PluginName, [accessory]);
		if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);

		// Stop startup generator and hand off to the device generator
		await impulseGenerator.state(false);
		await deviceInstance.startStopImpulseGenerator(true, [
			{ name: 'checkChannels', sampling: 60_000 },
			{ name: 'checkState', sampling: refreshInterval },
		]);
	}

	// ── Homebridge accessory cache ────────────────────────────────────────────

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, OpenWebIfPlatform);
};