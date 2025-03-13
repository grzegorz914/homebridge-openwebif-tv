<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/homebridge-openwebif-tv.png" width="640"></a>
</p>

<span align="center">

# Homebridge OpenWebIf TV

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-openwebif-tv?color=purple)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![npm](https://badgen.net/npm/v/homebridge-openwebif-tv?color=purple)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![npm](https://img.shields.io/npm/v/homebridge-openwebif-tv/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/issues)

Homebridge plugin for Sat Receivers based on the OpenWebIf API. Tested with VU+ Ultimo 4K, Formuler F4 Turbo.

</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/homebridge/homebridge-config-ui-x) | [Config UI X Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [OpenWebIf TV](https://www.npmjs.com/package/homebridge-openwebif-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-openwebif-tv/wiki) | Homebridge Plug-In | Required |

## About The Plugin

* Power ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume and Mute control is possible throught extra `lightbulb`/`fan` (slider).
* Channels can be changed using Channels selector in HomeKit.app, additionally can create separate tile.
* Siri can be used for all functions, some times need create legacy buttons/switches/sensors.
* Automations can be used for all functions, some times need create legacy buttons/switches/sensors.
* Support external integration [MQTT](https://github.com/grzegorz914/homebridge-openwebif-tv?tab=readme-ov-file#mqtt-integration).

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/homekit.png" width="382"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/inputs.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/RC.png" width="135"></a>
</p>

### Configuration

* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of Sat Receiver.|
| `port` | Here set the *Port* of Sat Receiver. |
| `disableAccessory` | If enabled, the accessory will be disabled. |
| `auth` | If enabled, authorizatins credentials will be used for login. |
| `user` | Here set the authorization *Username*. |
| `pass` | Here set the authorization *Password*. |
| `getInputsFromDevice` | This function get channels by *Bouquet* direct from device, manually configured channels will be skipped. |
| `bouquets.name` | Here set *Bouquet Name* which should be loaded from device, only first 90 services will be used. |
| `bouquets.displayType` | Here select display extra tile for all channels of this bouquet to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`.|
| `inputsDisplayOrder` | Here select display order of the channels list, `0 - None`, `1 - Ascending by Name`, `2 - Descending by Name`, 3 - `Ascending by Reference`, `4 - Ascending by Reference`. |
| `inputs.name` | Here set *Channel Name* which should be exposed in the *Homebridge/HomeKit* |
| `inputs.reference` | Here set *Channel Reference*. All can be found in `homebridge_directory/openwebifTv/inputs_xxxx`. |
| `inputs.displayType` | Here select display extra tile for this channel to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 -Outlet`, `2 - Switch`.|
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*.|
| `buttons.mode` | Here select button mode, `0 - Live TV Channel`, `1 - Remote Control`. |
| `buttons.reference` | Here set *Reference*, only for `Live TV Channel` mode, in other case leave empty. |
| `buttons.command` | Here select `Remote Control` command which will be assigned to the button. |
| `buttons.powerCommand` | Here select `Power Control` which will be assigned to the button. |
| `buttons.displayType` | Here select display type in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`.|
| `buttons.namePrefix` | Here enable/disable the accessory name as a prefix for button name.|
| `sensorPower`| If enabled, then the Power will be exposed as a `Contact Sensor`, fired if power ON. |
| `sensorVolume`| If enabled, then the Volume will be exposed as a `Contact Sensor`, fired on every Volume change. |
| `sensorMute`| If enabled, then the Mute will be exposed as a `Contact Sensor`, fired if Mmute ON. |
| `sensorChannel`| If enabled, then the Channel will be exposed as a `Contact Sensor`, fired on every Channel change. |
| `sensorInputs`| Her create custom Inputs sensor, sensors will be exposed as a `Contact Sensor`, fired if switch to it. |
| `sensorInputs.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `sensorInputs.reference` | Here set *Reference* like `1:0:1:3ABD:514:13E:820000:0:0:0:` to be exposed as sensor (active on switch to this Input). |
| `sensorInputs.displayType` | Here select sensor type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `sensorInputs.namePrefix` | Here enable/disable the accessory name as a prefix for sensor name.|
| `volumeControlNamePrefix` | Here enable/disable the accessory name as a prefix for volume control name. |
| `volumeControlName` | Here set Your own volume control name or leave empty. |
| `volumeControl` | Here select volume control mode `0 -None/Disabled`, `1 - Slider`, `2 - Fan`. |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `refreshInterval` | Here set the data refresh interval. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogSuccess` | If enabled, disable logging device success. |
| `disableLogWarn` | If enabled, disable logging device warnings. |
| `disableLogError` | If enabled, disable logging device error. |
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `mqtt` | This is MQTT Broker. |
| `enable` | If enabled, MQTT Broker will start automatically and publish all awailable PV data. |
| `host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `port` | Here set the `Port` for MQTT Broker, default 1883. |
| `clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `auth` | If enabled, MQTT Broker will use authorization credentials. |
| `user` | Here set the MQTT Broker user. |
| `passwd` | Here set the MQTT Broker password. |
| `debug` | If enabled, deep log will be present in homebridge console for MQTT. |

### MQTT Integration

| Direction | Topic | Message | Payload Data |
| --- | --- | --- | --- |
|  Publish   | `Info`, `State` | `{"inStandby": true, "volume": 100}` | JSON object. |
|  Subscribe   | `Set` | `{"Power": true}` | JSON object. |

| Subscribe | Key | Value | Type | Description |
| --- | --- | --- | --- | --- |
| OpenWebIf |     |     |     |      |
|     | `Power` | `true`, `false` | boolean | Power state. |
|     | `Channel` | `1:0:1:3DD3:640:13E:820000:0:0:0:` | string | Set channel. |
|     | `RcControl` | `168` | string | Send RC command. |
|     | `Volume` | `55` | integer | Set volume. |
|     | `Mute` | `true` | boolean | Toggle mute. |
