import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import OpenWebIfDevice from './src/openwebifdevice.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { isConnectionError } from './src/openwebif.js';
import Mqtt from './src/mqtt.js';
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

		// MQTT is created once, after the receiver answered for the first time, so nothing
		// is connected or published while the receiver is not reachable.
		// The 'set' handler uses activeDevice so it always routes to the current instance.
		let activeDevice = null;
		let mqttStarted = null;
		const startMqtt = () => (mqttStarted ??= connectMqtt());
		const connectMqtt = async () => {
			if (!device.mqtt?.enable) return { mqtt1: null, mqttConnected: false };

			let mqtt1 = null;
			let mqttConnected = false;
			try {
				await new Promise((resolve) => {
					const timer = setTimeout(resolve, 10000);
					mqtt1 = new Mqtt({
						host: device.mqtt.host,
						port: device.mqtt.port || 1883,
						clientId: device.mqtt.clientId ? `openwebif_${device.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `openwebif_${Math.random().toString(16).slice(3)}`,
						prefix: device.mqtt.prefix ? `openwebif/${device.mqtt.prefix}/${name}` : `openwebif/${name}`,
						protocolVersion: device.mqtt.protocolVersion,
						haDiscovery: device.mqtt.haDiscovery,
						user: device.mqtt.auth?.user,
						passwd: device.mqtt.auth?.passwd,
						logWarn: logLevel.warn,
						logDebug: logLevel.debug,
					})
						.once('connected', (msg) => {
							clearTimeout(timer);
							mqttConnected = true;
							if (logLevel.success) log.success(`Device: ${host} ${name}, ${msg}`);
							resolve();
						})
						.on('set', async (key, value) => {
							try {
								if (activeDevice) await activeDevice.setOverMqtt(key, value);
							} catch (error) {
								if (logLevel.warn) log.warn(`Device: ${host} ${name}, MQTT set error: ${error.message ?? error}`);
							}
						})
						.on('debug', (msg) => logLevel.debug && log.info(`Device: ${host} ${name}, debug: ${msg}`))
						.on('warn', (msg) => logLevel.warn && log.warn(`Device: ${host} ${name}, ${msg}`))
						.on('error', (msg) => logLevel.error && log.error(`Device: ${host} ${name}, ${msg}`));
				});
			} catch (error) {
				if (logLevel.warn) log.warn(`Device: ${host} ${name}, MQTT start error: ${error.message ?? error}`);
			}
			return { mqtt1, mqttConnected };
		};

		// The startup impulse generator retries the full connect+start cycle
		// every 120 s until it succeeds, then hands off to the device
		// impulse generator and stops itself.
		let notReachable = false;
		const impulseGenerator = new ImpulseGenerator()
			.on('start', async () => {
				try {
					await this.startDevice(
						device, name, host, refreshInterval,
						files, logLevel, log, api, impulseGenerator,
						startMqtt, (d) => { activeDevice = d; }
					);
				} catch (error) {
					// no answer from the receiver is not an error, it is reported once as not reachable
					if (isConnectionError(error)) {
						if (!notReachable) {
							notReachable = true;
							if (logLevel.warn) log.warn(`Device: ${host} ${name}, not reachable`);
						}
						return;
					}
					if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
				}
			})
			.on('state', (state) => {
				if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
			});

		await impulseGenerator.state(true, [{ name: 'start', sampling: 120_000 }]);
	}

	// ── Connect and register accessory for one device ─────────────────────────

	async startDevice(device, name, host, refreshInterval, files, logLevel, log, api, impulseGenerator, startMqtt, onDeviceReady) {
		const deviceInstance = new OpenWebIfDevice(api, device, files.devInfo, files.inputs, files.channels, files.inputsNames, files.inputsVisibility)
			.on('devInfo', (info) => logLevel.devInfo && log.info(info))
			.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
			.on('info', (msg) => log.info(`Device: ${host} ${name}, ${msg}`))
			.on('debug', (msg) => log.info(`Device: ${host} ${name}, debug: ${msg}`))
			.on('warn', (msg) => log.warn(`Device: ${host} ${name}, ${msg}`))
			.on('error', (msg) => log.error(`Device: ${host} ${name}, ${msg}`));

		// The broker is connected as soon as the receiver API answers, the HomeKit accessory is not needed for it
		const started = await deviceInstance.start(async () => {
			const { mqtt1, mqttConnected } = await startMqtt();
			await deviceInstance.attachMqtt(mqtt1, mqttConnected);
		});
		if (!started) return;

		onDeviceReady(deviceInstance);
		if (deviceInstance.accessory) {
			api.publishExternalAccessories(PluginName, [deviceInstance.accessory]);
			if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);
		}

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