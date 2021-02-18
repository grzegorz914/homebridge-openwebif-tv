<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/openwebif.png" height="140"></a>
</p>

<span align="center">

# Homebridge openWebif TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-openwebif-tv?color=purple)](https://www.npmjs.com/package/homebridge-openwebif-tv) [![npm](https://badgen.net/npm/v/homebridge-openwebif-tv?color=purple)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/issues)

Homebridge plugin to control Sat Receivers basis on the OpenWebIf API. Tested with Dreambox DM900, VU+ Ultimo 4K, Formuler F4 Turbo.

</span>

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-openwebif-tv using: `npm install -g homebridge-openwebif-tv` or search for `OpenWebIf TV` in Config UI X.

## Know issues
1. If use with Hoobs possible config incompatibilty.

## HomeKit pairing
1. Each accessories needs to be manually paired. 
2. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
3. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
4. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Note
1. Versin 3.6.0 and abowe need to be used with Homebridge min. v1.3.x.

## Info
1. Power ON/OFF short press tile in HomeKit app.
2. RC/Media control is possible after you go to the RC app on iPhone/iPad.
3. Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
4. Legacy volume and mute control is possible throught extra `lightbulb` (slider) or using Siri `Volume Service`.
5. Inputs can be changed after loong press tile in HomeKit app and select from the list.
6. Siri control.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/homekit.png" height="300"></a> 
  </p>
  <p align="left">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/inputs.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/RC.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/rc1.png" height="300"></a>
</p>

## Configuration
1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
2. If port `80` not working check which port is set for Your Sat Receiver.
3. All `reference` and `name` from Your sat receiver are stored in `homebridge_directory/openwebifTv/channels_19216804`, if U want somthing changed in channel list please add Yours prefered channels to the config bouquets.
4. In `refreshInterval` set the data refresh time in seconds, default 5sec.
5. In `volumeControl` You can select what a additional volume control mode You want to use (None, Slider, Fan).
6. If `disableLogInfo` is enabled, disable log info, all values and state will not be displayed in Homebridge log console.
7. If `switchInfoMenu` is enabled, `I` button change its behaviour in RC app between Menu and INFO.
8. `manufacturer`, `model`, `serialNumber`, `firmwareRevision` - optional branding data displayed in Home.app

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/ustawienia.png" height="150"></a>
</p>

```json
{
      "platform": "OpenWebIfTv",
      "devices": [
        {
        "name": "Sat Receiver",
        "host": "192.168.0.4",
        "port": 80,
        "auth": false,
        "user": "user",
        "pass": "pass",
        "refreshInterval": 5,
        "disableLogInfo": false,
        "volumeControl": 0,
        "switchInfoMenu": false,
        "inputs": [
          {
            "name": "Das Erste HD",
            "reference": "1:0:19:283D:3FB:1:C00000:0:0:0:"
          },
          {
            "name": "ZDF HD",
            "reference": "1:0:19:2B66:3F3:1:C00000:0:0:0:"
          },
          {
            "name": "RTL HD",
            "reference": "1:0:19:EF10:421:1:C00000:0:0:0:"
          },
          {
            "name": "SAT.1 HD",
            "reference": "1:0:19:EF74:3F9:1:C00000:0:0:0:"
          },
          {
            "name": "ProSieben HD",
            "reference": "1:0:19:EF75:3F9:1:C00000:0:0:0:"
          },
          {
            "name": "RTLII HD",
            "reference": "1:0:19:EF15:421:1:C00000:0:0:0:"
          },
          {
            "name": "VOX HD",
            "reference": "1:0:19:EF11:421:1:C00000:0:0:0:"
          },
          {
            "name": "kabel eins HD",
            "reference": "1:0:19:EF76:3F9:1:C00000:0:0:0:"
          },
          {
            "name": "SIXX HD",
            "reference": "1:0:19:EF77:3F9:1:C00000:0:0:0:"
          },
          {
            "name": "SUPER RTL HD",
            "reference": "1:0:19:2E9B:411:1:C00000:0:0:0:"
          },
          {
            "name": "TELE 5 HD",
            "reference": "1:0:19:1519:455:1:C00000:0:0:0:"
          },
          {
            "name": "ORF1 HD",
            "reference": "1:0:19:132F:3EF:1:C00000:0:0:0:"
          },
          {
            "name": "ORF2W HD",
            "reference": "1:0:19:1330:3EF:1:C00000:0:0:0:"
          },
          {
            "name": "RTL UHD",
            "reference": "1:0:1F:307A:3F5:1:C00000:0:0:0:"
          }
        ],
          "manufacturer": "Manufacturer",
          "modelName": "Model",
          "serialNumber": "Serial Number",
          "firmwareRevision": "Firmware Revision"
      }
    ]
  }
```

Sort of channel in HomeKit app is alpahabetically but U can sort the channels as in Yours receivers adding channel number at first place of every name, some example:

```json
                {
                    "name": "1 TVP HD",
                    "reference": "1:0:1:1138:2AF8:13E:820000:0:0:0:"
                },
                {
                    "name": "10 TVP 1 HD",
                    "reference": "1:0:1:3ABD:514:13E:820000:0:0:0:"
                },
                {
                    "name": "11 TVP 2 HD",
                    "reference": "1:0:1:C22:1E78:71:820000:0:0:0:"
                },
                {
                    "name": "12 TVP 3",
                    "reference": "1:0:1:113B:2AF8:13E:820000:0:0:0:"
                },
                {
                    "name": "13 TVP INFO HD",
                    "reference": "1:0:1:1139:2AF8:13E:820000:0:0:0:"
                },
                {
                    "name": "14 TVP ABC",
                    "reference": "1:0:1:3D5F:2C88:13E:820000:0:0:0:"
                },
                {
                    "name": "15 TVP Seriale",
                    "reference": "1:0:1:3D5C:2C88:13E:820000:0:0:0:"
                },
                {
                    "name": "16 TVP Kultura",
                    "reference": "1:0:1:3D59:2C88:13E:820000:0:0:0:"
                },
                {
                    "name": "17 TVP Rozrywka",
                    "reference": "1:0:1:4288:2BC0:13E:820000:0:0:0:"
                },
                {
                    "name": "18 TVP Polonia",
                    "reference": "1:0:1:132B:33F4:13E:820000:0:0:0:"
                },
                {
                    "name": "19 TVP Sport HD",
                    "reference": "1:0:1:DB1:2D50:13E:820000:0:0:0:"
                },
                {
                    "name": "2 TVP Historia",
                    "reference": "1:0:1:3D67:2C88:13E:820000:0:0:0:"
                },
                {
                    "name": "20 TVN HD",
                    "reference": "1:0:1:3DCD:640:13E:820000:0:0:0:"
                },
                {
                    "name": "21 TVN 7 HD",
                    "reference": "1:0:1:3DD3:640:13E:820000:0:0:0:"
                },
                {
                    "name": "22 TVN Turbo HD",
                    "reference": "1:0:1:3DD0:640:13E:820000:0:0:0:"
                }
```
## Limitations
1. Due to HomeKit app limitation max. services for 1 accessory is 100. Over this value HomeKit app will no response. As services in this accessory are, (1.information service, 2.speaker service, 3.lightbulb service, 4.television service and inputs service 5-100(where every input = 1 service)). If all services are enabled possible inputs to use is 96.

## Whats new:
https://github.com/grzegorz914/homebridge-openwebif-tv/blob/master/CHANGELOG.md

## Development
- Pull request and help in development highly appreciated.
