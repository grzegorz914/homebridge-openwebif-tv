<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/homebridge-openwebif-tv.png" width="840"></a>
</p>

<span align="center">

# Homebridge OpenWebIf TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-openwebif-tv?color=purple)](https://www.npmjs.com/package/homebridge-openwebif-tv) [![npm](https://badgen.net/npm/v/homebridge-openwebif-tv?color=purple)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/issues)

Homebridge plugin for Sat Receivers based on the OpenWebIf API. Tested with VU+ Ultimo 4K, Formuler F4 Turbo.

</span>

## Package Requirements
| Package Link | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Homebridge Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Web User Interface | Recommended |
| [Homebridge OpenWebIf TV](https://www.npmjs.com/package/homebridge-openwebif-tv) | `npm install -g homebridge-openwebif-tv` | Plug-In | Required |

## Know issues
* If use with Hoobs possible config incompatibilty.

## Note
* Versin 3.6.0 and above need to be used with Homebridge min. v1.3.x.

## Features and How To Use Them
* Power ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy volume and mute control is possible throught extra `lightbulb` (slider) or using Siri `Volume Service`.
* Inputs can be changed after long press tile in Home.app and select from the list or create separate tile in the Buttons section.
* Siri control.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/homekit.png" width="480"></a> 
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/inputs.png" width="115"></a>  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/RC.png" width="115"></a>  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/rc1.png" width="115"></a>
</p>

## Configuration
Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) plugin to configure this plugin (Highly Recommended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/master/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description | 
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of Sat Receiver.|
| `port` | Here set the *Port* of Sat Receiver. |
| `auth` | If enabled, authorizatins credentials will be used for login. |
| `user` | Here set the authorization *Username*. |
| `pass` | Here set the authorization *Password*. |
| `refreshInterval` | Here set the data refresh time in seconds. |
| `volumeControl` | Here choice what a additional volume control mode You want to use (None, Slider, Fan). |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `switchInfoMenu` | If enabled, `I` button change its behaviour in RC app between Menu and INFO. |
| `inputs.name` | Here set *Channel Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Here set *Channel Reference*. All can be found in `homebridge_directory/openwebifTv/inputs_xxxx`. |
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*.| 
| `buttons.reference` | Here set *Channel Reference*. All can be found in `homebridge_directory/openwebifTv/inputs_xxxx`. | 
| `manufacturer`, `model`, `serialNumber`, `firmwareRevision` | optional branding data displayed in Home.app. |

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
          }
        ],
        "buttons": [
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
        ],
          "manufacturer": "Manufacturer",
          "modelName": "Model",
          "serialNumber": "Serial Number",
          "firmwareRevision": "Firmware Revision"
      }
    ]
  }
```

* Sort of channels in HomeKit app is alpahabetically but U can sort the channels as in Yours receivers adding channel number at first place of every name:

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

## HomeKit pairing
1. Each accessories needs to be manually paired. 
2. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
3. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
4. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Limitations
* Due to a HomeKit limitation, that maximum services for 1 accessory is 100. Acessories containing services above this value in the HomeKit app will not respond.
* If all services are enabled possible inputs to use is 95. The services in this accessory are:
  * Information service.
  * Speaker service.
  * Lightbulb service.
  * Fan service
  * Television service.
  * Inputs service which may range from 6 to 100 as each input is 1 service.
  * Buttons service which may range from 6 to 100 as each input is 1 service.

## Whats new:
https://github.com/grzegorz914/homebridge-openwebif-tv/blob/master/CHANGELOG.md

## Development
* Pull request and help in development highly appreciated.
