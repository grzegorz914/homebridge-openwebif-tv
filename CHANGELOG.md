# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### NOTE

- After update to v4.0.0 MQTT config settings need to be updated

## [4.6.0] - (30.05.2025)

## Changes

- added speaker option to volume control
- now if volume control option is set to disable/nonethe  also TV Speakers (hardware control) is disabled
- stability improvements
- cleanup

## [4.5.0] - (26.04.2025)

## Changes

- bump dependencies
- config schema updated
- cleanup

## [4.4.0] - (13.03.2025)

## Changes

- added possibility to disable indyvidual accessory
- bump dependencies
- config schema updated
- redme updated
- cleanup

## [4.3.0] - (05.03.2025)

## Changes

- added Power Control mode for buttons, closes [#76](https://github.com/grzegorz914/homebridge-openwebif-tv/issues/76)
- bump dependencies
- redme update
- cleanup

## [4.2.9] - (07.02.2025)

## Changes

- stability and improvements

## [4.2.8] - (06.02.2025)

## Changes

- fix HAP-NodeJS WARNING: The accessory has an invalid 'Name' characteristic 'configuredName'
- Please use only alphanumeric, space, and apostrophe characters
- Ensure it starts and ends with an alphabetic or numeric character, and avoid emojis

## [4.2.5] - (16.01.2025)

## Changes

- functions reorder

## [4.2.4] - (16.01.2025)

## Changes

- added 1 default channel if no channels was created or 0 found to allow publisch accessory

## [4.2.2] - (15.01.2025)

## Changes

- prevent publish accessory if required data not found
- cleanup

## [4.2.0] - (15.01.2025)

## Changes

- added possibility to disable/enable log success, info, warn, error
- refactor cnnect code
- bump dependencies
- config schema updated
- redme updated
- cleanup

## [4.1.2] - (19.12.2024)

## Changes

- bump dependencies
- cleanup

## [4.1.0] - (01.12.2024)

## Changes

- move from commonJS to esm module
- moved constants.json to constants.js
- cleanup

## [4.0.2] - (18.08.2024)

## Changes

- fix correct catch error
- fix mqtt enable

## [4.0.0] - (15.08.2024)

## Changes

- hide passwords by typing and display in Config UI
- remove return duplicate promises from whole code
- performance improvements and stability
- bump dependencies
- cleanup

## [3.27.0] - (04.08.2024)

## Changes

- added possiblity to set own volume control name and enable/disable prefix
- config schema updated
- bump dependencies
- cleanup

## [3.26.0] - (04.03.2024)

## Changes

- added support to subscribe MQTT and control device
- config schema updated
- cleanup

## [3.25.0] - (02.01.2024)

## Changes

- added possibility to disable prefix name for buttons and sensors
- config schema updated
- cleanup

## [3.24.0] - (29.12.2023)

## Changes

- added possibility to select display channels order, possible by `None`, `Alphabetically Name`, `Alphabetically Reference`
- config.schema updated
- cleanup

## [3.23.0] - (12.10.2023)

## Changes

- added possibility load channels by bouquets array direct from device
- config.schema updated
- cleanup

## [3.22.0] - (12.10.2023)

## Changes

- added possibility load channels by bouquet direct from device
- config.schema updated
- cleanup

## [3.20.0] - (18.02.2023)

## Changes

- added Play/Pause functionality in RC
- added Record to selection list for I button in RC
- config.schema updated
- cleanup

## [3.19.0] - (13.02.2023)

## Changes

- standarize function of display type and volume control, now volume control -1 None/Disabled, 0 Slider, 1 Fan, please see in readme
- config.schema updated
- fix expose extra input tile in homekit app
- other small fixes and improvements
- cleanup

## [3.18.0] - (08.02.2023)

## Changes

- added [#60](https://github.com/grzegorz914/homebridge-openwebif-tv/issues/60)
- config.schema updated

## [3.17.0] - (07.02.2023)

## Changes

- removed duplicated display type *sensors* from inputs section
- config.schema updated
- bump dependencies
- cleanup

## [3.16.0] - (24.01.2023)

## Changes

- removed switch properties from input section
- added None and Contact Sensor options for displayType in the input section
- config.schema updated
- cleanup

## [3.15.0] - (14.01.2023)

## Changes

- added Channel Motion Sensor for use with automations (every channel change report motion)
- config.schema updated

## [3.14.9] - (04.01.2023)

## Changes

- fix save target visibility
- fix save custom names

## [3.14.7] - (31.12.2022)

## Changes

- bump dependencies

## [3.14.4] - (18.12.2022)

## Changed

- fix buttons and switch services

## [3.14.3] - (06.12.2022)

## Changes

- bump dependencies

## [3.14.0] - (27.10.2022)

## Changes

- added Power Motion Sensor for use with automations
- added Volume Motion Sensor for use with automations (every volume change report motion)
- added Mute Motion Sensor for use with automations
- config.schema updated
- other small fixes

## [3.13.32] - (10.09.2022)

## Changes

- bump dependencies

## [3.13.30] - (28.08.2022)

## Changes

- cleanup
- fix publish mqtt

## [3.13.26] - (27.08.2022)

## Changes

- cleanup

## [3.13.21] - (23.07.2022)

## Changes

- refactor information service
- refactor buttons service

## [3.13.19] - (25.04.2022)

## Changes

- refactor send debug and info log
- refactor send mqtt message
- update dependencies

## [3.13.16] - (24.04.2022)

## Changes

- fixed MQTT info report

## [3.13.12] - (23.04.2022)

## Changes

- prepare accessory process to prevent create accessory with wrong UUID
- in config.schema.json MQTT section

## [3.13.7] - (27.02.2022)

## Added

- MQTT Debug

## [3.13.5] - (22.02.2022)

## Added

- possibility to set custom command for Info button in RC, [#57](https://github.com/grzegorz914/homebridge-openwebif-tv/issues/57)

## [3.13.3] - (18.02.2022)

## Changes

- refactor check state and connect process

## [3.13.0] - (18.02.2022)

## Added

- MQTT Client, publish all device data

## Changes

- update dependencies
- code refactor

## [3.12.9] - (07.02.2022)

### Changes

- code cleanup

## [3.12.8] - (04.02.2022)

### Changes

- stability and performance improvements
- wording corrections in debug log

## [3.12.7] - (28.01.2022)

### Changes

- code refactor

## [3.12.5] - (20.01.2022)

### Changes

- prevent create inputs switch services if count <= 0

## [3.12.4] - (18.01.2022)

### Changes

- update dependencies

## [3.12.3] - (17.01.2022)

### Changes

- update dependencies

## [3.12.0] - (14.01.2022)

### Added

- ability to use channels with automations, shortcuts in HomeKit app
- ability to choice type of channels in automations (button, switch, motion sensor, occupancy sensor)

### Changs

- code cleanup
- update config.schema

### Fixed

- services calculation count

## [3.11.11] - (03.01.2022)

### Added

- ability to disable log device info by every connections device to the network (Advanced Section)

## [3.11.10] - (31.12.2021)

### Fixed

- power state report if device is disconnected from network

## [3.11.9] - (30.12.2021)

### Added

- log Receiver Disconnected if plugin restart and Receiver not on network

## [3.11.6] - (30.12.2021)

### Changs

- reduce logging if receiver for some reason lose the connection
- moved info and state error to debug

## [3.11.5] - (29.12.2021)

### Added

- prevent load plugin if host or port not set
- prepare directory and files synchronously

## [3.11.4] - (28.12.2021)

- update node minimum requirements

## [3.11.3] - (28.12.2021)

### Added

- Selectable display type of buttons in HomeKit app

## [3.11.0] - (22.12.2021)

## Changes

- remove branding fom config, not nedded anymore
- code cleanup
- config.schema update

## [3.10.0] - (20.12.2021)

## Changes

- added full remote control to button section

## [3.9.0] - (13.12.2021)

## Changes

- use event emmiter for state changes
- added debug mode
- removed refresh interval

## [3.8.8] - (05.10.2021

## Changes

- code cleanup
- bump dependencies

## [3.8.7] - (26.09.2021)

## Changes

- config.schema update

## [3.8.6] - (14.09.2021)

## Changes

- code cleanup

## [3.8.5] - (09.09.2021)

## Changes

- stability improvements
- performance improvements

## [3.8.4] - (08.09.2021)

## Changes

- bump dependencies

## [3.8.2] - (05.09.2021)

## Changes

- bump dependencies

## [3.8.1] - (04.09.2021)

## Changes

- bump dependencies

## [3.8.0] - (31.08.2021)

## Changes

- inputs list updatd
- code refactoring
- many small changes and stability improvements

## [3.7.0] - (01.03.2021)

## Changes

- added possibility to create separate buttons for channels

## [3.6.0] - (18.02.2021)

## Changes

- code rebuild, use Characteristic.onSet, Characteristic.onGet
- require Homebridge 1.3.x or above

## [3.5.12] - (15.02.2021)

## Changes

- added possibility disable log info, options available in config

## [3.5.6] - (19.01.2021)

## Changes

- some improvements and fixes

## [3.5.5] - (01.01.2021)

## Changes

- bump dependiencies

## [3.5.2] - (20.11.2020)

## Changes

- fixed slow response on RC control

## [3.5.0] - (17.11.2020)

## Changes

- added possibility to set custom data refresh inteval

## [3.4.0] - (09.09.2020)

## Changes

- added await/async function

## [3.3.0] - (08.09.2020)

## Changes

- added async/await function to read deviceInfo and updateStatus

## [3.1.0] - (06.09.2020)

## Changes

- completely reconfigured layout of config schema

## [3.0.4] - (25.08.2020)

### Changes

- performance improvements
- other small fixes

## [3.0.1] - (23.00.2020)

### Added

- donate option on plugin gui
- some cleanup

## [3.0.0] - (28.06.2020)

### Added

-release version.

## [2.11.1] - (23.05.2020)

### Added

- added possibility to select what a type of extra volume control You want to use (None, Slider, Fan).

## [2.10.0] - (20.05.2020)

### Added

- added mute ON/OFF to the slider volume

## [2.9.60] - (18.05.2020)

### Fixed

- fixed bug in RC control

## [2.9.36] - (17.05.2020)

### Fixed

- fixed switch input if start with scene or automation

## [2.9.23] - (14.05.2020)

### Added

- added descriptions in config.schema.json

## [2.9.22] - (10.05.2020)

### Fixed

- prevent plugin from crash if no inputs are defined, now display in the list 'No channels configured'

## [2.9.10] - (10.05.2020)

- code cleanup

## [2.9.0] - (09.05.2020)

- changed 'request' with 'axios'

## [2.7.0] - (06.05.2020)

- adapted to HAP-Node JS lib

## [2.6.45] - (06.05.2020)

- code cleanup and unification
- please update Your config.json (replace 'bouquets' with 'inputs')

## [2.6.40] - (05.05.2020)

- fixes and performance inprovements
- correted logging state

## [2.6.19] - (01.05.2020)

- fixes in realtime data read and write

## [2.6.0] - (30.04.2020)

- added realtime data read and write

## [2.5.3] - (27.04.2020)

- added switch ON/OFF volume control (please update config.json)

## [2.5.0] - (27.04.2020)

- add Siri volume control
- add Slider] - (Brightness) volume control

## [2.4.21] - (21.04.2020)

- different fixes.

## [2.4.8] - (07.04.2020)

- fixed store of positin in HomeKit fav.

## [2.4.6] - (05.04.2020)

- update README.md
- update sample-config.json

## [2.4.5] - (29.03.2020)

- fixed store file inside the Homebridge directory

## [2.4.3] - (29.03.2020)

- fixes crasch if no name defined

## [2.4.2] - (29.03.2020)

- small fixes

## [2.4.1] - (29.03.2020)

- update config.schema.json

## [2.4.0] - (28.03.2020)

- some small fixes
- update README.md

## [2.3.39] - (21.03.2020)

- corrections for homebridge git
- performance improvement

## [2.1.2] - (6.02.2020)

- removed checkStateInterval from Config
- some small fixes

## [2.1.1] - (03.02.2020)

- fixed crasch during saved changed channel name

## [2.1.0] - (03.02.2020)

- log corrections
- performance improvements
- some small fixes

## [2.0.26] - (03.02.2020)

- code cleanup

## [2.0.25] - (03.02.2020)

- switch channel usig scenes fixed
- some small changes

## [2.0.17] - (01.02.2020)

- fixed set channel using scenes
- some other fixes

## [2.0.15] - (31.01.2020)

- finally fixed all problems witch autocreate channels file

## [2.0.14] - (31.01.2020)

- some fixes, cpde cleanup

## [2.0.11] - (21.01.2020)

- fixed check state interval crash

## [2.0.8] - (20.01.2020)

- changes in logging
- changes in readme
- code cleanup

## [2.0.4] - (20.01.2020)

- many changes in logging

## [2.0.3(20.01.2020)

- code cleanup

## [2.0.2(20.01.2020)

- small fixes

## [2.0.0(19.01.2020)

- all moved to the platform and publisch as externall accessory
- please update Yours config!!!

## [1.3.8] - (19.01.2020)

- some fixes and improwements

## [1.3.6] - (15.01.2020)

- some crash fixes
- added Power Mode Selection
- removed possibility to disable speaker service

## [1.3.5] - (13.01.2020)

- some crash fixes

## [1.3.4] - (13.01.2020)

- save separate bouquets file for multiinstance

## [1.3.2] - (13.01.2020)

- fix read channels if authorization was disabled

## [1.3.1] - (12.01.2020)

- added automatically reads 97 channels from receiver and add them to the channel list if bouquets in config are not configured.
- some other fixes

## [1.3.0] - (11.01.2020)

- please update Yours config
- added option to use authentication for OpenWebIf
- code cleanup

## [1.2.12] - (08.01.2020)

- fixed crash if switch channel

## [1.2.11] - (08.01.2020)

- fixed current channel identification

## [1.2.10] - (08.01.2020)

- some small changes

## [1.2.9] - (07.01.2020)

- fixed read current reference of channels

## [1.2.6] - (07.01.2020)

- changed config bouquets, please update Your config
- fixed channel list present if tuner is off or channel not in bouquets
- some small fixes

## [1.2.5] - (06.01.2020)

- code cleanup
- some optimisation of display and working with channels list
- removed bouquetsDir from config

## [1.2.4] - (05.01.2020)

- schow channels list if receiver is off.

## [1.2.3] - (05.01.2020)

- save bouquets to the file and load it as channel list if no bouquets added in config, if Your bouquets contain more as 100 channels HomeKit will no response(HomeKit limitation)
- some small fixes

## [1.2.1] - (03.01.2020)

-Update README

## [1.2.0] - (03.01.2020)

### [Please update Your config or use Config Tool

- All code moved to index.js
- Preparation move plugin to platform Accessory
- Preparation register plugin as external Accesory
- added possibility to disable speakerService
- some fixes

## [1.1.0] - (02.01.2020)

- Code cleanup
- Fix generate bouquets
- Fix mute ON/OFF

## [1.0.75] - (01.01.2020)

- Code cleanup

### [Changes

- Code cleanup
- Read and shows channel if receiver is off.

## [1.0.11] - (30.12.2019)

### [Changes

- Code cleanup

## [1.0.8] - (30.12.2019)

### [Changes

- Code cleanup

## [1.0.7] - (30.12.2019)

### [Changes

- Adapted to working wit JSON using api OpenWebIf.
- Fixed channels list display if receiver is OFF.
- Publish to npm
